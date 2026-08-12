/* =========================================================
   RoutineX — ui/theme.js
   Aplica o tema salvo (dark, light ou o do sistema).

   O <head> de cada página tem um script curto que faz a mesma
   leitura antes da primeira pintura — é o único lugar do projeto
   que toca no localStorage fora de storage.js, e existe só para
   evitar o flash de tela clara/escura ao carregar.
   ========================================================= */

import { store } from "../storage.js";
import { $ } from "../utils.js";

const SYSTEM_QUERY = "(prefers-color-scheme: light)";

const COLORS = { dark: "#0B0D0C", light: "#F6F7F5" };

export const THEME_LABEL = {
  dark: "Dark",
  light: "Light",
  system: "Sistema",
};

/** "system" → o que o sistema operacional está pedindo agora. */
export function resolveTheme(theme) {
  if (theme === "light" || theme === "dark") return theme;
  return window.matchMedia(SYSTEM_QUERY).matches ? "light" : "dark";
}

export function applyTheme(theme) {
  const resolved = resolveTheme(theme);

  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;

  $('meta[name="theme-color"]')?.setAttribute("content", COLORS[resolved]);
  $('meta[name="color-scheme"]')?.setAttribute("content", resolved);

  const pill = $(".theme-pill");
  if (pill) pill.textContent = THEME_LABEL[theme] || THEME_LABEL[resolved];

  return resolved;
}

export function setTheme(theme) {
  store.updateSettings({ theme });
  return applyTheme(theme);
}

export function initTheme() {
  applyTheme(store.getSettings().theme);

  // Acompanha o sistema em tempo real quando o modo é "system".
  window.matchMedia(SYSTEM_QUERY).addEventListener("change", () => {
    if (store.getSettings().theme === "system") applyTheme("system");
  });

  store.on("settings", (settings) => applyTheme(settings.theme));
}
