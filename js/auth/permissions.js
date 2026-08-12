/* =========================================================
   RoutineX — auth/permissions.js
   Níveis de acesso. Um único lugar decide quem pode o quê;
   interface e storage consultam daqui.
   ========================================================= */

export const ROLES = {
  admin: {
    id: "admin",
    label: "Administrador",
    description: "Gerencia contas e níveis de acesso, além da própria agenda.",
    rank: 3,
  },
  member: {
    id: "member",
    label: "Membro",
    description: "Cria e edita livremente a própria agenda.",
    rank: 2,
  },
  viewer: {
    id: "viewer",
    label: "Visitante",
    description: "Só consulta: não cria, não edita e não apaga nada.",
    rank: 1,
  },
};

export const DEFAULT_ROLE = "member";
export const ROLE_LIST = Object.values(ROLES);

export const roleOf = (user) => ROLES[user?.role] || ROLES.viewer;
export const roleLabel = (role) => ROLES[role]?.label || "Desconhecido";

/**
 * Permissões por papel. "data:*" vale sempre sobre os próprios dados —
 * ninguém enxerga a agenda de outra pessoa, independentemente do papel.
 */
const GRANTS = {
  admin: ["data:read", "data:write", "settings:write", "users:read", "users:manage"],
  member: ["data:read", "data:write", "settings:write"],
  viewer: ["data:read"],
};

/**
 * @param {object|null} user  usuário da sessão
 * @param {string} action     ex.: "data:write"
 */
export function can(user, action) {
  if (!user) return false;
  return (GRANTS[user.role] || []).includes(action);
}

/** Atalho legível para a interface: "somente leitura". */
export const isReadOnly = (user) => !can(user, "data:write");

/** Erro lançado quando alguém tenta o que não pode. */
export class PermissionError extends Error {
  constructor(role) {
    super(`Seu nível de acesso (${roleLabel(role)}) não permite esta ação.`);
    this.name = "PermissionError";
  }
}

/** Só um admin pode mexer no papel de alguém — e nunca no próprio. */
export function canChangeRole(actor, target) {
  if (!can(actor, "users:manage")) return false;
  return actor.id !== target.id;
}
