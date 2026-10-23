/**
 * Santé de l'Edge Function (S-16, I-23, Q-22).
 *
 *  - GET /health (public, sans authentification) : réponse MINIMALE — le serveur répond, et des
 *    indicateurs oui/non utilisés par le diagnostic de l'application iPhone (eBay, tâches planifiées,
 *    IA, chiffrement). Ni noms de secrets, ni environnement eBay, ni message d'erreur interne.
 *  - GET /health/details (Authorization: Bearer CRON_SECRET) : diagnostic d'exploitation — état du
 *    chargement des secrets (NOMS seulement), configuration, fournisseurs, disjoncteur de suivi, et
 *    un PING de la base (requête réelle, durée mesurée).
 */
import { ebayEnv } from "@/lib/env";
import { encryptionKeyStatus } from "@/lib/crypto";
import { scrubSecrets } from "@/integrations/core/sanitize";
import { CRON_SECRET_MIN_LENGTH } from "@/lib/cron-auth";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import { aiConfigured } from "@/services/ai/llm";
import { shippingProvidersStatus } from "@/services/shipping/quotes";
import { trackingProviders, usableTrackingProviders } from "@/services/tracking/tracking";
import type { RuntimeSecretsStatus } from "./runtime-secrets";

type Env = Record<string, string | undefined>;

/** Contrat inchangé pour l'application iPhone (HealthDTO) ; `ebayEnvironment` n'est plus divulgué (null). */
export interface PublicHealth {
  ok: true;
  ebayConfigured: boolean;
  ebayEnvironment: null;
  cronConfigured: boolean;
  aiConfigured: boolean;
  encryptionConfigured: boolean;
  time: string;
}

function cronConfigured(env: Env): boolean {
  return Boolean(env.CRON_SECRET && env.CRON_SECRET.length >= CRON_SECRET_MIN_LENGTH);
}

export function publicHealth(env: Env = process.env, now: Date = new Date()): PublicHealth {
  let ebay = false;
  try {
    ebay = Boolean(ebayEnv());
  } catch {
    ebay = false;
  }
  return { ok: true, ebayConfigured: ebay, ebayEnvironment: null, cronConfigured: cronConfigured(env), aiConfigured: aiConfigured(env), encryptionConfigured: encryptionKeyStatus(env).configured, time: now.toISOString() };
}

export interface DatabasePing {
  ok: boolean;
  latencyMs: number;
  error: string | null;
}

export const DB_PING_TIMEOUT_MS = 5_000;

/** Requête réelle et bornée en temps sur la base (service_role) : lecture d'une ligne. */
export async function pingDatabase(admin: AdminSupabaseClient, clock: () => number = Date.now, timeoutMs = DB_PING_TIMEOUT_MS): Promise<DatabasePing> {
  const t0 = clock();
  try {
    const { error } = await admin.from("organizations").select("id").limit(1).abortSignal(AbortSignal.timeout(timeoutMs));
    if (error) return { ok: false, latencyMs: clock() - t0, error: scrubSecrets(`${error.code ?? "?"} ${error.message}`).slice(0, 200) };
    return { ok: true, latencyMs: clock() - t0, error: null };
  } catch (e) {
    return { ok: false, latencyMs: clock() - t0, error: scrubSecrets(e instanceof Error ? e.message : String(e)).slice(0, 200) };
  }
}

export interface HealthDetailsDeps {
  secrets: () => RuntimeSecretsStatus;
  ping: () => Promise<DatabasePing>;
  admin: () => AdminSupabaseClient;
  env?: Env;
  now?: () => Date;
}

export async function healthDetails(deps: HealthDetailsDeps) {
  const env = deps.env ?? process.env;
  const now = deps.now?.() ?? new Date();
  const secrets = deps.secrets();
  const [database, trackingUsable] = await Promise.all([
    deps.ping(),
    usableTrackingProviders(deps.admin(), env, now).catch(() => null),
  ]);
  let ebay: { EBAY_ENV: string } | null = null;
  try {
    ebay = ebayEnv();
  } catch {
    ebay = null;
  }
  const encryption = encryptionKeyStatus(env);
  return {
    ok: database.ok && secrets.error === null && encryption.configured,
    time: now.toISOString(),
    database,
    // Noms uniquement (jamais les valeurs).
    secrets: { loaded: secrets.loaded, loadedAt: secrets.loadedAt, attempts: secrets.attempts, nextRetryAt: secrets.nextRetryAt, fromEnv: secrets.fromEnv, fromVault: secrets.fromVault, error: secrets.error },
    ebay: { configured: Boolean(ebay), environment: ebay?.EBAY_ENV ?? null },
    cronConfigured: cronConfigured(env),
    aiConfigured: aiConfigured(env),
    encryption,
    shippingProviders: shippingProvidersStatus(env).filter((p) => p.configured).map((p) => p.id),
    tracking: { configured: trackingProviders(env), usable: trackingUsable },
  };
}
