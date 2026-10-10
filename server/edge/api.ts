/**
 * =============================================================================
 * MON STOCK — API serveur déployée en Supabase Edge Function (`api`).
 *
 * L'application web (Next.js) n'est pas déployée ; les traitements qui exigent des secrets ou
 * des privilèges serveur (tokens eBay, clé service_role, réseau sortant vers les fournisseurs)
 * ne peuvent PAS tourner dans le téléphone. Ce point d'entrée expose, pour l'application mobile,
 * les MÊMES services que le web (aucune logique dupliquée) :
 *
 *   GET  /api/health                      état de configuration (aucun secret)
 *   GET  /api/sourcing/search?q=…         recherche d'offres (sources connectées en direct + offres stockées)
 *   GET  /api/sourcing/status             état des sources de l'organisation
 *   GET  /api/sourcing/library            bibliothèque de sources (catalogue + état d'activation)
 *   POST /api/sourcing/library/activate   activer une source de la bibliothèque (attestation de l'utilisateur)
 *   GET  /api/integrations                connexions eBay, dernière synchronisation, erreurs
 *   POST /api/ebay/connect                URL d'autorisation eBay (état anti-CSRF lié à l'utilisateur)
 *   GET  /api/ebay/callback               retour d'eBay → redirection vers l'application (monstock://)
 *   POST /api/ebay/finalize               échange du code (utilisateur qui a démarré le flux uniquement)
 *   POST /api/ebay/sync                   synchronisation immédiate d'une connexion
 *   POST /api/cron/sync | /api/cron/sourcing | /api/cron/library-checks
 *                                         tâches planifiées (Authorization: Bearer CRON_SECRET)
 *
 * Authentification : `Authorization: Bearer <jeton d'accès Supabase de l'utilisateur>` validé par
 * Supabase Auth (getUser), organisation dans `X-Organization-Id` (appartenance vérifiée), puis
 * requêtes sous RLS avec le client de l'utilisateur. Le service_role n'est utilisé que par les
 * services serveur existants (moteur de synchronisation, stockage chiffré des tokens).
 * =============================================================================
 */
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { randomToken } from "@/lib/crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { ebayEnv } from "@/lib/env";
import { authorizeCron } from "@/lib/cron-auth";
import { errorResponse, handle, parseBody, parseQuery, uuidParam } from "@/features/mobile-api/http";
import { requireMobileOrgContext } from "@/features/mobile-api/context";
import { sourcingSearchQuerySchema } from "@/features/mobile-api/contract";
import { integrations, sourcingSearch, sourcingStatus } from "@/features/mobile-api/service";
import { syncConnectionNow } from "@/features/integrations/sync-service";
import { OAUTH_STATE_TTL_SECONDS, oauthErrorCodeFor } from "@/features/integrations/oauth-flow";
import { getEbayConnector } from "@/integrations/core/registry";
import { ebayScopeList } from "@/integrations/ebay/config";
import { scrubSecrets } from "@/integrations/core/sanitize";
import { listDueConnections, upsertOAuthConnection } from "@/services/channels/connection-store";
import { runChannelSync } from "@/services/sync/engine";
import { runSourcingSync } from "@/services/sourcing/sync";
import { activateLibrarySource, runLibraryChecks, sourceLibrary } from "@/services/sourcing/source-library";
import { EBAY_APP_CALLBACK, ebayCallbackRedirect } from "./ebay-callback";
import { loadRuntimeSecrets, type RuntimeSecretsState } from "./runtime-secrets";

const log = createLogger("EDGE_API");

/** L'application mobile appelle depuis un client natif : pas de CORS navigateur nécessaire, sauf pour les outils de test. */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-organization-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const ebayFinalizeSchema = z.object({ code: z.string().min(1).max(2048), state: z.string().min(16).max(200) });
const syncSchema = z.object({ connectionId: uuidParam, scope: z.enum(["full", "listings", "orders"]).default("full") });
const activateSchema = z.object({ key: z.string().min(1).max(80), attest: z.literal(true, { error: "Confirmez avoir lu les conditions d'utilisation de la source." }) });

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

/** Chemin relatif à la fonction : /functions/v1/api/sourcing/search → /sourcing/search. */
export function routeOf(url: URL): string {
  const p = url.pathname.replace(/\/+$/, "");
  const i = p.indexOf("/api");
  const rest = i >= 0 ? p.slice(i + 4) : p;
  return rest === "" ? "/" : rest;
}

async function startEbayConnect(request: Request) {
  const ctx = await requireMobileOrgContext(request, { admin: true });
  const connector = getEbayConnector();
  if (!connector.isConfigured()) {
    throw new AppError("VALIDATION", "Intégration eBay non configurée sur le serveur : les clés de l'application eBay (EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_RU_NAME) doivent être ajoutées aux secrets de la fonction.");
  }
  const state = randomToken(32);
  const admin = createAdminSupabaseClient();
  await admin.from("oauth_states").delete().lt("expires_at", new Date().toISOString());
  const { error } = await admin.from("oauth_states").insert({
    state,
    organization_id: ctx.organization.id,
    provider: "ebay",
    created_by: ctx.user.id,
    redirect_to: EBAY_APP_CALLBACK,
    expires_at: new Date(Date.now() + OAUTH_STATE_TTL_SECONDS * 1000).toISOString(),
  });
  if (error) throw new AppError("INTERNAL", "Impossible de démarrer la connexion eBay. Réessayez.");
  log.info("connexion eBay démarrée (mobile)", { orgId: ctx.organization.id, userId: ctx.user.id });
  return { authorizeUrl: connector.getAuthorizeUrl(state), callbackScheme: EBAY_APP_CALLBACK, environment: connector.config()?.environment ?? null };
}

/**
 * Fin du flux : l'application (session de l'utilisateur) transmet code + état reçus par le lien
 * profond. L'état est consommé atomiquement et doit avoir été créé par CE même utilisateur pour
 * CETTE organisation : un lien d'autorisation transmis à un tiers ne peut pas rattacher son compte
 * eBay à l'organisation de l'attaquant (équivalent mobile du cookie lié au navigateur sur le web).
 */
async function finalizeEbayConnect(request: Request) {
  const ctx = await requireMobileOrgContext(request, { admin: true });
  const { code, state } = await parseBody(request, ebayFinalizeSchema);
  const admin = createAdminSupabaseClient();
  const { data: row, error } = await admin.from("oauth_states").delete().eq("state", state).eq("provider", "ebay").select("*").maybeSingle();
  if (error) throw new AppError("INTERNAL", "Vérification de la demande de connexion impossible. Réessayez.");
  if (!row) throw new AppError("VALIDATION", "Demande de connexion inconnue ou déjà utilisée : relancez la connexion eBay.");
  if (row.created_by !== ctx.user.id || row.organization_id !== ctx.organization.id) {
    log.warn("finalisation eBay refusée : état créé par un autre utilisateur ou une autre organisation", { orgId: ctx.organization.id });
    throw new AppError("FORBIDDEN", "Cette autorisation eBay n'a pas été demandée depuis votre session : relancez la connexion.");
  }
  if (new Date(row.expires_at).getTime() < Date.now()) throw new AppError("VALIDATION", "La demande de connexion a expiré (15 min) : relancez la connexion eBay.");
  const connector = getEbayConnector();
  const config = connector.config();
  if (!config) throw new AppError("VALIDATION", "Intégration eBay non configurée sur le serveur.");
  try {
    const tokens = await connector.exchangeCode(code);
    const account = await connector.getAccountInfo({ getAccessToken: async () => tokens.accessToken });
    const { connection, isNew } = await upsertOAuthConnection({ organizationId: ctx.organization.id, userId: ctx.user.id, provider: "ebay", environment: config.environment, account, tokens, scopes: ebayScopeList() });
    log.info("connexion eBay établie (mobile)", { connectionId: connection.id, orgId: ctx.organization.id, isNew, environment: config.environment });
    return { connectionId: connection.id, isNew, username: account.username ?? null, environment: config.environment };
  } catch (e) {
    const code = oauthErrorCodeFor(e);
    log.error("échec de la connexion eBay (mobile)", { orgId: ctx.organization.id, code, message: scrubSecrets(e instanceof Error ? e.message : String(e)) });
    throw e;
  }
}

async function cronSync() {
  const due = await listDueConnections();
  const started = Date.now();
  const results: Array<Record<string, unknown>> = [];
  for (const c of due) {
    // Budget : la fonction est limitée en durée ; les connexions restantes restent « dues ».
    if (Date.now() - started > 100_000) {
      results.push({ connectionId: c.id, status: "deferred" });
      continue;
    }
    try {
      const r = await runChannelSync(c.id, { trigger: "scheduled" });
      results.push({ connectionId: c.id, runId: r.runId, status: r.status, durationMs: r.durationMs, errorSummary: r.errorSummary });
    } catch (e) {
      results.push({ connectionId: c.id, status: "skipped", error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { due: due.length, results };
}

export async function route(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(request.url);
  const path = routeOf(url);
  const m = request.method;
  try {
    if (m === "GET" && path === "/health") {
      return handle(async () => {
        const ebay = ebayEnv();
        const secrets = await ensureRuntimeSecrets();
        return {
          ok: true,
          ebayConfigured: Boolean(ebay),
          ebayEnvironment: ebay?.EBAY_ENV ?? null,
          cronConfigured: Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 16),
          encryptionConfigured: Boolean(process.env.TOKEN_ENCRYPTION_KEY && process.env.TOKEN_ENCRYPTION_KEY.length >= 32),
          // Noms uniquement (jamais les valeurs).
          secrets: { fromEnv: secrets.fromEnv, fromVault: secrets.fromVault, error: secrets.error },
          time: new Date().toISOString(),
        };
      });
    }
    if (m === "GET" && path === "/ebay/callback") return ebayCallbackRedirect(url);
    if (path.startsWith("/cron/")) {
      const auth = authorizeCron(request);
      if (!auth.ok) return auth.response;
      if (m === "POST" && path === "/cron/sync") return handle(cronSync);
      if (m === "POST" && path === "/cron/sourcing") return handle(() => runSourcingSync());
      if (m === "POST" && path === "/cron/library-checks") return handle(() => runLibraryChecks());
    }
    if (m === "GET" && path === "/sourcing/search") return handle(async () => sourcingSearch(await requireMobileOrgContext(request), parseQuery(request, sourcingSearchQuerySchema)));
    if (m === "GET" && path === "/sourcing/status") return handle(async () => sourcingStatus(await requireMobileOrgContext(request)));
    if (m === "GET" && path === "/sourcing/library") return handle(async () => sourceLibrary(await requireMobileOrgContext(request)));
    if (m === "POST" && path === "/sourcing/library/activate") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request, { write: true });
        const body = await parseBody(request, activateSchema);
        return activateLibrarySource(ctx, body.key);
      });
    }
    if (m === "GET" && path === "/integrations") return handle(async () => integrations(await requireMobileOrgContext(request)));
    if (m === "POST" && path === "/ebay/connect") return handle(() => startEbayConnect(request));
    if (m === "POST" && path === "/ebay/finalize") return handle(() => finalizeEbayConnect(request));
    if (m === "POST" && path === "/ebay/sync") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request, { write: true });
        const body = await parseBody(request, syncSchema);
        const r = await syncConnectionNow(ctx, body.connectionId, { trigger: "manual", scope: body.scope });
        return { runId: r.result.runId, status: r.result.status, durationMs: r.result.durationMs, summary: r.summary, errorSummary: r.result.errorSummary };
      });
    }
    return errorResponse(new AppError("NOT_FOUND", `Route inconnue : ${m} ${path}`));
  } catch (e) {
    return errorResponse(e);
  }
}

let secretsLoad: Promise<RuntimeSecretsState> | null = null;

/** Chargement unique (par instance) des secrets du Vault avant la première requête. */
export function ensureRuntimeSecrets(): Promise<RuntimeSecretsState> {
  secretsLoad ??= loadRuntimeSecrets(process.env as Record<string, string | undefined>).then((s) => {
    if (s.error) log.warn("secrets d'exécution incomplets", { error: s.error });
    return s;
  });
  return secretsLoad;
}

export async function serve(request: Request): Promise<Response> {
  await ensureRuntimeSecrets();
  return withCors(await route(request));
}
