/* =========================================================
   RoutineX — app.js
   Ponto de entrada. Todas as páginas carregam este arquivo.
   Responsabilidade: resolver a sessão, apontar o storage para a
   conta certa, montar o layout e delegar para o módulo da tela.
   ========================================================= */

import { store } from "./storage.js";
import { isTyping } from "./utils.js";
import { accounts } from "./auth/accounts.js";
import { can } from "./auth/permissions.js";
import { initShell, requestNewActivity, toggleDrawer } from "./ui/shell.js";
import { initClock } from "./ui/clock.js";
import { initTheme } from "./ui/theme.js";
import { toast } from "./ui/toast.js";
import { hasOpenModal, chooseDialog } from "./ui/modal.js";
import { openActivityForm } from "./features/activities.js";
import { openTaskForm } from "./features/tasks.js";
import { openRoutineForm } from "./features/routines.js";
import { openSearch, isSearchOpen, initSearchShortcuts } from "./features/search.js";
import { initNotifications } from "./features/notifications.js";

/* ---------- Mapa de telas ----------
   Import dinâmico: cada tela só baixa o código que usa, e uma
   página sem módulo próprio continua funcionando com a casca.
*/

const PAGES = {
  login: () => import("./pages/login.js"),
  dashboard: () => import("./pages/dashboard.js"),
  calendar: () => import("./pages/calendar.js"),
  tasks: () => import("./pages/tasks.js"),
  routines: () => import("./pages/routines.js"),
  statistics: () => import("./pages/statistics.js"),
  settings: () => import("./pages/settings.js"),
  profile: () => import("./pages/profile.js"),
  users: () => import("./pages/users.js"),
};

/** Telas que funcionam sem ninguém logado. */
const PUBLIC_PAGES = new Set(["login"]);

/** Telas que exigem uma permissão específica. */
const GUARDED_PAGES = { users: "users:manage" };

async function initPage(name) {
  const load = PAGES[name];
  if (!load) return;

  try {
    const module = await load();
    module.init?.();
  } catch (error) {
    console.error(`[app] Falha ao iniciar a tela "${name}".`, error);
    toast("Algo não carregou nesta tela. Tente recarregar a página.", "warning", 6000);
  }
}

/* ---------- Sessão ---------- */

/**
 * Decide se a pessoa pode ver esta tela e aponta o storage para a
 * gaveta dela. Devolve false quando um redirecionamento foi disparado
 * — nesse caso não vale a pena montar mais nada.
 */
function resolveSession(page, root) {
  accounts.init();
  const user = accounts.currentUser();

  store.use(user?.id);

  if (PUBLIC_PAGES.has(page)) {
    if (user) {
      window.location.replace(`${root}index.html`);
      return false;
    }
    return true;
  }

  if (!user) {
    const here = window.location.pathname.includes("/pages/")
      ? `pages/${window.location.pathname.split("/").pop()}`
      : "";
    const next = here ? `?next=${encodeURIComponent(here)}` : "";
    window.location.replace(`${root}pages/login.html${next}`);
    return false;
  }

  const required = GUARDED_PAGES[page];
  if (required && !can(user, required)) {
    window.location.replace(`${root}index.html?denied=${page}`);
    return false;
  }

  return true;
}

/** Aviso ao voltar de uma tela negada pelo nível de acesso. */
function reportDenied() {
  const denied = new URLSearchParams(window.location.search).get("denied");
  if (!denied) return;

  toast("Seu nível de acesso não permite abrir aquela tela.", "warning", 5000);

  const url = new URL(window.location.href);
  url.searchParams.delete("denied");
  window.history.replaceState({}, "", url);
}

/* ---------- Intenções de cadastro ----------
   O shell (e qualquer botão [data-action]) só anuncia o que a
   pessoa quer criar. É aqui que a intenção vira formulário.
*/

/* Quem está vendo a quinta-feira espera criar na quinta-feira: as telas
   com navegação por data anunciam o dia em <body data-view-date>. */
const viewedDate = () => document.body.dataset.viewDate || undefined;

const CREATORS = {
  activity: (detail) =>
    openActivityForm({ date: detail.date || viewedDate(), start: detail.start }),
  task: (detail) => openTaskForm({ dueDate: detail.date || viewedDate() }),
  routine: () => openRoutineForm(),
};

function initCreateBridge() {
  document.addEventListener("lp:create", (event) => {
    const detail = event.detail || {};

    // Visitante não cria nada; melhor dizer isso do que abrir um
    // formulário que vai falhar na hora de salvar.
    if (!can(accounts.currentUser(), "data:write")) {
      toast("Seu nível de acesso é somente leitura.", "warning");
      return;
    }

    (CREATORS[detail.kind] || CREATORS.activity)(detail);
  });

  document.addEventListener("lp:search", () => openSearch());
}

/* ---------- Atalhos de teclado ---------- */

const SHORTCUTS = {
  n: () => requestNewActivity({ source: "shortcut" }),
  // O dia de hoje agora abre no dashboard; "t" leva para lá.
  t: (root) => go(root, "index.html"),
  c: (root) => go(root, "pages/calendar.html"),
};

function go(root, href) {
  window.location.href = root + href;
}

function initShortcuts(root) {
  document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTyping()) return;

    if (event.key === "Escape") {
      document.dispatchEvent(new CustomEvent("lp:escape"));
      return;
    }

    // Com um modal ou a busca abertos, as letras pertencem a eles.
    if (hasOpenModal() || isSearchOpen()) return;

    const action = SHORTCUTS[event.key.toLowerCase()];
    if (!action) return;

    event.preventDefault();
    action(root);
  });
}

/* ---------- Primeiro acesso ----------
   Ninguém gosta de abrir um app vazio sem saber por onde começar,
   nem de achar dados que não cadastrou. Então a pessoa escolhe.
*/

async function offerDemoData() {
  const settings = store.getSettings();
  if (settings.seeded || !store.isEmpty() || !store.isAvailable()) return;
  if (!can(accounts.currentUser(), "data:write")) return;

  const choice = await chooseDialog({
    title: "Tudo pronto para começar",
    message:
      "Quer ver o RoutineX com alguns exemplos (rotinas, atividades e tarefas) ou começar com a agenda em branco?",
    options: [
      { label: "Começar do zero", value: "empty" },
      { label: "Ver com exemplos", value: "demo", primary: true },
    ],
  });

  if (choice === "demo") {
    store.seedDemo();
    toast("Pronto: exemplos criados. Apague o que não fizer sentido.", "success", 5000);
    return;
  }

  // Mesmo recusando, a pergunta não se repete.
  store.updateSettings({ seeded: true });
}

/* ---------- Boot ---------- */

function boot() {
  const root = document.body.dataset.root ?? "";
  const page = document.body.dataset.page || "dashboard";

  if (!resolveSession(page, root)) return;

  initTheme();

  if (PUBLIC_PAGES.has(page)) {
    initPage(page);
    document.documentElement.dataset.ready = "true";
    return;
  }

  initShell();
  initClock();
  initCreateBridge();
  initShortcuts(root);
  initSearchShortcuts();
  initNotifications();

  if (!store.isAvailable()) {
    toast(
      "Não foi possível acessar o armazenamento do navegador. Suas alterações não serão salvas.",
      "warning",
      6000
    );
  }

  reportDenied();
  initPage(page);
  offerDemoData();

  document.documentElement.dataset.ready = "true";
}

// Fecha o menu lateral quando a página é restaurada do cache do navegador.
window.addEventListener("pageshow", () => toggleDrawer(false));

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
