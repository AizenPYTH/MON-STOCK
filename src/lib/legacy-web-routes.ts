import { cleanEnvValue } from "@/lib/site";

/**
 * W-18 : routes machine du site web en DOUBLON de l'Edge Function Supabase, seule implémentation en
 * production (pg_cron → Edge `/api/cron/*`, notifications eBay enregistrées sur l'Edge) :
 *   - `/api/cron/sync`, `/api/cron/sourcing` ;
 *   - `/api/webhooks/ebay`.
 * Désactivées par défaut (404, comme une route inexistante) pour réduire la surface exposée ; le code
 * est conservé (même service partagé que l'Edge) et se réactive par la variable d'environnement
 * `MONSTOCK_WEB_LEGACY_ROUTES=1` (secours si l'Edge est indisponible, développement local). Les
 * protections d'origine (CRON_SECRET, signature eBay) restent en place une fois réactivées.
 */
export const WEB_LEGACY_ROUTES_ENV = "MONSTOCK_WEB_LEGACY_ROUTES";

export function legacyWebRoutesEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return cleanEnvValue(env[WEB_LEGACY_ROUTES_ENV]) === "1";
}

/** Réponse à renvoyer AVANT tout traitement quand la route est désactivée ; null si elle est active. */
export function legacyWebRouteDisabled(env: Readonly<Record<string, string | undefined>> = process.env): Response | null {
  if (legacyWebRoutesEnabled(env)) return null;
  return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
}
