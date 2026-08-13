/* =========================================================
   RoutineX — pages/login.js
   Entrada do sistema: acessar uma conta ou criar a primeira.
   Esta é a única tela que roda sem usuário na sessão.

   Entrar e criar conta são a mesma tela: as duas passam por
   `renderScreen`, então dividem cartão, títulos, espaçamento
   e botão. Muda só a lista de campos e o que acontece ao enviar.
   ========================================================= */

import { $, el, render } from "../utils.js";
import { accounts } from "../auth/accounts.js";
import { store } from "../storage.js";
import {
  formatCPF,
  formatPhone,
  passwordStrength,
} from "../auth/validators.js";
import {
  buildForm,
  textField,
  passwordField,
  maskedField,
} from "../ui/fields.js";
import { toast } from "../ui/toast.js";
import { brandMark } from "../ui/shell.js";

export function init() {
  const root = $("#auth-root");

  // Mesma marca da sidebar (assets/images/logo.png), em destaque maior.
  $("#auth-logo")?.replaceWith(brandMark("../", { size: 84 }));

  const tabs = $("#auth-tabs");
  const params = new URLSearchParams(window.location.search);

  // Sem nenhuma conta no aparelho, cadastrar é o único caminho possível.
  const first = accounts.isEmpty();
  let mode = first || params.get("mode") === "signup" ? "signup" : "signin";

  function go(destination = "../index.html") {
    const next = params.get("next");
    window.location.href =
      next && next.startsWith("pages/") ? `../${next}` : destination;
  }

  const switchTo = (next) => {
    mode = next;
    paint();
  };

  /* ---------- Abas ---------- */

  function paintTabs() {
    if (first) {
      render(tabs);
      return;
    }

    render(
      tabs,
      el(
        "div",
        {
          class: "segmented",
          role: "group",
          "aria-label": "Entrar ou criar conta",
        },
        [tabButton("signin", "Entrar"), tabButton("signup", "Criar conta")],
      ),
    );
  }

  function tabButton(value, label) {
    return el("button", {
      type: "button",
      "aria-pressed": String(mode === value),
      text: label,
      onclick: () => switchTo(value),
    });
  }

  /* ---------- Molde único das duas telas ---------- */

  /**
   * @param {object} screen
   * @param {string}   [screen.title]     opcional: a aba ativa já diz onde se está
   * @param {string}   [screen.subtitle]
   * @param {Array}    screen.rows        campos do formulário
   * @param {string}   screen.submitLabel
   * @param {Function} screen.onSubmit    recebe (valores, form); pode ser assíncrona
   * @param {Node}     [screen.extra]     peça opcional depois dos campos
   */
  function renderScreen({
    title,
    subtitle,
    rows,
    submitLabel,
    onSubmit,
    extra,
  }) {
    const form = buildForm(rows);
    if (extra) form.node.append(extra);

    const submit = el("button", {
      class: "btn btn--primary btn--block",
      type: "button",
      text: submitLabel,
      onclick: () => send(),
    });

    form.onSubmit(() => send());

    async function send() {
      form.clearInvalid();
      form.showError("");
      submit.disabled = true;

      try {
        await onSubmit(form.values(), form);
      } finally {
        submit.disabled = false;
      }
    }

    render(
      root,
      title && el("h1", { class: "auth__title", text: title }),
      subtitle && el("p", { class: "auth__sub", text: subtitle }),
      form.node,
      submit,
    );

    form.fields[0]?.focus();
    return form;
  }

  /* ---------- Entrar ---------- */

  function paintSignIn() {
    renderScreen({
      rows: [
        textField({
          name: "email",
          label: "E-mail",
          type: "email",
          placeholder: "login@gmail.com",
          required: true,
        }),
        passwordField({
          name: "password",
          label: "Senha",
          placeholder: "Senha",
        }),
      ],
      submitLabel: "Entrar",

      async onSubmit({ email, password }, form) {
        try {
          const user = await accounts.signIn(email, password);
          store.use(user.id);
          toast(`Bem-vindo de volta, ${user.name.split(" ")[0]}.`);
          go();
        } catch (error) {
          form.field("email").invalid(true);
          form.field("password").invalid(true);
          form.showError(error.message || "Não foi possível entrar.");
          form.field("password").set("");
          form.field("password").focus();
        }
      },
    });
  }

  /* ---------- Criar conta ---------- */

  function paintSignUp() {
    const meter = el("p", { class: "meter", dataset: { score: "0" } }, [
      el("span", { class: "meter__bar" }),
      el("span", {
        class: "meter__label",
        text: "Use pelo menos 8 caracteres.",
      }),
    ]);

    renderScreen({
      rows: [
        textField({
          name: "name",
          label: "Nome completo",
          placeholder: "Nome completo",
          required: true,
        }),
        textField({
          name: "email",
          label: "E-mail",
          type: "email",
          placeholder: "login@gmail.com",
          required: true,
        }),
        [
          maskedField({
            name: "cpf",
            label: "CPF",
            format: formatCPF,
            placeholder: "CPF",
            maxlength: 14,
          }),
          maskedField({
            name: "phone",
            label: "Telefone",
            format: formatPhone,
            placeholder: "Telefone",
            maxlength: 15,
            inputmode: "tel",
          }),
        ],
        passwordField({
          name: "password",
          label: "Senha",
          placeholder: "Senha",
          autocomplete: "new-password",
          onInput: (value) => {
            const strength = passwordStrength(value);
            meter.dataset.score = String(strength.score);
            meter.querySelector(".meter__label").textContent = value
              ? `${strength.label}${strength.hint ? ` · ${strength.hint}` : ""}`
              : "Use pelo menos 8 caracteres.";
          },
        }),
      ],
      extra: meter,
      submitLabel: "Criar conta",

      async onSubmit(data, form) {
        try {
          const user = await accounts.signUp(data);
          await accounts.signIn(data.email, data.password);
          store.use(user.id);
          toast(`Conta criada. Boas-vindas, ${user.name.split(" ")[0]}!`);
          go();
        } catch (error) {
          if (error.fields) {
            for (const [name, message] of Object.entries(error.fields)) {
              form.field(name)?.invalid(true);
              form.showError(message);
            }
            form.field(Object.keys(error.fields)[0])?.focus();
          } else {
            form.showError(error.message || "Não foi possível criar a conta.");
          }
        }
      },
    });
  }

  /* ---------- Orquestração ---------- */

  function paint() {
    paintTabs();
    if (mode === "signup") paintSignUp();
    else paintSignIn();
  }

  paint();
}
