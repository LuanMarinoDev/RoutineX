/* =========================================================
   RoutineX — auth/accounts.js
   Contas, sessão e senhas.

   AVISO IMPORTANTE
   Isto é autenticação de aplicativo local: os dados moram no
   navegador de quem usa. As senhas ficam guardadas como hash
   PBKDF2 com sal — nunca em texto puro —, mas qualquer pessoa
   com acesso ao dispositivo e ao DevTools pode alterar o
   localStorage. Para valer como segurança de verdade, a
   verificação precisa acontecer num servidor. A API abaixo foi
   desenhada para essa troca: só accounts.* conhece o formato,
   e todo método que um dia falará com a rede já é assíncrono.
   ========================================================= */

import { uid, clone } from "../utils.js";
import { PREFIX } from "../core/namespace.js";
import { DEFAULT_ROLE, ROLES, can, canChangeRole, PermissionError } from "./permissions.js";
import {
  digits,
  isCPF,
  isEmail,
  isName,
  isPhone,
  normalizeEmail,
  normalizeName,
  passwordStrength,
} from "./validators.js";

const ACCOUNTS_KEY = `${PREFIX}:accounts`;
const SESSION_KEY = `${PREFIX}:session`;

const PBKDF2_ITERATIONS = 150000;

/* ---------- Leitura e escrita ---------- */

let cache = null;
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => fn(accounts.currentUser()));
}

function read() {
  if (cache) return cache;

  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    cache = parsed && Array.isArray(parsed.users) ? parsed : { version: 2, users: [] };
  } catch (error) {
    console.warn("[accounts] Não foi possível ler as contas.", error);
    cache = { version: 2, users: [] };
  }

  return cache;
}

function write() {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(cache));
    return true;
  } catch (error) {
    console.error("[accounts] Não foi possível salvar as contas.", error);
    return false;
  }
}

/* ---------- Senhas ---------- */

const encoder = new TextEncoder();

const toHex = (buffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

const subtle = () => globalThis.crypto?.subtle || null;

export function randomSalt(bytes = 16) {
  const array = new Uint8Array(bytes);

  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(array);
  else for (let i = 0; i < bytes; i++) array[i] = Math.floor(Math.random() * 256);

  return toHex(array.buffer);
}

/**
 * PBKDF2-SHA256 quando o navegador oferece Web Crypto (https ou localhost).
 * Sem ele — uma página aberta por file://, por exemplo — caímos num hash
 * simples e avisamos: serve para separar contas, não para guardar segredo.
 */
export async function hashPassword(password, salt) {
  const api = subtle();

  if (!api) {
    console.warn(
      "[accounts] Web Crypto indisponível (abra por http://localhost). Usando hash de contingência."
    );

    let hash = 2166136261;
    for (const char of `${salt}:${password}`) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return `weak$${hash.toString(16)}`;
  }

  const key = await api.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);

  const bits = await api.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    key,
    256
  );

  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(bits)}`;
}

/** Comparação em tempo constante, para o relógio não entregar o hash. */
function safeEqual(a = "", b = "") {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---------- Saneamento ---------- */

/** O que a interface pode ver: nunca o hash nem o sal. */
function publicUser(user) {
  if (!user) return null;
  const { passwordHash, salt, ...safe } = user;
  return clone(safe);
}

/* ---------- API ---------- */

export const accounts = {
  /** Carrega as contas. Devolve o usuário da sessão, se houver. */
  init() {
    read();
    return accounts.currentUser();
  },

  on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /* ----- Consultas ----- */

  count: () => read().users.length,

  isEmpty: () => read().users.length === 0,

  list() {
    return read().users.map(publicUser);
  },

  get(id) {
    return publicUser(read().users.find((user) => user.id === id));
  },

  findByEmail(email) {
    const target = normalizeEmail(email);
    return publicUser(read().users.find((user) => user.email === target));
  },

  currentUser() {
    const id = accounts.sessionId();
    if (!id) return null;

    const user = read().users.find((item) => item.id === id);
    if (!user) {
      accounts.signOut();
      return null;
    }

    return publicUser(user);
  },

  sessionId() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null")?.userId || null;
    } catch {
      return null;
    }
  },

  isAuthenticated: () => Boolean(accounts.currentUser()),

  /* ----- Cadastro ----- */

  /**
   * Cria uma conta. A primeira do sistema nasce administradora —
   * alguém precisa poder gerenciar as demais.
   */
  async signUp({ name, email, password, cpf, phone, role } = {}) {
    const state = read();
    const errors = accounts.validateSignUp({ name, email, password, cpf, phone });

    if (Object.keys(errors).length) {
      const error = new Error("Confira os campos destacados.");
      error.name = "ValidationError";
      error.fields = errors;
      throw error;
    }

    const salt = randomSalt();
    const now = new Date().toISOString();

    const user = {
      id: uid("usr"),
      name: normalizeName(name),
      email: normalizeEmail(email),
      cpf: digits(cpf),
      phone: digits(phone),
      role: state.users.length === 0 ? "admin" : ROLES[role] ? role : DEFAULT_ROLE,
      passwordHash: await hashPassword(password, salt),
      salt,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    };

    state.users.push(user);
    write();
    emit();
    return publicUser(user);
  },

  /** Erros por campo — objeto vazio quer dizer tudo certo. */
  validateSignUp({ name, email, password, cpf, phone }, { ignoreId = null } = {}) {
    const state = read();
    const errors = {};

    if (!isName(name)) errors.name = "Escreva seu nome completo.";

    if (!isEmail(email)) errors.email = "E-mail inválido.";
    else if (
      state.users.some(
        (user) => user.email === normalizeEmail(email) && user.id !== ignoreId
      )
    ) {
      errors.email = "Já existe uma conta com este e-mail.";
    }

    if (!isCPF(cpf)) errors.cpf = "CPF inválido.";
    else if (
      state.users.some((user) => user.cpf === digits(cpf) && user.id !== ignoreId)
    ) {
      errors.cpf = "Este CPF já está cadastrado.";
    }

    if (!isPhone(phone)) errors.phone = "Telefone inválido. Use DDD + número.";

    if (password !== undefined) {
      const strength = passwordStrength(password);
      if (!strength.valid) errors.password = strength.hint;
    }

    return errors;
  },

  /* ----- Sessão ----- */

  async signIn(email, password) {
    const state = read();
    const user = state.users.find((item) => item.email === normalizeEmail(email));

    // A mesma mensagem para e-mail inexistente e senha errada: dizer
    // qual dos dois falhou entrega quem tem conta aqui.
    const generic = new Error("E-mail ou senha incorretos.");
    generic.name = "AuthError";

    if (!user) {
      await hashPassword(password || "", randomSalt()); // custo parecido nos dois caminhos
      throw generic;
    }

    const attempt = await hashPassword(password || "", user.salt);
    if (!safeEqual(attempt, user.passwordHash)) throw generic;

    user.lastLoginAt = new Date().toISOString();
    write();

    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ userId: user.id, startedAt: new Date().toISOString() })
    );

    emit();
    return publicUser(user);
  },

  signOut() {
    localStorage.removeItem(SESSION_KEY);
    emit();
  },

  /* ----- Manutenção da conta ----- */

  /** Atualiza o perfil. Só o dono da conta ou um administrador. */
  updateUser(id, patch = {}) {
    const actor = accounts.currentUser();
    if (!actor) throw new PermissionError("viewer");
    if (actor.id !== id && !can(actor, "users:manage")) {
      throw new PermissionError(actor.role);
    }

    const state = read();
    const user = state.users.find((item) => item.id === id);
    if (!user) throw new Error("Conta não encontrada.");

    const next = {
      name: patch.name ?? user.name,
      email: patch.email ?? user.email,
      cpf: patch.cpf ?? user.cpf,
      phone: patch.phone ?? user.phone,
    };

    const errors = accounts.validateSignUp(next, { ignoreId: id });
    if (Object.keys(errors).length) {
      const error = new Error("Confira os campos destacados.");
      error.name = "ValidationError";
      error.fields = errors;
      throw error;
    }

    user.name = normalizeName(next.name);
    user.email = normalizeEmail(next.email);
    user.cpf = digits(next.cpf);
    user.phone = digits(next.phone);
    user.updatedAt = new Date().toISOString();

    write();
    emit();
    return publicUser(user);
  },

  async changePassword(id, currentPassword, newPassword) {
    const actor = accounts.currentUser();
    if (!actor || actor.id !== id) throw new PermissionError(actor?.role || "viewer");

    const state = read();
    const user = state.users.find((item) => item.id === id);
    if (!user) throw new Error("Conta não encontrada.");

    const attempt = await hashPassword(currentPassword || "", user.salt);
    if (!safeEqual(attempt, user.passwordHash)) {
      const error = new Error("A senha atual não confere.");
      error.name = "AuthError";
      throw error;
    }

    const strength = passwordStrength(newPassword);
    if (!strength.valid) {
      const error = new Error(strength.hint);
      error.name = "ValidationError";
      throw error;
    }

    user.salt = randomSalt();
    user.passwordHash = await hashPassword(newPassword, user.salt);
    user.updatedAt = new Date().toISOString();
    write();
    return true;
  },

  /* ----- Administração ----- */

  setRole(id, role) {
    const actor = accounts.currentUser();
    const target = read().users.find((item) => item.id === id);

    if (!target) throw new Error("Conta não encontrada.");
    if (!canChangeRole(actor, target)) throw new PermissionError(actor?.role || "viewer");
    if (!ROLES[role]) throw new Error("Nível de acesso desconhecido.");

    // O sistema não pode ficar sem ninguém para administrá-lo.
    if (target.role === "admin" && role !== "admin" && accounts.adminCount() <= 1) {
      throw new Error("Esta é a única conta administradora — promova outra antes.");
    }

    target.role = role;
    target.updatedAt = new Date().toISOString();
    write();
    emit();
    return publicUser(target);
  },

  adminCount: () => read().users.filter((user) => user.role === "admin").length,

  /** Remove a conta. Quem chama cuida de apagar os dados dela. */
  deleteUser(id) {
    const actor = accounts.currentUser();
    const state = read();
    const target = state.users.find((item) => item.id === id);
    if (!target) return false;

    const self = actor?.id === id;
    if (!self && !can(actor, "users:manage")) {
      throw new PermissionError(actor?.role || "viewer");
    }
    if (target.role === "admin" && accounts.adminCount() <= 1) {
      throw new Error("Não dá para remover a única conta administradora.");
    }

    state.users = state.users.filter((item) => item.id !== id);
    write();

    if (self) accounts.signOut();
    else emit();
    return true;
  },

  /** Usado pelo "apagar tudo" e pelos testes. */
  reset() {
    cache = { version: 2, users: [] };
    write();
    accounts.signOut();
  },
};

export { ACCOUNTS_KEY, SESSION_KEY };
