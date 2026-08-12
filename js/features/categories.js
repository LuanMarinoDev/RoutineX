/* =========================================================
   RoutineX — features/categories.js
   Gerenciador de categorias: criar, renomear, trocar a cor
   e excluir (reatribuindo o que já estava classificado).
   ========================================================= */

import { el, render } from "../utils.js";
import { store } from "../storage.js";
import { openModal, confirmDialog } from "../ui/modal.js";
import { toast } from "../ui/toast.js";
import { icon } from "../ui/icons.js";
import { buildForm, textField, colorField } from "../ui/fields.js";

const FALLBACK_ID = "cat_outros";

/** Quantos registros usam a categoria. */
export function usageOf(categoryId) {
  const state = store.snapshot();
  return (
    state.activities.filter((a) => a.categoryId === categoryId).length +
    state.routines.filter((r) => r.categoryId === categoryId).length +
    state.tasks.filter((t) => t.categoryId === categoryId).length
  );
}

export function openCategoryManager() {
  const list = el("div", { class: "stack" });

  const modal = openModal({
    title: "Categorias",
    subtitle: "As cores organizam a agenda, o calendário e as estatísticas",
    body: list,
    footer: [
      el("button", {
        class: "btn btn--ghost",
        type: "button",
        text: "Fechar",
        onclick: () => modal.close(),
      }),
      el("button", {
        class: "btn btn--primary",
        type: "button",
        html: `${icon("plus", 16)}<span>Nova categoria</span>`,
        onclick: () => openCategoryForm({ onSaved: paint }),
      }),
    ],
  });

  function paint() {
    const categories = store.getCategories();

    render(
      list,
      categories.map((category) => {
        const uses = usageOf(category.id);

        return el("div", { class: "row" }, [
          el("span", {
            class: "dot",
            style: `background:${category.color}`,
            "aria-hidden": "true",
          }),
          el("div", { class: "row__body" }, [
            el("p", { class: "row__title", text: category.name }),
            el("p", {
              class: "row__meta",
              text: uses
                ? `${uses} ${uses === 1 ? "registro" : "registros"}`
                : "Ainda sem uso",
            }),
          ]),
          el("div", { class: "row__actions" }, [
            el("button", {
              class: "icon-btn",
              type: "button",
              "aria-label": `Editar ${category.name}`,
              html: icon("sparkle", 16),
              onclick: () => openCategoryForm({ category, onSaved: paint }),
            }),
            el("button", {
              class: "icon-btn icon-btn--danger",
              type: "button",
              "aria-label": `Excluir ${category.name}`,
              html: icon("close", 16),
              onclick: () => removeCategory(category, paint),
            }),
          ]),
        ]);
      })
    );
  }

  paint();
  return modal;
}

export function openCategoryForm({ category = null, onSaved } = {}) {
  const editing = Boolean(category);

  const form = buildForm([
    textField({
      name: "name",
      label: "Nome",
      value: category?.name || "",
      placeholder: "Ex.: Estudos",
      maxlength: 40,
      required: true,
    }),
    colorField({ value: category?.color || "#b6f000" }),
  ]);

  const modal = openModal({
    title: editing ? "Editar categoria" : "Nova categoria",
    body: form.node,
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
        text: "Salvar",
        onclick: () => submit(),
      }),
    ],
  });

  form.onSubmit(submit);

  function submit() {
    form.clearInvalid();
    form.showError("");

    const data = form.values();
    if (!data.name) {
      form.field("name").invalid(true);
      form.field("name").focus();
      return form.showError("Dê um nome para a categoria.");
    }

    const duplicated = store
      .getCategories()
      .some(
        (other) =>
          other.id !== category?.id &&
          other.name.toLowerCase() === data.name.toLowerCase()
      );

    if (duplicated) {
      form.field("name").invalid(true);
      return form.showError("Já existe uma categoria com esse nome.");
    }

    store.saveCategory(editing ? { id: category.id, ...data } : data);
    toast(editing ? "Categoria atualizada." : "Categoria criada.");
    modal.close();
    onSaved?.();
  }

  return modal;
}

async function removeCategory(category, onDone) {
  const categories = store.getCategories();

  if (categories.length <= 1) {
    toast("Você precisa de pelo menos uma categoria.", "warning");
    return;
  }

  const uses = usageOf(category.id);
  const fallback =
    categories.find((c) => c.id === FALLBACK_ID && c.id !== category.id) ||
    categories.find((c) => c.id !== category.id);

  const confirmed = await confirmDialog({
    title: "Excluir categoria",
    message: uses
      ? `${uses} ${uses === 1 ? "registro passa" : "registros passam"} para “${fallback.name}”.`
      : `“${category.name}” será removida.`,
    confirmLabel: "Excluir",
    danger: true,
  });

  if (!confirmed) return;

  if (uses) reassign(category.id, fallback.id);
  store.deleteCategory(category.id);
  toast("Categoria excluída.");
  onDone?.();
}

/** Move todos os registros de uma categoria para outra. */
function reassign(fromId, toId) {
  store.getActivities().forEach((activity) => {
    if (activity.categoryId === fromId) {
      store.saveActivity({ id: activity.id, categoryId: toId });
    }
  });

  store.getRoutines().forEach((routine) => {
    if (routine.categoryId === fromId) {
      store.saveRoutine({ id: routine.id, categoryId: toId });
    }
  });

  store.getTasks().forEach((task) => {
    if (task.categoryId === fromId) {
      store.saveTask({ id: task.id, categoryId: toId });
    }
  });
}
