/* =========================================================
   RoutineX — features/tasks.js
   Cadastro de tarefas: o que precisa ser feito sem hora marcada.
   ========================================================= */

import { el, todayISO } from "../utils.js";
import { store } from "../storage.js";
import { openModal, confirmDialog } from "../ui/modal.js";
import { toast } from "../ui/toast.js";
import {
  buildForm,
  textField,
  textareaField,
  dateField,
  selectField,
  categoryField,
} from "../ui/fields.js";
import { requireWrite } from "../ui/guard.js";

const PRIORITIES = [
  { value: "baixa", label: "Baixa" },
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
  { value: "urgente", label: "Urgente" },
];

export function openTaskForm({ task = null, dueDate } = {}) {
  if (!requireWrite()) return null;

  const editing = Boolean(task);
  const values = task || {
    title: "",
    notes: "",
    categoryId: store.getCategories()[0]?.id,
    dueDate: dueDate || "",
    priority: "media",
    status: "pending",
  };

  const form = buildForm([
    textField({
      name: "title",
      label: "O que precisa ser feito",
      value: values.title,
      placeholder: "Ex.: Pagar a conta de luz",
      required: true,
    }),
    categoryField({ value: values.categoryId }),
    [
      dateField({
        name: "dueDate",
        label: "Prazo",
        value: values.dueDate || "",
        hint: "Opcional",
      }),
      selectField({
        name: "priority",
        label: "Prioridade",
        value: values.priority,
        options: PRIORITIES,
      }),
    ],
    textareaField({
      name: "notes",
      label: "Notas",
      value: values.notes,
      placeholder: "Contexto, links, número do protocolo…",
    }),
  ]);

  const modal = openModal({
    title: editing ? "Editar tarefa" : "Nova tarefa",
    subtitle: editing ? null : "Sem horário: entra na lista, não na agenda",
    body: form.node,
    footerStart: editing
      ? [
          el("button", {
            class: "btn btn--danger",
            type: "button",
            text: "Excluir",
            onclick: async () => {
              modal.close();
              await deleteTaskFlow(task);
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
        text: editing ? "Salvar" : "Criar tarefa",
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
      return form.showError("Escreva o que precisa ser feito.");
    }

    const payload = { ...data, dueDate: data.dueDate || null };

    if (editing) {
      store.saveTask({ id: task.id, ...payload });
      toast("Tarefa atualizada.");
    } else {
      store.saveTask({ ...payload, status: "pending", doneAt: null });
      toast("Tarefa criada.");
    }

    modal.close();
  }

  return modal;
}

export async function deleteTaskFlow(task) {
  if (!requireWrite()) return false;

  const confirmed = await confirmDialog({
    title: "Excluir tarefa",
    message: `“${task.title}” sai da sua lista. Não dá para desfazer.`,
    confirmLabel: "Excluir",
    danger: true,
  });

  if (!confirmed) return false;
  store.deleteTask(task.id);
  toast("Tarefa excluída.");
  return true;
}

/** Ordena por atraso, prazo, prioridade e, por fim, título. */
export function sortTasks(tasks) {
  const ORDER = { urgente: 0, alta: 1, media: 2, baixa: 3 };
  const today = todayISO();

  return [...tasks].sort((a, b) => {
    if ((a.status === "done") !== (b.status === "done")) {
      return a.status === "done" ? 1 : -1;
    }

    const lateA = a.dueDate && a.dueDate < today ? 0 : 1;
    const lateB = b.dueDate && b.dueDate < today ? 0 : 1;
    if (lateA !== lateB) return lateA - lateB;

    if (a.dueDate !== b.dueDate) {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    }

    const priority = (ORDER[a.priority] ?? 2) - (ORDER[b.priority] ?? 2);
    return priority || a.title.localeCompare(b.title);
  });
}
