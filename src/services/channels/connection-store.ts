import "server-only";
import type { ChannelConnection, ChannelProvider } from "@/db/types";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { AppError, fromPostgrestError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { ConnectorError, isConnectorError, RECONNECT_ACTION } from "@/integrations/core/errors";
import type { ConnectorAuth } from "@/integrations/core/connector";
import type { AccountInfo, TokenSet } from "@/integrations/core/types";
import { getConnector } from "@/integrations/core/registry";
import { connectionExpiredKey, resolveAlerts, syncFailedKey, upsertAlert } from "@/services/sync/alerts";
import { sanitizeMessage } from "@/services/sync/context";

const log = createLogger("CONNECTIONS");

const PROVIDER_LABEL: Record<ChannelProvider, string> = { ebay: "eBay", amazon: "Amazon", shopify: "Shopify", woocommerce: "WooCommerce", manual: "Ventes manuelles" };

/**
 * Service de stockage des connexions et de leurs tokens.
 * - Les tokens sont chiffrés (AES-256-GCM) dans channel_connection_secrets, table sans policy RLS :
 *   seul ce module (service_role) y accède. Aucun token n'est jamais renvoyé à une page.
 * - Toute requête est scoppée par organisation lorsqu'elle provient d'une action utilisateur.
 */

export async function loadConnection(connectionId: string): Promise<ChannelConnection | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("channel_connections").select("*").eq("id", connectionId).maybeSingle();
  if (error) throw fromPostgrestError(error);
  return data ?? null;
}

export async function loadConnectionForOrg(connectionId: string, organizationId: string): Promise<ChannelConnection | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("channel_connections").select("*").eq("id", connectionId).eq("organization_id", organizationId).maybeSingle();
  if (error) throw fromPostgrestError(error);
  return data ?? null;
}

/** Connexions actives dont la synchronisation automatique est due (cron). */
export async function listDueConnections(now: Date = new Date()): Promise<ChannelConnection[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("channel_connections")
    .select("*")
    .in("status", ["connected", "error"])
    .eq("auto_sync", true)
    .order("last_sync_at", { ascending: true, nullsFirst: true })
    .limit(200);
  if (error) throw fromPostgrestError(error);
  return (data ?? []).filter((c) => {
    if (!c.last_sync_at) return true;
    const due = new Date(c.last_sync_at).getTime() + c.sync_interval_minutes * 60_000;
    return due <= now.getTime();
  });
}

export async function findConnectionsByExternalAccount(provider: ChannelProvider, account: { userId?: string | null; username?: string | null }): Promise<ChannelConnection[]> {
  const admin = createAdminSupabaseClient();
  const found = new Map<string, ChannelConnection>();
  // Requêtes paramétrées séparées (pas de filtre `.or()` construit par concaténation : les pseudos eBay peuvent contenir des points).
  if (account.userId) {
    const { data, error } = await admin.from("channel_connections").select("*").eq("provider", provider).eq("external_account_id", account.userId);
    if (error) throw fromPostgrestError(error);
    for (const c of data ?? []) found.set(c.id, c);
  }
  if (account.username) {
    const { data, error } = await admin.from("channel_connections").select("*").eq("provider", provider).eq("external_username", account.username);
    if (error) throw fromPostgrestError(error);
    for (const c of data ?? []) found.set(c.id, c);
  }
  return Array.from(found.values());
}

export async function saveConnectionTokens(connectionId: string, tokens: TokenSet): Promise<void> {
  const admin = createAdminSupabaseClient();
  const { error: secretsError } = await admin.from("channel_connection_secrets").upsert(
    {
      connection_id: connectionId,
      access_token_enc: encryptSecret(tokens.accessToken),
      ...(tokens.refreshToken ? { refresh_token_enc: encryptSecret(tokens.refreshToken) } : {}),
      key_version: 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connection_id" },
  );
  if (secretsError) throw fromPostgrestError(secretsError);
  const { error } = await admin
    .from("channel_connections")
    .update({
      token_expires_at: tokens.accessTokenExpiresAt.toISOString(),
      ...(tokens.refreshTokenExpiresAt ? { refresh_token_expires_at: tokens.refreshTokenExpiresAt.toISOString() } : {}),
    })
    .eq("id", connectionId);
  if (error) throw fromPostgrestError(error);
}

export interface UpsertConnectionInput {
  organizationId: string;
  userId: string | null;
  provider: ChannelProvider;
  environment: "production" | "sandbox";
  account: AccountInfo;
  tokens: TokenSet;
  scopes: string[];
}

/**
 * Crée (ou réactive) la connexion d'un compte marketplace : canal de vente + connexion +
 * secrets chiffrés. Une connexion existante pour le même compte externe est réutilisée
 * (ses annonces, commandes et associations sont conservées).
 */
export async function upsertOAuthConnection(input: UpsertConnectionInput): Promise<{ connection: ChannelConnection; isNew: boolean }> {
  const admin = createAdminSupabaseClient();
  const nowIso = new Date().toISOString();
  const label = PROVIDER_LABEL[input.provider];

  const { data: existingList, error: listError } = await admin
    .from("channel_connections")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("provider", input.provider)
    .order("created_at", { ascending: true });
  if (listError) throw fromPostgrestError(listError);

  // Réutilisation uniquement pour le MÊME compte externe (ou une connexion jamais finalisée) :
  // un autre compte eBay obtient sa propre connexion et son propre canal, sans hériter des annonces/commandes.
  const existing =
    (existingList ?? []).find((c) => c.external_account_id === input.account.externalAccountId) ??
    (existingList ?? []).find((c) => !c.external_account_id && c.status === "pending") ??
    null;

  const patch = {
    status: "connected" as const,
    environment: input.environment,
    external_account_id: input.account.externalAccountId,
    external_username: input.account.username,
    scopes: input.scopes,
    connected_at: nowIso,
    disconnected_at: null,
    last_error: null,
    token_expires_at: input.tokens.accessTokenExpiresAt.toISOString(),
    refresh_token_expires_at: input.tokens.refreshTokenExpiresAt?.toISOString() ?? null,
  };

  let connection: ChannelConnection;
  let isNew = false;
  if (existing) {
    const { data, error } = await admin.from("channel_connections").update(patch).eq("id", existing.id).select("*").single();
    if (error) throw fromPostgrestError(error);
    connection = data;
    await admin.from("sales_channels").update({ name: `${label} · ${input.account.username}`, is_active: true }).eq("id", existing.sales_channel_id);
  } else {
    const { data: org } = await admin.from("organizations").select("default_currency").eq("id", input.organizationId).maybeSingle();
    const { data: channel, error: channelError } = await admin
      .from("sales_channels")
      .insert({ organization_id: input.organizationId, provider: input.provider, name: `${label} · ${input.account.username}`, currency: org?.default_currency ?? "EUR" })
      .select("*")
      .single();
    if (channelError) throw fromPostgrestError(channelError);
    const { data, error } = await admin
      .from("channel_connections")
      .insert({ organization_id: input.organizationId, sales_channel_id: channel.id, provider: input.provider, ...patch })
      .select("*")
      .single();
    if (error) throw fromPostgrestError(error);
    connection = data;
    isNew = true;
  }

  await saveConnectionTokens(connection.id, input.tokens);
  await resolveAlerts(admin, input.organizationId, [connectionExpiredKey(connection.id), syncFailedKey(connection.id)]);
  log.info("connexion enregistrée", { provider: input.provider, connectionId: connection.id, orgId: input.organizationId, isNew, username: input.account.username });
  return { connection, isNew };
}

/**
 * Passe la connexion en 'expired' et crée l'alerte critique « Reconnecter ». Sans effet sur une
 * connexion déconnectée volontairement (une synchronisation en cours ne doit pas la « réveiller »).
 */
export async function markConnectionExpired(connectionId: string, reason: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  const cleanReason = sanitizeMessage(reason, 500);
  const { data } = await admin
    .from("channel_connections")
    .update({ status: "expired", last_error: cleanReason })
    .eq("id", connectionId)
    .neq("status", "disconnected")
    .select("organization_id, provider, external_username")
    .maybeSingle();
  if (data) {
    await upsertAlert(admin, {
      organizationId: data.organization_id,
      type: "connection_expired",
      severity: "critical",
      title: `Connexion ${PROVIDER_LABEL[data.provider]} expirée`,
      message: `${cleanReason} Reconnectez votre compte ${PROVIDER_LABEL[data.provider]}${data.external_username ? ` (${data.external_username})` : ""} pour reprendre la synchronisation.`,
      dedupeKey: connectionExpiredKey(connectionId),
      entityType: "channel_connection",
      entityId: connectionId,
      actionHref: "/settings/integrations",
    });
    log.warn("connexion marquée expirée", { connectionId, reason: cleanReason });
  }
}

function expired(connectionId: string, message: string, details: Record<string, unknown> = {}): ConnectorError {
  return new ConnectorError("AUTH_EXPIRED", "ebay", message, { details: { connectionId, ...details }, retryable: false });
}

/** Marge avant expiration de l'access token en deçà de laquelle on rafraîchit (eBay : tokens de 2 h ; un run peut durer 5 min). */
export const ACCESS_TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;

/** Rafraîchissements en cours dans ce processus : deux appels simultanés partagent le même rafraîchissement. */
const inflightRefresh = new Map<string, Promise<string>>();

interface TokenState {
  connection: ChannelConnection;
  secrets: { access_token_enc: string | null; refresh_token_enc: string | null } | null;
}

async function loadTokenState(connectionId: string): Promise<TokenState> {
  const admin = createAdminSupabaseClient();
  const connection = await loadConnection(connectionId);
  if (!connection) throw new AppError("NOT_FOUND", "Connexion introuvable.");
  const { data: secrets, error } = await admin.from("channel_connection_secrets").select("access_token_enc, refresh_token_enc").eq("connection_id", connectionId).maybeSingle();
  if (error) throw fromPostgrestError(error);
  return { connection, secrets: secrets ?? null };
}

function accessTokenIsFresh(state: TokenState, now: number): boolean {
  const expiresAt = state.connection.token_expires_at ? new Date(state.connection.token_expires_at).getTime() : 0;
  return Boolean(state.secrets?.access_token_enc) && expiresAt - now > ACCESS_TOKEN_REFRESH_MARGIN_MS;
}

/**
 * Renvoie un access token valide pour la connexion : déchiffre, rafraîchit automatiquement
 * s'il expire dans moins de 5 min (ou si `forceRefresh`, après un 401), persiste le nouveau
 * token de façon atomique (compare-and-set). En cas d'invalid_grant / refresh token expiré /
 * secret indéchiffrable, la connexion passe en 'expired' (alerte critique « Reconnecter eBay »)
 * et l'erreur AUTH_EXPIRED est levée.
 */
export async function getValidAccessToken(connectionId: string, options: { forceRefresh?: boolean } = {}): Promise<string> {
  const state = await loadTokenState(connectionId);
  const { connection, secrets } = state;
  if (connection.status === "disconnected") {
    throw expired(connectionId, "Cette connexion a été déconnectée : reconnectez votre compte pour reprendre la synchronisation.");
  }
  if (!secrets || (!secrets.access_token_enc && !secrets.refresh_token_enc)) {
    await markConnectionExpired(connectionId, "Aucun token enregistré pour cette connexion.");
    throw expired(connectionId, "Impossible de synchroniser : aucun token d'autorisation enregistré. Reconnectez votre compte.");
  }

  const now = Date.now();
  if (!options.forceRefresh && accessTokenIsFresh(state, now) && secrets.access_token_enc) {
    return safeDecrypt(connectionId, secrets.access_token_enc);
  }

  if (!secrets.refresh_token_enc) {
    await markConnectionExpired(connectionId, "Le token d'accès a expiré et aucun refresh token n'est disponible.");
    throw expired(connectionId, "Impossible de synchroniser eBay : le token d'autorisation a expiré.");
  }
  if (connection.refresh_token_expires_at && new Date(connection.refresh_token_expires_at).getTime() <= now) {
    await markConnectionExpired(connectionId, "L'autorisation eBay (refresh token, validité ~18 mois) a expiré.");
    throw expired(connectionId, "Impossible de synchroniser eBay : l'autorisation accordée a expiré (refresh token de 18 mois). Reconnectez votre compte.");
  }

  const pending = inflightRefresh.get(connectionId);
  if (pending) return pending;
  const refreshEnc = secrets.refresh_token_enc;
  const promise = refreshAndStore(connection, refreshEnc).finally(() => inflightRefresh.delete(connectionId));
  inflightRefresh.set(connectionId, promise);
  return promise;
}

async function refreshAndStore(connection: ChannelConnection, refreshEnc: string): Promise<string> {
  const admin = createAdminSupabaseClient();
  const connectionId = connection.id;
  const connector = getConnector(connection.provider);
  const refreshToken = await safeDecrypt(connectionId, refreshEnc);
  let tokens: TokenSet;
  try {
    tokens = await connector.refreshToken(refreshToken);
  } catch (e) {
    if (isConnectorError(e) && e.code === "AUTH_EXPIRED") {
      // Une reconnexion a pu remplacer le refresh token pendant l'appel : on ne marque pas expirée
      // une connexion fraîchement réautorisée, on relit simplement ses tokens.
      const latest = await loadTokenState(connectionId).catch(() => null);
      if (latest?.secrets?.refresh_token_enc && latest.secrets.refresh_token_enc !== refreshEnc && latest.connection.status !== "disconnected") {
        log.info("refresh token remplacé pendant le rafraîchissement (reconnexion) : la connexion n'est pas marquée expirée", { connectionId });
        if (latest.secrets.access_token_enc && accessTokenIsFresh(latest, Date.now())) return safeDecrypt(connectionId, latest.secrets.access_token_enc);
        throw e;
      }
      await markConnectionExpired(connectionId, e.message);
    }
    throw e;
  }

  const { data: outcome, error } = await admin.rpc("store_refreshed_access_token", {
    p_connection_id: connectionId,
    p_access_token_enc: encryptSecret(tokens.accessToken),
    p_expires_at: tokens.accessTokenExpiresAt.toISOString(),
    p_refresh_token_enc_used: refreshEnc,
  });
  if (error) {
    // Le token obtenu reste valide : la synchronisation peut continuer ; il sera redemandé au prochain run.
    log.error("token rafraîchi mais non enregistré", { connectionId, error: error.message });
    return tokens.accessToken;
  }
  if (outcome === "disconnected") {
    throw expired(connectionId, "La connexion a été déconnectée pendant la synchronisation : aucun token n'a été conservé.");
  }
  if (outcome === "stale") {
    // Un autre processus a enregistré un token plus récent, ou le compte a été reconnecté : on utilise le token en base.
    const latest = await loadTokenState(connectionId);
    if (latest.secrets?.access_token_enc && accessTokenIsFresh(latest, Date.now())) {
      log.info("token plus récent déjà enregistré par un autre processus", { connectionId });
      return safeDecrypt(connectionId, latest.secrets.access_token_enc);
    }
    return tokens.accessToken;
  }
  log.info("access token rafraîchi", { connectionId, provider: connection.provider, expiresAt: tokens.accessTokenExpiresAt.toISOString() });
  return tokens.accessToken;
}

/** Déchiffre un secret ; en cas d'échec (clé TOKEN_ENCRYPTION_KEY changée, donnée corrompue) la connexion passe en 'expired'. */
async function safeDecrypt(connectionId: string, payload: string): Promise<string> {
  try {
    return decryptSecret(payload);
  } catch {
    const message = "Les tokens eBay enregistrés ne peuvent pas être déchiffrés (la clé TOKEN_ENCRYPTION_KEY du serveur a probablement changé). Reconnectez votre compte eBay.";
    await markConnectionExpired(connectionId, message);
    throw new ConnectorError("AUTH_EXPIRED", "ebay", message, { details: { connectionId, reason: "decrypt_failed" }, retryable: false });
  }
}

/** Objet ConnectorAuth lié à une connexion (utilisé par le moteur de sync et les actions). */
export function connectorAuthFor(connectionId: string): ConnectorAuth {
  return { getAccessToken: (options) => getValidAccessToken(connectionId, options) };
}

/**
 * Déconnexion : suppression des secrets, statut 'disconnected', tentative de révocation distante
 * (eBay ne propose pas d'API de révocation : la note explique au vendeur comment faire côté eBay).
 */
export async function disconnectConnection(connectionId: string, organizationId: string): Promise<{ revoked: boolean; note: string }> {
  const admin = createAdminSupabaseClient();
  const connection = await loadConnectionForOrg(connectionId, organizationId);
  if (!connection) throw new AppError("NOT_FOUND", "Connexion introuvable dans votre organisation.");
  const connector = getConnector(connection.provider);
  let revoked = false;
  let note = "";
  try {
    const result = await connector.revoke(connectorAuthFor(connectionId));
    revoked = result.revoked;
    note = result.note;
  } catch (e) {
    note = `Révocation distante impossible (${e instanceof Error ? e.message : String(e)}). Les tokens ont été supprimés de MON STOCK.`;
  }
  const { error: delError } = await admin.from("channel_connection_secrets").delete().eq("connection_id", connectionId);
  if (delError) throw fromPostgrestError(delError);
  const { error } = await admin
    .from("channel_connections")
    .update({ status: "disconnected", disconnected_at: new Date().toISOString(), token_expires_at: null, refresh_token_expires_at: null, last_error: null })
    .eq("id", connectionId)
    .eq("organization_id", organizationId);
  if (error) throw fromPostgrestError(error);
  await resolveAlerts(admin, organizationId, [connectionExpiredKey(connectionId), syncFailedKey(connectionId)]);
  log.info("connexion déconnectée", { connectionId, orgId: organizationId, revoked });
  return { revoked, note };
}

export { RECONNECT_ACTION };
