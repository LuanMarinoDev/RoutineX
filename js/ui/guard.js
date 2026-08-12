/* =========================================================
   RoutineX — ui/guard.js
   A borda da interface para os níveis de acesso.

   O storage já recusa a escrita de quem é visitante, mas um
   erro estourando no meio de um clique não explica nada a
   ninguém. Aqui a recusa vira aviso — e o formulário sequer
   abre. As duas camadas existem de propósito: a de baixo
   protege os dados, a de cima explica a regra.
   ========================================================= */

import { accounts } from "../auth/accounts.js";
import { can } from "../auth/permissions.js";
import { toast } from "./toast.js";

/** A conta da sessão pode alterar dados? */
export const canWrite = () => can(accounts.currentUser(), "data:write");

/**
 * Use antes de abrir um formulário ou salvar algo.
 * @returns {boolean} true quando a ação pode seguir
 */
export function requireWrite(
  message = "Seu nível de acesso permite apenas consultar."
) {
  if (canWrite()) return true;
  toast(message, "warning", 4000);
  return false;
}
