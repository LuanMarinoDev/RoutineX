/* =========================================================
   RoutineX — ui/components.js
   Peças visuais reutilizadas por várias telas: linha de
   atividade, linha de tarefa, estado vazio, menu de ações.
   ========================================================= */

import {
  el,
  formatRelativeDay,
  formatDuration,
  todayISO,
  timeToMinutes,
} from "../utils.js";
import { store } from "../storage.js";
import { icon } from "./icons.js";
import { durationOf, statusOf } from "../core/schedule.js";
import { canWrite, requireWrite } from "./guard.js";

/* ---------- Categorias ---------- */

const FALLBACK_CATEGORY = {
  id: "cat_outros",
  name: "Sem categoria",
  color: "#929892",
};

export function categoryOf(id) {
  return store.getCategory(id) || FALLBACK_CATEGORY;
}

export function categoryTag(id) {
  const category = categoryOf(id);
  return el("span", {
    class: "tag",
    style: `--tag-color:${category.color}`,
    text: category.name,
  });
}

/* ---------- Botão de conclusão ---------- */

export function checkButton({ checked, label, onToggle }) {
  const readOnly = !canWrite();

  return el("button", {
    class: "check",
    type: "button",
    role: "checkbox",
    "aria-checked": String(Boolean(checked)),
    "aria-label": label,
    disabled: readOnly,
    title: readOnly ? "Seu nível de acesso permite apenas consultar" : null,
    onclick: (event) => {
      event.stopPropagation();
      if (!requireWrite()) return;
      onToggle();
    },
  });
}

/* ---------- Menu de ações (⋯) ---------- */

export function actionsMenu(items) {
  const list = el(
    "div",
    { class: "menu__list", role: "menu", hidden: true },
    items.map((item) =>
      el("button", {
        class: `menu__item${item.danger ? " menu__item--danger" : ""}`,
        type: "button",
        role: "menuitem",
        html: `${icon(item.icon || "info", 15)}<span>${item.label}</span>`,
        onclick: (event) => {
          event.stopPropagation();
          close();
          item.onSelect();
        },
      })
    )
  );

  const trigger = el("button", {
    class: "icon-btn",
    type: "button",
    "aria-haspopup": "menu",
    "aria-expanded": "false",
    "aria-label": "Mais ações",
    html: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
    onclick: (event) => {
      event.stopPropagation();
      list.hidden ? open() : close();
    },
  });

  function open() {
    document.querySelectorAll(".menu__list:not([hidden])").forEach((node) => {
      node.hidden = true;
      node.previousElementSibling?.setAttribute("aria-expanded", "false");
    });
    list.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    document.addEventListener("click", close, { once: true });
  }

  function close() {
    list.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  return el("div", { class: "menu" }, [trigger, list]);
}

/* ---------- Estado vazio ---------- */

export function emptyState({ icon: name = "inbox", title, text, action }) {
  return el("div", { class: "empty" }, [
    el("span", { class: "empty__icon", "aria-hidden": "true", html: icon(name, 20) }),
    el("p", { class: "empty__title", text: title }),
    text && el("p", { class: "empty__text", text }),
    action &&
      el("button", {
        class: "btn btn--primary",
        type: "button",
        text: action.label,
        onclick: action.onClick,
      }),
  ]);
}

/* ---------- Linha de atividade (timeline) ---------- */

/**
 * @param {object} occurrence
 * @param {object} handlers  { onToggle, onOpen, onEdit, onDelete }
 */
export function activityItem(occurrence, handlers = {}) {
  const category = categoryOf(occurrence.categoryId);
  const status = statusOf(occurrence);

  const meta = el("p", { class: "tl-item__time" }, [
    `${occurrence.start} – ${occurrence.end}`,
    el("span", { class: "muted", text: ` · ${formatDuration(durationOf(occurrence))}` }),
  ]);

  const item = el(
    "div",
    {
      class: "tl-item",
      style: `--tl-color:${category.color}`,
      dataset: {
        done: String(Boolean(occurrence.done)),
        status,
        id: occurrence.id,
      },
    },
    [
      checkButton({
        checked: occurrence.done,
        label: `Concluir ${occurrence.title}`,
        onToggle: () => handlers.onToggle?.(occurrence),
      }),

      el(
        "button",
        {
          class: "tl-item__body",
          type: "button",
          style: "background:none;border:0;text-align:left;cursor:pointer",
          onclick: () => handlers.onOpen?.(occurrence),
        },
        [
          el("p", { class: "tl-item__title", text: occurrence.title }),
          meta,
        ]
      ),

      el("div", { class: "row__actions" }, [
        occurrence.routineId &&
          el("span", {
            class: "pill-routine",
            title: "Vem de uma rotina",
            html: `${icon("routines", 12)}<span>Rotina</span>`,
          }),
        categoryTag(occurrence.categoryId),
        canWrite() &&
          actionsMenu([
            {
              label: "Editar",
              icon: "sparkle",
              onSelect: () => handlers.onEdit?.(occurrence),
            },
            {
              label: occurrence.done ? "Marcar como pendente" : "Marcar como feita",
              icon: "check",
              onSelect: () => handlers.onToggle?.(occurrence),
            },
            {
              label: "Excluir",
              icon: "close",
              danger: true,
              onSelect: () => handlers.onDelete?.(occurrence),
            },
          ]),
      ]),
    ]
  );

  return item;
}

/**
 * Lista de atividades em formato de linha do tempo.
 * A faixa "agora" entra entre a última atividade que já começou
 * e a próxima — só quando o dia mostrado é hoje.
 */
export function timelineList(occurrences, handlers = {}, { date } = {}) {
  const showNow = date === todayISO();
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const rows = [];

  let placed = !showNow;

  for (const occurrence of occurrences) {
    if (!placed && timeToMinutes(occurrence.start) > minutes) {
      rows.push(nowLine(now));
      placed = true;
    }

    rows.push(
      el("div", { class: "timeline__row" }, [
        el("p", { class: "timeline__hour", text: occurrence.start }),
        el("div", { class: "timeline__track" }, [
          activityItem(occurrence, handlers),
        ]),
      ])
    );
  }

  if (!placed && occurrences.length) rows.push(nowLine(now));
  return rows;
}

function nowLine(now = new Date()) {
  const label = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}`;

  return el("div", { class: "now-line", style: "position:relative" }, [
    el("span", { class: "now-line__label", text: label }),
    el("span", { class: "now-line__bar" }),
  ]);
}

/* ---------- Linha de tarefa ---------- */

export function taskItem(task, handlers = {}) {
  const done = task.status === "done";
  const overdue = !done && task.dueDate && task.dueDate < todayISO();

  const meta = el("div", { class: "task-item__meta" }, [
    el("span", {
      class: "priority",
      dataset: { level: task.priority },
      text: PRIORITY_LABEL[task.priority] || "Média",
    }),
    task.dueDate &&
      el("span", {
        class: overdue ? "" : "muted",
        style: overdue ? "color:var(--danger)" : null,
        text: overdue
          ? `Atrasada — ${formatRelativeDay(task.dueDate)}`
          : formatRelativeDay(task.dueDate),
      }),
    categoryTag(task.categoryId),
  ]);

  return el(
    "div",
    { class: "task-item", dataset: { done: String(done), id: task.id } },
    [
      checkButton({
        checked: done,
        label: `Concluir ${task.title}`,
        onToggle: () => handlers.onToggle?.(task),
      }),

      el(
        "button",
        {
          class: "task-item__body",
          type: "button",
          style: "background:none;border:0;text-align:left;cursor:pointer",
          onclick: () => handlers.onEdit?.(task),
        },
        [
          el("p", { class: "task-item__title", text: task.title }),
          meta,
          task.notes &&
            el("p", {
              class: "row__meta",
              style: "margin-top:6px;white-space:pre-wrap",
              text: task.notes,
            }),
        ]
      ),

      el("div", { class: "row__actions" }, [
        canWrite() &&
          actionsMenu([
            { label: "Editar", icon: "sparkle", onSelect: () => handlers.onEdit?.(task) },
            {
              label: done ? "Reabrir" : "Concluir",
              icon: "check",
              onSelect: () => handlers.onToggle?.(task),
            },
            {
              label: "Excluir",
              icon: "close",
              danger: true,
              onSelect: () => handlers.onDelete?.(task),
            },
          ]),
      ]),
    ]
  );
}

export const PRIORITY_LABEL = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

export const PRIORITY_ORDER = { urgente: 0, alta: 1, media: 2, baixa: 3 };

/* ---------- Barra de progresso rotulada ---------- */

export function progressBar(percent, label) {
  return el(
    "div",
    {
      class: "progress",
      role: "progressbar",
      "aria-valuenow": String(Math.round(percent)),
      "aria-valuemin": "0",
      "aria-valuemax": "100",
      "aria-label": label || "Progresso",
    },
    [el("div", { class: "progress__bar", style: `width:${percent}%` })]
  );
}
