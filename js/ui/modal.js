/* =========================================================
   RoutineX — ui/modal.js
   Janela modal acessível: foco preso, Esc fecha, clique fora fecha.
   Empilhável — só o modal do topo responde ao teclado.
   ========================================================= */

import { el, $$ } from "../utils.js";
import { icon } from "./icons.js";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const stack = [];

/**
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.subtitle]
 * @param {Node|Node[]} options.body
 * @param {Node[]} [options.footer]        botões do rodapé
 * @param {Node[]} [options.footerStart]   botões alinhados à esquerda
 * @param {boolean} [options.wide]
 * @param {string} [options.icon]   nome do ícone (ui/icons.js) exibido junto ao título
 * @param {string} [options.tone]   identidade visual do modal — hoje "activity" | "routine" | "task"
 * @param {Function} [options.onClose]
 * @returns {{ close: Function, panel: HTMLElement, root: HTMLElement }}
 */
export function openModal({
  title,
  subtitle,
  body,
  footer = [],
  footerStart = [],
  wide = false,
  icon: iconName,
  tone,
  onClose,
}) {
  const previouslyFocused = document.activeElement;

  const closeButton = el("button", {
    class: "icon-btn",
    type: "button",
    "aria-label": "Fechar",
    html: icon("close", 18),
    onclick: () => close(),
  });

  const panel = el(
    "div",
    {
      class: `modal__panel${wide ? " modal__panel--wide" : ""}`,
      dataset: tone ? { tone } : {},
      role: "dialog",
      "aria-modal": "true",
      "aria-label": title,
    },
    [
      el("div", { class: "modal__head" }, [
        el("div", { class: "modal__head-main" }, [
          iconName && el("span", { class: "modal__icon", html: icon(iconName, 18) }),
          el("div", { class: "modal__head-text" }, [
            el("h2", { class: "modal__title", text: title }),
            subtitle && el("p", { class: "modal__sub", text: subtitle }),
          ]),
        ]),
        closeButton,
      ]),

      el("div", { class: "modal__body" }, [].concat(body)),

      (footer.length || footerStart.length) &&
        el(
          "div",
          {
            class: `modal__foot${
              footerStart.length ? " modal__foot--split" : ""
            }`,
          },
          [
            footerStart.length ? el("div", { class: "inline" }, footerStart) : null,
            el("div", { class: "inline" }, footer),
          ]
        ),
    ]
  );

  const root = el(
    "div",
    {
      class: "modal",
      onmousedown: (event) => {
        if (event.target === root) close();
      },
    },
    [panel]
  );

  function onKeydown(event) {
    if (stack[stack.length - 1] !== instance) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = $$(FOCUSABLE, panel).filter(
      (node) => node.offsetParent !== null
    );
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  let closed = false;
  function close(result) {
    if (closed) return;
    closed = true;

    document.removeEventListener("keydown", onKeydown, true);
    const index = stack.indexOf(instance);
    if (index > -1) stack.splice(index, 1);
    if (!stack.length) document.body.style.removeProperty("overflow");

    root.dataset.closing = "true";
    setTimeout(() => root.remove(), 140);

    previouslyFocused?.focus?.();
    onClose?.(result);
  }

  const instance = { close, panel, root };

  document.body.append(root);
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", onKeydown, true);
  stack.push(instance);

  // Primeiro campo do formulário, ou o botão de fechar.
  const target = $$(FOCUSABLE, panel).find(
    (node) => node !== closeButton && node.offsetParent !== null
  );
  (target || closeButton).focus();

  return instance;
}

/** Fecha todos os modais abertos (usado ao navegar). */
export function closeAllModals() {
  [...stack].reverse().forEach((instance) => instance.close());
}

export const hasOpenModal = () => stack.length > 0;

/**
 * Confirmação com Promise. Resolve true quando o usuário confirma.
 * @returns {Promise<boolean>}
 */
export function confirmDialog({
  title = "Tem certeza?",
  message = "",
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger = false,
}) {
  return new Promise((resolve) => {
    let answer = false;

    const modal = openModal({
      title,
      body: el("p", { class: "muted", text: message }),
      footer: [
        el("button", {
          class: "btn btn--ghost",
          type: "button",
          text: cancelLabel,
          onclick: () => modal.close(),
        }),
        el("button", {
          class: `btn ${danger ? "btn--danger" : "btn--primary"}`,
          type: "button",
          text: confirmLabel,
          onclick: () => {
            answer = true;
            modal.close();
          },
        }),
      ],
      onClose: () => resolve(answer),
    });
  });
}

/**
 * Escolha entre várias opções (ex.: apagar só este dia ou a série inteira).
 * @returns {Promise<string|null>} valor escolhido
 */
export function chooseDialog({ title, message, options }) {
  return new Promise((resolve) => {
    let answer = null;

    const modal = openModal({
      title,
      body: el("p", { class: "muted", text: message }),
      footer: options.map((option) =>
        el("button", {
          class: `btn ${option.danger ? "btn--danger" : option.primary ? "btn--primary" : "btn--ghost"}`,
          type: "button",
          text: option.label,
          onclick: () => {
            answer = option.value;
            modal.close();
          },
        })
      ),
      onClose: () => resolve(answer),
    });
  });
}
