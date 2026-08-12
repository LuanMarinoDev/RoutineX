/* =========================================================
   RoutineX — pages/users.js
   Tela de administrador: quem tem conta, com que nível de
   acesso, e o que cada nível permite.
   ========================================================= */

import { $, el, render, formatDateShort, normalize } from "../utils.js";
import { accounts } from "../auth/accounts.js";
import { ROLE_LIST, ROLES, roleOf, canChangeRole } from "../auth/permissions.js";
import { formatCPF, formatPhone } from "../auth/validators.js";
import { store } from "../storage.js";
import { avatar } from "../ui/shell.js";
import { emptyState } from "../ui/components.js";
import { icon } from "../ui/icons.js";
import { toast } from "../ui/toast.js";
import { confirmDialog, chooseDialog } from "../ui/modal.js";

export function init() {
  const list = $("#users-list");
  const summary = $("#users-summary");
  const searchInput = $("#users-search");

  let term = "";

  /* ---------- Linha de usuário ---------- */

  function userRow(user) {
    const me = accounts.currentUser();
    const isMe = user.id === me.id;
    const role = roleOf(user);

    return el("article", { class: "user-row", dataset: { id: user.id, role: user.role } }, [
      avatar(user, 42),

      el("div", { class: "user-row__body" }, [
        el("p", { class: "user-row__name" }, [
          user.name,
          isMe && el("span", { class: "badge", text: "você" }),
        ]),
        el("p", { class: "user-row__mail", text: user.email }),
        el("p", { class: "user-row__meta muted" }, [
          `${formatCPF(user.cpf)} · ${formatPhone(user.phone)}`,
        ]),
      ]),

      el("div", { class: "user-row__side" }, [
        el("span", { class: "tag tag--plain", text: role.label }),
        el("span", {
          class: "user-row__since",
          text: `desde ${formatDateShort(user.createdAt.slice(0, 10))}`,
        }),
      ]),

      el("div", { class: "user-row__actions" }, [
        el("button", {
          class: "btn btn--ghost btn--sm",
          type: "button",
          disabled: !canChangeRole(me, user),
          title: isMe ? "Você não pode alterar o próprio nível de acesso" : "",
          text: "Nível de acesso",
          onclick: () => changeRole(user),
        }),
        el("button", {
          class: "icon-btn icon-btn--danger",
          type: "button",
          disabled: isMe,
          "aria-label": `Excluir a conta de ${user.name}`,
          title: isMe ? "Exclua a própria conta pelo seu perfil" : `Excluir ${user.name}`,
          html: icon("trash", 15),
          onclick: () => removeUser(user),
        }),
      ]),
    ]);
  }

  /* ---------- Ações ---------- */

  async function changeRole(user) {
    const choice = await chooseDialog({
      title: `Nível de acesso de ${user.name.split(" ")[0]}`,
      message: ROLE_LIST.map((role) => `${role.label}: ${role.description}`).join("\n"),
      options: [
        { label: "Cancelar", value: null },
        ...ROLE_LIST.sort((a, b) => a.rank - b.rank).map((role) => ({
          label: role.label,
          value: role.id,
          primary: role.id === "member",
        })),
      ],
    });

    if (!choice || choice === user.role) return;

    try {
      accounts.setRole(user.id, choice);
      toast(`${user.name.split(" ")[0]} agora é ${ROLES[choice].label.toLowerCase()}.`);
      paint();
    } catch (error) {
      toast(error.message, "warning", 6000);
    }
  }

  async function removeUser(user) {
    const proceed = await confirmDialog({
      title: "Excluir conta",
      message: `A conta de ${user.email} e toda a agenda dela serão removidas deste navegador. Não dá para desfazer.`,
      confirmLabel: "Excluir conta",
      danger: true,
    });
    if (!proceed) return;

    try {
      accounts.deleteUser(user.id);
      store.dropUser(user.id);
      toast("Conta excluída.");
      paint();
    } catch (error) {
      toast(error.message, "warning", 6000);
    }
  }

  /* ---------- Pintura ---------- */

  function paintSummary(users) {
    render(
      summary,
      el("div", { class: "day-summary" }, [
        stat("Contas", String(users.length)),
        ...ROLE_LIST.sort((a, b) => b.rank - a.rank).map((role) =>
          stat(role.label, String(users.filter((user) => user.role === role.id).length))
        ),
      ])
    );
  }

  function paint() {
    const users = accounts.list();
    paintSummary(users);

    const query = normalize(term);
    const numbers = term.replace(/\D/g, ""); // busca por CPF só faz sentido com dígitos

    const visible = query
      ? users.filter(
          (user) =>
            normalize(user.name).includes(query) ||
            normalize(user.email).includes(query) ||
            (numbers.length >= 3 && user.cpf.includes(numbers))
        )
      : users;

    if (!visible.length) {
      render(
        list,
        emptyState({
          icon: "users",
          title: "Nenhuma conta encontrada",
          text: `Nada corresponde a “${term}”.`,
        })
      );
      return;
    }

    // Administradores primeiro, depois por nome.
    const ordered = [...visible].sort(
      (a, b) => roleOf(b).rank - roleOf(a).rank || a.name.localeCompare(b.name)
    );

    render(list, el("div", { class: "user-list" }, ordered.map(userRow)));
  }

  searchInput?.addEventListener("input", () => {
    term = searchInput.value;
    paint();
  });

  accounts.on(() => paint());
  paint();
}

function stat(label, value) {
  return el("div", { class: "stat" }, [
    el("p", { class: "stat__value", text: value }),
    el("p", { class: "stat__label", text: label }),
  ]);
}
