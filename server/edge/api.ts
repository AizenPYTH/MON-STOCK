/**
 * =============================================================================
 * MON STOCK — API serveur déployée en Supabase Edge Function (`api`).
 *
 * Traitements qui exigent des secrets ou des privilèges serveur (jetons eBay, clé service_role,
 * réseau sortant vers les fournisseurs et transporteurs, OpenAI) : ils ne peuvent PAS tourner dans
 * le téléphone. Ce point d'entrée expose, pour l'application iPhone et pour le site web (appels
 * serveur à serveur, src/lib/edge-api.ts), les MÊMES services que le web (aucune logique dupliquée).
 *
 * TABLE DES ROUTES — tenue à jour avec le code : tests/unit/edge-hardening.test.ts vérifie que
 * chaque route du routeur figure ici. Rôle : membre (lecture), rédacteur (≠ lecture seule),
 * admin (propriétaire / administrateur). `X-Organization-Id` obligatoire pour rédacteur et admin (S-29).
 *
 *   Santé
 *   GET  /api/health                       public, minimal : oui/non (eBay, cron, IA, chiffrement) et heure
 *   GET  /api/health/details               CRON_SECRET : secrets chargés (noms), configuration, ping de la base
 *
 *   Fournisseurs et sourcing (membre sauf mention)
 *   GET  /api/suppliers/search?q=          recherche simple « Fournisseurs » (en direct : rédacteur ; lecture seule : offres stockées)
 *   GET  /api/sourcing/search?q=           recherche d'offres (sources en direct pour un rédacteur, offres stockées)
 *   GET  /api/sourcing/status              état des sources de l'organisation
 *   GET  /api/sourcing/library             bibliothèque de sources (catalogue + activation)
 *   POST /api/sourcing/library/activate    activer une source (validation tracée) — rédacteur
 *   GET  /api/sourcing/matches             suggestions de rapprochement offre ↔ SKU
 *   POST /api/sourcing/matches/decide      confirmer / refuser une suggestion — rédacteur
 *   GET  /api/sourcing/directory           annuaire de fournisseurs qualifiés
 *   GET  /api/sourcing/accounts            « Connectez vos comptes » : comptes pro + sources publiques
 *   POST /api/sourcing/accounts/connect    connexion API d'un compte (identifiants chiffrés, test réel) — rédacteur
 *   POST /api/sourcing/accounts/sync       synchronisation du catalogue d'un compte — rédacteur
 *   POST /api/sourcing/accounts/disconnect déconnexion (identifiants supprimés) — admin
 *   GET  /api/sourcing/supplier-offers?supplierId=  produits récupérés pour un fournisseur
 *   POST /api/sourcing/import/preview      aperçu d'un catalogue (CSV, XLSX, XML, JSON), rien enregistré — rédacteur
 *   POST /api/sourcing/import              import réel du catalogue (par lots) — rédacteur
 *   GET  /api/sourcing/imports             historique des imports
 *   GET  /api/sourcing/imports/detail?id=  détail d'un import et lignes ignorées
 *   POST /api/sourcing/imports/resume      reprise d'un import par lots — rédacteur
 *   GET  /api/sourcing/sources             sources : statut, offres exploitables, dernier succès, prochain passage
 *   POST /api/sourcing/sources/sync        « Synchroniser maintenant » (verrou, délai de 2 min) — rédacteur
 *   POST /api/sourcing/sources/schedule    fréquence et activation d'une source — admin
 *   POST /api/sourcing/feeds/preview       aperçu d'un flux distant autorisé — rédacteur
 *   POST /api/sourcing/feeds               ajout du flux (attestation, identifiants chiffrés) — rédacteur
 *   GET  /api/radar?sort=                  radar d'opportunités d'achat
 *   GET  /api/radar/offer?id=&quantity=    détail d'une offre du radar
 *   POST /api/radar/settings               paramètres de coûts — admin
 *
 *   Outils
 *   GET  /api/tools/status                 transporteurs configurés ; suivi utilisable (disjoncteur La Poste, I-17)
 *   POST /api/shipping/quotes              devis d'expédition (consultation seule) — limite de débit (S-15, I-29)
 *   POST /api/tracking/refresh             actualisation d'un colis — rédacteur, 1 fois/min par colis (S-15)
 *
 *   eBay
 *   GET  /api/integrations                 connexions eBay, dernière synchronisation, erreurs
 *   POST /api/ebay/connect                 URL d'autorisation (état anti-CSRF lié à l'utilisateur) ; { extended } — admin
 *   GET  /api/ebay/callback                retour d'eBay → redirection vers l'application (monstock://)
 *   POST /api/ebay/finalize                échange du code (état de CET utilisateur et CETTE organisation, S-24) — admin
 *   POST /api/ebay/disconnect              déconnexion (jetons supprimés) — admin
 *   GET|POST /api/ebay/webhook             notifications eBay signées (suppression de compte ; voir docs/ebay-setup.md, I-22)
 *   GET  /api/ebay/listings/prefill?skuId= brouillon d'annonce depuis un SKU — rédacteur
 *   GET  /api/ebay/account-setup[?connectionId=]  politiques et emplacements du compte — rédacteur
 *   POST /api/ebay/listings/check          contrôle + simulation (rien n'est envoyé) — rédacteur
 *   POST /api/ebay/listings/publish        publication verrouillée (EBAY_LISTING_ENABLED, confirmation,
 *                                          compte explicite si plusieurs, SKU libre — I-31) — admin
 *   POST /api/ebay/sync                    synchronisation immédiate — rédacteur, 1 fois/2 min par connexion (S-15)
 *
 *   IA
 *   POST /api/ai/product-draft             phrase dictée → brouillon de produit (quota IA) — rédacteur
 *   POST /api/ai/assistant                 questions sur ventes / stock / eBay (quota IA)
 *   GET  /api/advisor/status               conseiller IA : configuré, limites
 *   GET  /api/advisor/speech?messageId=    voix d'une réponse reçue (audio/mpeg)
 *   GET  /api/advisor/voice-sample?voice=  échantillon de voix (quota IA)
 *   POST /api/advisor/chat                 conseiller IA (NDJSON si Accept: application/x-ndjson)
 *   POST /api/advisor/actions/confirm      exécute UNE action préparée (droits revérifiés)
 *   POST /api/advisor/actions/cancel       annule une action préparée
 *
 *   Compte
 *   POST /api/account/delete               suppression DÉFINITIVE du compte ({ confirmation: "SUPPRIMER" }), sans organisation
 *
 *   Tâches planifiées (POST, Authorization: Bearer CRON_SECRET ; planifiées : sync, sourcing,
 *   library-checks, directory-checks, tracking — voir supabase/migrations/20261023000700)
 *   /api/cron/sync                 synchro eBay des connexions dues + reprise des notifications abandonnées (I-22)
 *   /api/cron/sourcing             sources fournisseurs ; { phase } facultatif
 *   /api/cron/sourcing-imports     reprise des imports par lots
 *   /api/cron/library-checks       vérification de la bibliothèque de sources (lot borné)
 *   /api/cron/library-review-report  rapport en lecture seule (sources à faire revalider)
 *   /api/cron/library-activate     SUPPRIMÉE (410) : activation réservée à un utilisateur
 *   /api/cron/sourcing-weekly      collecte hebdomadaire — DÉSACTIVÉE (503) tant que la migration
 *                                  supabase/pending/20261014000100 n'est pas appliquée (S-27)
 *   /api/cron/collect-source       collecte d'une source précise
 *   /api/cron/directory-checks     vérification de l'annuaire
 *   /api/cron/tracking             suivi des colis dus (budget de temps, disjoncteur La Poste, I-17)
 *   /api/cron/e2e-search | chain-selftest | import-selftest | readonly-check | deal-check
 *     | ai-tools-check | adapter-probe | scout | connectors-probe   autotests et sondes (exploitation)
 *
 * Authentification : `Authorization: Bearer <jeton d'accès Supabase de l'utilisateur>` validé par
 * Supabase Auth (getUser), organisation dans `X-Organization-Id` (appartenance vérifiée), puis
 * requêtes sous RLS avec le client de l'utilisateur. Le service_role n'est utilisé que par les
 * services serveur (moteur de synchronisation, stockage chiffré des jetons, limites de débit).
 * Chaque réponse porte `X-Request-Id`, repris dans les journaux JSON (S-17). CORS : origines
 * connues seulement (server/edge/cors.ts, Q-22).
 * =============================================================================
 */
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { randomToken } from "@/lib/crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { runSourceCrawl } from "@/services/sourcing/crawler/crawler-manager";
import { runWeeklyCollection, WEEKLY_COLLECTION_DISABLED_MESSAGE, weeklyCollectionSchemaReady, weeklyRunSchema } from "@/services/sourcing/weekly-collection";
import { authorizeCron } from "@/lib/cron-auth";
import { errorResponse, handle, parseBody, parseQuery, uuidParam } from "@/features/mobile-api/http";
import { requireMobileOrgContext, requireMobileUser } from "@/features/mobile-api/context";
import { accountDeleteInputSchema, ADVISOR_MESSAGE_MAX_CHARS, advisorActionDecisionSchema, advisorChatSchema, shippingQuoteRequestSchema, sourcingSearchQuerySchema, trackingRefreshSchema } from "@/features/mobile-api/contract";
import { integrations, sourcingSearch, sourcingStatus } from "@/features/mobile-api/service";
import { syncConnectionNow } from "@/features/integrations/sync-service";
import { buildOAuthState, isExtendedOAuthState, OAUTH_STATE_TTL_SECONDS, oauthErrorCodeFor } from "@/features/integrations/oauth-flow";
import { reserveApiRate } from "@/services/rate-limit";
import { getEbayConnector } from "@/integrations/core/registry";
import { ebayScopeList } from "@/integrations/ebay/config";
import { scrubSecrets } from "@/integrations/core/sanitize";
import { findConnectionsByExternalAccount, upsertOAuthConnection } from "@/services/channels/connection-store";
import { computeChallengeResponse } from "@/integrations/ebay/webhook-verify";
import { EbayNotificationKeyStore } from "@/integrations/ebay/notification-keys";
import { handleEbayNotification } from "@/services/sync/ebay-webhook";
import { runChannelSync } from "@/services/sync/engine";
import { EDGE_CRON_SYNC_BUDGET_MS, runSyncCron } from "@/services/sync/cron";
import { runSourcingSync } from "@/services/sourcing/sync";
import { activateLibrarySource, libraryActivateSchema, librarySourcesToRevalidate, runLibraryChecks, sourceLibrary } from "@/services/sourcing/source-library";
import { scoutHosts } from "@/services/sourcing/source-scout";
import { runChainSelfTest, runImportSelfTest, runSearchSelfTest } from "@/services/sourcing/e2e-check";
import { checkListing, disconnectEbay, disconnectSchema, ebayAccountSetup, listingRequestSchema, prefillListing, publishListingForOrg } from "@/services/channels/ebay-listing-service";
import { decideMatch, listMatchSuggestions, matchDecisionSchema } from "@/services/sourcing/offer-linking";
import { buildRadar, buildRadarOffer, radarSettingsSchema, saveCostSettings } from "@/services/radar/radar";
import { directoryForOrg, runDirectoryChecks } from "@/services/sourcing/supplier-directory";
import { connectProAccount, disconnectProAccount, proAccountsHub, supplierOffers, syncProAccount } from "@/services/sourcing/pro-accounts";
import { catalogImportSchema, catalogPreviewSchema, getImportJob, importCatalogFile, listImportJobs, previewCatalogFileForOrg, resumeImportJob } from "@/services/sourcing/catalog-import";
import { runPendingImportJobs } from "@/services/sourcing/import-jobs";
import { listSourcesForOrg, setSourceSchedule, sourceScheduleSchema, syncSourceNow } from "@/services/sourcing/source-sync";
import { simpleSupplierSearch } from "@/services/sourcing/simple-search";
import { adapterProbeSchema, runAdapterProbes } from "@/services/sourcing/adapter-probe";
import { createRemoteFeed, previewRemoteFeed, remoteFeedCreateSchema, remoteFeedPreviewSchema } from "@/services/sourcing/remote-feeds";
import { aiConfigured, aiModel, llmClient } from "@/services/ai/llm";
import { audioCacheControl, synthesizeAdvisorMessage, synthesizeVoiceSample, TTS_CHOICES, ttsVoice } from "@/services/ai/speech";
import { aiMeter, enforceAiQuota } from "@/services/ai/quota";
import { draftProductFromText } from "@/services/ai/product-draft";
import { askAssistant, assistantRequestSchema } from "@/services/ai/assistant";
import { advisorNdjsonStream, runAdvisorTurn } from "@/services/ai/advisor";
import { decideAdvisorAction } from "@/services/ai/advisor-actions";
import { AI_LIMITS } from "@/services/ai/quota";
import { checkAssistantTools, checkDealAnalysis, checkReadOnlyRoutes } from "@/services/ai/tools-check";
import { EBAY_APP_CALLBACK, ebayCallbackRedirect } from "./ebay-callback";
import { createRuntimeSecretsLoader, type RuntimeSecretsState, type RuntimeSecretsStatus } from "./runtime-secrets";
import { corsHeaders } from "./cors";
import { healthDetails, pingDatabase, publicHealth } from "./health";
import { consumeEbayOAuthState } from "./ebay-oauth-state";
import { REQUEST_ID_HEADER, requestIdFrom, withRequestContext } from "./request-context";
import { quoteShipping, shippingProvidersStatus } from "@/services/shipping/quotes";
import { refreshParcelForOrg, runDueTracking, usableTrackingProviders } from "@/services/tracking/tracking";
import { probeToolConnectors } from "@/services/tools/connectors-probe";
import { deleteAccountForUser } from "@/services/account";

const log = createLogger("EDGE_API");

const ebayConnectSchema = z.object({ extended: z.boolean().optional() });
const ebayFinalizeSchema = z.object({ code: z.string().min(1).max(2048), state: z.string().min(16).max(200) });
const syncSchema = z.object({ connectionId: uuidParam, scope: z.enum(["full", "listings", "orders"]).default("full") });
const scoutSchema = z.object({ hosts: z.array(z.string().min(3).max(120)).min(1).max(25), query: z.string().min(2).max(80).optional() });
/** Imports par lots dans l'Edge : durée (limite d'horloge ~150 s) et calcul (~2 s de CPU) bornés par requête. */
const IMPORT_EDGE_BUDGET_MS = 90_000;
const IMPORT_EDGE_CPU_BUDGET_MS = 1_200;
/** Fichier de 15 Mo en base64 (+ mapping) : seule route qui accepte un corps volumineux. */
const CATALOG_BODY_LIMIT = 21_000_000;
const productDraftSchema = z.object({ text: z.string().trim().min(3, "Dites ou écrivez le produit à ajouter.").max(2000, "Texte trop long (2000 caractères maximum).") });

/** En-têtes CORS (origines connues seulement, Q-22) et identifiant de requête (S-17) ajoutés à la réponse. */
function finalize(res: Response, origin: string | null, requestId: string): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v);
  headers.set(REQUEST_ID_HEADER, requestId);
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
  // Corps facultatif { extended: true } : « Autoriser l'analyse complète » (finances, trafic, marketing en lecture).
  const { extended = false } = await parseBody(request, ebayConnectSchema);
  const state = buildOAuthState(randomToken(32), extended);
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
  log.info("connexion eBay démarrée (mobile)", { orgId: ctx.organization.id, userId: ctx.user.id, extended });
  return { authorizeUrl: connector.getAuthorizeUrl(state, { extended }), callbackScheme: EBAY_APP_CALLBACK, environment: connector.config()?.environment ?? null, extended };
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
  // S-24 : seul l'état de CET utilisateur pour CETTE organisation est consommé (filtre dans le DELETE).
  const row = await consumeEbayOAuthState(createAdminSupabaseClient(), { state, userId: ctx.user.id, organizationId: ctx.organization.id });
  if (new Date(row.expires_at).getTime() < Date.now()) throw new AppError("VALIDATION", "La demande de connexion a expiré (15 min) : relancez la connexion eBay.");
  const connector = getEbayConnector();
  const config = connector.config();
  if (!config) throw new AppError("VALIDATION", "Intégration eBay non configurée sur le serveur.");
  try {
    const tokens = await connector.exchangeCode(code);
    const account = await connector.getAccountInfo({ getAccessToken: async () => tokens.accessToken });
    const { connection, isNew } = await upsertOAuthConnection({ organizationId: ctx.organization.id, userId: ctx.user.id, provider: "ebay", environment: config.environment, account, tokens, scopes: ebayScopeList({ extended: isExtendedOAuthState(row.state) }) });
    log.info("connexion eBay établie (mobile)", { connectionId: connection.id, orgId: ctx.organization.id, isNew, environment: config.environment });
    return { connectionId: connection.id, isNew, username: account.username ?? null, environment: config.environment };
  } catch (e) {
    const code = oauthErrorCodeFor(e);
    log.error("échec de la connexion eBay (mobile)", { orgId: ctx.organization.id, code, message: scrubSecrets(e instanceof Error ? e.message : String(e)) });
    throw e;
  }
}

/**
 * Cron de synchronisation : même service que la route web (src/services/sync/cron.ts) — runs
 * abandonnés nettoyés, notifications eBay abandonnées reprises (S-06), connexions dues traitées dans
 * un budget partagé sous la limite d'horloge de l'Edge Function (~150 s) ; chaque run s'arrête
 * proprement à l'échéance et reprend au passage suivant (D-01).
 */
function cronSync() {
  return runSyncCron({ budgetMs: EDGE_CRON_SYNC_BUDGET_MS });
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
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  const url = new URL(request.url);
  const path = routeOf(url);
  const m = request.method;
  try {
    // Public et minimal (S-16, I-23) : aucun nom de secret, aucune configuration détaillée.
    if (m === "GET" && path === "/health") return handle(async () => publicHealth());
    // Diagnostic d'exploitation : CRON_SECRET exigé ; ping réel de la base.
    if (m === "GET" && path === "/health/details") {
      const auth = authorizeCron(request);
      if (!auth.ok) return auth.response;
      return handle(() => healthDetails({ secrets: runtimeSecretsStatus, ping: () => pingDatabase(createAdminSupabaseClient()), admin: createAdminSupabaseClient }));
    }
    if (m === "GET" && path === "/ebay/callback") return ebayCallbackRedirect(url);
    if (path === "/ebay/webhook") return ebayWebhook(request, url);
    if (path.startsWith("/cron/")) {
      const auth = authorizeCron(request);
      if (!auth.ok) return auth.response;
      if (m === "POST" && path === "/cron/sync") return handle(cronSync);
      if (m === "POST" && path === "/cron/sourcing") {
        // Budget global ; `phase` lance une étape seule (ex. cron séparé pour les alertes).
        return handle(async () => runSourcingSync(new Date(), { phase: (await parseBody(request, z.object({ phase: z.enum(["all", "alerts", "sources", "imports"]).optional() }))).phase }));
      }
      // Reprise des imports de catalogues / flux en cours (traitement par lots, budget borné).
      if (m === "POST" && path === "/cron/sourcing-imports") return handle(() => runPendingImportJobs({ budgetMs: IMPORT_EDGE_BUDGET_MS, cpuBudgetMs: IMPORT_EDGE_CPU_BUDGET_MS }));
      if (m === "POST" && path === "/cron/library-checks") {
        // Lot borné (les moins récemment vérifiées d'abord) dans un budget de temps global.
        return handle(async () => {
          const body = await parseBody(request, z.object({ keys: z.array(z.string().min(1).max(80)).max(60).optional(), batchSize: z.number().int().min(1).max(20).optional() }));
          return runLibraryChecks({ keys: body.keys, batchSize: body.batchSize });
        });
      }
      // Activation planifiée supprimée (I-05) : l'activation exige la validation de l'utilisateur dans l'application.
      if (m === "POST" && path === "/cron/library-activate") {
        return errorResponse(new AppError("FORBIDDEN", "Activation de sources par tâche planifiée supprimée : chaque activation exige la validation tracée d'un utilisateur de l'organisation (application ou site web).", { status: 410 }));
      }
      // Rapport en lecture seule : sources de la bibliothèque actives à faire revalider par le titulaire (rien n'est désactivé).
      if (m === "POST" && path === "/cron/library-review-report") return handle(() => librarySourcesToRevalidate());
      if (m === "POST" && path === "/cron/sourcing-weekly") {
        // S-27 : désactivée tant que la migration supabase/pending/20261014000100 n'est pas appliquée.
        if (!(await weeklyCollectionSchemaReady())) return errorResponse(new AppError("NOT_CONFIGURED", WEEKLY_COLLECTION_DISABLED_MESSAGE, { status: 503 }));
        return handle(async () => runWeeklyCollection(await parseBody(request, weeklyRunSchema)));
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
      if (m === "POST" && path === "/cron/tracking") return handle(() => runDueTracking()); // budget de temps et disjoncteur La Poste (I-17)
      if (m === "POST" && path === "/cron/connectors-probe") return handle(() => probeToolConnectors());
      if (m === "POST" && path === "/cron/import-selftest") return handle(() => runImportSelfTest());
      if (m === "POST" && path === "/cron/readonly-check") {
        return handle(async () => checkReadOnlyRoutes((await parseBody(request, z.object({ organizationId: uuidParam.optional() }))).organizationId));
      }
      if (m === "POST" && path === "/cron/deal-check") {
        return handle(async () => checkDealAnalysis(await parseBody(request, z.object({ organizationId: uuidParam, userId: uuidParam, query: z.string().trim().min(2).max(120), live: z.boolean().default(false) }))));
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
        const body = await parseBody(request, libraryActivateSchema);
        return activateLibrarySource(ctx, body.key, { termsUrl: body.termsUrl ?? null }, "mobile");
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
        // Suivi : « configuré » seulement si la clé n'est pas coupée par le disjoncteur (I-17).
        return { shipping: shippingProvidersStatus(), tracking: await usableTrackingProviders() };
      });
    }
    if (m === "POST" && path === "/shipping/quotes") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request);
        const body = await parseBody(request, shippingQuoteRequestSchema);
        await reserveApiRate(ctx, "shipping_quotes", null); // S-15 / I-29
        return quoteShipping(body);
      });
    }
    if (m === "POST" && path === "/tracking/refresh") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request, { write: true });
        const { parcelId } = await parseBody(request, trackingRefreshSchema);
        await reserveApiRate(ctx, "tracking_refresh", parcelId); // S-15
        return refreshParcelForOrg(ctx, parcelId);
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
    if (m === "GET" && path === "/sourcing/accounts") return handle(async () => proAccountsHub(await requireMobileOrgContext(request)));
    if (m === "GET" && path === "/sourcing/supplier-offers") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request);
        return supplierOffers(ctx, parseQuery(request, z.object({ supplierId: uuidParam })).supplierId);
      });
    }
    if (m === "POST" && path === "/sourcing/accounts/connect") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request, { write: true });
        const body = await parseBody(request, z.object({ key: z.string().min(1).max(80), credentials: z.record(z.string().max(80), z.string().max(2000)) }));
        return connectProAccount(ctx, body);
      });
    }
    if (m === "POST" && path === "/sourcing/accounts/sync") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request, { write: true });
        return syncProAccount(ctx, (await parseBody(request, z.object({ connectionId: uuidParam }))).connectionId);
      });
    }
    if (m === "POST" && path === "/sourcing/accounts/disconnect") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request, { admin: true });
        return disconnectProAccount(ctx, (await parseBody(request, z.object({ connectionId: uuidParam }))).connectionId);
      });
    }
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
        // Traitement par lots dans le budget de la requête ; au-delà, `result.pending` et reprise.
        return importCatalogFile(ctx, body, { budgetMs: IMPORT_EDGE_BUDGET_MS, cpuBudgetMs: IMPORT_EDGE_CPU_BUDGET_MS });
      });
    }
    if (m === "POST" && path === "/sourcing/imports/resume") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request, { write: true });
        return resumeImportJob(ctx, (await parseBody(request, z.object({ id: uuidParam }))).id, { budgetMs: IMPORT_EDGE_BUDGET_MS, cpuBudgetMs: IMPORT_EDGE_CPU_BUDGET_MS });
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
        return askAssistant({ supabase: ctx.supabase, organizationId: ctx.organization.id, organizationName: ctx.organization.name, currency: ctx.organization.default_currency }, body, { meter: aiMeter(ctx) });
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
        return new Response(audio, { status: 200, headers: { "Content-Type": "audio/mpeg", "Cache-Control": audioCacheControl(), "X-Content-Type-Options": "nosniff" } });
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
    if (m === "POST" && path === "/account/delete") {
      // M-01 : aucune organisation requise (compte sans organisation inclus). Jeton revalidé auprès
      // de Supabase Auth (getUser) ; l'identifiant supprimé est TOUJOURS celui du jeton vérifié.
      return handle(async () => {
        const { supabase, user } = await requireMobileUser(request);
        const body = await parseBody(request, accountDeleteInputSchema);
        return deleteAccountForUser(supabase, user.id, body.confirmation);
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
    if (m === "GET" && path === "/ebay/account-setup") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request, { write: true });
        return ebayAccountSetup(ctx, parseQuery(request, z.object({ connectionId: uuidParam.optional() })).connectionId ?? null);
      });
    }
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
        await reserveApiRate(ctx, "ebay_sync", body.connectionId); // S-15 : délai minimal par connexion
        const r = await syncConnectionNow(ctx, body.connectionId, { trigger: "manual", scope: body.scope });
        return { runId: r.result.runId, status: r.result.status, durationMs: r.result.durationMs, summary: r.summary, errorSummary: r.result.errorSummary };
      });
    }
    return errorResponse(new AppError("NOT_FOUND", `Route inconnue : ${m} ${path}`));
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * Secrets du Vault (S-07, W-15) : chargement paresseux au premier besoin ; seul un SUCCÈS est gardé
 * pour la vie de l'instance, un échec est retenté au besoin suivant (backoff), jamais figé.
 */
const runtimeSecrets = createRuntimeSecretsLoader(process.env as Record<string, string | undefined>);

export function ensureRuntimeSecrets(): Promise<RuntimeSecretsState> {
  return runtimeSecrets.ensure();
}

export function runtimeSecretsStatus(): RuntimeSecretsStatus {
  return runtimeSecrets.status();
}

export async function serve(request: Request): Promise<Response> {
  const requestId = requestIdFrom(request);
  return withRequestContext(requestId, async () => {
    await ensureRuntimeSecrets();
    return finalize(await route(request), request.headers.get("origin"), requestId);
  });
}
