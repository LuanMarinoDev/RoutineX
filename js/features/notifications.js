/* =========================================================
   RoutineX — features/notifications.js
   Avisos do navegador alguns minutos antes de cada atividade.

   A permissão só é pedida quando a pessoa liga a opção nas
   Configurações — nunca ao abrir o app.
   ========================================================= */

import { store } from "../storage.js";
import { every, formatDuration, todayISO } from "../utils.js";
import { toast } from "../ui/toast.js";
import { occurrencesFor, minutesUntil } from "../core/schedule.js";

const CHECK_INTERVAL = 30_000;

/** Avisos já disparados nesta sessão: "id@data". */
const fired = new Set();

let stop = null;

export const notificationsSupported = () => typeof window.Notification === "function";

export function notificationPermission() {
  return notificationsSupported() ? window.Notification.permission : "unsupported";
}

/**
 * Liga os avisos. Devolve true se a permissão foi concedida.
 * Só chame a partir de um clique — os navegadores exigem gesto do usuário.
 */
export async function enableNotifications() {
  if (!notificationsSupported()) {
    toast("Este navegador não oferece notificações.", "warning");
    return false;
  }

  let permission = window.Notification.permission;
  if (permission === "default") {
    permission = await window.Notification.requestPermission();
  }

  if (permission !== "granted") {
    store.updateSettings({ notificationsEnabled: false });
    toast(
      "Permissão negada. Libere as notificações nas configurações do navegador para ativar.",
      "warning",
      6000
    );
    return false;
  }

  store.updateSettings({ notificationsEnabled: true });
  start();
  toast("Notificações ativadas.");
  return true;
}

export function disableNotifications() {
  store.updateSettings({ notificationsEnabled: false });
  stop?.();
  stop = null;
}

/* ---------- Laço de verificação ---------- */

function check() {
  const settings = store.getSettings();
  if (!settings.notificationsEnabled) return;
  if (notificationPermission() !== "granted") return;

  const lead = Number(settings.notifyMinutesBefore) || 15;
  const today = todayISO();

  for (const occurrence of occurrencesFor(today)) {
    if (occurrence.done) continue;

    const key = `${occurrence.id}@${today}`;
    if (fired.has(key)) continue;

    const minutes = minutesUntil(occurrence);
    if (minutes > lead || minutes < -1) continue;

    fired.add(key);
    show(occurrence, minutes);
  }
}

function show(occurrence, minutes) {
  const body =
    minutes <= 1
      ? `Começa agora · ${occurrence.start}–${occurrence.end}`
      : `Começa ${formatDuration(minutes)} · ${occurrence.start}–${occurrence.end}`;

  try {
    const notification = new window.Notification(occurrence.title, {
      body,
      tag: occurrence.id,
      badge: undefined,
      silent: false,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch (error) {
    // Alguns navegadores exigem Service Worker; o toast garante o aviso.
    console.warn("[notifications] Falha ao exibir.", error);
  }

  toast(`${occurrence.title} — ${body.toLowerCase()}`, "info", 6000);
}

function start() {
  stop?.();
  stop = every(CHECK_INTERVAL, check);
}

export function initNotifications() {
  const settings = store.getSettings();
  if (!settings.notificationsEnabled) return;

  if (notificationPermission() !== "granted") {
    // A permissão foi revogada fora do app: desliga para não mentir na tela.
    store.updateSettings({ notificationsEnabled: false });
    return;
  }

  start();
}
