import "server-only";

/**
 * APERÇU VISUEL du site (contrôle des écrans sans aucun accès à Supabase) : base en mémoire de
 * démonstration partagée avec l'aperçu de l'application iPhone (apps/mobile/preview/demo-db.ts).
 * Activé UNIQUEMENT si MONSTOCK_WEB_PREVIEW=1 ET l'URL Supabase est « https://preview.invalid » :
 * impossible sur un vrai déploiement (l'URL y désigne le vrai projet).
 */
export function isWebPreview(): boolean {
  if (process.env.MONSTOCK_WEB_PREVIEW !== "1") return false;
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host === "preview.invalid";
  } catch {
    return false;
  }
}

type PreviewModule = typeof import("../../../apps/mobile/preview/demo-db");
let client: ReturnType<PreviewModule["createDemoClient"]> | null = null;

/** Client de démonstration (une base par processus : les modifications durent le temps de l'aperçu). */
export async function previewClient() {
  if (!client) {
    const m: PreviewModule = await import("../../../apps/mobile/preview/demo-db");
    client = m.createDemoClient(m.demoTables(), m.DEMO_USER);
  }
  return client;
}
