/* =========================================================
   RoutineX — features/routines.js
   Rotinas são regras: "toda segunda, quarta e sexta às 7h".
   Elas não gravam atividades — o core/schedule.js as expande
   em ocorrências na hora de mostrar cada dia.
   ========================================================= */

import { el, todayISO, timeToMinutes, minutesToTime, WEEKDAYS_LONG, weekOrder } from "../utils.js";
import { store } from "../storage.js";
import { openModal, confirmDialog, chooseDialog } from "../ui/modal.js";
import { toast } from "../ui/toast.js";
import {
  buildForm,
  textField,
  textareaField,
  dateField,
  timeField,
  categoryField,
  daysField,
} from "../ui/fields.js";
import { requireWrite } from "../ui/guard.js";

export function openRoutineForm({ routine = null } = {}) {
  if (!requireWrite()) return null;

  const editing = Boolean(routine);
  const values = routine || {
    title: "",
    notes: "",
    categoryId: store.getCategories()[0]?.id,
    start: "07:00",
    end: "08:00",
    days: [1, 2, 3, 4, 5],
    startDate: todayISO(),
    endDate: null,
    paused: false,
  };

  const form = buildForm([
    textField({
      name: "title",
      label: "Nome da rotina",
      value: values.title,
      placeholder: "Ex.: Academia",
      required: true,
    }),
    categoryField({ value: values.categoryId }),
    daysField({
      value: values.days,
      hint: "A rotina aparece automaticamente nesses dias, no calendário e na agenda.",
    }),
    [
      timeField({ name: "start", label: "Começa", value: values.start }),
      timeField({ name: "end", label: "Termina", value: values.end }),
    ],
    [
      dateField({
        name: "startDate",
        label: "A partir de",
        value: values.startDate || todayISO(),
      }),
      dateField({
        name: "endDate",
        label: "Até",
        value: values.endDate || "",
        hint: "Deixe vazio para não ter fim",
      }),
    ],
    textareaField({
      name: "notes",
      label: "Notas",
      value: values.notes,
      placeholder: "O que lembrar toda vez que essa rotina acontecer",
    }),
  ]);

  const startInput = form.field("start").input;
  const endInput = form.field("end").input;
  let lastStart = timeToMinutes(values.start);

  startInput.addEventListener("change", () => {
    const next = timeToMinutes(startInput.value || "00:00");
    const duration = Math.max(15, timeToMinutes(endInput.value) - lastStart);
    endInput.value = minutesToTime(next + duration);
    lastStart = next;
  });

  form.node.classList.add("form--underline");

  const modal = openModal({
    title: editing ? "Editar rotina" : "Nova rotina",
    subtitle: "O que se repete toda semana",
    icon: "routines",
    tone: "routine",
    body: form.node,
    footerStart: editing
      ? [
          el("button", {
            class: "btn btn--danger",
            type: "button",
            text: "Excluir",
            onclick: async () => {
              modal.close();
              await deleteRoutineFlow(routine);
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
        text: editing ? "Salvar" : "Criar rotina",
        onclick: () => submit(),
      }),
    ],
  });

  form.onSubmit(submit);

  function submit() {
    form.clearInvalid();
    form.showError("");

    const data = form.values();

    if (!data.title) {
      form.field("title").invalid(true);
      form.field("title").focus();
      return form.showError("Dê um nome para a rotina.");
    }

    if (!data.days.length) {
      form.field("days").invalid(true);
      return form.showError("Escolha pelo menos um dia da semana.");
    }

    if (timeToMinutes(data.end) <= timeToMinutes(data.start)) {
      form.field("end").invalid(true);
      return form.showError("O horário final precisa ser depois do inicial.");
    }

    if (data.endDate && data.endDate < data.startDate) {
      form.field("endDate").invalid(true);
      return form.showError("A data final precisa ser depois da inicial.");
    }

    const payload = {
      ...data,
      startDate: data.startDate || todayISO(),
      endDate: data.endDate || null,
    };

    if (editing) {
      store.saveRoutine({ id: routine.id, ...payload, paused: routine.paused });
      toast("Rotina atualizada.");
    } else {
      store.saveRoutine({ ...payload, paused: false });
      toast("Rotina criada. Ela já aparece na sua agenda.");
    }

    modal.close();
  }

  return modal;
}

export async function deleteRoutineFlow(routine) {
  if (!requireWrite()) return false;

  const generated = store
    .getActivities()
    .filter((a) => a.routineId === routine.id).length;

  if (!generated) {
    const confirmed = await confirmDialog({
      title: "Excluir rotina",
      message: `“${routine.title}” sai da sua agenda em todos os dias futuros.`,
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!confirmed) return false;

    store.deleteRoutine(routine.id);
    toast("Rotina excluída.");
    return true;
  }

  const choice = await chooseDialog({
    title: "Excluir rotina",
    message: `“${routine.title}” já tem ${generated} ${
      generated === 1 ? "ocorrência registrada" : "ocorrências registradas"
    }. O histórico já concluído pode ser mantido.`,
    options: [
      { label: "Cancelar", value: null },
      { label: "Manter histórico", value: "keep", primary: true },
      { label: "Apagar tudo", value: "all", danger: true },
    ],
  });

  if (!choice) return false;

  store.deleteRoutineActivities(routine.id, { onlyFuture: choice === "keep" });
  store.deleteRoutine(routine.id);
  toast(
    choice === "keep"
      ? "Rotina excluída. O histórico foi mantido."
      : "Rotina e histórico excluídos."
  );
  return true;
}

/** "Seg, Qua e Sex" — descrição legível dos dias de uma rotina. */
export function describeDays(days = []) {
  if (days.length === 7) return "Todos os dias";
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) {
    return "De segunda a sexta";
  }
  if (days.length === 2 && days.includes(0) && days.includes(6)) {
    return "Fins de semana";
  }
  if (!days.length) return "Nenhum dia selecionado";

  const settings = store.getSettings();
  const names = weekOrder(settings.weekStartsOn)
    .filter((day) => days.includes(day))
    .map((day) => WEEKDAYS_LONG[day].replace("-feira", ""));

  if (names.length === 1) return `Toda ${names[0].toLowerCase()}`;
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}
