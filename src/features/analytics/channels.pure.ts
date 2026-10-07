/** État des canaux de vente à partir de sales_channels + channel_connections (jamais supposé connecté). */

export type ChannelState = "connected" | "expired" | "error" | "not_connected" | "coming_soon" | "manual";

export interface ChannelLike {
  id: string;
  provider: string;
  name: string;
  is_active: boolean;
}

export interface ConnectionLike {
  sales_channel_id: string;
  status: string;
  refresh_token_expires_at: string | null;
  last_error: string | null;
  last_successful_sync_at: string | null;
  last_sync_at: string | null;
  external_username: string | null;
}

export interface ChannelCard {
  key: string;
  channelId: string | null;
  provider: string;
  name: string;
  state: ChannelState;
  label: string;
  detail: string | null;
  href: string;
  lastSuccessfulSyncAt: string | null;
}

export const PROVIDER_LABEL: Record<string, string> = { ebay: "eBay", amazon: "Amazon", shopify: "Shopify", woocommerce: "WooCommerce", manual: "Ventes manuelles" };
export const CHANNEL_STATE_LABEL: Record<ChannelState, string> = {
  connected: "Connecté",
  expired: "Connexion expirée",
  error: "Erreur",
  not_connected: "Non connecté",
  coming_soon: "Disponible prochainement",
  manual: "Saisie manuelle",
};

const COMING_SOON = new Set(["amazon", "shopify", "woocommerce"]);

export function deriveConnectionState(provider: string, connection: ConnectionLike | null, now: Date): { state: ChannelState; detail: string | null } {
  if (provider === "manual") return { state: "manual", detail: null };
  if (COMING_SOON.has(provider)) return { state: "coming_soon", detail: null };
  if (!connection) return { state: "not_connected", detail: null };
  switch (connection.status) {
    case "connected": {
      const refreshExp = connection.refresh_token_expires_at ? new Date(connection.refresh_token_expires_at).getTime() : null;
      if (refreshExp !== null && refreshExp <= now.getTime()) return { state: "expired", detail: "Le jeton de connexion a expiré : reconnectez le compte." };
      return { state: "connected", detail: connection.external_username ? `Compte ${connection.external_username}` : null };
    }
    case "expired":
      return { state: "expired", detail: "Le jeton de connexion a expiré : reconnectez le compte." };
    case "error":
      return { state: "error", detail: connection.last_error ?? "Dernière synchronisation en erreur." };
    case "pending":
    case "disconnected":
    default:
      return { state: "not_connected", detail: null };
  }
}

/** Cartes « Canaux » : canaux existants + eBay (si absent) + Amazon/Shopify annoncés comme à venir. */
export function buildChannelCards(channels: readonly ChannelLike[], connections: readonly ConnectionLike[], now: Date): ChannelCard[] {
  const byChannel = new Map(connections.map((c) => [c.sales_channel_id, c] as const));
  const cards: ChannelCard[] = [];
  for (const ch of channels) {
    if (!ch.is_active) continue;
    const conn = byChannel.get(ch.id) ?? null;
    const { state, detail } = deriveConnectionState(ch.provider, conn, now);
    cards.push({
      key: ch.id,
      channelId: ch.id,
      provider: ch.provider,
      name: ch.name,
      state,
      label: CHANNEL_STATE_LABEL[state],
      detail,
      href: ch.provider === "manual" ? "/sales" : "/settings/integrations",
      lastSuccessfulSyncAt: conn?.last_successful_sync_at ?? null,
    });
  }
  const providers = new Set(cards.map((c) => c.provider));
  if (!providers.has("ebay")) cards.push({ key: "placeholder:ebay", channelId: null, provider: "ebay", name: "eBay", state: "not_connected", label: CHANNEL_STATE_LABEL.not_connected, detail: "Importez vos annonces et vos ventes.", href: "/settings/integrations", lastSuccessfulSyncAt: null });
  for (const p of ["amazon", "shopify"]) {
    if (!providers.has(p)) cards.push({ key: `placeholder:${p}`, channelId: null, provider: p, name: PROVIDER_LABEL[p] ?? p, state: "coming_soon", label: CHANNEL_STATE_LABEL.coming_soon, detail: null, href: "/settings/integrations", lastSuccessfulSyncAt: null });
  }
  const order: Record<ChannelState, number> = { error: 0, expired: 1, connected: 2, not_connected: 3, manual: 4, coming_soon: 5 };
  return cards.sort((a, b) => order[a.state] - order[b.state] || a.name.localeCompare(b.name, "fr"));
}
