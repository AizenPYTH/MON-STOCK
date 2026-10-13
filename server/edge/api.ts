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
 *   GET  /api/suppliers/search?q=…        recherche simple « Fournisseurs » : offres par fournisseur, du moins cher au plus cher
 *   GET  /api/sourcing/search?q=…         recherche d'offres (sources connectées en direct + offres stockées)
 *   GET  /api/sourcing/status             état des sources de l'organisation
 *   GET  /api/sourcing/library            bibliothèque de sources (catalogue + état d'activation)
 *   POST /api/sourcing/library/activate   activer une source de la bibliothèque (attestation de l'utilisateur)
 *   GET  /api/radar?sort=…                radar d'opportunités d'achat (offres réelles × ventes réelles × coûts)
 *   GET  /api/radar/offer?id=&quantity=   détail d'une offre : appréciation, scénarios de quantité, offres concurrentes
 *   POST /api/radar/settings              paramètres de coûts (TVA, frais, emballage, retours, douane) — administrateur
 *   GET  /api/sourcing/directory          annuaire de fournisseurs qualifiés (statuts prouvés, e-mails de demande d'accès)
 *   POST /api/sourcing/import/preview     aperçu d'un catalogue fournisseur (CSV, XLSX, XML, JSON) — rien n'est enregistré
 *   POST /api/sourcing/import             import réel du catalogue dans un flux du fournisseur (rédacteur)
 *   GET  /api/sourcing/sources            sources : statut affiché, offres exploitables, dernier succès, prochain passage
 *   POST /api/sourcing/sources/sync       « Synchroniser maintenant » (rédacteur ; verrou et délai de 2 min)
 *   POST /api/sourcing/sources/schedule   fréquence et activation d'une source (administrateur)
 *   POST /api/sourcing/feeds/preview      aperçu d'un flux distant autorisé (CSV / XML / JSON en HTTPS) — rien n'est enregistré
 *   POST /api/sourcing/feeds              ajout du flux (attestation d'accord du fournisseur, identifiants chiffrés)
 *   GET  /api/sourcing/imports            historique des imports (fichier, empreinte, compteurs, utilisateur)
 *   GET  /api/sourcing/imports/detail?id= détail d'un import et lignes ignorées avec leur raison
 *   GET  /api/integrations                connexions eBay, dernière synchronisation, erreurs
 *   POST /api/ebay/connect                URL d'autorisation eBay (état anti-CSRF lié à l'utilisateur)
 *   GET|POST /api/ebay/webhook            notifications eBay (suppression de compte, commandes) — signées par eBay
 *   GET  /api/ebay/callback               retour d'eBay → redirection vers l'application (monstock://)
 *   POST /api/ebay/finalize               échange du code (utilisateur qui a démarré le flux uniquement)
 *   POST /api/ebay/disconnect             déconnexion (administrateur) : tokens supprimés
 *   GET  /api/ebay/listings/prefill       brouillon d'annonce depuis un SKU · GET /api/ebay/account-setup politiques/emplacements
 *   POST /api/ebay/listings/check         contrôle + simulation (rien n'est envoyé à eBay)
 *   POST /api/ebay/listings/publish       publication — verrouillée (EBAY_LISTING_ENABLED, administrateur, confirmation)
 *   POST /api/ebay/sync                   synchronisation immédiate d'une connexion
 *   POST /api/ai/product-draft            phrase dictée → brouillon du formulaire produit (OpenAI ; rien n'est créé)
 *   POST /api/ai/assistant                questions sur les ventes / le stock / eBay (OpenAI + lecture seule sous RLS)
 *   GET  /api/advisor/status              conseiller IA : configuré ?, limites
 *   GET  /api/advisor/speech?messageId=   voix du conseiller (OpenAI) : lecture d'une réponse déjà reçue (audio/mpeg ; voice=marin|cedar)
 *   GET  /api/advisor/voice-sample?voice= même texte de démonstration, pour comparer les voix (quota IA)
 *   POST /api/advisor/chat                conseiller IA (texte / voix) : flux NDJSON si Accept: application/x-ndjson
 *   POST /api/advisor/actions/confirm     exécute UNE action préparée, après revérification des droits (bouton de l'app)
 *   POST /api/advisor/actions/cancel      annule une action préparée
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
import { runSourceCrawl } from "@/services/sourcing/crawler/crawler-manager";
import { ebayEnv } from "@/lib/env";
import { authorizeCron } from "@/lib/cron-auth";
import { errorResponse, handle, parseBody, parseQuery, uuidParam } from "@/features/mobile-api/http";
import { requireMobileOrgContext } from "@/features/mobile-api/context";
import { ADVISOR_MESSAGE_MAX_CHARS, advisorActionDecisionSchema, advisorChatSchema, shippingQuoteRequestSchema, sourcingSearchQuerySchema, trackingRefreshSchema } from "@/features/mobile-api/contract";
import { integrations, sourcingSearch, sourcingStatus } from "@/features/mobile-api/service";
import { syncConnectionNow } from "@/features/integrations/sync-service";
import { OAUTH_STATE_TTL_SECONDS, oauthErrorCodeFor } from "@/features/integrations/oauth-flow";
import { getEbayConnector } from "@/integrations/core/registry";
import { ebayScopeList } from "@/integrations/ebay/config";
import { scrubSecrets } from "@/integrations/core/sanitize";
import { findConnectionsByExternalAccount, listDueConnections, upsertOAuthConnection } from "@/services/channels/connection-store";
import { computeChallengeResponse } from "@/integrations/ebay/webhook-verify";
import { EbayNotificationKeyStore } from "@/integrations/ebay/notification-keys";
import { handleEbayNotification } from "@/services/sync/ebay-webhook";
import { runChannelSync } from "@/services/sync/engine";
import { runSourcingSync } from "@/services/sourcing/sync";
import { activateLibrarySource, activateLibrarySourceFor, getLibrarySource, runLibraryChecks, sourceLibrary } from "@/services/sourcing/source-library";
import { scoutHosts } from "@/services/sourcing/source-scout";
import { runChainSelfTest, runImportSelfTest, runSearchSelfTest } from "@/services/sourcing/e2e-check";
import { checkListing, disconnectEbay, disconnectSchema, ebayAccountSetup, listingRequestSchema, prefillListing, publishListingForOrg } from "@/services/channels/ebay-listing-service";
import { decideMatch, listMatchSuggestions, matchDecisionSchema } from "@/services/sourcing/offer-linking";
import { buildRadar, buildRadarOffer, radarSettingsSchema, saveCostSettings } from "@/services/radar/radar";
import { directoryForOrg, runDirectoryChecks } from "@/services/sourcing/supplier-directory";
import { catalogImportSchema, catalogPreviewSchema, getImportJob, importCatalogFile, listImportJobs, previewCatalogFileForOrg } from "@/services/sourcing/catalog-import";
import { listSourcesForOrg, setSourceSchedule, sourceScheduleSchema, syncSourceNow } from "@/services/sourcing/source-sync";
import { simpleSupplierSearch } from "@/services/sourcing/simple-search";
import { adapterProbeSchema, runAdapterProbes } from "@/services/sourcing/adapter-probe";
import { createRemoteFeed, previewRemoteFeed, remoteFeedCreateSchema, remoteFeedPreviewSchema } from "@/services/sourcing/remote-feeds";
import { aiConfigured, aiModel, llmClient } from "@/services/ai/llm";
import { synthesizeAdvisorMessage, synthesizeVoiceSample, TTS_CHOICES, ttsVoice } from "@/services/ai/speech";
import { enforceAiQuota } from "@/services/ai/quota";
import { draftProductFromText } from "@/services/ai/product-draft";
import { askAssistant, assistantRequestSchema } from "@/services/ai/assistant";
import { advisorNdjsonStream, runAdvisorTurn } from "@/services/ai/advisor";
import { decideAdvisorAction } from "@/services/ai/advisor-actions";
import { AI_LIMITS } from "@/services/ai/quota";
import { checkAssistantTools, checkReadOnlyRoutes } from "@/services/ai/tools-check";
import { EBAY_APP_CALLBACK, ebayCallbackRedirect } from "./ebay-callback";
import { loadRuntimeSecrets, type RuntimeSecretsState } from "./runtime-secrets";
import { quoteShipping, shippingProvidersStatus } from "@/services/shipping/quotes";
import { refreshParcelForOrg, runDueTracking, trackingProviders } from "@/services/tracking/tracking";
import { probeToolConnectors } from "@/services/tools/connectors-probe";

const log = createLogger("EDGE_API");

/** L'application mobile appelle depuis un client natif : pas de CORS navigateur nécessaire, sauf pour les outils de test. */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-organization-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const ebayFinalizeSchema = z.object({ code: z.string().min(1).max(2048), state: z.string().min(16).max(200) });
const syncSchema = z.object({ connectionId: uuidParam, scope: z.enum(["full", "listings", "orders"]).default("full") });
const scoutSchema = z.object({ hosts: z.array(z.string().min(3).max(120)).min(1).max(25), query: z.string().min(2).max(80).optional() });
/** Fichier de 15 Mo en base64 (+ mapping) : seule route qui accepte un corps volumineux. */
const CATALOG_BODY_LIMIT = 21_000_000;
const productDraftSchema = z.object({ text: z.string().trim().min(3, "Dites ou écrivez le produit à ajouter.").max(2000, "Texte trop long (2000 caractères maximum).") });
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

/** Cache mémoire (par instance) des clés publiques eBay et du jeton d'application. */
const keyStore = new EbayNotificationKeyStore(() => getEbayConnector().config());

/** URL publique exacte de l'endpoint (à déclarer dans le portail eBay, utilisée dans le hash du challenge). */
export function ebayWebhookEndpoint(): string {
  return `${(process.env.SUPABASE_URL ?? "").replace(/\/+$/, "")}/functions/v1/api/ebay/webhook`;
}

/**
 * Notifications eBay (Marketplace Account Deletion, obligatoire en production) : mêmes traitements
 * que la route web (validation du challenge, signature, déduplication, suppression de compte,
 * synchronisation), exécutés après la réponse via EdgeRuntime.waitUntil.
 */
async function ebayWebhook(request: Request, url: URL): Promise<Response> {
  if (request.method === "GET") {
    const challenge = url.searchParams.get("challenge_code");
    if (!challenge) return Response.json({ ok: true, usage: "eBay envoie GET ?challenge_code=… puis des POST signés." });
    const token = getEbayConnector().config()?.webhookVerificationToken ?? null;
    if (!token) return Response.json({ error: "EBAY_WEBHOOK_VERIFICATION_TOKEN non configuré : impossible de valider l'endpoint eBay." }, { status: 503 });
    return Response.json({ challengeResponse: computeChallengeResponse(challenge, token, ebayWebhookEndpoint()) });
  }
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  return handleEbayNotification(request as never, {
    admin: createAdminSupabaseClient(),
    isConfigured: () => getEbayConnector().isConfigured(),
    getPublicKey: (kid) => keyStore.getPublicKey(kid),
    findConnections: (account) => findConnectionsByExternalAccount("ebay", account),
    runSync: (connectionId, options) => runChannelSync(connectionId, options),
    schedule: (task) => {
      const p = Promise.resolve().then(task);
      if (runtime) runtime.waitUntil(p);
    },
  });
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
          aiConfigured: aiConfigured(),
          shippingProviders: shippingProvidersStatus().filter((p) => p.configured).map((p) => p.id),
          trackingProviders: trackingProviders(),
          encryptionConfigured: Boolean(process.env.TOKEN_ENCRYPTION_KEY && process.env.TOKEN_ENCRYPTION_KEY.length >= 32),
          // Noms uniquement (jamais les valeurs).
          secrets: { fromEnv: secrets.fromEnv, fromVault: secrets.fromVault, error: secrets.error },
          time: new Date().toISOString(),
        };
      });
    }
    if (m === "GET" && path === "/ebay/callback") return ebayCallbackRedirect(url);
    if (path === "/ebay/webhook") return ebayWebhook(request, url);
    if (path.startsWith("/cron/")) {
      const auth = authorizeCron(request);
      if (!auth.ok) return auth.response;
      if (m === "POST" && path === "/cron/sync") return handle(cronSync);
      if (m === "POST" && path === "/cron/sourcing") return handle(() => runSourcingSync());
      if (m === "POST" && path === "/cron/library-checks") {
        return handle(async () => runLibraryChecks((await parseBody(request, z.object({ keys: z.array(z.string().min(1).max(80)).max(60).optional() }))).keys));
      }
      if (m === "POST" && path === "/cron/library-activate") {
        return handle(async () => {
          const body = await parseBody(request, z.object({ organizationId: uuidParam, keys: z.array(z.string().min(1).max(80)).min(1).max(60), requestedBy: z.string().min(10).max(600) }));
          const admin = createAdminSupabaseClient();
          const out: { key: string; sourceId: string | null; alreadyActive: boolean; error: string | null }[] = [];
          for (const key of body.keys) {
            const terms = getLibrarySource(key)?.termsUrl ?? "?";
            const attestation = `${body.requestedBy} Conditions du fournisseur : ${terms}. robots.txt vérifié par le serveur. Activation enregistrée le ${new Date().toISOString()}.`;
            try {
              const r = await activateLibrarySourceFor(admin, body.organizationId, key, attestation);
              out.push({ key, sourceId: r.sourceId, alreadyActive: r.alreadyActive, error: null });
            } catch (e) {
              out.push({ key, sourceId: null, alreadyActive: false, error: e instanceof Error ? e.message : String(e) });
            }
          }
          return out;
        });
      }
      if (m === "POST" && path === "/cron/collect-source") {
        return handle(async () => {
          const body = await parseBody(request, z.object({ sourceId: uuidParam, budgetMs: z.number().int().min(10_000).max(110_000).optional() }));
          return runSourceCrawl(body.sourceId, { trigger: "scheduled", budgetMs: body.budgetMs });
        });
      }
      if (m === "POST" && path === "/cron/e2e-search") {
        return handle(async () => {
          const body = await parseBody(request, z.object({ query: z.string().min(2).max(120), source: z.string().min(1).max(80) }));
          return runSearchSelfTest(body.query, body.source);
        });
      }
      if (m === "POST" && path === "/cron/directory-checks") {
        return handle(async () => {
          const body = await parseBody(request, z.object({ keys: z.array(z.string().min(1).max(80)).max(100).optional() }));
          return runDirectoryChecks({ keys: body.keys });
        });
      }
      if (m === "POST" && path === "/cron/chain-selftest") return handle(() => runChainSelfTest());
      if (m === "POST" && path === "/cron/tracking") return handle(() => runDueTracking());
      if (m === "POST" && path === "/cron/connectors-probe") return handle(() => probeToolConnectors());
      if (m === "POST" && path === "/cron/import-selftest") return handle(() => runImportSelfTest());
      if (m === "POST" && path === "/cron/readonly-check") {
        return handle(async () => checkReadOnlyRoutes((await parseBody(request, z.object({ organizationId: uuidParam.optional() }))).organizationId));
      }
      if (m === "POST" && path === "/cron/ai-tools-check") {
        return handle(async () => {
          const body = await parseBody(request, z.object({ organizationId: uuidParam.optional() }));
          return checkAssistantTools(body.organizationId);
        });
      }
      if (m === "POST" && path === "/cron/adapter-probe") return handle(async () => runAdapterProbes(await parseBody(request, adapterProbeSchema)));
      if (m === "POST" && path === "/cron/scout") {
        return handle(async () => {
          const body = await parseBody(request, scoutSchema);
          return scoutHosts(body.hosts, body.query);
        });
      }
    }
    if (m === "GET" && path === "/suppliers/search") return handle(async () => simpleSupplierSearch(await requireMobileOrgContext(request), parseQuery(request, z.object({ q: z.string().trim().min(1).max(120) })).q));
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
    if (m === "GET" && path === "/radar") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request);
        const q = parseQuery(request, z.object({ sort: z.enum(["score", "profit", "margin", "availability", "freshness"]).optional() }));
        return buildRadar(ctx, { sort: q.sort });
      });
    }
    if (m === "GET" && path === "/tools/status") {
      return handle(async () => {
        await requireMobileOrgContext(request);
        return { shipping: shippingProvidersStatus(), tracking: trackingProviders() };
      });
    }
    if (m === "POST" && path === "/shipping/quotes") {
      return handle(async () => {
        await requireMobileOrgContext(request);
        return quoteShipping(await parseBody(request, shippingQuoteRequestSchema));
      });
    }
    if (m === "POST" && path === "/tracking/refresh") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request, { write: true });
        return refreshParcelForOrg(ctx, (await parseBody(request, trackingRefreshSchema)).parcelId);
      });
    }
    if (m === "GET" && path === "/radar/offer") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request);
        const q = parseQuery(request, z.object({ id: uuidParam, quantity: z.coerce.number().int().min(1).max(100_000).optional() }));
        return buildRadarOffer(ctx, q.id, q.quantity ? [q.quantity] : []);
      });
    }
    if (m === "POST" && path === "/radar/settings") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request, { admin: true });
        return saveCostSettings(ctx, await parseBody(request, radarSettingsSchema));
      });
    }
    if (m === "GET" && path === "/sourcing/matches") return handle(async () => listMatchSuggestions(await requireMobileOrgContext(request)));
    if (m === "POST" && path === "/sourcing/matches/decide") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request, { write: true });
        return decideMatch(ctx, await parseBody(request, matchDecisionSchema));
      });
    }
    if (m === "GET" && path === "/sourcing/directory") return handle(async () => directoryForOrg(await requireMobileOrgContext(request)));
    if (m === "POST" && path === "/sourcing/import/preview") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request, { write: true });
        const body = await parseBody(request, catalogPreviewSchema, CATALOG_BODY_LIMIT);
        return previewCatalogFileForOrg(ctx, body);
      });
    }
    if (m === "GET" && path === "/sourcing/sources") return handle(async () => listSourcesForOrg(await requireMobileOrgContext(request)));
    if (m === "POST" && path === "/sourcing/sources/sync") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request, { write: true });
        return syncSourceNow(ctx, (await parseBody(request, z.object({ sourceId: uuidParam }))).sourceId);
      });
    }
    if (m === "POST" && path === "/sourcing/sources/schedule") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request, { admin: true });
        return setSourceSchedule(ctx, await parseBody(request, sourceScheduleSchema));
      });
    }
    if (m === "POST" && path === "/sourcing/feeds/preview") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request, { write: true });
        return previewRemoteFeed(ctx, await parseBody(request, remoteFeedPreviewSchema));
      });
    }
    if (m === "POST" && path === "/sourcing/feeds") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request, { write: true });
        return createRemoteFeed(ctx, await parseBody(request, remoteFeedCreateSchema));
      });
    }
    if (m === "GET" && path === "/sourcing/imports") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request);
        const q = parseQuery(request, z.object({ supplierId: uuidParam.optional(), limit: z.coerce.number().int().min(1).max(200).optional() }));
        return listImportJobs(ctx, { supplierId: q.supplierId ?? null, limit: q.limit ?? 50 });
      });
    }
    if (m === "GET" && path === "/sourcing/imports/detail") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request);
        return getImportJob(ctx, parseQuery(request, z.object({ id: uuidParam })).id);
      });
    }
    if (m === "POST" && path === "/sourcing/import") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request, { write: true });
        const body = await parseBody(request, catalogImportSchema, CATALOG_BODY_LIMIT);
        return importCatalogFile(ctx, body);
      });
    }
    if (m === "POST" && path === "/ai/product-draft") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request, { write: true });
        const body = await parseBody(request, productDraftSchema);
        llmClient(); // « non configuré » avant de consommer le quota
        await enforceAiQuota(ctx, "product_draft");
        return draftProductFromText(body.text, ctx.organization.default_currency);
      });
    }
    if (m === "POST" && path === "/ai/assistant") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request);
        const body = await parseBody(request, assistantRequestSchema);
        llmClient();
        await enforceAiQuota(ctx, "assistant");
        return askAssistant({ supabase: ctx.supabase, organizationId: ctx.organization.id, organizationName: ctx.organization.name, currency: ctx.organization.default_currency }, body);
      });
    }
    if (m === "GET" && path === "/advisor/status") {
      return handle(async () => {
        await requireMobileOrgContext(request);
        return { configured: aiConfigured(), model: aiConfigured() ? aiModel() : null, voice: aiConfigured() ? { provider: "openai", name: ttsVoice(), choices: [...TTS_CHOICES] } : null, limits: { perUserPerHour: AI_LIMITS.assistantPerHour, perOrganizationPerDay: AI_LIMITS.orgPerDay, maxMessageChars: ADVISOR_MESSAGE_MAX_CHARS } };
      });
    }
    if (m === "GET" && path === "/advisor/speech") {
      try {
        const ctx = await requireMobileOrgContext(request);
        const messageId = url.searchParams.get("messageId") ?? "";
        if (!/^[0-9a-f-]{36}$/i.test(messageId)) throw new AppError("VALIDATION", "Réponse à lire invalide.");
        llmClient(); // « non configuré » sans clé
        const audio = await synthesizeAdvisorMessage(ctx, messageId, { voice: url.searchParams.get("voice") });
        return new Response(audio, { status: 200, headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
      } catch (e) {
        return errorResponse(e);
      }
    }
    if (m === "GET" && path === "/advisor/voice-sample") {
      try {
        const ctx = await requireMobileOrgContext(request);
        llmClient(); // « non configuré » avant de consommer le quota
        await enforceAiQuota(ctx, "assistant");
        const audio = await synthesizeVoiceSample(url.searchParams.get("voice"));
        return new Response(audio, { status: 200, headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
      } catch (e) {
        return errorResponse(e);
      }
    }
    if (m === "POST" && path === "/advisor/chat") {
      try {
        const ctx = await requireMobileOrgContext(request);
        const body = await parseBody(request, advisorChatSchema);
        llmClient(); // « non configuré » avant de consommer le quota
        await enforceAiQuota(ctx, "assistant");
        if ((request.headers.get("accept") ?? "").includes("application/x-ndjson")) {
          return new Response(advisorNdjsonStream(ctx, body), { status: 200, headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
        }
        return handle(() => runAdvisorTurn(ctx, body, () => undefined));
      } catch (e) {
        return errorResponse(e);
      }
    }
    if (m === "POST" && (path === "/advisor/actions/confirm" || path === "/advisor/actions/cancel")) {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request);
        const { actionId } = await parseBody(request, advisorActionDecisionSchema);
        return decideAdvisorAction(ctx, actionId, path.endsWith("/confirm") ? "confirm" : "cancel");
      });
    }
    if (m === "GET" && path === "/integrations") return handle(async () => integrations(await requireMobileOrgContext(request)));
    if (m === "POST" && path === "/ebay/connect") return handle(() => startEbayConnect(request));
    if (m === "POST" && path === "/ebay/finalize") return handle(() => finalizeEbayConnect(request));
    if (m === "POST" && path === "/ebay/disconnect") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request, { admin: true });
        return disconnectEbay(ctx, (await parseBody(request, disconnectSchema)).connectionId);
      });
    }
    if (m === "GET" && path === "/ebay/listings/prefill") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request, { write: true });
        return prefillListing(ctx, parseQuery(request, z.object({ skuId: uuidParam })).skuId);
      });
    }
    if (m === "GET" && path === "/ebay/account-setup") return handle(async () => ebayAccountSetup(await requireMobileOrgContext(request, { write: true })));
    if (m === "POST" && path === "/ebay/listings/check") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request, { write: true });
        return checkListing(ctx, await parseBody(request, listingRequestSchema));
      });
    }
    if (m === "POST" && path === "/ebay/listings/publish") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request, { admin: true });
        return publishListingForOrg(ctx, await parseBody(request, listingRequestSchema));
      });
    }
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
