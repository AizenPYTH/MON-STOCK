/**
 * Au démarrage du serveur Next.js (Vercel ou local) : les secrets d'exécution absents des variables
 * d'environnement (TOKEN_ENCRYPTION_KEY, CRON_SECRET, EBAY_WEBHOOK_VERIFICATION_TOKEN…) sont lus
 * dans le Vault Supabase, exactement comme l'Edge Function (server/edge/runtime-secrets.ts). Le
 * web et l'application iPhone chiffrent et déchiffrent ainsi avec la MÊME clé, sans recopier de
 * secret dans Vercel. Une variable définie dans Vercel garde la priorité. Seuls les noms sont
 * journalisés, jamais les valeurs.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { loadRuntimeSecrets } = await import("../server/edge/runtime-secrets");
  const { createLogger } = await import("@/lib/logger");
  const env = process.env as Record<string, string | undefined>;
  env.SUPABASE_URL ??= env.NEXT_PUBLIC_SUPABASE_URL;
  const state = await loadRuntimeSecrets(env);
  const log = createLogger("runtime-secrets");
  if (state.error) log.warn(state.error, { fromEnv: state.fromEnv });
  else log.info("Secrets d'exécution chargés", { fromEnv: state.fromEnv, fromVault: state.fromVault });
}
