/* =========================================================
   RoutineX — pages/calendar.js
   Três visões da mesma agenda: mês, semana e dia.
   O estado (visão + data) vive na URL, então dá para
   compartilhar ou recarregar sem perder o lugar.
   ========================================================= */

import {
  $,
  $$,
  el,
  render,
  every,
  addDays,
  addMonths,
  startOfWeek,
  fromISODate,
  toISODate,
  todayISO,
  timeToMinutes,
  nowMinutes,
  formatDateLong,
  formatDuration,
  minutesToTime,
  clamp,
  weekOrder,
  WEEKDAYS_SHORT,
  MONTHS_LONG,
} from "../utils.js";
import { store } from "../storage.js";
import {
  occurrencesFor,
  occurrencesInRange,
  dayStats,
  durationOf,
  toggleOccurrenceDone,
} from "../core/schedule.js";
import { categoryOf, emptyState, timelineList, taskItem } from "../ui/components.js";
import { icon } from "../ui/icons.js";
import {
  openActivityForm,
  openActivityDetail,
  deleteActivityFlow,
} from "../features/activities.js";
import { openTaskForm, deleteTaskFlow, sortTasks } from "../features/tasks.js";
import { openModal } from "../ui/modal.js";
import { canWrite, requireWrite } from "../ui/guard.js";
import { toast } from "../ui/toast.js";

const HOUR_HEIGHT = 52;
const MAX_CHIPS = 3;
const VIEWS = ["month", "week", "day"];

export function init() {
  const params = new URLSearchParams(window.location.search);

  let view = VIEWS.includes(params.get("view")) ? params.get("view") : "month";
  let cursor = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") || "")
    ? params.get("date")
    : todayISO();

  const root = $("#calendar-root");
  const title = $("#cal-title");

  const handlers = {
    onToggle: (occurrence) => {
      toggleOccurrenceDone(occurrence);
      if (!occurrence.done) toast("Feito! Mais uma concluída.");
    },
    onOpen: (occurrence) => openActivityDetail(occurrence),
    onEdit: (occurrence) => openActivityForm({ occurrence }),
    onDelete: (occurrence) => deleteActivityFlow(occurrence),
  };

  /* ---------- Estado na URL ---------- */

  function syncUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set("view", view);
    url.searchParams.set("date", cursor);
    window.history.replaceState({}, "", url);
  }

  function setView(next) {
    view = next;
    $$(".segmented button").forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.view === next))
    );
    syncUrl();
    paint();
  }

  function move(direction) {
    if (view === "month") cursor = addMonths(cursor, direction);
    else if (view === "week") cursor = addDays(cursor, direction * 7);
    else cursor = addDays(cursor, direction);
    syncUrl();
    paint();
  }

  /* ---------- Modal do dia completo ---------- */

  /**
   * Abre um modal com tudo o que existe naquele dia — atividades, rotinas
   * e tarefas com prazo — e permite marcar o dia inteiro como concluído
   * sem precisar sair da grade do calendário.
   */
  function openDayDetail(iso) {
    let unsubscribe = null;
    const placeholder = el("div");

    const modal = openModal({
      title: formatDateLong(iso),
      subtitle: iso === todayISO() ? "Hoje" : null,
      wide: true,
      body: placeholder,
      footer: [
        el("button", {
          class: "btn btn--ghost",
          type: "button",
          text: "Abrir na agenda",
          onclick: () => {
            window.location.href = `today.html?date=${iso}`;
          },
        }),
        el("button", {
          class: "btn btn--primary",
          type: "button",
          text: "Nova atividade",
          onclick: () => {
            modal.close();
            openActivityForm({ date: iso });
          },
        }),
      ],
      onClose: () => unsubscribe?.(),
    });

    const dayHandlers = {
      onToggle: (occurrence) => {
        toggleOccurrenceDone(occurrence);
        if (!occurrence.done) toast("Feito! Mais uma concluída.");
      },
      onOpen: (occurrence) => openActivityDetail(occurrence),
      onEdit: (occurrence) => openActivityForm({ occurrence }),
      onDelete: (occurrence) => deleteActivityFlow(occurrence),
    };

    const taskHandlers = {
      onToggle: (task) => {
        store.toggleTask(task.id);
        toast(task.status === "done" ? "Tarefa reaberta." : "Tarefa concluída.");
      },
      onEdit: (task) => openTaskForm({ task }),
      onDelete: (task) => deleteTaskFlow(task),
    };

    function markAllDone() {
      if (!requireWrite()) return;

      const pendingOccurrences = occurrencesFor(iso).filter((o) => !o.done);
      const pendingTasks = store
        .getTasks({ dueDate: iso })
        .filter((t) => t.status !== "done");

      if (!pendingOccurrences.length && !pendingTasks.length) return;

      pendingOccurrences.forEach((occurrence) => toggleOccurrenceDone(occurrence));
      pendingTasks.forEach((task) => store.toggleTask(task.id));

      toast("Dia todo concluído!");
    }

    function repaint() {
      const occurrences = occurrencesFor(iso);
      const tasks = sortTasks(store.getTasks({ dueDate: iso }));
      const stats = dayStats(iso, occurrences);
      const pendingTasks = tasks.filter((t) => t.status !== "done");
      const hasAnything = Boolean(occurrences.length || tasks.length);
      const allDone = hasAnything && stats.pending === 0 && !pendingTasks.length;

      render(
        placeholder,
        el("div", { class: "inline", style: "margin-bottom:16px" }, [
          el("span", {
            class: "tag tag--plain",
            text: `${stats.done}/${stats.total} atividades`,
          }),
          tasks.length
            ? el("span", {
                class: "tag tag--plain",
                text: `${tasks.length - pendingTasks.length}/${tasks.length} tarefas`,
              })
            : null,
          el("span", { class: "tag tag--plain", text: formatDuration(stats.plannedMinutes) }),
          el("span", { class: "spacer" }),
          canWrite() && hasAnything
            ? el("button", {
                class: "btn btn--ghost btn--sm",
                type: "button",
                text: "Marcar tudo como feito",
                disabled: allDone,
                onclick: markAllDone,
              })
            : null,
        ]),

        !hasAnything &&
          emptyState({
            icon: "calendar",
            title: "Dia livre",
            text: `Nada agendado para ${formatDateLong(iso)}.`,
            action: {
              label: "Nova atividade",
              onClick: () => {
                modal.close();
                openActivityForm({ date: iso });
              },
            },
          }),

        occurrences.length
          ? el("div", { class: "timeline" }, timelineList(occurrences, dayHandlers, { date: iso }))
          : null,

        tasks.length
          ? el("div", { style: "margin-top:20px" }, [
              el("p", {
                class: "eyebrow",
                style: "margin-bottom:8px",
                text: "Tarefas com prazo neste dia",
              }),
              ...tasks.map((task) => taskItem(task, taskHandlers)),
            ])
          : null
      );
    }

    unsubscribe = store.on("change", repaint);
    repaint();
  }

  /* ---------- Controles ---------- */

  $("[data-cal='prev']").addEventListener("click", () => move(-1));
  $("[data-cal='next']").addEventListener("click", () => move(1));
  $("[data-cal='today']").addEventListener("click", () => {
    cursor = todayISO();
    syncUrl();
    paint();
  });

  $$(".segmented button").forEach((button) =>
    button.addEventListener("click", () => setView(button.dataset.view))
  );

  /* ---------- Mês ---------- */

  function paintMonth() {
    const date = fromISODate(cursor);
    const weekStartsOn = store.getSettings().weekStartsOn;

    const firstOfMonth = toISODate(new Date(date.getFullYear(), date.getMonth(), 1));
    const lastOfMonth = toISODate(
      new Date(date.getFullYear(), date.getMonth() + 1, 0)
    );

    const gridStart = startOfWeek(firstOfMonth, weekStartsOn);
    let gridEnd = addDays(startOfWeek(lastOfMonth, weekStartsOn), 6);
    // Sempre seis linhas: o calendário não "pula" de altura ao trocar de mês.
    while (daysBetween(gridStart, gridEnd) < 41) gridEnd = addDays(gridEnd, 7);

    const byDate = occurrencesInRange(gridStart, gridEnd);
    const today = todayISO();

    const head = el(
      "div",
      { class: "cal-grid__head" },
      weekOrder(weekStartsOn).map((day) =>
        el("span", { text: WEEKDAYS_SHORT[day] })
      )
    );

    const cells = [];
    for (const [iso, occurrences] of byDate) {
      const outside = iso < firstOfMonth || iso > lastOfMonth;
      const visible = occurrences.slice(0, MAX_CHIPS);

      cells.push(
        el(
          "div",
          {
            class: "cal-day",
            dataset: {
              today: String(iso === today),
              outside: String(outside),
              selected: String(iso === cursor),
            },
            role: "button",
            tabindex: "0",
            "aria-label": `${formatDateLong(iso)} — ${occurrences.length} ${
              occurrences.length === 1 ? "atividade" : "atividades"
            }`,
            onclick: () => openDayDetail(iso),
            onkeydown: (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openDayDetail(iso);
              }
            },
          },
          [
            el("button", {
              class: "cal-day__add",
              type: "button",
              "aria-label": `Nova atividade em ${formatDateLong(iso)}`,
              html: icon("plus", 14),
              onclick: (event) => {
                event.stopPropagation();
                openActivityForm({ date: iso });
              },
            }),

            el("span", { class: "cal-day__num", text: String(fromISODate(iso).getDate()) }),

            el(
              "div",
              { class: "cal-day__events" },
              [
                ...visible.map((occurrence) => {
                  const category = categoryOf(occurrence.categoryId);
                  return el("span", {
                    class: "cal-chip",
                    style: `--tl-color:${category.color}`,
                    dataset: { done: String(occurrence.done) },
                    title: `${occurrence.start} ${occurrence.title}`,
                    text: `${occurrence.start} ${occurrence.title}`,
                    onclick: (event) => {
                      event.stopPropagation();
                      openActivityDetail(occurrence);
                    },
                  });
                }),
                occurrences.length > MAX_CHIPS &&
                  el("span", {
                    class: "cal-more",
                    text: `+${occurrences.length - MAX_CHIPS} mais`,
                  }),
              ]
            ),
          ]
        )
      );
    }

    title.innerHTML = "";
    title.append(
      document.createTextNode(`${MONTHS_LONG[date.getMonth()]} `),
      el("span", { text: String(date.getFullYear()) })
    );

    render(
      root,
      el("div", { class: "cal-grid" }, [head, el("div", { class: "cal-grid__body" }, cells)])
    );
  }

  /* ---------- Semana e dia ---------- */

  function paintGrid(days) {
    const today = todayISO();
    const byDate = occurrencesInRange(days[0], days[days.length - 1]);
    const all = [...byDate.values()].flat();

    const range = hourRange(all);
    const hours = [];
    for (let hour = range.from; hour <= range.to; hour++) hours.push(hour);

    const head = el(
      "div",
      { class: "wk__head" },
      [
        el("div", {}),
        ...days.map((iso) => {
          const date = fromISODate(iso);
          return el(
            "div",
            {
              class: "wk__day",
              dataset: { today: String(iso === today) },
              role: "button",
              tabindex: "0",
              title: `Ver ${formatDateLong(iso)}`,
              onclick: () => openDayDetail(iso),
              onkeydown: (event) => {
                if (event.key === "Enter") openDayDetail(iso);
              },
            },
            [
              el("p", { class: "wk__day-name", text: WEEKDAYS_SHORT[date.getDay()] }),
              el("p", { class: "wk__day-num num", text: String(date.getDate()) }),
            ]
          );
        }),
      ]
    );

    const columns = days.map((iso) => {
      const column = el("div", {
        class: "wk__col",
        dataset: { today: String(iso === today), date: iso },
        style: `height:${hours.length * HOUR_HEIGHT}px`,
        onclick: (event) => {
          if (event.target !== column) return;
          const offset = event.offsetY / HOUR_HEIGHT;
          const hour = clamp(range.from + Math.floor(offset), 0, 23);
          openActivityForm({ date: iso, start: minutesToTime(hour * 60) });
        },
      });

      for (const { occurrence, lane, lanes } of layoutLanes(byDate.get(iso) || [])) {
        column.append(eventNode(occurrence, lane, lanes, range));
      }

      if (iso === today) {
        const offset = (nowMinutes() - range.from * 60) * (HOUR_HEIGHT / 60);
        if (offset >= 0 && offset <= hours.length * HOUR_HEIGHT) {
          column.append(el("div", { class: "wk__now", style: `top:${offset}px` }));
        }
      }

      return column;
    });

    const body = el("div", { class: "wk__body" }, [
      el(
        "div",
        { class: "wk__hours" },
        hours.map((hour) =>
          el("p", {
            class: "wk__hour",
            text: `${String(hour).padStart(2, "0")}:00`,
          })
        )
      ),
      ...columns,
    ]);

    const grid = el("div", { class: "wk", style: `--cols:${days.length}` }, [head, body]);
    render(root, grid);

    // Abre a visão já rolada para perto do horário atual.
    requestAnimationFrame(() => {
      const target = (nowMinutes() - range.from * 60) * (HOUR_HEIGHT / 60) - 120;
      body.scrollTop = Math.max(0, target);
    });
  }

  function eventNode(occurrence, lane, lanes, range) {
    const category = categoryOf(occurrence.categoryId);
    const top = (timeToMinutes(occurrence.start) - range.from * 60) * (HOUR_HEIGHT / 60);
    const height = Math.max(20, durationOf(occurrence) * (HOUR_HEIGHT / 60) - 2);
    const width = `calc(${100 / lanes}% - 6px)`;

    return el(
      "button",
      {
        class: "wk-event",
        type: "button",
        dataset: { done: String(occurrence.done) },
        style: `--tl-color:${category.color};top:${top}px;height:${height}px;left:calc(3px + ${
          (100 / lanes) * lane
        }%);width:${width}`,
        title: `${occurrence.title} · ${occurrence.start}–${occurrence.end}`,
        onclick: () => openActivityDetail(occurrence),
      },
      [
        el("span", { class: "wk-event__title", text: occurrence.title }),
        height > 30 &&
          el("span", { class: "wk-event__time", text: `${occurrence.start}–${occurrence.end}` }),
      ]
    );
  }

  function paintWeek() {
    const weekStartsOn = store.getSettings().weekStartsOn;
    const start = startOfWeek(cursor, weekStartsOn);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

    const first = fromISODate(days[0]);
    const last = fromISODate(days[6]);
    const sameMonth = first.getMonth() === last.getMonth();

    title.innerHTML = "";
    title.append(
      document.createTextNode(
        sameMonth
          ? `${first.getDate()} – ${last.getDate()} de ${MONTHS_LONG[first.getMonth()]} `
          : `${first.getDate()} ${MONTHS_LONG[first.getMonth()].slice(0, 3)} – ${last.getDate()} ${MONTHS_LONG[
              last.getMonth()
            ].slice(0, 3)} `
      ),
      el("span", { text: String(last.getFullYear()) })
    );

    paintGrid(days);
  }

  function paintDay() {
    const occurrences = occurrencesFor(cursor);
    const stats = dayStats(cursor, occurrences);
    const date = fromISODate(cursor);

    title.innerHTML = "";
    title.append(
      document.createTextNode(
        `${date.getDate()} de ${MONTHS_LONG[date.getMonth()]} `
      ),
      el("span", { text: String(date.getFullYear()) })
    );

    if (!occurrences.length) {
      render(
        root,
        emptyState({
          icon: "calendar",
          title: "Dia livre",
          text: `Nada agendado para ${formatDateLong(cursor)}.`,
          action: {
            label: "Nova atividade",
            onClick: () => openActivityForm({ date: cursor }),
          },
        })
      );
      return;
    }

    render(
      root,
      el("div", { class: "inline", style: "margin-bottom:16px" }, [
        el("span", {
          class: "tag tag--plain",
          text: `${stats.done}/${stats.total} concluídas`,
        }),
        el("span", {
          class: "tag tag--plain",
          text: formatDuration(stats.plannedMinutes),
        }),
        el("span", { class: "spacer" }),
        el("button", {
          class: "btn btn--ghost btn--sm",
          type: "button",
          text: "Abrir na agenda",
          onclick: () => {
            window.location.href = `today.html?date=${cursor}`;
          },
        }),
      ]),
      el("div", { class: "timeline" }, timelineList(occurrences, handlers, { date: cursor }))
    );
  }

  /* ---------- Orquestração ---------- */

  function paint() {
    // O botão “Nova atividade” da topbar segue o período que está na tela.
    document.body.dataset.viewDate = cursor;

    if (view === "month") paintMonth();
    else if (view === "week") paintWeek();
    else paintDay();
  }

  $$(".segmented button").forEach((button) =>
    button.setAttribute("aria-pressed", String(button.dataset.view === view))
  );

  paint();
  store.on("change", paint);
  every(60_000, () => {
    if (view !== "month") paint();
  });
}

/* ---------- Auxiliares ---------- */

function daysBetween(from, to) {
  return Math.round((fromISODate(to) - fromISODate(from)) / 86400000);
}

/** Faixa de horas exibida: cobre as atividades, com 6h–22h de piso. */
function hourRange(occurrences) {
  let from = 6;
  let to = 22;

  for (const occurrence of occurrences) {
    from = Math.min(from, Math.floor(timeToMinutes(occurrence.start) / 60));
    to = Math.max(to, Math.ceil(timeToMinutes(occurrence.end) / 60));
  }

  return { from: clamp(from, 0, 23), to: clamp(to, 1, 24) - 1 };
}

/**
 * Divide atividades que se sobrepõem em colunas lado a lado.
 * Devolve [{ occurrence, lane, lanes }].
 */
function layoutLanes(occurrences) {
  const sorted = [...occurrences].sort(
    (a, b) => timeToMinutes(a.start) - timeToMinutes(b.start)
  );

  const result = [];
  let cluster = [];
  let clusterEnd = -1;

  const flush = () => {
    if (!cluster.length) return;
    const lanes = Math.max(...cluster.map((item) => item.lane)) + 1;
    cluster.forEach((item) => result.push({ ...item, lanes }));
    cluster = [];
    clusterEnd = -1;
  };

  for (const occurrence of sorted) {
    const start = timeToMinutes(occurrence.start);
    const end = timeToMinutes(occurrence.end);

    if (start >= clusterEnd) flush();

    const used = new Set(cluster.filter((item) => item.end > start).map((i) => i.lane));
    let lane = 0;
    while (used.has(lane)) lane++;

    cluster.push({ occurrence, lane, end });
    clusterEnd = Math.max(clusterEnd, end);
  }

  flush();
  return result;
}
