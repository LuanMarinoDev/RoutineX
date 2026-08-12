/* =========================================================
   RoutineX — core/namespace.js
   O prefixo de todas as chaves no localStorage, num lugar só.

   O produto já se chamou Nexora. Trocar o nome trocaria também o
   endereço dos dados, e todo mundo perderia conta e agenda no dia
   da mudança. Por isso, ao carregar, as chaves do nome antigo são
   copiadas para o novo — uma vez, sem apagar as originais.

   Este módulo é importado por storage.js e por auth/accounts.js
   antes de qualquer leitura, então a migração sempre acontece
   primeiro. Módulos ES rodam uma única vez, então não há repetição.
   ========================================================= */

export const NAMESPACE = "routinex";
export const VERSION = 2;
export const PREFIX = `${NAMESPACE}:v${VERSION}`;

/** Nomes anteriores do produto, do mais recente para o mais antigo. */
const PREVIOUS_PREFIXES = ["nexora:v2"];

function adoptPreviousNames() {
  try {
    if (typeof localStorage === "undefined") return;

    for (const previous of PREVIOUS_PREFIXES) {
      const keys = Object.keys(localStorage).filter((key) =>
        key.startsWith(`${previous}:`)
      );

      for (const key of keys) {
        const renamed = PREFIX + key.slice(previous.length);

        // Só copia o que ainda não existe: dado novo nunca é sobrescrito.
        if (localStorage.getItem(renamed) === null) {
          localStorage.setItem(renamed, localStorage.getItem(key));
        }
      }

      if (keys.length) {
        console.info(
          `[namespace] ${keys.length} chave(s) de "${previous}" adotadas por "${PREFIX}".`
        );
      }
    }
  } catch (error) {
    // Modo privativo, cota estourada… nada aqui pode derrubar o boot.
    console.warn("[namespace] Não foi possível migrar as chaves antigas.", error);
  }
}

adoptPreviousNames();
