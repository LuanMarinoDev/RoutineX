/* =========================================================
   RoutineX — auth/validators.js
   Validação e formatação dos dados de cadastro.
   Funções puras: recebem texto, devolvem verdade ou erro.
   ========================================================= */

/** Só os dígitos de um texto. */
export const digits = (value) => String(value ?? "").replace(/\D/g, "");

/* ---------- E-mail ---------- */

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export const isEmail = (value) => EMAIL.test(String(value ?? "").trim());

export const normalizeEmail = (value) => String(value ?? "").trim().toLowerCase();

/* ---------- CPF ---------- */

/** Dígito verificador do CPF: soma ponderada, módulo 11. */
function cpfCheckDigit(numbers, weightStart) {
  const sum = numbers.reduce(
    (total, digit, index) => total + digit * (weightStart - index),
    0
  );
  const rest = (sum * 10) % 11;
  return rest === 10 ? 0 : rest;
}

export function isCPF(value) {
  const numbers = digits(value);
  if (numbers.length !== 11) return false;

  // 111.111.111-11 e afins passam na conta, mas não existem.
  if (/^(\d)\1{10}$/.test(numbers)) return false;

  const list = numbers.split("").map(Number);
  return (
    cpfCheckDigit(list.slice(0, 9), 10) === list[9] &&
    cpfCheckDigit(list.slice(0, 10), 11) === list[10]
  );
}

/** "12345678901" → "123.456.789-01" */
export function formatCPF(value) {
  const n = digits(value).slice(0, 11);
  if (n.length <= 3) return n;
  if (n.length <= 6) return `${n.slice(0, 3)}.${n.slice(3)}`;
  if (n.length <= 9) return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6)}`;
  return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`;
}

/* ---------- Telefone ---------- */

/** Fixo (10 dígitos) ou celular (11, começando com 9 depois do DDD). */
export function isPhone(value) {
  const n = digits(value);
  if (n.length !== 10 && n.length !== 11) return false;
  if (Number(n.slice(0, 2)) < 11) return false; // DDD válido começa em 11
  if (n.length === 11 && n[2] !== "9") return false;
  return true;
}

/** "11987654321" → "(11) 98765-4321" */
export function formatPhone(value) {
  const n = digits(value).slice(0, 11);
  if (n.length <= 2) return n;
  if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
}

/* ---------- Senha ---------- */

export const MIN_PASSWORD = 8;

/**
 * Força da senha: 0 a 4, com um recado do que falta.
 * Nada de regras impossíveis — só o suficiente para não ser "12345678".
 */
export function passwordStrength(password = "") {
  const value = String(password);
  const checks = [
    value.length >= MIN_PASSWORD,
    /[a-z]/.test(value) && /[A-Z]/.test(value),
    /\d/.test(value),
    /[^\w\s]/.test(value) || value.length >= 12,
  ];

  const score = checks.filter(Boolean).length;
  const LABELS = ["Muito fraca", "Fraca", "Razoável", "Boa", "Forte"];

  return {
    score,
    label: LABELS[score],
    valid: value.length >= MIN_PASSWORD,
    hint:
      value.length < MIN_PASSWORD
        ? `Use pelo menos ${MIN_PASSWORD} caracteres.`
        : score < 3
        ? "Misture maiúsculas, minúsculas e números."
        : "",
  };
}

/* ---------- Nome ---------- */

export const isName = (value) => String(value ?? "").trim().length >= 2;

/** "  maria  clara  " → "Maria Clara" */
export function normalizeName(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/(^|\s)(\p{L})/gu, (_, space, letter) => space + letter.toUpperCase());
}

/** Iniciais para o avatar: "Maria Clara Souza" → "MS" */
export function initialsOf(name) {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
