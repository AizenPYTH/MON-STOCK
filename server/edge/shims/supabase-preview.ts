/**
 * Remplace src/lib/supabase/preview.ts dans le bundle de l'Edge Function (Q-22) : l'aperçu visuel
 * (base de démonstration en mémoire, apps/mobile/preview/demo-db.ts) n'existe que pour le site web
 * en mode MONSTOCK_WEB_PREVIEW ; il n'a rien à faire dans le code déployé de l'Edge.
 */
export function isWebPreview(): boolean {
  return false;
}

export async function previewClient(): Promise<never> {
  throw new Error("Aperçu de démonstration indisponible dans l'Edge Function.");
}
