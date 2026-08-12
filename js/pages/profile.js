/* =========================================================
   RoutineX — pages/profile.js
   Os dados da conta: ver, editar, trocar a senha e sair.
   ========================================================= */

import { $, el, render, formatDateLong } from "../utils.js";
import { accounts } from "../auth/accounts.js";
import { roleOf, ROLE_LIST, can } from "../auth/permissions.js";
import { formatCPF, formatPhone } from "../auth/validators.js";
import { store } from "../storage.js";
import { avatar } from "../ui/shell.js";
import { icon } from "../ui/icons.js";
import { toast } from "../ui/toast.js";
import { openModal, confirmDialog } from "../ui/modal.js";
import {
  buildForm,
  textField,
  passwordField,
  maskedField,
} from "../ui/fields.js";

export function init() {
  const header = $("#profile-header");
  const details = $("#profile-details");
  const accessBox = $("#profile-access");
  const activityBox = $("#profile-activity");

  /* ---------- Cabeçalho ---------- */

  function paintHeader() {
    const user = accounts.currentUser();
    const role = roleOf(user);

    render(
      header,
      el("div", { class: "profile__identity" }, [
        avatar(user, 72),
        el("div", {}, [
          el("h1", { class: "profile__name", text: user.name }),
          el("p", { class: "profile__mail", text: user.email }),
          el("span", { class: "tag tag--plain", text: role.label }),
        ]),
      ]),

      el("div", { class: "toolbar" }, [
        el("button", {
          class: "btn btn--primary",
          type: "button",
          text: "Editar dados",
          onclick: () => openProfileForm(),
        }),
        el("button", {
          class: "btn btn--ghost",
          type: "button",
          text: "Trocar a senha",
          onclick: () => openPasswordForm(),
        }),
        el("button", {
          class: "btn btn--ghost",
          type: "button",
          html: `${icon("logout", 15)}<span>Sair da conta</span>`,
          onclick: () => {
            accounts.signOut();
            window.location.href = "./login.html";
          },
        }),
      ])
    );
  }

  /* ---------- Dados cadastrais ---------- */

  function paintDetails() {
    const user = accounts.currentUser();

    render(
      details,
      el("dl", { class: "data-list" }, [
        ...item("Nome completo", user.name),
        ...item("E-mail", user.email),
        ...item("CPF", formatCPF(user.cpf)),
        ...item("Telefone", formatPhone(user.phone)),
        ...item("Conta criada em", formatDateLong(user.createdAt.slice(0, 10))),
        ...item(
          "Último acesso",
          user.lastLoginAt ? formatDateLong(user.lastLoginAt.slice(0, 10)) : "Agora"
        ),
      ])
    );
  }

  function item(label, value) {
    return [
      el("dt", { class: "eyebrow", text: label }),
      el("dd", { text: value }),
    ];
  }

  /* ---------- Nível de acesso ---------- */

  function paintAccess() {
    const user = accounts.currentUser();
    const mine = roleOf(user);

    render(
      accessBox,
      el("p", { class: "muted setting__text", text: mine.description }),

      el(
        "ul",
        { class: "role-list" },
        ROLE_LIST.sort((a, b) => b.rank - a.rank).map((role) =>
          el("li", { class: "role-list__item", dataset: { current: String(role.id === mine.id) } }, [
            el("span", { class: "role-list__mark", html: icon(role.id === mine.id ? "check" : "shield", 14) }),
            el("div", {}, [
              el("p", { class: "role-list__label", text: role.label }),
              el("p", { class: "role-list__text", text: role.description }),
            ]),
          ])
        )
      ),

      can(user, "users:manage")
        ? el("a", { class: "btn btn--ghost", href: "./users.html", text: "Gerenciar usuários" })
        : el("p", {
            class: "form__hint",
            text: "Só um administrador pode alterar níveis de acesso.",
          })
    );
  }

  /* ---------- Resumo da agenda ---------- */

  function paintActivity() {
    const snapshot = store.snapshot();

    render(
      activityBox,
      el("div", { class: "day-summary" }, [
        stat("Atividades", String(snapshot.activities.length)),
        stat("Rotinas", String(snapshot.routines.length)),
        stat("Tarefas", String(snapshot.tasks.length)),
        stat("Categorias", String(snapshot.categories.length)),
      ]),
      el("p", {
        class: "form__hint",
        text: "Estes dados pertencem só a esta conta e não são vistos por outros usuários.",
      })
    );
  }

  /* ---------- Formulário de dados ---------- */

  function openProfileForm() {
    const user = accounts.currentUser();

    const form = buildForm([
      textField({ name: "name", label: "Nome completo", value: user.name, required: true }),
      textField({ name: "email", label: "E-mail", type: "email", value: user.email, required: true }),
      [
        maskedField({ name: "cpf", label: "CPF", value: user.cpf, format: formatCPF, maxlength: 14 }),
        maskedField({
          name: "phone",
          label: "Telefone",
          value: user.phone,
          format: formatPhone,
          maxlength: 15,
          inputmode: "tel",
        }),
      ],
    ]);

    const modal = openModal({
      title: "Editar meus dados",
      subtitle: "O e-mail é o que você usa para entrar",
      body: form.node,
      footer: [
        el("button", { class: "btn btn--ghost", type: "button", text: "Cancelar", onclick: () => modal.close() }),
        el("button", { class: "btn btn--primary", type: "button", text: "Salvar", onclick: () => submit() }),
      ],
    });

    form.onSubmit(submit);

    function submit() {
      form.clearInvalid();
      form.showError("");

      try {
        accounts.updateUser(user.id, form.values());
        toast("Dados atualizados.");
        modal.close();
        paintAll();
      } catch (error) {
        if (error.fields) {
          Object.entries(error.fields).forEach(([name, message]) => {
            form.field(name)?.invalid(true);
            form.showError(message);
          });
          form.field(Object.keys(error.fields)[0])?.focus();
        } else {
          form.showError(error.message);
        }
      }
    }
  }

  /* ---------- Troca de senha ---------- */

  function openPasswordForm() {
    const user = accounts.currentUser();

    const form = buildForm([
      passwordField({ name: "current", label: "Senha atual" }),
      passwordField({
        name: "next",
        label: "Nova senha",
        autocomplete: "new-password",
        hint: "Pelo menos 8 caracteres.",
      }),
      passwordField({ name: "confirm", label: "Repita a nova senha", autocomplete: "new-password" }),
    ]);

    const modal = openModal({
      title: "Trocar a senha",
      body: form.node,
      footer: [
        el("button", { class: "btn btn--ghost", type: "button", text: "Cancelar", onclick: () => modal.close() }),
        el("button", { class: "btn btn--primary", type: "button", text: "Salvar nova senha", onclick: () => submit() }),
      ],
    });

    form.onSubmit(submit);

    async function submit() {
      form.clearInvalid();
      form.showError("");

      const { current, next, confirm } = form.values();

      if (next !== confirm) {
        form.field("confirm").invalid(true);
        form.field("confirm").focus();
        return form.showError("A confirmação não é igual à nova senha.");
      }

      try {
        await accounts.changePassword(user.id, current, next);
        toast("Senha alterada.");
        modal.close();
      } catch (error) {
        form.field(error.name === "AuthError" ? "current" : "next").invalid(true);
        form.showError(error.message);
      }
    }
  }

  /* ---------- Excluir conta ---------- */

  function paintDanger() {
    const box = $("#profile-danger");
    if (!box) return;

    render(
      box,
      el("p", {
        class: "muted setting__text",
        text: "Excluir a conta apaga também toda a agenda dela neste navegador. Exporte um backup antes, se quiser guardar.",
      }),
      el("button", {
        class: "btn btn--danger",
        type: "button",
        html: `${icon("trash", 15)}<span>Excluir minha conta</span>`,
        onclick: async () => {
          const user = accounts.currentUser();

          const proceed = await confirmDialog({
            title: "Excluir sua conta",
            message: `A conta de ${user.email} e todos os seus dados serão removidos deste navegador. Não dá para desfazer.`,
            confirmLabel: "Excluir definitivamente",
            danger: true,
          });
          if (!proceed) return;

          try {
            accounts.deleteUser(user.id);
            store.dropUser(user.id);
            window.location.href = "./login.html";
          } catch (error) {
            toast(error.message, "warning", 6000);
          }
        },
      })
    );
  }

  /* ---------- Orquestração ---------- */

  function paintAll() {
    paintHeader();
    paintDetails();
    paintAccess();
    paintActivity();
    paintDanger();
  }

  paintAll();
  store.on("change", paintActivity);
}

function stat(label, value) {
  return el("div", { class: "stat" }, [
    el("p", { class: "stat__value", text: value }),
    el("p", { class: "stat__label", text: label }),
  ]);
}
