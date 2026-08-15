/* =========================================================
   RoutineX — pages/tasks.js
   A lista do que precisa ser feito, agrupada por prazo:
   atrasadas primeiro, depois hoje, esta semana, depois e sem data.
   ========================================================= */

import { $, $$, el, render, todayISO, addDays } from "../utils.js";
import { store } from "../storage.js";
import { taskItem, emptyState } from "../ui/components.js";
import { openTaskForm, deleteTaskFlow, sortTasks } from "../features/tasks.js";
import { toast } from "../ui/toast.js";
import { accounts } from "../auth/accounts.js";
import { can } from "../auth/permissions.js";

const FILTERS = {
  all: { label: "Todas", match: () => true },
  pending: { label: "Pendentes", match: (task) => task.status !== "done" },
  done: { label: "Concluídas", match: (task) => task.status === "done" },
};

export function init() {
  const root = $("#tasks-root");
  const toolbar = $("#tasks-toolbar");

  const params = new URLSearchParams(window.location.search);
  let filter = FILTERS[params.get("filter")] ? params.get("filter") : "pending";

  const writable = can(accounts.currentUser(), "data:write");

  const handlers = {
    onToggle: (task) => {
      store.toggleTask(task.id);
      toast(task.status === "done" ? "Tarefa reaberta." : "Tarefa concluída.");
    },
    onEdit: (task) => openTaskForm({ task }),
    onDelete: (task) => deleteTaskFlow(task),
  };

  /* ---------- Filtros ---------- */

  function paintToolbar() {
    render(
      toolbar,
      ...Object.entries(FILTERS).map(([id, config]) => {
        const count = store.getTasks().filter(config.match).length;

        return el("button", {
          class: "chip",
          type: "button",
          "aria-pressed": String(id === filter),
          dataset: { filter: id },
          text: `${config.label} (${count})`,
          onclick: () => {
            filter = id;
            const url = new URL(window.location.href);
            url.searchParams.set("filter", id);
            window.history.replaceState({}, "", url);
            paint();
          },
        });
      })
    );
  }

  /* ---------- Agrupamento ---------- */

  /** Um prazo vira um grupo com nome de gente: "Atrasadas", "Hoje"… */
  function groupOf(task) {
    if (task.status === "done") return "Concluídas";
    if (!task.dueDate) return "Sem prazo";

    const today = todayISO();
    if (task.dueDate < today) return "Atrasadas";
    if (task.dueDate === today) return "Hoje";
    if (task.dueDate <= addDays(today, 7)) return "Próximos 7 dias";
    return "Mais adiante";
  }

  const GROUP_ORDER = [
    "Atrasadas",
    "Hoje",
    "Próximos 7 dias",
    "Mais adiante",
    "Sem prazo",
    "Concluídas",
  ];

  /* ---------- Pintura ---------- */

  function paintList() {
    const all = store.getTasks();
    const visible = sortTasks(all.filter(FILTERS[filter].match));

    if (!visible.length) {
      render(
        root,
        emptyState({
          icon: "tasks",
          title:
            filter === "done"
              ? "Nada concluído ainda"
              : all.length
              ? "Nenhuma tarefa neste filtro"
              : "Sua lista está vazia",
          text:
            filter === "done"
              ? "As tarefas que você concluir aparecem aqui."
              : "Tarefas são o que precisa ser feito sem hora marcada — o que não pode esquecer.",
          action: writable ? { label: "Nova tarefa", onClick: () => openTaskForm() } : null,
        })
      );
      return;
    }

    // Agrupa mantendo a ordem de prioridade já resolvida por sortTasks.
    const groups = new Map();
    for (const task of visible) {
      const key = groupOf(task);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(task);
    }

    const sections = GROUP_ORDER.filter((name) => groups.has(name)).map((name) =>
      el("section", { class: "task-group" }, [
        el("div", { class: "task-group__head" }, [
          el("p", { class: "eyebrow", text: name }),
          el("span", { class: "badge", text: String(groups.get(name).length) }),
        ]),
        ...groups.get(name).map((task) => taskItem(task, handlers)),
      ])
    );

    render(root, el("div", { class: "task-groups" }, sections));
  }

  function paint() {
    paintToolbar();
    paintList();
  }

  $("[data-new-task]")?.addEventListener("click", () => openTaskForm());
  if (!writable) $$("[data-new-task]").forEach((button) => button.remove());

  paint();
  store.on("change", paint);
}