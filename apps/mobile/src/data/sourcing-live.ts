import type { SourcingOfferDTO, SourcingSearchDTO } from "@/features/mobile-api/contract";
import { callApi } from "~/lib/api";

/**
 * Recherche fournisseurs EN DIRECT (serveur) et bibliothèque de sources vérifiées.
 * Le téléphone n'interroge jamais un site fournisseur lui-même : robots.txt, politesse, clés
 * d'API et stockage des offres sont gérés par le serveur (Edge Function `api`).
 */

export type OfferClass = "verified" | "published" | "indicative";

export const OFFER_CLASS_LABEL: Record<OfferClass, string> = {
  verified: "Disponibilité vérifiée",
  published: "Offre publiée",
  indicative: "Prix indicatif",
};

export const OFFER_CLASS_HELP: Record<OfferClass, string> = {
  verified: "La source indique un stock disponible, relevé il y a moins de 24 h.",
  published: "Annonce ou fiche produit publique relevée par le serveur ; la disponibilité n'est pas garantie.",
  indicative: "Prix issu d'un flux, d'une saisie ou d'un relevé ancien : à confirmer auprès du fournisseur.",
};

const LIVE_METHODS = new Set(["official_api", "public_json", "public_html", "supplier_account"]);

/**
 * Classe honnête d'une offre :
 *   - « disponibilité vérifiée » : quantité > 0 fournie par la source ET relevé < 24 h ;
 *   - « offre publiée » : relevée en direct (API officielle, page/JSON public, compte) il y a < 7 j ;
 *   - « prix indicatif » : tout le reste (flux, saisie manuelle, relevé ancien ou inconnu).
 */
export function classifyOffer(o: Pick<SourcingOfferDTO, "quantityAvailable" | "stockStatus" | "provenance" | "lastSeenAt">, now: Date = new Date()): OfferClass {
  const seen = o.provenance?.retrievedAt ?? o.lastSeenAt;
  const ageH = seen ? (now.getTime() - new Date(seen).getTime()) / 3_600_000 : Number.POSITIVE_INFINITY;
  if (o.quantityAvailable !== null && o.quantityAvailable > 0 && o.stockStatus !== "out_of_stock" && ageH < 24) return "verified";
  if (o.provenance?.method && LIVE_METHODS.has(o.provenance.method) && ageH < 24 * 7) return "published";
  return "indicative";
}

export const SOURCE_STATUS_LABEL: Record<string, string> = {
  ok: "interrogée",
  cached: "résultat récent (cache)",
  error: "erreur",
  timeout: "délai dépassé",
  skipped: "ignorée",
  no_search: "pas de recherche en direct",
  not_attested: "accès non attesté",
  account_required: "compte requis",
  robots_disallowed: "interdit par robots.txt",
};

export async function searchOffers(organizationId: string, q: string, options: { live?: boolean; sku?: string; qty?: number } = {}): Promise<SourcingSearchDTO> {
  return callApi<SourcingSearchDTO>("/sourcing/search", {
    organizationId,
    query: { q, live: options.live === false ? "0" : "1", sku: options.sku, qty: options.qty },
    timeoutMs: 90_000,
  });
}

export interface LibraryEntry {
  key: string;
  name: string;
  website: string;
  segment: "parts" | "refurbished" | "lots" | "marketplace";
  country: string;
  currency: string;
  access: "public_json" | "public_html" | "official_api";
  termsUrl: string;
  notes: string;
  check: { status: string; checkedAt: string; productCount: number | null; message: string | null; sample: unknown } | null;
  activatable: boolean;
  sourceId: string | null;
}

export const LIBRARY_SEGMENT_LABEL: Record<LibraryEntry["segment"], string> = {
  parts: "Pièces détachées",
  refurbished: "Reconditionné",
  lots: "Lots / déstockage",
  marketplace: "Marketplace (API officielle)",
};

export const LIBRARY_ACCESS_LABEL: Record<LibraryEntry["access"], string> = {
  official_api: "API officielle",
  public_json: "Catalogue public (JSON)",
  public_html: "Catalogue public (plan du site + données structurées)",
};

export const CHECK_STATUS_LABEL: Record<string, string> = {
  ok: "Vérifiée en direct",
  robots_disallowed: "Refusée : robots.txt interdit l'accès",
  no_products: "Aucun produit avec prix trouvé",
  http_error: "Pas de catalogue lisible publiquement",
  unreachable: "Site injoignable",
  not_configured: "Clés requises sur le serveur",
};

export async function fetchLibrary(organizationId: string): Promise<{ entries: LibraryEntry[] }> {
  return callApi<{ entries: LibraryEntry[] }>("/sourcing/library", { organizationId });
}

export async function activateLibrarySource(organizationId: string, key: string): Promise<{ sourceId: string; supplierId: string; alreadyActive: boolean }> {
  return callApi("/sourcing/library/activate", { method: "POST", organizationId, body: { key, attest: true } });
}

/** Exemples d'offres relevées lors de la vérification (preuve affichée telle quelle). */
export function sampleOf(entry: LibraryEntry): Array<{ title: string; price: number | null; currency: string | null }> {
  const s = entry.check?.sample;
  if (!Array.isArray(s)) return [];
  return s
    .filter((x): x is { title: string; price: number | null; currency: string | null } => Boolean(x) && typeof (x as { title?: unknown }).title === "string")
    .slice(0, 3);
}
