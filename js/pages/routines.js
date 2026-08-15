/* =========================================================
   RoutineX — pages/routines.js
   As regras que se repetem, num quadro de 7 colunas.
   Cada coluna é um dia da semana; a rotina aparece em todos
   os dias que ela marca, com pausar, editar ou excluir.
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

const WEEKDAYS_LONG = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

export function init() {
  const root = $("#routines-root");

  const writable = can(accounts.currentUser(), "data:write");

  const minutesOf = (routine) =>
    Math.max(0, timeToMinutes(routine.end) - timeToMinutes(routine.start));

  /* ---------- Datas da semana em exibição ---------- */

  /** Casa cada dia da semana com a data real desta semana. */
  function weekDates(order) {
    const today = new Date();
    const offset = order.indexOf(today.getDay());
    const map = new Map();

    order.forEach((day, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() + (index - offset));
      const pad = (value) => String(value).padStart(2, "0");
      map.set(
        day,
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
      );
    });

    return map;
  }

  /* ---------- Cartão ---------- */

  function routineCard(routine, day, dateISO) {
    const category = categoryOf(routine.categoryId);
    const duration = minutesOf(routine);

    // Fora da janela de início/término — a rotina existe, mas não roda neste dia.
    const outside = !routine.paused && !routineCoversDate(routine, dateISO);

    const period = [
      routine.startDate ? `Começou em ${routine.startDate}` : "",
      routine.endDate ? `termina em ${routine.endDate}` : "",
    ]
      .filter(Boolean)
      .join(" · ");

    const strip = el(
      "div",
      { class: "rcard__days", role: "list", "aria-label": describeDays(routine.days) },
      weekOrder(store.getSettings().weekStartsOn).map((weekday) =>
        el("span", {
          role: "listitem",
          dataset: {
            on: String(routine.days.includes(weekday)),
            current: String(weekday === day),
          },
          title: WEEKDAYS_LONG[weekday],
          text: WEEKDAYS_MIN[weekday],
        })
      )
    );

    return el(
      "article",
      {
        class: "rcard",
        style: `--tl-color:${category.color}`,
        title: period || undefined,
        dataset: {
          id: routine.id,
          paused: String(Boolean(routine.paused)),
          outside: String(outside),
        },
      },
      [
        el("div", { class: "rcard__head" }, [
          el("p", { class: "rcard__title", text: routine.title }),
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

        el("p", { class: "rcard__time num" }, [
          `${routine.start} – ${routine.end}`,
          el("span", { class: "muted", text: ` · ${formatDuration(duration)}` }),
        ]),

        el("div", { class: "rcard__tags" }, [
          routine.paused ? el("span", { class: "tag tag--plain", text: "Pausada" }) : null,
          outside ? el("span", { class: "tag tag--plain", text: "Fora do período" }) : null,
          categoryTag(routine.categoryId),
        ]),

        strip,

        routine.notes && el("p", { class: "rcard__notes", text: routine.notes }),
      ]
    );
  }

  /* ---------- Coluna do dia ---------- */

  function dayColumn(day, dateISO, routines) {
    const isToday = dateISO === todayISO();

    // Ativas primeiro, depois por horário de início.
    const ofDay = routines
      .filter((routine) => routine.days.includes(day))
      .sort(
        (a, b) =>
          Number(Boolean(a.paused)) - Number(Boolean(b.paused)) ||
          a.start.localeCompare(b.start)
      );

    const load = ofDay
      .filter((routine) => !routine.paused && routineCoversDate(routine, dateISO))
      .reduce((total, routine) => total + minutesOf(routine), 0);

    const addButton =
      writable &&
      el("button", {
        class: "board__add",
        type: "button",
        text: "+ Nova rotina",
        "aria-label": `Nova rotina ${WEEKDAYS_LONG[day].toLowerCase()}`,
      });

    if (addButton) {
      addButton.addEventListener("click", () => openRoutineForm({ preset: { days: [day] } }));
    }

    return el(
      "section",
      {
        class: "board__col",
        dataset: {
          day: String(day),
          today: String(isToday),
          weekend: String(day === 0 || day === 6),
        },
        "aria-label": WEEKDAYS_LONG[day],
      },
      [
        el("header", { class: "board__head" }, [
          el("p", { class: "board__day", text: WEEKDAYS_LONG[day] }),
          el("span", { class: "board__count num", text: String(ofDay.length) }),
          el("span", { class: "board__load num muted", text: load ? formatDuration(load) : "—" }),
        ]),

        el(
          "div",
          { class: "board__body" },
          ofDay.length
            ? ofDay.map((routine) => routineCard(routine, day, dateISO))
            : [el("p", { class: "board__empty muted", text: "Nada neste dia." })]
        ),

        addButton,
      ]
    );
  }

  /* ---------- Pintura ---------- */

  function paint() {
    const routines = store.getRoutines();

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

    const order = weekOrder(store.getSettings().weekStartsOn);
    const dates = weekDates(order);

    render(
      root,
      el(
        "div",
        { class: "board" },
        order.map((day) => dayColumn(day, dates.get(day), routines))
      )
    );
  }

  $("[data-new-routine]")?.addEventListener("click", () => openRoutineForm());
  if (!writable) $$("[data-new-routine]").forEach((button) => button.remove());

  paint();
  store.on("change", paint);
}