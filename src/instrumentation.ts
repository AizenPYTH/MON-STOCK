/**
 * Au démarrage du serveur Next.js (Vercel ou local) : les secrets d'exécution absents des variables
 * d'environnement sont lus dans le Vault Supabase, comme pour l'Edge Function
 * (server/edge/runtime-secrets.ts). Le web et l'application iPhone chiffrent et déchiffrent ainsi
 * avec la MÊME clé, sans recopier de secret dans Vercel. Une variable définie dans Vercel garde la
 * priorité. Seuls les noms sont journalisés, jamais les valeurs.
 *
 * W-02 : le web n'injecte dans son environnement QUE les secrets qu'il utilise
 * (src/lib/web-runtime-secrets.ts). Les clés OpenAI, transporteurs, suivi de colis… restent à l'Edge.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { loadRuntimeSecrets } = await import("../server/edge/runtime-secrets");
  const { createLogger } = await import("@/lib/logger");
  const { normalizeBaseUrl } = await import("@/lib/site");
  const { WEB_RUNTIME_SECRET_NAMES, VAULT_TIMEOUT_MS } = await import("@/lib/web-runtime-secrets");
  const env = process.env as Record<string, string | undefined>;
  // URL normalisée comme dans les pages (W-08 : guillemets, espaces, schéma manquant).
  const supabaseUrl = normalizeBaseUrl(env.SUPABASE_URL) ?? normalizeBaseUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  if (supabaseUrl) env.SUPABASE_URL = supabaseUrl;
  // Lecture dans un environnement de travail : seuls les secrets du web sont recopiés ensuite.
  const scratch: Record<string, string | undefined> = { ...env };
  const timedFetch: typeof fetch = (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(VAULT_TIMEOUT_MS) });
  const state = await loadRuntimeSecrets(scratch, timedFetch);
  const fromVault: string[] = [];
  for (const name of WEB_RUNTIME_SECRET_NAMES) {
    const value = scratch[name];
    if (!env[name] && value) {
      env[name] = value;
      fromVault.push(name);
    }
  }
  const fromEnv = state.fromEnv.filter((n) => (WEB_RUNTIME_SECRET_NAMES as readonly string[]).includes(n));
  const log = createLogger("runtime-secrets");
  if (state.error) log.warn(state.error, { fromEnv });
  else log.info("Secrets d'exécution chargés", { fromEnv, fromVault });
}
