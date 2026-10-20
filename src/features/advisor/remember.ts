/**
 * Conversation en cours du conseiller, mémorisée pour l'onglet (sessionStorage) : le panneau ⌘J
 * reprend la conversation ouverte sur la page, et inversement. Indisponible (navigation privée,
 * stockage bloqué) : une nouvelle conversation s'ouvre, sans erreur.
 */

const KEY = "monstock.advisor.conversation";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function rememberConversation(id: string | null): void {
  try {
    if (id) window.sessionStorage.setItem(KEY, id);
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // stockage indisponible : rien à mémoriser
  }
}

export function rememberedConversation(): string | null {
  try {
    const v = window.sessionStorage.getItem(KEY);
    return v && UUID.test(v) ? v : null;
  } catch {
    return null;
  }
}
