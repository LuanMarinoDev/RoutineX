/* =========================================================
   RoutineX — features/activities.js
   Criar, editar, ver e excluir atividades.
   Sabe lidar com ocorrências vindas de rotinas: editar ou
   excluir um dia isolado não desfaz a série inteira.
   ========================================================= */

import { el, todayISO, timeToMinutes, minutesToTime, formatDateLong, formatDuration, overlaps } from "../utils.js";
import { store } from "../storage.js";
import { openModal, confirmDialog, chooseDialog } from "../ui/modal.js";
import { toast } from "../ui/toast.js";
import { icon } from "../ui/icons.js";
import {
  buildForm,
  textField,
  textareaField,
  dateField,
  timeField,
  categoryField,
} from "../ui/fields.js";
import { categoryOf } from "../ui/components.js";
import {
  occurrencesFor,
  durationOf,
  materialize,
  deleteOccurrence,
  toggleOccurrenceDone,
  statusOf,
} from "../core/schedule.js";
import { requireWrite, canWrite } from "../ui/guard.js";

/* ---------- Formulário ---------- */

/**
 * @param {object} options
 * @param {object} [options.occurrence] atividade existente (real ou virtual)
 * @param {string} [options.date]       data sugerida ao criar
 * @param {string} [options.start]      horário sugerido ao criar
 */
export function openActivityForm({ occurrence = null, date, start } = {}) {
  if (!requireWrite()) return null;

  const editing = Boolean(occurrence);
  const fromRoutine = Boolean(occurrence?.routineId);

  const suggestedStart = start || nextRoundHour();
  const values = occurrence || {
    title: "",
    notes: "",
    categoryId: store.getCategories()[0]?.id,
    date: date || todayISO(),
    start: suggestedStart,
    end: minutesToTime(timeToMinutes(suggestedStart) + 60),
  };

  const form = buildForm([
    textField({
      name: "title",
      label: "O que você vai fazer",
      value: values.title,
      placeholder: "Ex.: Bloco de foco — relatório",
      required: true,
    }),
    categoryField({ value: values.categoryId }),
    dateField({ name: "date", label: "Data", value: values.date, required: true }),
    [
      timeField({ name: "start", label: "Começa", value: values.start }),
      timeField({ name: "end", label: "Termina", value: values.end }),
    ],
    textareaField({
      name: "notes",
      label: "Notas",
      value: values.notes,
      placeholder: "Detalhes, link da reunião, o que levar…",
    }),
  ]);

  // Mantém a duração ao mudar o início — comportamento esperado de agenda.
  const startInput = form.field("start").input;
  const endInput = form.field("end").input;
  let lastStart = timeToMinutes(values.start);

  startInput.addEventListener("change", () => {
    const next = timeToMinutes(startInput.value || "00:00");
    const duration = Math.max(15, timeToMinutes(endInput.value) - lastStart);
    endInput.value = minutesToTime(next + duration);
    lastStart = next;
  });

  if (fromRoutine) {
    form.node.append(
      el("p", { class: "form__hint" }, [
        "Esta atividade vem da rotina “",
        values.title,
        "”. As mudanças valem só para este dia — para alterar todos os dias, edite a rotina.",
      ])
    );
  }

  form.node.classList.add("form--underline");

  const modal = openModal({
    title: editing ? "Editar atividade" : "Nova atividade",
    subtitle: editing ? formatDateLong(values.date) : "Reserve um horário no seu dia",
    icon: "clock",
    tone: "activity",
    body: form.node,
    footerStart: editing
      ? [
          el("button", {
            class: "btn btn--danger",
            type: "button",
            text: "Excluir",
            onclick: async () => {
              modal.close();
              await deleteActivityFlow(occurrence);
            },
          }),
        ]
      : [],
    footer: [
      el("button", {
        class: "btn btn--ghost",
        type: "button",
        text: "Cancelar",
        onclick: () => modal.close(),
      }),
      el("button", {
        class: "btn btn--primary",
        type: "button",
        text: editing ? "Salvar" : "Criar atividade",
        onclick: () => submit(),
      }),
    ],
  });

  form.onSubmit(submit);

  async function submit() {
    form.clearInvalid();
    form.showError("");

    const data = form.values();

    if (!data.title) {
      form.field("title").invalid(true);
      form.field("title").focus();
      return form.showError("Dê um nome para a atividade.");
    }

    if (!data.date) {
      form.field("date").invalid(true);
      return form.showError("Escolha uma data.");
    }

    if (timeToMinutes(data.end) <= timeToMinutes(data.start)) {
      form.field("end").invalid(true);
      return form.showError("O horário final precisa ser depois do inicial.");
    }

    const conflict = findConflict(data, occurrence?.id);
    if (conflict) {
      const proceed = await confirmDialog({
        title: "Horário ocupado",
        message: `“${conflict.title}” acontece das ${conflict.start} às ${conflict.end} nesse mesmo dia. Quer salvar assim mesmo?`,
        confirmLabel: "Salvar mesmo assim",
      });
      if (!proceed) return;
    }

    if (editing) {
      materialize(occurrence, data);
      toast("Atividade atualizada.");
    } else {
      store.saveActivity({ ...data, done: false, routineId: null });
      toast("Atividade criada.");
    }

    modal.close();
  }

  return modal;
}

/* ---------- Detalhes ---------- */

export function openActivityDetail(occurrence) {
  const category = categoryOf(occurrence.categoryId);
  const status = statusOf(occurrence);
  const STATUS_LABEL = { past: "Já passou", now: "Acontecendo agora", future: "Ainda vai acontecer" };

  const body = el("div", {}, [
    el("div", { class: "inline" }, [
      el("span", {
        class: "tag",
        style: `--tag-color:${category.color}`,
        text: category.name,
      }),
      occurrence.routineId &&
        el("span", {
          class: "pill-routine",
          html: `${icon("routines", 12)}<span>Gerada por rotina</span>`,
        }),
      el("span", {
        class: "tag tag--plain",
        text: occurrence.done ? "Concluída" : STATUS_LABEL[status],
      }),
    ]),

    el("p", { class: "detail__title", style: "margin-top:12px", text: occurrence.title }),

    el("div", { class: "detail__grid" }, [
      detailItem("Data", formatDateLong(occurrence.date)),
      detailItem("Horário", `${occurrence.start} – ${occurrence.end}`),
      detailItem("Duração", formatDuration(durationOf(occurrence))),
    ]),

    occurrence.notes && el("p", { class: "detail__notes", text: occurrence.notes }),
  ]);

  const modal = openModal({
    title: "Atividade",
    body,
    footerStart: canWrite()
      ? [
          el("button", {
            class: "btn btn--danger",
            type: "button",
            text: "Excluir",
            onclick: async () => {
              modal.close();
              await deleteActivityFlow(occurrence);
            },
          }),
        ]
      : [],
    footer: canWrite() ? [
      el("button", {
        class: "btn btn--ghost",
        type: "button",
        text: occurrence.done ? "Reabrir" : "Concluir",
        onclick: () => {
          toggleOccurrenceDone(occurrence);
          modal.close();
          toast(occurrence.done ? "Atividade reaberta." : "Boa! Atividade concluída.");
        },
      }),
      el("button", {
        class: "btn btn--primary",
        type: "button",
        text: "Editar",
        onclick: () => {
          modal.close();
          openActivityForm({ occurrence });
        },
      }),
    ] : [
      el("button", {
        class: "btn btn--ghost",
        type: "button",
        text: "Fechar",
        onclick: () => modal.close(),
      }),
    ],
  });

  return modal;
}

function detailItem(label, value) {
  return el("div", { class: "detail__item" }, [
    el("p", { class: "eyebrow", text: label }),
    el("p", { class: "detail__value", text: value }),
  ]);
}

/* ---------- Exclusão ---------- */

export async function deleteActivityFlow(occurrence) {
  if (!requireWrite()) return false;

  if (occurrence.routineId) {
    const choice = await chooseDialog({
      title: "Excluir atividade da rotina",
      message: `“${occurrence.title}” se repete. O que você quer remover?`,
      options: [
        { label: "Cancelar", value: null },
        { label: "Só este dia", value: "one", primary: true },
        { label: "A rotina inteira", value: "series", danger: true },
      ],
    });

    if (!choice) return false;
    deleteOccurrence(occurrence, choice);
    toast(
      choice === "series"
        ? "Rotina removida."
        : "Atividade removida só deste dia.",
      "success"
    );
    return true;
  }

  const confirmed = await confirmDialog({
    title: "Excluir atividade",
    message: `“${occurrence.title}” será removida do seu dia. Não dá para desfazer.`,
    confirmLabel: "Excluir",
    danger: true,
  });

  if (!confirmed) return false;
  deleteOccurrence(occurrence, "one");
  toast("Atividade excluída.");
  return true;
}

/* ---------- Auxiliares ---------- */

/** Próxima hora cheia, útil como sugestão ao criar. */
function nextRoundHour(date = new Date()) {
  const minutes = (date.getHours() + 1) * 60;
  return minutesToTime(Math.min(minutes, 23 * 60));
}

/** Outra atividade no mesmo dia ocupando a mesma faixa de horário. */
function findConflict(data, ignoreId) {
  return (
    occurrencesFor(data.date).find(
      (other) =>
        other.id !== ignoreId &&
        !other.done &&
        overlaps(data.start, data.end, other.start, other.end)
    ) || null
  );
}
