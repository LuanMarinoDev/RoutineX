/* =========================================================
   RoutineX — utils.js
   Funções auxiliares puras: DOM, datas, horários, formatação.
   Nenhuma dependência de outros módulos.
   ========================================================= */

/* ---------- DOM ---------- */

export const $ = (selector, scope = document) => scope.querySelector(selector);
export const $$ = (selector, scope = document) =>
  Array.from(scope.querySelectorAll(selector));

/**
 * Cria um elemento com atributos e filhos.
 * el("button", { class: "btn", onclick: fn }, "Salvar")
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;

    if (key === "class") node.className = value;
    else if (key === "html") node.innerHTML = value;
    else if (key === "text") node.textContent = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2), value);
    } else node.setAttribute(key, value === true ? "" : value);
  }

  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }

  return node;
}

/** Substitui todo o conteúdo de um container de uma só vez. */
export function render(container, ...children) {
  container.replaceChildren(...children.flat().filter(Boolean));
}

/* ---------- Ids e clones ---------- */

export const uid = (prefix = "id") =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const clone = (value) =>
  typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));

/* ---------- Números ---------- */

export const pad2 = (n) => String(n).padStart(2, "0");
export const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

/* ---------- Datas ----------
   Convenção do projeto:
   - data  → string "YYYY-MM-DD" (sempre horário local, nunca UTC)
   - hora  → string "HH:MM"
   Evitamos new Date("2026-08-10") porque o JS interpreta como UTC.
*/

export const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const WEEKDAYS_MIN = ["D", "S", "T", "Q", "Q", "S", "S"];
export const WEEKDAYS_LONG = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
export const MONTHS_LONG = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/** Date → "YYYY-MM-DD" (local) */
export const toISODate = (date = new Date()) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

/** "YYYY-MM-DD" → Date (meia-noite local) */
export function fromISODate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export const todayISO = () => toISODate();

/** Soma dias a uma data ISO e devolve outra ISO. */
export function addDays(iso, days) {
  const date = fromISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

export function addMonths(iso, months) {
  const date = fromISODate(iso);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return toISODate(date);
}

/** Início da semana (0 = domingo, 1 = segunda). */
export function startOfWeek(iso, weekStartsOn = 1) {
  const date = fromISODate(iso);
  const diff = (date.getDay() - weekStartsOn + 7) % 7;
  date.setDate(date.getDate() - diff);
  return toISODate(date);
}

export const isSameDay = (a, b) => a === b;
export const isToday = (iso) => iso === todayISO();

/** "10/08/2026" */
export const formatDateShort = (iso) => {
  const d = fromISODate(iso);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/** "Segunda-feira, 10 de Agosto de 2026" */
export function formatDateLong(iso) {
  const d = fromISODate(iso);
  return `${WEEKDAYS_LONG[d.getDay()]}, ${d.getDate()} de ${
    MONTHS_LONG[d.getMonth()]
  } de ${d.getFullYear()}`;
}

/** "Hoje", "Amanhã", "Ontem" ou "Seg, 12 ago". */
export function formatRelativeDay(iso) {
  const today = todayISO();
  if (iso === today) return "Hoje";
  if (iso === addDays(today, 1)) return "Amanhã";
  if (iso === addDays(today, -1)) return "Ontem";

  const d = fromISODate(iso);
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[
    d.getMonth()
  ]
    .slice(0, 3)
    .toLowerCase()}`;
}

/* ---------- Horários ---------- */

/** "19:30" → 1170 (minutos desde 00:00) */
export function timeToMinutes(time) {
  const [h, m] = String(time).split(":").map(Number);
  return h * 60 + (m || 0);
}

/** 1170 → "19:30" */
export function minutesToTime(minutes) {
  const total = clamp(Math.round(minutes), 0, 24 * 60);
  return `${pad2(Math.floor(total / 60) % 24)}:${pad2(total % 60)}`;
}

/** Minutos decorridos hoje, incluindo segundos como fração. */
export function nowMinutes(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

/** Hora atual como "HH:MM:SS". */
export const formatClock = (date = new Date()) =>
  `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(
    date.getSeconds()
  )}`;

/** 222 → "3h42" | 15 → "15 min" | 1560 → "1d 2h" */
export function formatDuration(minutes) {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} min`;

  const hours = Math.floor(total / 60);
  const mins = total % 60;

  if (hours < 24) return mins ? `${hours}h${pad2(mins)}` : `${hours}h`;

  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/** "em 3h42" / "há 12 min" / "agora" */
export function formatCountdown(minutes) {
  if (Math.abs(minutes) < 1) return "agora";
  return minutes > 0
    ? `em ${formatDuration(minutes)}`
    : `há ${formatDuration(-minutes)}`;
}

/** Saudação conforme o horário. */
export function greetingFor(hour = new Date().getHours()) {
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

/** Dois intervalos "HH:MM" se sobrepõem? */
export const overlaps = (startA, endA, startB, endB) =>
  timeToMinutes(startA) < timeToMinutes(endB) &&
  timeToMinutes(startB) < timeToMinutes(endA);

/* ---------- Texto ---------- */

export const capitalize = (text) =>
  text ? text.charAt(0).toUpperCase() + text.slice(1) : "";

/** Normaliza para busca: minúsculo e sem acentos. */
export const normalize = (text) =>
  String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/* ---------- Cores ---------- */

/** "#b6f000" → "rgba(182, 240, 0, 0.12)" */
export function hexToRgba(hex, alpha = 1) {
  const clean = String(hex || "").replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;

  const int = parseInt(full, 16);
  if (Number.isNaN(int) || full.length !== 6) return `rgba(0, 0, 0, ${alpha})`;

  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

/* ---------- Coleções ---------- */

/** Agrupa uma lista por chave e devolve um Map (mantém a ordem de entrada). */
export function groupBy(list, keyFn) {
  const map = new Map();
  for (const item of list) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

/** Lista de datas ISO de `from` até `to`, inclusive. */
export function eachDay(from, to) {
  const days = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard++ < 800) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

/** Ordena dias da semana a partir do início escolhido: [1,2,3,4,5,6,0] */
export const weekOrder = (weekStartsOn = 1) =>
  Array.from({ length: 7 }, (_, i) => (i + weekStartsOn) % 7);

/* ---------- Controle de fluxo ---------- */

export function debounce(fn, wait = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/** Executa fn a cada intervalo e imediatamente. Devolve o cancelador. */
export function every(ms, fn) {
  fn();
  const id = setInterval(fn, ms);
  return () => clearInterval(id);
}

/** O foco está em um campo de digitação? (usado nos atalhos) */
export function isTyping(target = document.activeElement) {
  if (!target) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}
