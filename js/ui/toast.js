/* =========================================================
   RoutineX — ui/toast.js
   Avisos rápidos no canto da tela. Somem sozinhos.
   ========================================================= */

import { el } from "../utils.js";
import { icon } from "./icons.js";

const ICONS = {
  success: "check",
  info: "info",
  warning: "alert",
  error: "alert",
};

let region = null;

function getRegion() {
  if (region?.isConnected) return region;

  region = document.getElementById("toast-region");
  if (!region) {
    region = el("div", {
      id: "toast-region",
      class: "toasts",
      role: "status",
      "aria-live": "polite",
    });
    document.body.append(region);
  }
  return region;
}

/**
 * @param {string} message  texto exibido
 * @param {"success"|"info"|"warning"|"error"} type
 * @param {number} duration  ms até sumir
 */
export function toast(message, type = "success", duration = 3200) {
  const node = el("div", { class: `toast toast--${type}` }, [
    el("span", { class: "toast__icon", html: icon(ICONS[type] || "info", 16) }),
    el("span", { class: "toast__text", text: message }),
  ]);

  getRegion().append(node);

  const close = () => {
    if (node.dataset.closing) return;
    node.dataset.closing = "true";
    node.addEventListener("animationend", () => node.remove(), { once: true });
    setTimeout(() => node.remove(), 400); // rede de segurança
  };

  const timer = setTimeout(close, duration);
  node.addEventListener("click", () => {
    clearTimeout(timer);
    close();
  });

  return close;
}
