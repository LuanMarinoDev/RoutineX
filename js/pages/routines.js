/* =========================================================
   RoutineX — pages/routines.js
   As regras que se repetem. Cada cartão mostra o que a rotina
   gera, em quais dias, e deixa pausar, editar ou excluir.
   ========================================================= */

import { $, $$, el, render, todayISO, formatDuration, timeToMinutes, WEEKDAYS_MIN, weekOrder } from "../utils.js";
import { store } from "../storage.js";
import {
  emptyState,
  categoryTag,
  categoryOf,
  actionsMenu,
} from "../ui/components.js";
import { openRoutineForm, deleteRoutineFlow, describeDays } from "../features/routines.js";
import { routineCoversDate } from "../core/schedule.js";
import { toast } from "../ui/toast.js";
import { accounts } from "../auth/accounts.js";
import { can } from "../auth/permissions.js";

export function init() {
  const root = $("#routines-root");
  const summary = $("#routines-summary");

  const writable = can(accounts.currentUser(), "data:write");

  /* ---------- Cartão ---------- */

  function routineCard(routine) {
    const category = categoryOf(routine.categoryId);
    const duration = Math.max(
      0,
      timeToMinutes(routine.end) - timeToMinutes(routine.start)
    );
    const perWeek = routine.days.length;
    const active = routineCoversDate(routine, todayISO());

    const weekdays = el(
      "div",
      { class: "weekdays", role: "list", "aria-label": describeDays(routine.days) },
      weekOrder(store.getSettings().weekStartsOn).map((day) =>
        el("span", {
          role: "listitem",
          dataset: { on: String(routine.days.includes(day)) },
          title: describeDays([day]),
          text: WEEKDAYS_MIN[day],
        })
      )
    );

    return el(
      "article",
      {
        class: "routine",
        style: `--tl-color:${category.color}`,
        dataset: { paused: String(Boolean(routine.paused)), id: routine.id },
      },
      [
        el("div", { class: "routine__head" }, [
          el("div", {}, [
            el("p", { class: "routine__title", text: routine.title }),
            el("p", { class: "routine__time num" }, [
              `${routine.start} – ${routine.end}`,
              el("span", { class: "muted", text: ` · ${formatDuration(duration)}` }),
            ]),
          ]),

          el("div", { class: "row__actions" }, [
            routine.paused
              ? el("span", { class: "tag tag--plain", text: "Pausada" })
              : active
              ? el("span", { class: "tag", style: "--tag-color:var(--accent)", text: "Acontece hoje" })
              : null,
            categoryTag(routine.categoryId),
            writable &&
              actionsMenu([
                { label: "Editar", icon: "sparkle", onSelect: () => openRoutineForm({ routine }) },
                {
                  label: routine.paused ? "Retomar" : "Pausar",
                  icon: routine.paused ? "play" : "pause",
                  onSelect: () => {
                    store.toggleRoutine(routine.id);
                    toast(
                      routine.paused
                        ? "Rotina retomada — volta a aparecer na agenda."
                        : "Rotina pausada — some da agenda até você retomar."
                    );
                  },
                },
                { label: "Excluir", icon: "trash", danger: true, onSelect: () => deleteRoutineFlow(routine) },
              ]),
          ]),
        ]),

        weekdays,

        el("p", { class: "routine__meta muted" }, [
          `${describeDays(routine.days)} · ${formatDuration(duration * perWeek)} por semana`,
        ]),

        routine.notes && el("p", { class: "routine__notes", text: routine.notes }),

        (routine.startDate || routine.endDate) &&
          el("p", { class: "form__hint" }, [
            routine.startDate ? `Começou em ${routine.startDate}` : "",
            routine.endDate ? ` · termina em ${routine.endDate}` : "",
          ]),
      ]
    );
  }

  /* ---------- Pintura ---------- */

  function paint() {
    const routines = store.getRoutines();
    const activeOnes = routines.filter((routine) => !routine.paused);

    const weeklyMinutes = activeOnes.reduce(
      (total, routine) =>
        total +
        Math.max(0, timeToMinutes(routine.end) - timeToMinutes(routine.start)) *
          routine.days.length,
      0
    );

    render(
      summary,
      el("div", { class: "day-summary" }, [
        stat("Rotinas", String(routines.length)),
        stat("Ativas", String(activeOnes.length)),
        stat("Hoje", String(activeOnes.filter((r) => routineCoversDate(r, todayISO())).length)),
        stat("Tempo semanal", formatDuration(weeklyMinutes)),
      ])
    );

    if (!routines.length) {
      render(
        root,
        emptyState({
          icon: "routines",
          title: "Nenhuma rotina cadastrada",
          text: "Rotinas são o que se repete: academia toda segunda, quarta e sexta; leitura todo dia às 21h. Elas aparecem sozinhas na agenda.",
          action: writable ? { label: "Nova rotina", onClick: () => openRoutineForm() } : null,
        })
      );
      return;
    }

    // Ativas primeiro, depois por horário de início.
    const ordered = [...routines].sort(
      (a, b) =>
        Number(Boolean(a.paused)) - Number(Boolean(b.paused)) ||
        a.start.localeCompare(b.start)
    );

    render(root, el("div", { class: "routine-list" }, ordered.map(routineCard)));
  }

  $("[data-new-routine]")?.addEventListener("click", () => openRoutineForm());
  if (!writable) $$("[data-new-routine]").forEach((button) => button.remove());

  paint();
  store.on("change", paint);
}

function stat(label, value) {
  return el("div", { class: "stat" }, [
    el("p", { class: "stat__value", text: value }),
    el("p", { class: "stat__label", text: label }),
  ]);
}
