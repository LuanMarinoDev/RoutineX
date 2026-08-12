/* =========================================================
   RoutineX — pages/today.js
   A agenda de um dia inteiro, com navegação entre os dias.
   Aceita ?date=YYYY-MM-DD (é assim que o calendário chega aqui).
   ========================================================= */

import {
  $,
  el,
  render,
  every,
  addDays,
  todayISO,
  formatDateLong,
  formatRelativeDay,
  formatDuration,
} from "../utils.js";
import { store } from "../storage.js";
import {
  occurrencesFor,
  dayStats,
  toggleOccurrenceDone,
} from "../core/schedule.js";
import { timelineList, emptyState, taskItem, progressBar } from "../ui/components.js";
import {
  openActivityForm,
  openActivityDetail,
  deleteActivityFlow,
} from "../features/activities.js";
import { openTaskForm, deleteTaskFlow, sortTasks } from "../features/tasks.js";
import { toast } from "../ui/toast.js";

export function init() {
  const params = new URLSearchParams(window.location.search);
  let date = isValidISO(params.get("date")) ? params.get("date") : todayISO();

  const title = $("[data-day-title]");
  const subtitle = $("[data-day-sub]");
  const summary = $("#day-summary");
  const timeline = $("#day-timeline");
  const tasksBox = $("#day-tasks");
  const tasksSection = $("#day-tasks-section");

  const handlers = {
    onToggle: (occurrence) => {
      toggleOccurrenceDone(occurrence);
      if (!occurrence.done) toast("Feito! Mais uma concluída.");
    },
    onOpen: (occurrence) => openActivityDetail(occurrence),
    onEdit: (occurrence) => openActivityForm({ occurrence }),
    onDelete: (occurrence) => deleteActivityFlow(occurrence),
  };

  /* ---------- Navegação ---------- */

  function goTo(next) {
    date = next;
    const url = new URL(window.location.href);
    if (date === todayISO()) url.searchParams.delete("date");
    else url.searchParams.set("date", date);
    window.history.replaceState({}, "", url);
    paint();
  }

  $("[data-nav='prev']").addEventListener("click", () => goTo(addDays(date, -1)));
  $("[data-nav='next']").addEventListener("click", () => goTo(addDays(date, 1)));
  $("[data-nav='today']").addEventListener("click", () => goTo(todayISO()));
  // Botão próprio da tela: cria já na data que está sendo vista.
  $("[data-new-here]")?.addEventListener("click", () => openActivityForm({ date }));

  /* ---------- Pintura ---------- */

  function paintHeader(stats) {
    title.textContent = formatRelativeDay(date);
    subtitle.textContent = formatDateLong(date);

    render(
      summary,
      el("div", { class: "day-summary" }, [
        summaryItem("Atividades", String(stats.total)),
        summaryItem("Concluídas", `${stats.done}/${stats.total || 0}`),
        summaryItem("Tempo planejado", formatDuration(stats.plannedMinutes)),
        summaryItem("Conclusão", `${stats.rate}%`),
      ]),
      progressBar(stats.rate, "Progresso do dia")
    );
  }

  function paintTimeline(occurrences) {
    if (!occurrences.length) {
      render(
        timeline,
        emptyState({
          icon: "calendar",
          title:
            date === todayISO()
              ? "Nenhuma atividade hoje"
              : "Nenhuma atividade neste dia",
          text: "Comece pelo essencial: o que precisa acontecer antes do dia acabar?",
          action: {
            label: "Nova atividade",
            onClick: () => openActivityForm({ date }),
          },
        })
      );
      return;
    }

    render(timeline, timelineList(occurrences, handlers, { date }));
  }

  function paintTasks() {
    const tasks = sortTasks(store.getTasks({ dueDate: date }));
    tasksSection.hidden = !tasks.length;
    if (!tasks.length) return;

    render(
      tasksBox,
      tasks.map((task) =>
        taskItem(task, {
          onToggle: () => {
            store.toggleTask(task.id);
            toast(task.status === "done" ? "Tarefa reaberta." : "Tarefa concluída.");
          },
          onEdit: () => openTaskForm({ task }),
          onDelete: () => deleteTaskFlow(task),
        })
      )
    );
  }

  function paint() {
    // O botão “Nova atividade” da topbar segue o dia que está na tela.
    document.body.dataset.viewDate = date;

    const occurrences = occurrencesFor(date);
    paintHeader(dayStats(date, occurrences));
    paintTimeline(occurrences);
    paintTasks();
  }

  paint();
  store.on("change", paint);

  // Mantém a faixa "agora" no lugar certo ao longo do dia.
  every(60_000, () => {
    if (date === todayISO()) paintTimeline(occurrencesFor(date));
  });
}

function summaryItem(label, value) {
  return el("div", { class: "stat" }, [
    el("p", { class: "stat__value", text: value }),
    el("p", { class: "stat__label", text: label }),
  ]);
}

function isValidISO(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value));
}
