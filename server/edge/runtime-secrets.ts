/**
 * Secrets d'exécution de l'Edge Function : variables d'environnement d'abord (Dashboard →
 * Edge Functions → Secrets), puis Supabase Vault via la RPC server_runtime_secrets()
 * (service_role uniquement, liste fermée de noms). Les valeurs ne sont jamais journalisées :
 * seuls les NOMS chargés sont exposés (diagnostic protégé /api/health/details).
 *
 * S-25 — deux listes, alignées sur la fonction SQL VERSIONNÉE :
 *  - VAULT_SECRET_NAMES : les 9 noms que renvoie `server_runtime_secrets()` telle que définie par
 *    la migration 20261009000400 (un test unitaire compare les deux listes) ;
 *  - ENV_ONLY_SECRET_NAMES : secrets à déclarer dans les secrets de la fonction (OpenAI,
 *    transporteurs, suivi, rotation de clé). La version versionnée de la RPC ne les renvoie pas ;
 *    s'ils arrivaient du Vault (fonction modifiée hors migrations), ils resteraient acceptés.
 *
 * S-07 / W-15 — chargement résilient :
 *  - chaque lecture du Vault a un délai d'expiration (AbortSignal.timeout) et jusqu'à 2 nouvelles
 *    tentatives avec backoff sur erreur transitoire (réseau, délai, HTTP 5xx / 429) ;
 *  - seul un SUCCÈS est mis en cache pour la vie de l'instance ; un échec est retenté au premier
 *    besoin suivant (chargement paresseux), au plus tôt après un délai croissant (2 s → 60 s).
 */
import { createLogger } from "@/lib/logger";

const log = createLogger("EDGE_SECRETS");

/** Noms renvoyés par la version versionnée de `server_runtime_secrets()` (migration 20261009000400). */
export const VAULT_SECRET_NAMES = [
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

/** Secrets lus par l'Edge mais à déclarer dans les secrets de la fonction (pas dans le Vault versionné). */
export const ENV_ONLY_SECRET_NAMES = [
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "EBAY_LISTING_ENABLED",
  "PACKLINK_API_KEY",
  "BOXTAL_V1_LOGIN",
  "BOXTAL_V1_PASSWORD",
  "BOXTAL_CONTENT_CODE",
  "BOXTAL_API_URL",
  "LAPOSTE_OKAPI_KEY",
  "SHIP24_API_KEY",
  "DHL_API_KEY",
  "SENDCLOUD_PUBLIC_KEY",
  "SENDCLOUD_SECRET_KEY",
  // Rotation de TOKEN_ENCRYPTION_KEY (S-28, docs/SERVER.md « Rotation de la clé de chiffrement »).
  "TOKEN_ENCRYPTION_KEY_VERSION",
  "TOKEN_ENCRYPTION_KEY_PREVIOUS",
  "TOKEN_ENCRYPTION_KEY_FORMAT",
] as const;

export const RUNTIME_SECRET_NAMES = [...VAULT_SECRET_NAMES, ...ENV_ONLY_SECRET_NAMES] as const;

export interface RuntimeSecretsState {
  fromEnv: string[];
  fromVault: string[];
  error: string | null;
}

export interface LoadRuntimeSecretsOptions {
  /** Délai d'une lecture du Vault (ms). */
  timeoutMs?: number;
  /** Nouvelles tentatives sur erreur transitoire. */
  retries?: number;
  /** Attente avant la 1re nouvelle tentative (ms), triplée ensuite. */
  backoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export const VAULT_TIMEOUT_MS = 5_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 300;

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

class TransientVaultError extends Error {}

export async function loadRuntimeSecrets(env: Record<string, string | undefined>, fetchImpl: typeof fetch = fetch, options: LoadRuntimeSecretsOptions = {}): Promise<RuntimeSecretsState> {
  const fromEnv = RUNTIME_SECRET_NAMES.filter((n) => Boolean(env[n]));
  const state: RuntimeSecretsState = { fromEnv: [...fromEnv], fromVault: [], error: null };
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    state.error = "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absents : secrets du Vault non chargés.";
    return state;
  }
  const timeoutMs = options.timeoutMs ?? VAULT_TIMEOUT_MS;
  const retries = Math.max(0, options.retries ?? DEFAULT_RETRIES);
  const sleep = options.sleep ?? realSleep;
  let wait = options.backoffMs ?? DEFAULT_BACKOFF_MS;

  for (let attempt = 0; ; attempt++) {
    try {
      const data = await readVault(`${url.replace(/\/+$/, "")}/rest/v1/rpc/server_runtime_secrets`, key, fetchImpl, timeoutMs);
      state.error = null; // une tentative précédente a pu échouer
      if (!data || typeof data !== "object" || Array.isArray(data)) return state;
      for (const name of RUNTIME_SECRET_NAMES) {
        const value = (data as Record<string, unknown>)[name];
        // Une variable d'environnement explicite garde la priorité sur le Vault.
        if (!env[name] && typeof value === "string" && value.length > 0) {
          env[name] = value;
          state.fromVault.push(name);
        }
      }
      return state;
    } catch (e) {
      const transient = e instanceof TransientVaultError;
      state.error = e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300);
      if (!transient || attempt >= retries) return state;
      await sleep(wait);
      wait *= 3;
    }
  }
}

async function readVault(endpoint: string, key: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new TransientVaultError(timeout ? `Vault injoignable : délai de ${timeoutMs} ms dépassé.` : `Vault injoignable : ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) {
    const message = `Lecture du Vault refusée (HTTP ${res.status}).`;
    // 5xx / 429 : panne passagère, nouvelle tentative ; 4xx : configuration (clé, droits), inutile d'insister.
    if (res.status >= 500 || res.status === 429) throw new TransientVaultError(message);
    throw new Error(message);
  }
  try {
    return await res.json();
  } catch {
    throw new TransientVaultError("Réponse du Vault illisible.");
  }
}

export interface RuntimeSecretsStatus extends RuntimeSecretsState {
  /** Chargement réussi (mis en cache) ? */
  loaded: boolean;
  loadedAt: string | null;
  attempts: number;
  /** Prochaine tentative possible après un échec (ISO) ; null si chargé ou jamais tenté. */
  nextRetryAt: string | null;
}

export interface RuntimeSecretsLoaderOptions {
  load?: (env: Record<string, string | undefined>) => Promise<RuntimeSecretsState>;
  now?: () => number;
  minRetryMs?: number;
  maxRetryMs?: number;
}

export interface RuntimeSecretsLoader {
  ensure(): Promise<RuntimeSecretsState>;
  status(): RuntimeSecretsStatus;
}

/**
 * Chargement paresseux et partagé : un seul appel au Vault en vol à la fois ; un succès est gardé
 * pour la vie de l'instance ; un échec est renvoyé tel quel jusqu'à `nextRetryAt`, puis retenté.
 */
export function createRuntimeSecretsLoader(env: Record<string, string | undefined>, options: RuntimeSecretsLoaderOptions = {}): RuntimeSecretsLoader {
  const load = options.load ?? ((e: Record<string, string | undefined>) => loadRuntimeSecrets(e));
  const now = options.now ?? Date.now;
  const minRetryMs = options.minRetryMs ?? 2_000;
  const maxRetryMs = options.maxRetryMs ?? 60_000;
  let success: RuntimeSecretsState | null = null;
  let last: RuntimeSecretsState | null = null;
  let inflight: Promise<RuntimeSecretsState> | null = null;
  let loadedAt: number | null = null;
  let attempts = 0;
  let failures = 0;
  let nextRetryAt = 0;

  const run = async (): Promise<RuntimeSecretsState> => {
    attempts++;
    let s: RuntimeSecretsState;
    try {
      s = await load(env);
    } catch (e) {
      s = { fromEnv: [], fromVault: [], error: `Chargement des secrets impossible : ${e instanceof Error ? e.message : String(e)}`.slice(0, 300) };
    }
    last = s;
    if (!s.error) {
      success = s;
      loadedAt = now();
      failures = 0;
      nextRetryAt = 0;
    } else {
      failures++;
      nextRetryAt = now() + Math.min(maxRetryMs, minRetryMs * 2 ** (failures - 1));
      log.warn("secrets d'exécution incomplets : nouvel essai au prochain besoin", { error: s.error, attempts, retryInMs: nextRetryAt - now() });
    }
    return s;
  };

  return {
    ensure() {
      if (success) return Promise.resolve(success);
      if (inflight) return inflight;
      if (last && now() < nextRetryAt) return Promise.resolve(last);
      inflight = run().finally(() => {
        inflight = null;
      });
      return inflight;
    },
    status() {
      const s = success ?? last ?? { fromEnv: [], fromVault: [], error: null };
      return {
        ...s,
        loaded: success !== null,
        loadedAt: loadedAt === null ? null : new Date(loadedAt).toISOString(),
        attempts,
        nextRetryAt: success || !last ? null : new Date(nextRetryAt).toISOString(),
      };
    },
  };
}
