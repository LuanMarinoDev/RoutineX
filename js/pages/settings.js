/* =========================================================
   RoutineX — pages/settings.js
   Preferências da conta: identidade, aparência, semana,
   notificações, categorias e o destino dos seus dados.
   ========================================================= */

import { $, el, render, debounce } from "../utils.js";
import { store } from "../storage.js";
import { accounts } from "../auth/accounts.js";
import { can, roleOf } from "../auth/permissions.js";
import { applyTheme, setTheme, THEME_LABEL } from "../ui/theme.js";
import { openCategoryManager } from "../features/categories.js";
import {
  enableNotifications,
  disableNotifications,
  notificationPermission,
  notificationsSupported,
} from "../features/notifications.js";
import { toast } from "../ui/toast.js";
import { confirmDialog } from "../ui/modal.js";
import { icon } from "../ui/icons.js";
import { avatar } from "../ui/shell.js";

const THEMES = ["dark", "light", "system"];

export function init() {
  const user = accounts.currentUser();
  const writable = can(user, "settings:write");

  /* ---------- Perfil resumido ---------- */

  function paintAccount() {
    const box = $("#set-account");
    if (!box) return;

    render(
      box,
      el("div", { class: "account-row" }, [
        avatar(user, 46),
        el("div", { class: "account-row__text" }, [
          el("p", { class: "account-row__name", text: user.name }),
          el("p", { class: "account-row__mail", text: user.email }),
        ]),
        el("span", { class: "tag tag--plain", text: roleOf(user).label }),
      ]),
      el("a", {
        class: "btn btn--ghost",
        href: "./profile.html",
        text: "Editar meu perfil",
      })
    );
  }

  /* ---------- Como te chamar ---------- */

  function paintName() {
    const input = $("#user-name");
    if (!input) return;

    input.disabled = !writable;
    input.value = store.getSettings().userName || user.name.split(" ")[0];

    const save = debounce((value) => {
      store.updateSettings({ userName: value.trim() });
      toast("Nome atualizado.");
    }, 600);

    input.addEventListener("input", () => save(input.value));
  }

  /* ---------- Aparência ---------- */

  function paintTheme() {
    const box = $("#set-theme");
    if (!box) return;

    const current = store.getSettings().theme;

    render(
      box,
      el(
        "div",
        { class: "segmented segmented--wide", role: "group", "aria-label": "Tema" },
        THEMES.map((theme) =>
          el("button", {
            type: "button",
            "aria-pressed": String(theme === current),
            text: THEME_LABEL[theme],
            disabled: !writable,
            onclick: () => {
              setTheme(theme);
              paintTheme();
              toast(`Tema: ${THEME_LABEL[theme]}.`);
            },
          })
        )
      ),
      el("p", {
        class: "form__hint",
        text: "“Sistema” acompanha a configuração do seu aparelho automaticamente.",
      })
    );

    applyTheme(current);
  }

  /* ---------- Início da semana ---------- */

  function paintWeek() {
    const box = $("#set-week");
    if (!box) return;

    const current = store.getSettings().weekStartsOn;

    render(
      box,
      el(
        "div",
        { class: "segmented segmented--wide", role: "group", "aria-label": "Início da semana" },
        [
          [1, "Segunda"],
          [0, "Domingo"],
        ].map(([value, label]) =>
          el("button", {
            type: "button",
            "aria-pressed": String(value === current),
            text: label,
            disabled: !writable,
            onclick: () => {
              store.updateSettings({ weekStartsOn: value });
              paintWeek();
              toast(`A semana começa na ${label.toLowerCase()}.`);
            },
          })
        )
      )
    );
  }

  /* ---------- Notificações ---------- */

  function paintNotifications() {
    const box = $("#set-notifications");
    if (!box) return;

    const settings = store.getSettings();
    const permission = notificationPermission();
    const on = settings.notificationsEnabled && permission === "granted";

    const STATUS = {
      unsupported: "Este navegador não oferece notificações.",
      denied: "O navegador bloqueou os avisos. Libere nas permissões do site.",
      granted: on
        ? `Avisando ${settings.notifyMinutesBefore} minutos antes de cada atividade.`
        : "Permissão concedida. Ative para voltar a receber avisos.",
      default: "Você decide: nada é pedido antes de você ativar aqui.",
    };

    const toggle = el("button", {
      class: `btn ${on ? "btn--ghost" : "btn--primary"}`,
      type: "button",
      disabled: !writable || permission === "unsupported",
      text: on ? "Desativar notificações" : "Ativar notificações",
      onclick: async () => {
        if (on) {
          disableNotifications();
          toast("Notificações desativadas.");
        } else {
          await enableNotifications();
        }
        paintNotifications();
      },
    });

    const minutes = el(
      "select",
      {
        class: "select",
        "aria-label": "Minutos de antecedência",
        disabled: !writable,
        onchange: (event) => {
          store.updateSettings({ notifyMinutesBefore: Number(event.target.value) });
          paintNotifications();
          toast("Antecedência atualizada.");
        },
      },
      [5, 10, 15, 30, 60].map((value) =>
        el("option", {
          value: String(value),
          text: `${value} minutos antes`,
          selected: value === Number(settings.notifyMinutesBefore),
        })
      )
    );

    render(
      box,
      el("p", { class: "muted setting__text", text: STATUS[permission] || STATUS.default }),
      el("div", { class: "toolbar" }, [toggle, notificationsSupported() ? minutes : null])
    );
  }

  /* ---------- Categorias ---------- */

  function paintCategories() {
    const box = $("#set-categories");
    if (!box) return;

    const categories = store.getCategories();

    render(
      box,
      el(
        "div",
        { class: "swatches swatches--preview" },
        categories.map((category) =>
          el("span", {
            class: "tag",
            style: `--tag-color:${category.color}`,
            text: category.name,
          })
        )
      ),
      el("button", {
        class: "btn btn--ghost",
        type: "button",
        disabled: !writable,
        text: `Gerenciar categorias (${categories.length})`,
        onclick: () => openCategoryManager(),
      })
    );
  }

  /* ---------- Dados ---------- */

  function paintData() {
    const box = $("#set-data");
    if (!box) return;

    const exportButton = el("button", {
      class: "btn btn--ghost",
      type: "button",
      html: `${icon("download", 15)}<span>Exportar backup</span>`,
      onclick: () => {
        const blob = new Blob([store.exportData()], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = el("a", {
          href: url,
          download: `routinex-${new Date().toISOString().slice(0, 10)}.json`,
        });
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        toast("Backup baixado.");
      },
    });

    const picker = el("input", {
      type: "file",
      accept: "application/json,.json",
      hidden: true,
      onchange: async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const proceed = await confirmDialog({
          title: "Importar backup",
          message: `O conteúdo de “${file.name}” substitui a agenda desta conta. Exporte um backup antes, se quiser voltar atrás.`,
          confirmLabel: "Importar e substituir",
          danger: true,
        });

        picker.value = "";
        if (!proceed) return;

        try {
          store.importData(await file.text());
          toast("Backup importado.");
          paintAll();
        } catch (error) {
          console.error("[settings] Importação falhou.", error);
          toast(error.message || "Arquivo inválido.", "warning", 6000);
        }
      },
    });

    const importButton = el("button", {
      class: "btn btn--ghost",
      type: "button",
      disabled: !writable,
      html: `${icon("upload", 15)}<span>Importar backup</span>`,
      onclick: () => picker.click(),
    });

    const clearButton = el("button", {
      class: "btn btn--danger",
      type: "button",
      disabled: !writable,
      html: `${icon("trash", 15)}<span>Apagar meus dados</span>`,
      onclick: async () => {
        const proceed = await confirmDialog({
          title: "Apagar seus dados",
          message:
            "Atividades, rotinas e tarefas desta conta serão removidas. Sua conta e suas preferências continuam. Não dá para desfazer.",
          confirmLabel: "Apagar tudo",
          danger: true,
        });
        if (!proceed) return;

        store.clearAll();
        toast("Dados apagados.");
        paintAll();
      },
    });

    const snapshot = store.snapshot();

    render(
      box,
      el("p", {
        class: "muted setting__text",
        text: "Tudo fica salvo apenas neste navegador, separado por conta. Exporte um backup antes de limpar o histórico ou trocar de aparelho.",
      }),
      el("div", { class: "day-summary" }, [
        countBox("Atividades", snapshot.activities.length),
        countBox("Rotinas", snapshot.routines.length),
        countBox("Tarefas", snapshot.tasks.length),
        countBox("Categorias", snapshot.categories.length),
      ]),
      el("div", { class: "toolbar" }, [exportButton, importButton, clearButton, picker])
    );
  }

  /* ---------- Orquestração ---------- */

  function paintAll() {
    paintAccount();
    paintName();
    paintTheme();
    paintWeek();
    paintNotifications();
    paintCategories();
    paintData();
  }

  paintAll();
  store.on("change", () => {
    paintCategories();
    paintData();
  });
}

function countBox(label, value) {
  return el("div", { class: "stat" }, [
    el("p", { class: "stat__value", text: String(value) }),
    el("p", { class: "stat__label", text: label }),
  ]);
}
