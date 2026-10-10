import * as WebBrowser from "expo-web-browser";
import type { EbayListingCheckDTO, EbayListingDraftDTO, EbayListingPrefillDTO, EbayPoliciesDTO, IntegrationsDTO } from "@/features/mobile-api/contract";
import { callApi } from "~/lib/api";
import type { MobileSupabase } from "~/lib/supabase";
import { UserFacingError, userMessage } from "~/lib/errors";

/**
 * eBay depuis l'application : toute opération qui manipule des tokens eBay s'exécute sur le
 * serveur (Edge Function). Le téléphone ouvre seulement la page d'autorisation d'eBay dans une
 * session d'authentification système (ASWebAuthenticationSession), récupère code + état via le
 * lien profond monstock://ebay/callback, et les transmet au serveur sous la session de
 * l'utilisateur qui a démarré le flux.
 */
export const EBAY_CALLBACK_URL = "monstock://ebay/callback";

export const EBAY_CALLBACK_ERRORS: Record<string, string> = {
  access_denied: "Vous avez refusé l'autorisation sur eBay : aucune connexion n'a été créée.",
  ebay_error: "eBay a renvoyé une erreur pendant l'autorisation. Réessayez ; si le problème persiste, vérifiez la configuration (RuName, environnement).",
  incomplete: "Retour d'eBay incomplet. Relancez la connexion.",
};

export function fetchIntegrations(organizationId: string): Promise<IntegrationsDTO> {
  return callApi<IntegrationsDTO>("/integrations", { organizationId });
}

/** Lit le retour d'eBay relayé par le serveur (`monstock://ebay/callback?code&state` ou `?error`). */
export function parseEbayCallback(url: string): { code: string; state: string } | { error: string } {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { error: EBAY_CALLBACK_ERRORS.incomplete! };
  }
  const err = u.searchParams.get("error");
  if (err) return { error: EBAY_CALLBACK_ERRORS[err] ?? EBAY_CALLBACK_ERRORS.ebay_error! };
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  if (!code || !state) return { error: EBAY_CALLBACK_ERRORS.incomplete! };
  return { code, state };
}

export interface EbayConnectResult {
  connectionId: string;
  username: string | null;
  environment: string;
  isNew: boolean;
  sync: { status: string; summary: string } | null;
  syncError: string | null;
}

export type OpenAuthSession = (url: string, redirect: string) => Promise<{ type: string; url?: string }>;

const defaultOpenAuthSession: OpenAuthSession = async (url, redirect) => {
  const r = await WebBrowser.openAuthSessionAsync(url, redirect, { preferEphemeralSession: false });
  return r.type === "success" ? { type: "success", url: r.url } : { type: r.type };
};

/** Connexion complète : autorisation eBay → finalisation serveur → première synchronisation. */
export async function connectEbay(organizationId: string, openAuthSession: OpenAuthSession = defaultOpenAuthSession): Promise<EbayConnectResult | null> {
  const start = await callApi<{ authorizeUrl: string; callbackScheme: string; environment: string | null }>("/ebay/connect", { method: "POST", organizationId });
  const session = await openAuthSession(start.authorizeUrl, EBAY_CALLBACK_URL);
  if (session.type !== "success" || !session.url) return null; // fenêtre fermée par l'utilisateur : rien n'est créé
  const parsed = parseEbayCallback(session.url);
  if ("error" in parsed) throw new UserFacingError(parsed.error, "EBAY_AUTH");
  const done = await callApi<{ connectionId: string; isNew: boolean; username: string | null; environment: string }>("/ebay/finalize", { method: "POST", organizationId, body: parsed, timeoutMs: 60_000 });
  let sync: EbayConnectResult["sync"] = null;
  let syncError: string | null = null;
  try {
    const r = await syncEbay(organizationId, done.connectionId);
    sync = { status: r.status, summary: r.summary };
  } catch (e) {
    syncError = userMessage(e);
  }
  return { ...done, sync, syncError };
}

export interface SyncResult {
  runId: string;
  status: string;
  durationMs: number;
  summary: string;
  errorSummary: string | null;
}

export function syncEbay(organizationId: string, connectionId: string, scope: "full" | "listings" | "orders" = "full"): Promise<SyncResult> {
  return callApi<SyncResult>("/ebay/sync", { method: "POST", organizationId, body: { connectionId, scope }, timeoutMs: 150_000 });
}

export function fetchListingPrefill(organizationId: string, skuId: string): Promise<EbayListingPrefillDTO> {
  return callApi("/ebay/listings/prefill", { organizationId, query: { skuId } });
}

export function fetchEbayAccountSetup(organizationId: string): Promise<EbayPoliciesDTO> {
  return callApi("/ebay/account-setup", { organizationId, timeoutMs: 60_000 });
}

/** Contrôle et simulation : rien n'est envoyé à eBay. */
export function checkEbayListing(organizationId: string, draft: EbayListingDraftDTO): Promise<EbayListingCheckDTO> {
  return callApi("/ebay/listings/check", { method: "POST", organizationId, body: { draft } });
}

/** Publication réelle — refusée par le serveur sans les trois verrous (activation serveur, administrateur, confirmation). */
export function publishEbayListing(organizationId: string, draft: EbayListingDraftDTO): Promise<{ sku: string; offerId: string; listingId: string | null; createdOffer: boolean }> {
  return callApi("/ebay/listings/publish", { method: "POST", organizationId, body: { draft, confirm: true }, timeoutMs: 120_000 });
}

/** Déconnexion (administrateur) : tokens supprimés du serveur ; l'autorisation se retire aussi côté eBay. */
export function disconnectEbay(organizationId: string, connectionId: string): Promise<{ revoked: boolean; note: string }> {
  return callApi("/ebay/disconnect", { method: "POST", organizationId, body: { connectionId } });
}

// ---------------------------------------------------------------------------------------------
// Association annonce eBay ↔ SKU (fonction SQL existante map_listing_to_sku, sous RLS)
// ---------------------------------------------------------------------------------------------

export interface ListingDetail {
  id: string;
  title: string | null;
  price: number | null;
  currency: string | null;
  quantity_available: number | null;
  status: string;
  external_listing_id: string;
  external_sku: string | null;
  sku_id: string | null;
  mapping_status: string;
  last_synced_at: string | null;
  listing_url: string | null;
  sku: { code: string; product: { name: string } | null } | null;
}

export async function fetchListing(supabase: MobileSupabase, organizationId: string, listingId: string): Promise<ListingDetail | null> {
  const { data, error } = await supabase
    .from("channel_listings")
    .select("id, title, price, currency, quantity_available, status, external_listing_id, external_sku, sku_id, mapping_status, last_synced_at, listing_url, sku:skus(code, product:products(name))")
    .eq("organization_id", organizationId)
    .eq("id", listingId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ListingDetail | null) ?? null;
}

export async function mapListing(supabase: MobileSupabase, listingId: string, skuId: string | null): Promise<void> {
  // p_sku_id NULL = dissocier (la fonction SQL l'accepte ; le type généré ne le reflète pas).
  const { error } = await supabase.rpc("map_listing_to_sku", { p_listing_id: listingId, p_sku_id: skuId as string, p_source: "manual" });
  if (error) throw new UserFacingError(userMessage(error), "REJECTED");
}

/** Déduit du stock les ventes passées rattachées mais non appliquées (action explicite, fonction SQL existante). */
export async function applyPendingSales(supabase: MobileSupabase, skuId: string): Promise<number> {
  const { data, error } = await supabase.rpc("apply_pending_sales_for_sku", { p_sku_id: skuId });
  if (error) throw new UserFacingError(userMessage(error), "REJECTED");
  return typeof data === "number" ? data : 0;
}
