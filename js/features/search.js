/* =========================================================
   RoutineX — features/search.js
   Busca global: atividades, rotinas e tarefas em um só lugar.
   Abre com a lupa da topbar, com "/" ou com Ctrl/⌘ + K.
   ========================================================= */

import {
  el,
  render,
  $$,
  normalize,
  debounce,
  formatRelativeDay,
  isTyping,
} from "../utils.js";
import { store } from "../storage.js";
import { icon } from "../ui/icons.js";
import { hasOpenModal } from "../ui/modal.js";
import { openActivityDetail } from "./activities.js";
import { openTaskForm } from "./tasks.js";
import { openRoutineForm } from "./routines.js";
import { describeDays } from "./routines.js";

const LIMIT = 8;

let overlay = null;

/* ---------- Consulta ---------- */

export function searchAll(term) {
  const query = normalize(term);
  if (query.length < 2) return [];

  const matches = (text) => normalize(text).includes(query);
  const results = [];

  for (const activity of store.getActivities()) {
    if (activity.skipped) continue;
    if (!matches(activity.title) && !matches(activity.notes)) continue;
    results.push({
      kind: "Atividade",
      title: activity.title,
      meta: `${formatRelativeDay(activity.date)} · ${activity.start}–${activity.end}`,
      sort: activity.date,
      icon: "calendar",
      open: () => openActivityDetail(activity),
    });
  }

  for (const routine of store.getRoutines()) {
    if (!matches(routine.title) && !matches(routine.notes)) continue;
    results.push({
      kind: "Rotina",
      title: routine.title,
      meta: `${describeDays(routine.days)} · ${routine.start}–${routine.end}`,
      sort: "0",
      icon: "routines",
      open: () => openRoutineForm({ routine }),
    });
  }

  for (const task of store.getTasks()) {
    if (!matches(task.title) && !matches(task.notes)) continue;
    results.push({
      kind: "Tarefa",
      title: task.title,
      meta: task.dueDate
        ? `Prazo ${formatRelativeDay(task.dueDate)}`
        : "Sem prazo",
      sort: task.dueDate || "9",
      icon: "tasks",
      open: () => openTaskForm({ task }),
    });
  }

  return results
    .sort((a, b) => String(a.sort).localeCompare(String(b.sort)))
    .slice(0, LIMIT * 3);
}

/* ---------- Overlay ---------- */

export function openSearch(initial = "") {
  if (overlay) return overlay;

  const input = el("input", {
    type: "search",
    placeholder: "Buscar atividades, rotinas e tarefas…",
    "aria-label": "Busca global",
    value: initial,
    autocomplete: "off",
  });

  const results = el("div", { class: "search-results" });

  const panel = el("div", { class: "search-panel", role: "dialog", "aria-modal": "true", "aria-label": "Busca global" }, [
    el("div", { class: "search-panel__head" }, [
      el("span", { html: icon("search", 18) }),
      input,
      el("button", {
        class: "icon-btn",
        type: "button",
        "aria-label": "Fechar busca",
        html: icon("close", 16),
        onclick: () => close(),
      }),
    ]),
    results,
  ]);

  const root = el(
    "div",
    {
      class: "search-overlay",
      onmousedown: (event) => {
        if (event.target === root) close();
      },
    },
    [panel]
  );

  let active = 0;

  function paint() {
    const found = searchAll(input.value);

    if (input.value.trim().length < 2) {
      render(
        results,
        el("div", { class: "empty" }, [
          el("p", { class: "empty__title", text: "Digite para buscar" }),
          el("p", {
            class: "empty__text",
            text: "Procure por qualquer atividade, rotina ou tarefa já cadastrada.",
          }),
        ])
      );
      return;
    }

    if (!found.length) {
      render(
        results,
        el("div", { class: "empty" }, [
          el("span", { class: "empty__icon", html: icon("search", 20) }),
          el("p", { class: "empty__title", text: "Nada encontrado" }),
          el("p", {
            class: "empty__text",
            text: `Nenhum resultado para “${input.value.trim()}”.`,
          }),
        ])
      );
      return;
    }

    active = 0;
    render(
      results,
      found.map((result, index) =>
        el(
          "button",
          {
            class: "result",
            type: "button",
            dataset: { active: String(index === 0) },
            onclick: () => choose(result),
            onmouseenter: () => setActive(index),
          },
          [
            el("span", { class: "icon-btn", html: icon(result.icon, 16) }),
            el("span", { class: "result__body" }, [
              el("span", { class: "result__title", text: result.title }),
              el("span", { class: "result__meta", text: result.meta }),
            ]),
            el("span", { class: "result__kind", text: result.kind }),
          ]
        )
      )
    );
  }

  function setActive(index) {
    const nodes = $$(".result", results);
    if (!nodes.length) return;
    active = (index + nodes.length) % nodes.length;
    nodes.forEach((node, i) =>
      node.setAttribute("data-active", String(i === active))
    );
    nodes[active].scrollIntoView({ block: "nearest" });
  }

  function choose(result) {
    close();
    result.open();
  }

  function onKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }

    const nodes = $$(".result", results);
    if (!nodes.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(active + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(active - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      nodes[active].click();
    }
  }

  function close() {
    if (!overlay) return;
    overlay = null;
    document.removeEventListener("keydown", onKeydown, true);
    root.remove();
  }

  input.addEventListener("input", debounce(paint, 140));
  document.addEventListener("keydown", onKeydown, true);

  document.body.append(root);
  overlay = { close, root };
  paint();
  input.focus();
  input.select();

  return overlay;
}

export const isSearchOpen = () => Boolean(overlay);

/** Atalhos globais: "/" e Ctrl/⌘ + K. */
export function initSearchShortcuts() {
  document.addEventListener("keydown", (event) => {
    const combo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
    const slash = event.key === "/" && !isTyping() && !hasOpenModal();

    if (!combo && !slash) return;
    event.preventDefault();
    openSearch();
  });
}
