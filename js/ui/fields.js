/* =========================================================
   RoutineX — ui/fields.js
   Campos de formulário. Cada função devolve um objeto
   { name, node, get(), set(v), invalid(bool) } — o formulário
   só precisa juntar os get() na hora de salvar.
   ========================================================= */

import { el, WEEKDAYS_MIN, WEEKDAYS_LONG, weekOrder } from "../utils.js";
import { store } from "../storage.js";

/* Dois formulários podem coexistir na tela (um modal por cima do outro),
   então cada campo ganha um id próprio — labels nunca apontam para o input errado. */
let seq = 0;
const fieldId = (name) => `f-${name}-${++seq}`;

function wrap(labelText, control, hint) {
  const field = el("div", { class: "field" }, [
    labelText && el("label", { for: control.id || null, text: labelText }),
    control,
    hint && el("p", { class: "form__hint", text: hint }),
  ]);
  return field;
}

function base(name, node, field) {
  return {
    name,
    node: field,
    input: node,
    get: () => node.value.trim(),
    set: (value) => {
      node.value = value ?? "";
    },
    focus: () => node.focus(),
    invalid(state) {
      field.classList.toggle("field--invalid", Boolean(state));
      node.setAttribute("aria-invalid", state ? "true" : "false");
    },
  };
}

/* ---------- Texto ---------- */

export function textField({
  name,
  label,
  value = "",
  placeholder = "",
  hint,
  type = "text",
  maxlength = 120,
  required = false,
}) {
  const input = el("input", {
    class: "input",
    id: fieldId(name),
    name,
    type,
    value,
    placeholder,
    maxlength,
    required,
    autocomplete: "off",
  });
  return base(name, input, wrap(label, input, hint));
}

export function textareaField({ name, label, value = "", placeholder = "", hint }) {
  const input = el("textarea", {
    class: "textarea",
    id: fieldId(name),
    name,
    placeholder,
    maxlength: 800,
  });
  input.value = value ?? "";
  return base(name, input, wrap(label, input, hint));
}

/* ---------- Senha ---------- */

export function passwordField({
  name = "password",
  label = "Senha",
  value = "",
  hint,
  placeholder = "",
  autocomplete = "current-password",
  onInput,
}) {
  const input = el("input", {
    class: "input input--with-action",
    id: fieldId(name),
    name,
    type: "password",
    value,
    placeholder,
    autocomplete,
    maxlength: 120,
  });

  const toggle = el("button", {
    class: "input__action",
    type: "button",
    "aria-label": "Mostrar a senha",
    "aria-pressed": "false",
    text: "Mostrar",
    onclick: () => {
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      toggle.textContent = showing ? "Mostrar" : "Ocultar";
      toggle.setAttribute("aria-pressed", String(!showing));
      toggle.setAttribute("aria-label", showing ? "Mostrar a senha" : "Ocultar a senha");
      input.focus();
    },
  });

  if (onInput) input.addEventListener("input", () => onInput(input.value));

  const control = el("div", { class: "input-wrap" }, [input, toggle]);
  const field = el("div", { class: "field" }, [
    label && el("label", { for: input.id, text: label }),
    control,
    hint && el("p", { class: "form__hint", text: hint }),
  ]);

  return {
    ...base(name, input, field),
    get: () => input.value, // senha não sofre trim: espaço pode ser proposital
  };
}

/* ---------- Campo com máscara (CPF, telefone) ---------- */

/**
 * Formata enquanto a pessoa digita e devolve o valor já formatado.
 * A validação continua olhando só os dígitos.
 */
export function maskedField({
  name,
  label,
  value = "",
  format,
  placeholder = "",
  hint,
  inputmode = "numeric",
  maxlength = 20,
}) {
  const input = el("input", {
    class: "input",
    id: fieldId(name),
    name,
    type: "text",
    value: value ? format(value) : "",
    placeholder,
    inputmode,
    maxlength,
    autocomplete: "off",
  });

  input.addEventListener("input", () => {
    const start = input.selectionStart;
    const before = input.value.length;
    input.value = format(input.value);
    // Mantém o cursor no lugar quando a máscara insere um separador.
    const shift = input.value.length - before;
    if (start !== null) input.setSelectionRange(start + shift, start + shift);
  });

  return base(name, input, wrap(label, input, hint));
}

/* ---------- Data e hora ---------- */

export function dateField({ name, label, value = "", hint, required = false }) {
  const input = el("input", {
    class: "input",
    id: fieldId(name),
    name,
    type: "date",
    value: value || "",
    required,
  });
  return base(name, input, wrap(label, input, hint));
}

export function timeField({ name, label, value = "08:00", hint, step = 300 }) {
  const input = el("input", {
    class: "input",
    id: fieldId(name),
    name,
    type: "time",
    value,
    step,
  });
  return base(name, input, wrap(label, input, hint));
}

/* ---------- Seleção ---------- */

export function selectField({ name, label, value, options, hint }) {
  const select = el(
    "select",
    { class: "select", id: fieldId(name), name },
    options.map((option) =>
      el("option", {
        value: option.value,
        text: option.label,
        selected: String(option.value) === String(value),
      })
    )
  );
  return base(name, select, wrap(label, select, hint));
}

/* ---------- Categoria (lista suspensa) ----------
   A versão em pastilhas ocupa uma faixa inteira do formulário. Quando
   a categoria precisa dividir a linha com outro campo, o select cabe
   na metade — e o ponto colorido ao lado guarda a leitura da cor,
   que o <option> nativo não sabe pintar.
*/

export function categorySelectField({
  name = "categoryId",
  label = "Categoria",
  value,
}) {
  const categories = store.getCategories();

  const select = el(
    "select",
    { class: "select", id: fieldId(name), name },
    categories.map((category) =>
      el("option", {
        value: category.id,
        text: category.name,
        selected: category.id === (value || categories[0]?.id),
      })
    )
  );

  const dot = el("span", { class: "select-dot", "aria-hidden": "true" });

  const paintDot = () => {
    const color = categories.find((c) => c.id === select.value)?.color;
    dot.style.setProperty("--sw-color", color || "var(--accent)");
  };

  paintDot();
  select.addEventListener("change", paintDot);

  const control = el("div", { class: "select-wrap" }, [dot, select]);

  const field = el("div", { class: "field" }, [
    el("label", { for: select.id, text: label }),
    control,
  ]);

  return {
    name,
    node: field,
    input: select,
    get: () => select.value,
    set: (id) => {
      select.value = id;
      paintDot();
    },
    focus: () => select.focus(),
    invalid(state) {
      field.classList.toggle("field--invalid", Boolean(state));
      select.setAttribute("aria-invalid", state ? "true" : "false");
    },
  };
}

/* ---------- Categoria (pastilhas coloridas) ---------- */

export function categoryField({ name = "categoryId", label = "Categoria", value }) {
  const categories = store.getCategories();
  let current = value || categories[0]?.id;

  const buttons = categories.map((category) =>
    el("button", {
      class: "swatch",
      type: "button",
      style: `--sw-color:${category.color}`,
      "aria-pressed": String(category.id === current),
      text: category.name,
      onclick: () => {
        current = category.id;
        sync();
      },
    })
  );

  function sync() {
    buttons.forEach((button, index) => {
      button.setAttribute(
        "aria-pressed",
        String(categories[index].id === current)
      );
    });
  }

  const group = el(
    "div",
    { class: "swatches", role: "group", "aria-label": label },
    buttons
  );

  const field = el("div", { class: "field" }, [
    el("label", { text: label }),
    group,
  ]);

  return {
    name,
    node: field,
    get: () => current,
    set: (id) => {
      current = id;
      sync();
    },
    invalid() {},
  };
}

/* ---------- Dias da semana ---------- */

export function daysField({
  name = "days",
  label = "Repete em",
  value = [1, 2, 3, 4, 5],
  hint,
}) {
  const settings = store.getSettings();
  const order = weekOrder(settings.weekStartsOn);
  let selected = new Set(value);

  const buttons = order.map((day) =>
    el("button", {
      class: "",
      type: "button",
      "aria-pressed": String(selected.has(day)),
      "aria-label": WEEKDAYS_LONG[day],
      title: WEEKDAYS_LONG[day],
      text: WEEKDAYS_MIN[day],
      onclick: () => {
        selected.has(day) ? selected.delete(day) : selected.add(day);
        sync();
      },
    })
  );

  function sync() {
    buttons.forEach((button, index) =>
      button.setAttribute("aria-pressed", String(selected.has(order[index])))
    );
  }

  const presets = el("div", { class: "inline" }, [
    presetButton("Todos os dias", [0, 1, 2, 3, 4, 5, 6]),
    presetButton("Dias úteis", [1, 2, 3, 4, 5]),
    presetButton("Fim de semana", [0, 6]),
  ]);

  function presetButton(text, days) {
    return el("button", {
      class: "chip",
      type: "button",
      text,
      onclick: () => {
        selected = new Set(days);
        sync();
      },
    });
  }

  const picker = el(
    "div",
    { class: "daypicker", role: "group", "aria-label": label },
    buttons
  );

  const field = el("div", { class: "field" }, [
    el("label", { text: label }),
    picker,
    presets,
    hint && el("p", { class: "form__hint", text: hint }),
  ]);

  return {
    name,
    node: field,
    get: () => [...selected].sort((a, b) => a - b),
    set: (days) => {
      selected = new Set(days);
      sync();
    },
    invalid(state) {
      field.classList.toggle("field--invalid", Boolean(state));
    },
  };
}

/* ---------- Switch ---------- */

export function switchField({ name, label, hint, checked = false, onChange }) {
  const control = el("button", {
    class: "switch__control",
    type: "button",
    role: "switch",
    "aria-checked": String(checked),
    "aria-label": label,
    onclick: () => {
      const next = control.getAttribute("aria-checked") !== "true";
      control.setAttribute("aria-checked", String(next));
      onChange?.(next);
    },
  });

  const node = el("div", { class: "switch" }, [
    el("div", { class: "switch__text" }, [
      el("p", { class: "switch__label", text: label }),
      hint && el("p", { class: "switch__hint", text: hint }),
    ]),
    control,
  ]);

  return {
    name,
    node,
    get: () => control.getAttribute("aria-checked") === "true",
    set: (value) => control.setAttribute("aria-checked", String(Boolean(value))),
    invalid() {},
  };
}

/* ---------- Cor ---------- */

export function colorField({ name = "color", label = "Cor", value = "#b6f000" }) {
  const PALETTE = [
    "#b6f000",
    "#59a5ff",
    "#a78bfa",
    "#38d9d9",
    "#ff9d47",
    "#f472b6",
    "#ffc24b",
    "#ff5f57",
    "#929892",
  ];

  let current = value;

  const buttons = PALETTE.map((color) =>
    el("button", {
      class: "swatch",
      type: "button",
      style: `--sw-color:${color}`,
      "aria-pressed": String(color === current),
      "aria-label": `Cor ${color}`,
      text: " ",
      onclick: () => {
        current = color;
        sync();
      },
    })
  );

  const sync = () =>
    buttons.forEach((button, index) =>
      button.setAttribute("aria-pressed", String(PALETTE[index] === current))
    );

  const field = el("div", { class: "field" }, [
    el("label", { text: label }),
    el("div", { class: "swatches", role: "group", "aria-label": label }, buttons),
  ]);

  return {
    name,
    node: field,
    get: () => current,
    set: (color) => {
      current = color;
      sync();
    },
    invalid() {},
  };
}

/* ---------- Montagem do formulário ---------- */

/**
 * Junta campos em um <form>. `rows` aceita um campo ou um array
 * de campos (que viram uma linha lado a lado).
 */
export function buildForm(rows) {
  const fields = [];
  const form = el("form", { class: "form", novalidate: true });
  const errorBox = el("p", { class: "form__error", hidden: true });
  form.append(errorBox);

  for (const row of rows) {
    if (!row) continue;
    if (Array.isArray(row)) {
      row.forEach((field) => fields.push(field));
      form.append(el("div", { class: "form__row" }, row.map((f) => f.node)));
    } else {
      fields.push(row);
      form.append(row.node);
    }
  }

  return {
    node: form,
    fields,
    values() {
      return Object.fromEntries(fields.map((field) => [field.name, field.get()]));
    },
    field(name) {
      return fields.find((f) => f.name === name);
    },
    showError(message) {
      errorBox.textContent = message || "";
      errorBox.hidden = !message;
    },
    clearInvalid() {
      fields.forEach((field) => field.invalid(false));
    },
    onSubmit(handler) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        handler();
      });
    },
  };
}
