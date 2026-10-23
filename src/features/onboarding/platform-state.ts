import type { EbayWebConnectStatus } from "@/features/integrations/ebay-web";
import { isUuid, OAUTH_ERROR_MESSAGES, oauthErrorMessage, type OAuthErrorCode } from "@/features/integrations/oauth-flow";

/**
 * Étape « plateforme » du parcours d'inscription (`/onboarding/plateforme`, handoff v2 §D et §I).
 *
 * Fonction PURE qui choisit l'état affiché à partir de faits RÉELS lus par la page serveur :
 * - la connexion eBay en base (`channel_connections`, même source que /settings/integrations) ;
 * - une demande d'autorisation en attente (`oauth_states` non consommé et non expiré) ;
 * - la configuration du serveur (RuName web, W-06) et le rôle de l'utilisateur ;
 * - les paramètres de l'URL (`connected`, `error`, `canal`), qui ne sont que des INDICES :
 *   « succès » exige une connexion confirmée en base, l'erreur n'affiche qu'un message connu.
 */

/** Canaux annoncés « prochainement » : aucun bouton, aucune date, aucune liste d'attente. */
export const FUTURE_CHANNELS = [
  { key: "amazon", label: "Amazon", text: "Annonces et commandes Amazon dans le même stock central." },
  { key: "shopify", label: "Shopify", text: "Votre boutique Shopify branchée sur les mêmes quantités." },
  { key: "woocommerce", label: "WooCommerce", text: "Votre site WooCommerce relié au stock, sans double saisie." },
] as const;

export type FutureChannelKey = (typeof FUTURE_CHANNELS)[number]["key"];

export type ConnectionStatus = "pending" | "connected" | "expired" | "error" | "disconnected";

/** Connexion eBay telle que lue en base (sous RLS). */
export interface EbayConnectionFact {
  id: string;
  status: ConnectionStatus;
  username: string | null;
  environment: string;
  connectedAt: string | null;
  lastSuccessfulSyncAt: string | null;
}

export interface PlatformInputs {
  webConnect: EbayWebConnectStatus;
  admin: boolean;
  /** Toutes les connexions eBay de l'organisation (déconnectées comprises). */
  connections: readonly EbayConnectionFact[];
  /** Lecture des connexions en échec : rien n'est affirmé (ni succès, ni « aucune connexion » certaine). */
  connectionsReadFailed?: boolean;
  /** Date de la dernière demande d'autorisation non consommée (null : aucune, ou inconnue). */
  pendingSince: string | null;
  params: { connected?: string | string[]; error?: string | string[]; canal?: string | string[] };
}

export type EbayCardKind = "none" | "pending" | "success" | "error" | "already" | "unavailable";
export type PlatformStateKind = EbayCardKind | "future";

/** Pourquoi le bouton OAuth n'est pas proposé (null : il l'est, ou la question ne se pose pas). */
export type ConnectBlock = "web_runame_missing" | "not_configured" | "not_admin" | null;

export interface PlatformState {
  /** État principal de la page (7 valeurs). */
  kind: PlatformStateKind;
  /** État de la carte eBay (le panneau « canal futur » s'affiche en plus). */
  ebay: EbayCardKind;
  /** Bouton « Connecter eBay » (POST OAuth) proposé. */
  canConnect: boolean;
  block: ConnectBlock;
  /** Connexion à montrer (succès : celle confirmée ; déjà connecté : la première active). */
  connection: EbayConnectionFact | null;
  /** Erreur du retour OAuth : code connu (affiché en mono) ou null pour un code inconnu (jamais recopié). */
  error: { code: OAuthErrorCode | null; message: string } | null;
  future: FutureChannelKey | null;
  pendingSince: string | null;
  /** `?connected=` présent mais non confirmé en base : on le dit au lieu d'afficher un succès. */
  unconfirmedReturn: boolean;
  /** Connexions illisibles : la page le signale (aucun « non connecté » affirmé). */
  readFailed: boolean;
  /** Administrateur de l'organisation (détails techniques de configuration). */
  admin: boolean;
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function futureChannel(raw: string | string[] | undefined): FutureChannelKey | null {
  const v = first(raw);
  return FUTURE_CHANNELS.some((c) => c.key === v) ? (v as FutureChannelKey) : null;
}

function knownErrorCode(code: string): OAuthErrorCode | null {
  return Object.prototype.hasOwnProperty.call(OAUTH_ERROR_MESSAGES, code) ? (code as OAuthErrorCode) : null;
}

export function choosePlatformState(input: PlatformInputs): PlatformState {
  const active = input.connections.filter((c) => c.status !== "disconnected");
  const connectedParam = first(input.params.connected);
  const errorParam = first(input.params.error)?.trim() || undefined;
  const future = futureChannel(input.params.canal);

  // Succès : UNIQUEMENT une connexion confirmée en base (statut « connecté ») portant l'identifiant renvoyé.
  const confirmed = isUuid(connectedParam) ? (active.find((c) => c.id === connectedParam && c.status === "connected") ?? null) : null;
  const unconfirmedReturn = connectedParam !== undefined && confirmed === null;

  // Demande en attente : seulement si aucune connexion active ne lui est postérieure.
  const pendingAt = input.pendingSince ? Date.parse(input.pendingSince) : NaN;
  const pending = Number.isFinite(pendingAt) && !active.some((c) => c.connectedAt !== null && Date.parse(c.connectedAt) >= pendingAt);

  let ebay: EbayCardKind;
  if (confirmed) ebay = "success";
  else if (errorParam) ebay = "error";
  else if (active.length > 0) ebay = "already";
  else if (pending) ebay = "pending";
  else if (input.webConnect !== "ready") ebay = "unavailable";
  else ebay = "none";

  const block: ConnectBlock = input.webConnect !== "ready" ? input.webConnect : input.admin ? null : "not_admin";
  // Jamais de bouton OAuth quand un compte est déjà relié (déjà connecté / succès) ni sans RuName web.
  const canConnect = block === null && (ebay === "none" || ebay === "pending" || (ebay === "error" && active.length === 0));

  const kind: PlatformStateKind = future && ebay !== "success" && ebay !== "error" ? "future" : ebay;

  return {
    kind,
    ebay,
    canConnect,
    block,
    connection: confirmed ?? active[0] ?? null,
    error: ebay === "error" && errorParam ? { code: knownErrorCode(errorParam), message: oauthErrorMessage(errorParam) ?? "" } : null,
    future,
    pendingSince: pending ? input.pendingSince : null,
    unconfirmedReturn,
    readFailed: input.connectionsReadFailed === true,
    admin: input.admin,
  };
}

/** Étapes du flux OAuth affichées pendant l'attente (aucune n'est cochée sans preuve du serveur). */
export const PENDING_STEPS = [
  { key: "request", label: "Demande d'autorisation enregistrée", detail: "Par MON STOCK, pour cette organisation" },
  { key: "ebay", label: "Autorisation sur la page d'eBay", detail: "Vous vous connectez chez eBay, jamais ici" },
  { key: "confirm", label: "Confirmation par le serveur", detail: "Compte lu et jetons enregistrés, chiffrés" },
  { key: "ready", label: "Stock central relié", detail: "Annonces et commandes prêtes à être lues" },
] as const;
