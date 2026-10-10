/**
 * Secrets d'exécution de l'Edge Function : variables d'environnement d'abord (Dashboard →
 * Edge Functions → Secrets), puis Supabase Vault via la RPC server_runtime_secrets()
 * (service_role uniquement, liste fermée de noms). Les valeurs ne sont jamais journalisées :
 * seuls les NOMS chargés sont exposés (diagnostic /api/health).
 */
export const RUNTIME_SECRET_NAMES = [
  "TOKEN_ENCRYPTION_KEY",
  "CRON_SECRET",
  "EBAY_ENV",
  "EBAY_CLIENT_ID",
  "EBAY_CLIENT_SECRET",
  "EBAY_RU_NAME",
  "EBAY_WEBHOOK_VERIFICATION_TOKEN",
  "SOURCING_DISCOVERY_PROVIDER",
  "BRAVE_SEARCH_API_KEY",
] as const;

export interface RuntimeSecretsState {
  fromEnv: string[];
  fromVault: string[];
  error: string | null;
}

export async function loadRuntimeSecrets(env: Record<string, string | undefined>, fetchImpl: typeof fetch = fetch): Promise<RuntimeSecretsState> {
  const fromEnv = RUNTIME_SECRET_NAMES.filter((n) => Boolean(env[n]));
  const state: RuntimeSecretsState = { fromEnv: [...fromEnv], fromVault: [], error: null };
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    state.error = "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absents : secrets du Vault non chargés.";
    return state;
  }
  try {
    const res = await fetchImpl(`${url.replace(/\/+$/, "")}/rest/v1/rpc/server_runtime_secrets`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: "{}",
    });
    if (!res.ok) {
      state.error = `Lecture du Vault refusée (HTTP ${res.status}).`;
      return state;
    }
    const data: unknown = await res.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) return state;
    for (const name of RUNTIME_SECRET_NAMES) {
      const value = (data as Record<string, unknown>)[name];
      // Une variable d'environnement explicite garde la priorité sur le Vault.
      if (!env[name] && typeof value === "string" && value.length > 0) {
        env[name] = value;
        state.fromVault.push(name);
      }
    }
  } catch (e) {
    state.error = `Vault injoignable : ${e instanceof Error ? e.message : String(e)}`.slice(0, 300);
  }
  return state;
}
