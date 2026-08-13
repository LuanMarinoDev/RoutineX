/* =========================================================
   RoutineX — storage.js
   Única porta de entrada para o localStorage.
   Nenhum outro arquivo deve chamar localStorage diretamente.

   Modelo em memória (cache) + escrita imediata no disco.
   Quem quiser reagir a mudanças usa store.on("change", fn).
   ========================================================= */

import { uid, clone, todayISO, addDays, fromISODate } from "./utils.js";
import { PREFIX, VERSION } from "./core/namespace.js";
import { accounts } from "./auth/accounts.js";
import { can, PermissionError } from "./auth/permissions.js";

/** Chave de dados de uma conta. Cada usuário tem a sua gaveta. */
export const keyFor = (userId) => `${PREFIX}:u:${userId}`;

/** Dados da versão anterior, de quando o app era de um usuário só. */
const LEGACY_KEY = "lp:v1";
const LEGACY_CLAIMED = `${PREFIX}:legacy-claimed`;

/* Antes do login existe uma gaveta "guest": guarda só preferências
   (tema, por exemplo) para a tela de entrada não nascer sem estilo. */
export const GUEST_SCOPE = "guest";

let scope = GUEST_SCOPE;
let KEY = keyFor(scope);

/* ---------- Estado padrão ---------- */

export const DEFAULT_CATEGORIES = [
  { id: "cat_trabalho", name: "Trabalho", color: "#59a5ff" },
  { id: "cat_estudos", name: "Estudos", color: "#a78bfa" },
  { id: "cat_exercicio", name: "Exercício", color: "#b6f000" },
  { id: "cat_saude", name: "Saúde", color: "#38d9d9" },
  { id: "cat_casa", name: "Casa", color: "#ff9d47" },
  { id: "cat_lazer", name: "Lazer", color: "#f472b6" },
  { id: "cat_pessoal", name: "Pessoal", color: "#ffc24b" },
  { id: "cat_outros", name: "Outros", color: "#929892" },
];

const defaultState = () => ({
  version: VERSION,
  createdAt: new Date().toISOString(),
  settings: {
    userName: "",
    /* Bloco de notas do dashboard: texto livre, salvo enquanto se digita. */
    dashboardNotes: "",
    theme: "dark",
    weekStartsOn: 1, // 0 = domingo, 1 = segunda
    notificationsEnabled: false,
    notifyMinutesBefore: 15,
    onboarded: false,
    seeded: false,
  },
  categories: clone(DEFAULT_CATEGORIES),
  activities: [], // ocorrências concretas (ETAPA 3)
  routines: [], // regras de recorrência (ETAPA 5)
  tasks: [], // tarefas (ETAPA 5)
});

/* ---------- Leitura e escrita cruas ---------- */

let available = true;
let state = null;

function readRaw() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    console.warn("[storage] Falha ao ler os dados salvos.", error);
    return null;
  }
}

function writeRaw(value) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
    available = true;
    return true;
  } catch (error) {
    available = false;
    console.error("[storage] Não foi possível salvar.", error);
    emit("error", { error });
    return false;
  }
}

/** Garante que campos novos existam mesmo em dados antigos ou importados. */
function migrate(saved) {
  const base = defaultState();
  const list = (value) => (Array.isArray(value) ? value : []);

  return {
    ...base,
    ...saved,
    version: VERSION,
    settings: { ...base.settings, ...(saved.settings || {}) },
    categories: saved.categories?.length ? saved.categories : base.categories,

    activities: list(saved.activities)
      .filter((a) => a && a.date && a.start)
      .map((a) => ({
        notes: "",
        categoryId: "cat_outros",
        ...a,
        end: a.end || a.start,
        done: Boolean(a.done),
        routineId: a.routineId || null,
        skipped: Boolean(a.skipped),
      })),

    routines: list(saved.routines)
      .filter((r) => r && r.title)
      .map((r) => ({
        notes: "",
        categoryId: "cat_outros",
        startDate: null,
        endDate: null,
        ...r,
        start: r.start || "08:00",
        end: r.end || "09:00",
        days: list(r.days).filter((d) => d >= 0 && d <= 6),
        paused: Boolean(r.paused),
      })),

    tasks: list(saved.tasks)
      .filter((t) => t && t.title)
      .map((t) => ({
        notes: "",
        categoryId: "cat_outros",
        dueDate: null,
        ...t,
        priority: t.priority || "media",
        status: t.status === "done" ? "done" : "pending",
      })),
  };
}

/* ---------- Permissão de escrita ---------- */

/**
 * Visitante ("viewer") enxerga tudo e não altera nada. Antes do login
 * a gaveta é a de convidado e só guarda preferências, então liberamos.
 */
function guardWrite() {
  if (scope === GUEST_SCOPE) return;

  const user = accounts.currentUser();
  if (!user) return;
  if (!can(user, "data:write")) throw new PermissionError(user.role);
}

/* ---------- Eventos ---------- */

const listeners = new Map();

function emit(type, detail = {}) {
  (listeners.get(type) || []).forEach((fn) => fn(detail));
  if (type !== "*") (listeners.get("*") || []).forEach((fn) => fn(detail));
}

/* ---------- API pública ---------- */

export const store = {
  /**
   * Aponta o storage para a gaveta de um usuário. Chamado no boot,
   * depois que a sessão é resolvida, e a cada troca de conta.
   * Sem argumento volta para a gaveta de visitante (antes do login).
   */
  use(userId = GUEST_SCOPE) {
    const next = userId || GUEST_SCOPE;
    if (next === scope && state) return store.snapshot();

    scope = next;
    KEY = keyFor(scope);
    state = null; // nada de uma conta sobra em memória para a seguinte

    adoptLegacyData();
    store.init();
    emit("change", { collection: "*", reason: "user" });
    return store.snapshot();
  },

  /** Qual conta está carregada agora. */
  scope: () => scope,

  /** Apaga a gaveta inteira de uma conta (usado ao excluir o usuário). */
  dropUser(userId) {
    try {
      localStorage.removeItem(keyFor(userId));
    } catch (error) {
      console.warn("[storage] Não foi possível apagar os dados da conta.", error);
    }
    if (userId === scope) {
      state = null;
      store.use(GUEST_SCOPE);
    }
  },

  /** Carrega (ou cria) o estado. Deve ser chamado uma vez no boot. */
  init() {
    if (state) return state;
    const saved = readRaw();
    state = saved ? migrate(saved) : defaultState();
    if (!saved) writeRaw(state);
    return state;
  },

  /** Cópia somente leitura do estado inteiro. */
  snapshot() {
    return clone(store.init());
  },

  /** localStorage está funcionando? (modo privativo pode bloquear) */
  isAvailable() {
    return available;
  },

  on(type, fn) {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(fn);
    return () => store.off(type, fn);
  },

  off(type, fn) {
    const list = listeners.get(type) || [];
    const index = list.indexOf(fn);
    if (index > -1) list.splice(index, 1);
  },

  /* ----- Configurações ----- */

  getSettings() {
    return clone(store.init().settings);
  },

  updateSettings(patch) {
    guardWrite();
    const current = store.init();
    current.settings = { ...current.settings, ...patch };
    writeRaw(current);
    emit("change", { collection: "settings" });
    emit("settings", clone(current.settings));
    return clone(current.settings);
  },

  /* ----- Categorias ----- */

  getCategories() {
    return clone(store.init().categories);
  },

  getCategory(id) {
    return clone(store.init().categories.find((c) => c.id === id) || null);
  },

  saveCategory(data) {
    return upsert("categories", data, "cat");
  },

  deleteCategory(id) {
    return remove("categories", id);
  },

  /* ----- Atividades ----- */

  getActivities(filter = {}) {
    let list = clone(store.init().activities);
    if (filter.date) list = list.filter((a) => a.date === filter.date);
    if (filter.from) list = list.filter((a) => a.date >= filter.from);
    if (filter.to) list = list.filter((a) => a.date <= filter.to);
    if (filter.categoryId)
      list = list.filter((a) => a.categoryId === filter.categoryId);
    return list.sort(
      (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)
    );
  },

  getActivity(id) {
    return clone(store.init().activities.find((a) => a.id === id) || null);
  },

  saveActivity(data) {
    return upsert("activities", data, "act");
  },

  deleteActivity(id) {
    return remove("activities", id);
  },

  /** Marca (ou desmarca) uma atividade como concluída. */
  setActivityDone(id, done) {
    return upsert("activities", {
      id,
      done: Boolean(done),
      doneAt: done ? new Date().toISOString() : null,
    });
  },

  /* ----- Tarefas ----- */

  getTasks(filter = {}) {
    let list = clone(store.init().tasks);
    if (filter.status) list = list.filter((t) => t.status === filter.status);
    if (filter.dueDate) list = list.filter((t) => t.dueDate === filter.dueDate);
    return list;
  },

  getTask(id) {
    return clone(store.init().tasks.find((t) => t.id === id) || null);
  },

  saveTask(data) {
    return upsert("tasks", data, "task");
  },

  deleteTask(id) {
    return remove("tasks", id);
  },

  /** Alterna entre "pending" e "done" e devolve a tarefa atualizada. */
  toggleTask(id) {
    const task = store.getTask(id);
    if (!task) return null;
    const done = task.status !== "done";
    return upsert("tasks", {
      id,
      status: done ? "done" : "pending",
      doneAt: done ? new Date().toISOString() : null,
    });
  },

  /* ----- Rotinas ----- */

  getRoutines() {
    return clone(store.init().routines);
  },

  getRoutine(id) {
    return clone(store.init().routines.find((r) => r.id === id) || null);
  },

  saveRoutine(data) {
    return upsert("routines", data, "rot");
  },

  deleteRoutine(id) {
    return remove("routines", id);
  },

  /** Pausa ou retoma uma rotina. */
  toggleRoutine(id) {
    const routine = store.getRoutine(id);
    if (!routine) return null;
    return upsert("routines", { id, paused: !routine.paused });
  },

  /** Remove as ocorrências já materializadas de uma rotina (ao apagá-la). */
  deleteRoutineActivities(routineId, { onlyFuture = true } = {}) {
    guardWrite();
    const current = store.init();
    const today = todayISO();
    const before = current.activities.length;

    current.activities = current.activities.filter(
      (a) =>
        a.routineId !== routineId || (onlyFuture && a.date < today)
    );

    if (current.activities.length === before) return 0;
    writeRaw(current);
    emit("change", { collection: "activities", action: "delete" });
    return before - current.activities.length;
  },

  /* ----- Backup ----- */

  exportData() {
    return JSON.stringify(
      { ...store.init(), exportedAt: new Date().toISOString() },
      null,
      2
    );
  },

  /** Recebe o texto do arquivo. Lança erro se o formato for inválido. */
  importData(json) {
    guardWrite();
    const parsed = typeof json === "string" ? JSON.parse(json) : json;
    if (!parsed || typeof parsed !== "object" || !parsed.settings) {
      throw new Error("Arquivo inválido: não parece um backup do RoutineX.");
    }
    state = migrate(parsed);
    writeRaw(state);
    emit("change", { collection: "*" });
    return store.snapshot();
  },

  clearAll() {
    guardWrite();
    const settings = clone(store.init().settings);
    state = defaultState();
    // Preferências do usuário sobrevivem à limpeza dos dados.
    state.settings = { ...state.settings, ...settings, seeded: true };
    writeRaw(state);
    emit("change", { collection: "*" });
    return store.snapshot();
  },

  /** Não há nada cadastrado? (usado no primeiro acesso) */
  isEmpty() {
    const current = store.init();
    return (
      !current.activities.length &&
      !current.routines.length &&
      !current.tasks.length
    );
  },

  /** Popula um conjunto de exemplo para a interface nascer com conteúdo. */
  seedDemo() {
    guardWrite();
    const current = store.init();
    const today = todayISO();
    const now = new Date().toISOString();

    const make = (collection, records) =>
      records.map((data) => {
        const record = {
          ...data,
          id: data.id || uid(PREFIXES[collection]),
          createdAt: now,
          updatedAt: now,
        };
        current[collection].push(record);
        return record;
      });

    const [academia, leitura, revisao] = make("routines", [
      {
        title: "Academia",
        categoryId: "cat_exercicio",
        start: "07:00",
        end: "08:00",
        days: [1, 3, 5],
        startDate: addDays(today, -60),
        endDate: null,
        paused: false,
        notes: "Treino de força — alternar superior e inferior.",
      },
      {
        title: "Leitura antes de dormir",
        categoryId: "cat_pessoal",
        start: "21:30",
        end: "22:15",
        days: [0, 1, 2, 3, 4, 5, 6],
        startDate: addDays(today, -60),
        endDate: null,
        paused: false,
        notes: "",
      },
      {
        title: "Revisão da semana",
        categoryId: "cat_pessoal",
        start: "19:00",
        end: "19:45",
        days: [0],
        startDate: addDays(today, -60),
        endDate: null,
        paused: false,
        notes: "Fechar pendências e planejar os próximos sete dias.",
      },
    ]);

    // Histórico: as ocorrências das rotinas nos últimos 7 dias já concluídas.
    const history = [];
    for (let back = 7; back >= 1; back--) {
      const date = addDays(today, -back);
      const weekday = fromISODate(date).getDay();

      for (const routine of [academia, leitura, revisao]) {
        if (!routine.days.includes(weekday)) continue;
        history.push({
          title: routine.title,
          categoryId: routine.categoryId,
          date,
          start: routine.start,
          end: routine.end,
          routineId: routine.id,
          notes: "",
          done: true,
          doneAt: `${date}T${routine.end}:00`,
        });
      }
    }

    make("activities", [
      ...history,

      // Hoje
      {
        title: "Reunião de alinhamento",
        categoryId: "cat_trabalho",
        date: today,
        start: "09:30",
        end: "10:30",
        notes: "Pauta: prioridades da semana e bloqueios.",
        done: false,
      },
      {
        title: "Bloco de foco — projeto novo",
        categoryId: "cat_trabalho",
        date: today,
        start: "14:00",
        end: "16:00",
        notes: "Sem notificações. Celular no silencioso.",
        done: false,
      },
      {
        title: "Almoço",
        categoryId: "cat_saude",
        date: today,
        start: "12:00",
        end: "13:00",
        notes: "",
        done: false,
      },

      // Próximos dias
      {
        title: "Consulta médica",
        categoryId: "cat_saude",
        date: addDays(today, 1),
        start: "10:00",
        end: "11:00",
        notes: "Levar os exames anteriores.",
        done: false,
      },
      {
        title: "Estudar espanhol",
        categoryId: "cat_estudos",
        date: addDays(today, 2),
        start: "18:30",
        end: "19:30",
        notes: "",
        done: false,
      },
      {
        title: "Feira e compras da semana",
        categoryId: "cat_casa",
        date: addDays(today, 3),
        start: "09:00",
        end: "10:30",
        notes: "",
        done: false,
      },
      {
        title: "Cinema",
        categoryId: "cat_lazer",
        date: addDays(today, 5),
        start: "20:00",
        end: "22:30",
        notes: "",
        done: false,
      },
    ]);

    make("tasks", [
      {
        title: "Pagar a conta de luz",
        categoryId: "cat_casa",
        dueDate: today,
        priority: "urgente",
        status: "pending",
        notes: "",
      },
      {
        title: "Responder o e-mail do cliente",
        categoryId: "cat_trabalho",
        dueDate: today,
        priority: "alta",
        status: "pending",
        notes: "",
      },
      {
        title: "Comprar presente de aniversário",
        categoryId: "cat_pessoal",
        dueDate: addDays(today, 4),
        priority: "media",
        status: "pending",
        notes: "",
      },
      {
        title: "Renovar a assinatura da academia",
        categoryId: "cat_exercicio",
        dueDate: addDays(today, 9),
        priority: "baixa",
        status: "pending",
        notes: "",
      },
      {
        title: "Organizar as fotos da viagem",
        categoryId: "cat_lazer",
        dueDate: null,
        priority: "baixa",
        status: "done",
        doneAt: now,
        notes: "",
      },
    ]);

    current.settings.seeded = true;
    writeRaw(current);
    emit("change", { collection: "*" });
    return store.snapshot();
  },
};

const PREFIXES = {
  categories: "cat",
  activities: "act",
  routines: "rot",
  tasks: "task",
};

/* ---------- Migração da versão de usuário único ---------- */

/**
 * Quem já usava o app antes das contas tem uma agenda inteira em "lp:v1".
 * Ela é entregue à primeira conta que abrir o sistema — uma única vez.
 */
function adoptLegacyData() {
  if (scope === GUEST_SCOPE) return;

  try {
    if (localStorage.getItem(KEY)) return; // esta conta já tem dados
    if (localStorage.getItem(LEGACY_CLAIMED)) return; // já foi adotada

    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) return;

    localStorage.setItem(KEY, legacy);
    localStorage.setItem(LEGACY_CLAIMED, scope);
    console.info("[storage] Agenda da versão anterior migrada para esta conta.");
  } catch (error) {
    console.warn("[storage] Falha ao migrar os dados antigos.", error);
  }
}

/* ---------- Helpers internos de CRUD ---------- */

function upsert(collection, data, prefix) {
  guardWrite();
  const current = store.init();
  const list = current[collection];
  const now = new Date().toISOString();

  if (data.id) {
    const index = list.findIndex((item) => item.id === data.id);
    if (index === -1) throw new Error(`Registro não encontrado: ${data.id}`);
    list[index] = { ...list[index], ...data, updatedAt: now };
    writeRaw(current);
    emit("change", { collection, action: "update", id: data.id });
    return clone(list[index]);
  }

  const record = { ...data, id: uid(prefix), createdAt: now, updatedAt: now };
  list.push(record);
  writeRaw(current);
  emit("change", { collection, action: "create", id: record.id });
  return clone(record);
}

function remove(collection, id) {
  guardWrite();
  const current = store.init();
  const index = current[collection].findIndex((item) => item.id === id);
  if (index === -1) return false;

  current[collection].splice(index, 1);
  writeRaw(current);
  emit("change", { collection, action: "delete", id });
  return true;
}

/* Mantém abas diferentes em sincronia. */
window.addEventListener("storage", (event) => {
  if (event.key !== KEY) return; // mudanças de outra conta não nos interessam
  state = event.newValue ? migrate(JSON.parse(event.newValue)) : defaultState();
  emit("change", { collection: "*", external: true });
});

export const storageKey = () => KEY;
export { todayISO };
