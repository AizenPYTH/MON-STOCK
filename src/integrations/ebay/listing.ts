import { z } from "zod";
import { ConnectorError } from "@/integrations/core/errors";
import type { ConnectorAuth } from "@/integrations/core/connector";
import { fetchWithRetry, readJson } from "@/integrations/core/http";
import { EBAY_PROVIDER } from "@/integrations/ebay/config";
import { summarizeRestErrors } from "@/integrations/ebay/rest";

/**
 * CRÉATION / MISE À JOUR D'ANNONCES eBay — Sell Inventory API (préparé, publication verrouillée).
 *
 * Endpoints officiels utilisés (https://developer.ebay.com/api-docs/sell/inventory/overview.html) :
 *   PUT  /sell/inventory/v1/inventory_item/{sku}            article d'inventaire (idempotent par SKU)
 *   GET  /sell/inventory/v1/offer?sku=…&marketplace_id=…     offre existante (anti-doublon)
 *   POST /sell/inventory/v1/offer · PUT /offer/{offerId}     création / mise à jour de l'offre
 *   POST /sell/inventory/v1/offer/{offerId}/publish          publication → listingId
 *   POST /sell/inventory/v1/bulk_update_price_quantity       prix et quantités
 *
 * Prérequis eBay (sinon les appels échouent) : compte vendeur avec politiques métier (paiement,
 * retour, expédition) et un emplacement d'inventaire (merchantLocationKey) ; catégorie et
 * caractéristiques obligatoires (Taxonomy API) ; état autorisé pour la catégorie (Metadata API
 * getItemConditionPolicies — les états « reconditionnés » peuvent exiger un agrément eBay).
 * Les annonces créées par la Trading API ne sont pas gérables par l'Inventory API sans migration.
 *
 * Verrous : aucune publication sans (1) EBAY_LISTING_ENABLED=true côté serveur, (2) rôle
 * administrateur, (3) confirmation explicite `confirm: true` de l'utilisateur. Sinon : simulation
 * (validation + contenu exact qui serait envoyé), aucun appel à eBay.
 */

export const EBAY_CONDITIONS = [
  "NEW",
  "LIKE_NEW",
  "NEW_OTHER",
  "NEW_WITH_DEFECTS",
  "CERTIFIED_REFURBISHED",
  "EXCELLENT_REFURBISHED",
  "VERY_GOOD_REFURBISHED",
  "GOOD_REFURBISHED",
  "SELLER_REFURBISHED",
  "USED_EXCELLENT",
  "USED_VERY_GOOD",
  "USED_GOOD",
  "USED_ACCEPTABLE",
  "FOR_PARTS_OR_NOT_WORKING",
] as const;

export const EBAY_CONDITION_LABEL: Record<(typeof EBAY_CONDITIONS)[number], string> = {
  NEW: "Neuf",
  LIKE_NEW: "Comme neuf",
  NEW_OTHER: "Neuf autre (sans emballage d'origine)",
  NEW_WITH_DEFECTS: "Neuf avec défauts",
  CERTIFIED_REFURBISHED: "Reconditionné certifié (agrément eBay)",
  EXCELLENT_REFURBISHED: "Reconditionné — excellent état (programme eBay)",
  VERY_GOOD_REFURBISHED: "Reconditionné — très bon état (programme eBay)",
  GOOD_REFURBISHED: "Reconditionné — bon état (programme eBay)",
  SELLER_REFURBISHED: "Reconditionné par le vendeur",
  USED_EXCELLENT: "Occasion — excellent état",
  USED_VERY_GOOD: "Occasion — très bon état",
  USED_GOOD: "Occasion — bon état",
  USED_ACCEPTABLE: "Occasion — état correct",
  FOR_PARTS_OR_NOT_WORKING: "Pour pièces / ne fonctionne pas",
};

/** Caractères autorisés dans un SKU eBay (50 max). */
const SKU_RE = /^[A-Za-z0-9._\-/]{1,50}$/;

export const listingDraftSchema = z.object({
  sku: z.string().trim().regex(SKU_RE, "Code SKU : 50 caractères max (lettres, chiffres, . _ - /)."),
  marketplaceId: z.literal("EBAY_FR").default("EBAY_FR"),
  title: z.string().trim().min(10, "Titre trop court (10 caractères minimum).").max(80, "Titre limité à 80 caractères par eBay."),
  description: z.string().trim().min(20, "Description trop courte (20 caractères minimum).").max(20_000),
  categoryId: z.string().trim().regex(/^\d{1,10}$/, "Catégorie eBay : identifiant numérique (ex. 9355 Téléphones mobiles)."),
  condition: z.enum(EBAY_CONDITIONS),
  conditionDescription: z.string().trim().max(1000).optional(),
  price: z.number().finite().positive("Prix positif requis.").max(1_000_000),
  currency: z.literal("EUR").default("EUR"),
  quantity: z.number().int().min(1, "Quantité d'au moins 1 pour publier.").max(10_000),
  imageUrls: z.array(z.string().url().refine((u) => u.startsWith("https://"), "Images en HTTPS uniquement.")).min(1, "Au moins une photo (URL HTTPS) est exigée par eBay.").max(24, "24 photos maximum."),
  aspects: z.record(z.string().min(1).max(65), z.array(z.string().min(1).max(65)).min(1)).default({}),
  brand: z.string().trim().max(65).optional(),
  mpn: z.string().trim().max(65).optional(),
  ean: z.string().trim().regex(/^\d{8,14}$/, "EAN : 8 à 14 chiffres.").optional(),
  policies: z.object({ fulfillmentPolicyId: z.string().min(1), paymentPolicyId: z.string().min(1), returnPolicyId: z.string().min(1) }).optional(),
  merchantLocationKey: z.string().trim().min(1).max(36).optional(),
});

export type ListingDraft = z.infer<typeof listingDraftSchema>;

export interface ListingCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** Contrôles locaux (avant tout appel eBay). eBay fait foi pour les règles de catégorie. */
export function checkListingDraft(input: unknown): ListingCheck & { draft: ListingDraft | null } {
  const parsed = listingDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "annonce"} : ${i.message}`), warnings: [], draft: null };
  const d = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!d.policies) errors.push("Politiques métier eBay (paiement, retour, expédition) non choisies.");
  if (!d.merchantLocationKey) errors.push("Emplacement d'inventaire eBay (merchantLocationKey) non choisi.");
  const aspectNames = Object.keys(d.aspects).map((a) => a.toLowerCase());
  if (!d.brand && !aspectNames.includes("marque") && !aspectNames.includes("brand")) warnings.push("Marque non renseignée : souvent obligatoire.");
  if (!aspectNames.includes("modèle") && !aspectNames.includes("model")) warnings.push("Caractéristique « Modèle » absente : souvent obligatoire pour les téléphones.");
  if (/[<>]/.test(d.title)) errors.push("Le titre ne doit pas contenir de balises.");
  if (d.title === d.title.toUpperCase() && /[A-Z]{6,}/.test(d.title)) warnings.push("Titre entièrement en majuscules : déconseillé par eBay.");
  if (d.condition.endsWith("_REFURBISHED") && d.condition !== "SELLER_REFURBISHED") warnings.push("État « reconditionné » du programme eBay : vérifiez votre agrément pour cette catégorie.");
  warnings.push("Caractéristiques obligatoires et états autorisés de la catégorie vérifiés par eBay au moment de la publication.");
  return { ok: errors.length === 0, errors, warnings, draft: d };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function descriptionHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function buildInventoryItem(d: ListingDraft) {
  const aspects: Record<string, string[]> = { ...d.aspects };
  if (d.brand && !aspects.Marque) aspects.Marque = [d.brand];
  return {
    availability: { shipToLocationAvailability: { quantity: d.quantity } },
    condition: d.condition,
    ...(d.conditionDescription ? { conditionDescription: d.conditionDescription } : {}),
    product: {
      title: d.title,
      description: descriptionHtml(d.description),
      aspects,
      imageUrls: d.imageUrls,
      ...(d.brand ? { brand: d.brand } : {}),
      ...(d.mpn ? { mpn: d.mpn } : {}),
      ...(d.ean ? { ean: [d.ean] } : {}),
    },
  };
}

export function buildOffer(d: ListingDraft) {
  return {
    sku: d.sku,
    marketplaceId: d.marketplaceId,
    format: "FIXED_PRICE",
    availableQuantity: d.quantity,
    categoryId: d.categoryId,
    listingDescription: descriptionHtml(d.description),
    ...(d.policies ? { listingPolicies: d.policies } : {}),
    ...(d.merchantLocationKey ? { merchantLocationKey: d.merchantLocationKey } : {}),
    pricingSummary: { price: { value: d.price.toFixed(2), currency: d.currency } },
  };
}

type Method = "GET" | "PUT" | "POST";

async function ebayRestSend(auth: ConnectorAuth, method: Method, url: string, label: string, body?: unknown): Promise<{ status: number; json: unknown }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await auth.getAccessToken({ forceRefresh: attempt > 0 });
    const res = await fetchWithRetry(
      url,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Accept-Language": "fr-FR",
          "Content-Language": "fr-FR",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      // POST non idempotent (création d'offre, publication) : jamais rejoué automatiquement (anti-doublon).
      { provider: EBAY_PROVIDER, label, retries: method === "POST" ? 0 : undefined },
    );
    const json = res.status === 204 ? null : await readJson(res, EBAY_PROVIDER);
    if (res.status === 401 && attempt === 0) continue;
    return { status: res.status, json };
  }
  throw new ConnectorError("AUTH_EXPIRED", EBAY_PROVIDER, "Autorisation eBay expirée : reconnectez votre compte.", { retryable: false });
}

function fail(step: string, status: number, json: unknown): never {
  const { message, errorIds } = summarizeRestErrors(json);
  const auth = status === 401 || status === 403;
  throw new ConnectorError(auth ? "AUTH_EXPIRED" : "API_ERROR", EBAY_PROVIDER, `${step} refusé par eBay (HTTP ${status})${message ? ` : ${message}` : ""}.`, {
    httpStatus: status,
    details: { step, errorIds },
    retryable: status >= 500,
  });
}

export interface PublishResult {
  sku: string;
  offerId: string;
  listingId: string | null;
  createdOffer: boolean;
}

/**
 * Publication réelle (appelée UNIQUEMENT après les trois verrous). Anti-doublon : l'article est
 * identifié par le SKU MON STOCK ; une offre existante pour ce SKU et cette place de marché est
 * mise à jour au lieu d'en créer une seconde.
 */
export async function publishListing(auth: ConnectorAuth, apiBase: string, d: ListingDraft): Promise<PublishResult> {
  const base = `${apiBase.replace(/\/+$/, "")}/sell/inventory/v1`;
  const sku = encodeURIComponent(d.sku);

  const item = await ebayRestSend(auth, "PUT", `${base}/inventory_item/${sku}`, "createOrReplaceInventoryItem", buildInventoryItem(d));
  if (item.status >= 300) fail("Enregistrement de l'article", item.status, item.json);

  const existing = await ebayRestSend(auth, "GET", `${base}/offer?sku=${sku}&marketplace_id=${d.marketplaceId}`, "getOffers");
  let offerId: string | null = null;
  if (existing.status === 200) {
    const offers = (existing.json as { offers?: { offerId?: string; marketplaceId?: string; format?: string }[] } | null)?.offers ?? [];
    offerId = offers.find((o) => o.marketplaceId === d.marketplaceId && (o.format ?? "FIXED_PRICE") === "FIXED_PRICE")?.offerId ?? null;
  } else if (existing.status !== 404) fail("Lecture des offres existantes", existing.status, existing.json);

  let created = false;
  if (offerId) {
    const upd = await ebayRestSend(auth, "PUT", `${base}/offer/${encodeURIComponent(offerId)}`, "updateOffer", buildOffer(d));
    if (upd.status >= 300) fail("Mise à jour de l'offre", upd.status, upd.json);
  } else {
    const cre = await ebayRestSend(auth, "POST", `${base}/offer`, "createOffer", buildOffer(d));
    if (cre.status >= 300) fail("Création de l'offre", cre.status, cre.json);
    offerId = (cre.json as { offerId?: string } | null)?.offerId ?? null;
    if (!offerId) throw new ConnectorError("API_ERROR", EBAY_PROVIDER, "eBay n'a pas renvoyé d'identifiant d'offre.", { retryable: false });
    created = true;
  }

  const pub = await ebayRestSend(auth, "POST", `${base}/offer/${encodeURIComponent(offerId)}/publish`, "publishOffer");
  if (pub.status >= 300) fail("Publication", pub.status, pub.json);
  return { sku: d.sku, offerId, listingId: (pub.json as { listingId?: string } | null)?.listingId ?? null, createdOffer: created };
}

/** Mise à jour groupée prix / quantités (25 SKU max par appel eBay). */
export function buildBulkPriceQuantity(lines: { sku: string; offerId: string; quantity: number; price?: number; currency?: string }[]) {
  if (lines.length === 0 || lines.length > 25) throw new Error("Entre 1 et 25 SKU par mise à jour.");
  return {
    requests: lines.map((l) => ({
      sku: l.sku,
      shipToLocationAvailability: { quantity: Math.max(0, Math.floor(l.quantity)) },
      offers: [{ offerId: l.offerId, availableQuantity: Math.max(0, Math.floor(l.quantity)), ...(l.price !== undefined ? { price: { value: l.price.toFixed(2), currency: l.currency ?? "EUR" } } : {}) }],
    })),
  };
}

/** Les trois verrous de publication. */
export function publicationGate(input: { enabledFlag: string | undefined; isAdmin: boolean; confirm: boolean; connected: boolean }): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (input.enabledFlag !== "true") reasons.push("Publication eBay désactivée sur le serveur (EBAY_LISTING_ENABLED ≠ true).");
  if (!input.isAdmin) reasons.push("Seul un administrateur peut publier une annonce.");
  if (!input.confirm) reasons.push("Confirmation explicite requise.");
  if (!input.connected) reasons.push("Aucun compte eBay connecté.");
  return { allowed: reasons.length === 0, reasons };
}
