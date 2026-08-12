/* =========================================================
   RoutineX — ui/clock.js
   Relógio ao vivo, data por extenso e saudação por período.
   Marcação esperada (opcional em cada página):
     [data-clock]  → HH:MM + <span class="clock__sec">:SS</span>
     [data-date]   → "Segunda-feira, 10 de Agosto de 2026"
     [data-greeting] → "Bom dia, Luan 👋"
   ========================================================= */

import { $, every, pad2, formatDateLong, greetingFor, todayISO } from "../utils.js";
import { store } from "../storage.js";

let stop = null;
let lastGreeting = "";
let lastDate = "";

function paint() {
  const now = new Date();

  const clock = $("[data-clock]");
  if (clock) {
    clock.innerHTML = `${pad2(now.getHours())}:${pad2(
      now.getMinutes()
    )}<span class="clock__sec">:${pad2(now.getSeconds())}</span>`;
    clock.setAttribute(
      "aria-label",
      `Agora são ${now.getHours()} horas e ${now.getMinutes()} minutos`
    );
  }

  // Data e saudação mudam pouco: só reescreve quando necessário.
  const today = todayISO();
  const dateNode = $("[data-date]");
  if (dateNode && today !== lastDate) {
    dateNode.textContent = formatDateLong(today);
    lastDate = today;
  }

  const greetingNode = $("[data-greeting]");
  if (greetingNode) {
    const name = store.getSettings().userName?.trim();
    const text = `${greetingFor(now.getHours())}${name ? `, ${name}` : ""} 👋`;
    if (text !== lastGreeting) {
      greetingNode.textContent = text;
      lastGreeting = text;
    }
  }
}

export function initClock() {
  if (!$("[data-clock]") && !$("[data-greeting]") && !$("[data-date]")) return;

  stop?.();
  stop = every(1000, paint);

  // Ao voltar para a aba, corrige o atraso na hora.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) paint();
  });

  store.on("settings", () => {
    lastGreeting = "";
    paint();
  });
}

export function stopClock() {
  stop?.();
  stop = null;
}
