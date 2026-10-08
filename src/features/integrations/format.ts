import type { Json } from "@/db/database.types";
import type { SyncStats } from "@/services/sync/engine";
import { formatNumber } from "@/lib/format";

/** Module pur : libellés et résumé d'un run (utilisé par les pages et testé unitairement). */

export const SYNC_STATUS_LABEL: Record<string, string> = { running: "En cours", success: "Réussie", partial: "Partielle", failed: "Échouée" };
export const SYNC_TRIGGER_LABEL: Record<string, string> = { manual: "Manuelle", scheduled: "Planifiée", webhook: "Webhook", initial: "Initiale" };
export const CONNECTION_STATUS_LABEL: Record<string, string> = { pending: "En attente", connected: "Connecté", expired: "Expirée", error: "Erreur", disconnected: "Déconnecté" };
export const MAPPING_SOURCE_LABEL: Record<string, string> = { auto_sku_match: "SKU identique (auto)", manual: "Manuelle", suggestion_accepted: "Suggestion validée" };
export const SUGGESTION_METHOD_LABEL: Record<string, string> = { ean: "EAN identique", sku_partial: "SKU proche", attributes: "Titre + attributs", title_similarity: "Similarité du titre" };
export const PROVIDER_LABEL: Record<string, string> = {
  ebay: "eBay",
  amazon: "Amazon",
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  manual: "Ventes manuelles",
  // Sourcing (runs des sources fournisseurs et des recherches en direct, provider = clé d'adaptateur)
  public_web: "Page publique",
  csv: "Flux CSV",
  xml: "Flux XML",
  json: "Flux JSON",
  live_search: "Recherche en direct",
  "jsonld-public": "Page publique (JSON-LD)",
  "shopify-storefront": "Boutique Shopify (JSON public)",
  "woocommerce-store": "Boutique WooCommerce (Store API)",
  "google-merchant-feed": "Flux Google Merchant",
  bigbuy: "BigBuy (compte fournisseur)",
  "ingram-micro": "Ingram Micro (compte fournisseur)",
};

export function readStats(stats: Json | null | undefined): SyncStats {
  const s = stats && typeof stats === "object" && !Array.isArray(stats) ? stats : {};
  const num = (k: keyof SyncStats) => {
    const v = (s as Record<string, unknown>)[k];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  };
  return {
    listings_fetched: num("listings_fetched"),
    listings_upserted: num("listings_upserted"),
    listings_ended: num("listings_ended"),
    listings_auto_mapped: num("listings_auto_mapped"),
    suggestions_created: num("suggestions_created"),
    orders_fetched: num("orders_fetched"),
    orders_created: num("orders_created"),
    orders_updated: num("orders_updated"),
    items_unmapped: num("items_unmapped"),
    inventory_changes: num("inventory_changes"),
    inventory_pushed: num("inventory_pushed"),
    errors: num("errors"),
  };
}

function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatNumber(n)} ${n > 1 ? pluralForm : singular}`;
}

/** « ✓ Réussie · 247 listings analysés · 13 commandes récupérées · 4 stocks modifiés · 0 erreur » */
export function formatRunSummary(run: { status: string; stats: Json | null; error_count?: number | null }): string {
  const stats = readStats(run.stats);
  const icon = run.status === "success" ? "✓" : run.status === "partial" ? "⚠" : run.status === "failed" ? "✗" : "…";
  const errors = run.error_count ?? stats.errors;
  const parts = [
    `${icon} ${SYNC_STATUS_LABEL[run.status] ?? run.status}`,
    `${plural(stats.listings_fetched, "listing analysé", "listings analysés")}`,
    `${plural(stats.orders_fetched, "commande récupérée", "commandes récupérées")}`,
    `${plural(stats.inventory_changes, "stock modifié", "stocks modifiés")}`,
    `${plural(errors, "erreur")}`,
  ];
  return parts.join(" · ");
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}

export function confidenceLabel(c: number): string {
  return `${Math.round(c * 100)} %`;
}
