/* =========================================================
   RoutineX — pages/dashboard.js
   A tela de abertura: o que está acontecendo agora, a agenda
   de hoje, o progresso do dia e as tarefas em aberto.
   ========================================================= */

import {
  $,
  el,
  render,
  every,
  todayISO,
  formatDuration,
  formatCountdown,
  formatRelativeDay,
} from "../utils.js";
import { store } from "../storage.js";
import {
  focusNow,
  dayStats,
  durationOf,
  progressOf,
  minutesUntil,
  toggleOccurrenceDone,
  currentStreak,
} from "../core/schedule.js";
import {
  timelineList,
  emptyState,
  categoryOf,
  checkButton,
} from "../ui/components.js";
import {
  openActivityForm,
  openActivityDetail,
  deleteActivityFlow,
} from "../features/activities.js";
import { openTaskForm, sortTasks } from "../features/tasks.js";
import { toast } from "../ui/toast.js";

const TASK_LIMIT = 5;

export function init() {
  const focusCard = $("#focus-card");
  const timeline = $("#day-timeline");
  const tasksBox = $("#dash-tasks");

  // Refs do card em foco, atualizados a cada segundo sem redesenhar tudo.
  let live = null;

  const handlers = {
    onToggle: (occurrence) => {
      toggleOccurrenceDone(occurrence);
      if (!occurrence.done) toast("Feito! Mais uma concluída.");
    },
    onOpen: (occurrence) => openActivityDetail(occurrence),
    onEdit: (occurrence) => openActivityForm({ occurrence }),
    onDelete: (occurrence) => deleteActivityFlow(occurrence),
  };

  /* ---------- Card em foco ---------- */

  function paintFocus() {
    const { current, next } = focusNow();
    const target = current || next;

    focusCard.dataset.state = current ? "now" : next ? "next" : "empty";
    live = null;

    if (!target) {
      render(
        focusCard,
        el("div", { class: "focus-card__head" }, [
          el("p", { class: "eyebrow", text: "Em foco" }),
        ]),
        emptyState({
          icon: "clock",
          title: "Nada programado por enquanto",
          text: "Crie uma atividade e ela aparece aqui com o tempo restante ao vivo.",
          action: {
            label: "Nova atividade",
            onClick: () => openActivityForm(),
          },
        })
      );
      return;
    }

    const category = categoryOf(target.categoryId);
    const countdown = el("span", { class: "focus-card__countdown" });
    const bar = el("div", { class: "progress__bar" });
    const elapsed = el("span");
    const remaining = el("span");

    const head = el("div", { class: "focus-card__head" }, [
      el("p", {
        class: current ? "eyebrow live-dot" : "eyebrow",
        text: current ? "Acontecendo agora" : "A seguir",
      }),
      el("span", {
        class: "tag",
        style: `--tag-color:${category.color}`,
        text: category.name,
      }),
    ]);

    const body = el("div", {}, [
      el("p", { class: "focus-card__time num", text: target.start }),
      el("h2", { class: "focus-card__title", text: target.title }),
      el("p", { class: "focus-card__meta" }, [
        el("span", {
          text: `${target.start} – ${target.end} · ${formatDuration(durationOf(target))}`,
        }),
        countdown,
      ]),
      target.date !== todayISO() &&
        el("p", { class: "form__hint", text: formatRelativeDay(target.date) }),
    ]);

    const progress = el("div", { class: "focus-card__progress" }, [
      el(
        "div",
        {
          class: "progress",
          role: "progressbar",
          "aria-label": "Progresso da atividade",
          "aria-valuemin": "0",
          "aria-valuemax": "100",
        },
        [bar]
      ),
      el("div", { class: "focus-card__progress-meta" }, [elapsed, remaining]),
    ]);

    const actions = el("div", { class: "inline", style: "margin-top:20px" }, [
      el("button", {
        class: "btn btn--primary",
        type: "button",
        text: target.done ? "Reabrir" : "Marcar como feita",
        onclick: () => {
          toggleOccurrenceDone(target);
          toast(target.done ? "Atividade reaberta." : "Boa! Atividade concluída.");
        },
      }),
      el("button", {
        class: "btn btn--ghost",
        type: "button",
        text: "Ver detalhes",
        onclick: () => openActivityDetail(target),
      }),
    ]);

    render(focusCard, head, body, current ? progress : "", actions);

    live = { target, countdown, bar, elapsed, remaining, isCurrent: Boolean(current) };
    tick();
  }

  /** Só os números que mudam a cada segundo. */
  function tick() {
    if (!live) return;

    const { target, countdown, bar, elapsed, remaining, isCurrent } = live;

    if (isCurrent) {
      const ratio = progressOf(target);
      const total = durationOf(target);
      const doneMinutes = Math.round(total * ratio);

      bar.style.width = `${Math.round(ratio * 100)}%`;
      bar.parentElement.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
      elapsed.textContent = `${formatDuration(doneMinutes)} decorridos`;
      remaining.textContent = `faltam ${formatDuration(total - doneMinutes)}`;
      countdown.textContent = `termina em ${formatDuration(total - doneMinutes)}`;
      return;
    }

    countdown.textContent = formatCountdown(minutesUntil(target));
  }

  /* ---------- Agenda de hoje ---------- */

  function paintTimeline() {
    const today = todayISO();
    const { today: occurrences } = focusNow();

    if (!occurrences.length) {
      render(
        timeline,
        emptyState({
          icon: "calendar",
          title: "Nenhuma atividade hoje",
          text: "Organize seu dia criando a primeira atividade.",
          action: { label: "Nova atividade", onClick: () => openActivityForm({ date: today }) },
        })
      );
      return;
    }

    render(timeline, timelineList(occurrences, handlers, { date: today }));
  }

  /* ---------- Progresso do dia ---------- */

  function paintProgress() {
    const stats = dayStats(todayISO());
    const pct = stats.rate;

    $("[data-progress-pct]").textContent = `${pct}%`;

    const bar = $("[data-progress-bar]");
    bar.style.width = `${pct}%`;
    bar.closest(".progress")?.setAttribute("aria-valuenow", String(pct));

    $("[data-progress-caption]").textContent = stats.total
      ? `${stats.done} de ${stats.total} ${
          stats.total === 1 ? "atividade concluída" : "atividades concluídas"
        }`
      : "Nenhuma atividade programada para hoje";

    $('[data-stat="planned"]').textContent = formatDuration(stats.plannedMinutes);

    const streak = currentStreak();
    $('[data-stat="streak"]').textContent = `${streak} ${
      streak === 1 ? "dia" : "dias"
    }`;
  }

  /* ---------- Tarefas pendentes ---------- */

  function paintTasks() {
    const pending = sortTasks(store.getTasks({ status: "pending" }));

    if (!pending.length) {
      render(
        tasksBox,
        emptyState({
          icon: "tasks",
          title: "Lista limpa",
          text: "Nada em aberto por aqui. Que tal registrar o que não pode esquecer?",
          action: { label: "Nova tarefa", onClick: () => openTaskForm() },
        })
      );
      return;
    }

    const rows = pending.slice(0, TASK_LIMIT).map((task) => {
      const overdue = task.dueDate && task.dueDate < todayISO();

      return el("div", { class: "task-line" }, [
        checkButton({
          checked: false,
          label: `Concluir ${task.title}`,
          onToggle: () => {
            store.toggleTask(task.id);
            toast("Tarefa concluída.");
          },
        }),
        el(
          "button",
          {
            class: "task-line__title",
            type: "button",
            style: "background:none;border:0;text-align:left;cursor:pointer",
            text: task.title,
            onclick: () => openTaskForm({ task }),
          }
        ),
        el("span", {
          class: "badge",
          style: overdue ? "color:var(--danger)" : null,
          text: task.dueDate ? formatRelativeDay(task.dueDate) : "Sem prazo",
        }),
      ]);
    });

    if (pending.length > TASK_LIMIT) {
      rows.push(
        el("p", {
          class: "row__meta",
          style: "padding-top:12px",
          text: `+ ${pending.length - TASK_LIMIT} ${
            pending.length - TASK_LIMIT === 1 ? "outra tarefa" : "outras tarefas"
          } em aberto`,
        })
      );
    }

    render(tasksBox, rows);
  }

  /* ---------- Orquestração ---------- */

  function paintAll() {
    paintFocus();
    paintTimeline();
    paintProgress();
    paintTasks();
  }

  paintAll();
  store.on("change", paintAll);

  // O relógio do card em foco anda sozinho; a cada minuto conferimos
  // se a atividade em foco mudou.
  every(1000, tick);
  every(30_000, () => {
    const { current, next } = focusNow();
    const id = (current || next)?.id ?? null;
    if (id !== (live?.target.id ?? null)) {
      paintFocus();
      paintTimeline();
    }
  });
}
