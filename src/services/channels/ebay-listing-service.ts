import "server-only";
import { z } from "zod";
import type { OrgContext } from "@/features/auth/dal";
import type { EbayListingCheckDTO, EbayListingPrefillDTO, EbayPoliciesDTO } from "@/features/mobile-api/contract";
import { AppError, fromPostgrestError } from "@/lib/errors";
import { ebayEnv } from "@/lib/env";
import { createEbayConfig } from "@/integrations/ebay/config";
import { ebayRestGet } from "@/integrations/ebay/rest";
import { buildInventoryItem, buildOffer, checkListingDraft, publicationGate, publishListing, type ListingDraft } from "@/integrations/ebay/listing";
import { connectorAuthFor, disconnectConnection } from "@/services/channels/connection-store";

/**
 * Annonces eBay depuis MON STOCK : pré-remplissage depuis un SKU, politiques et emplacement du
 * compte, contrôle (simulation : contenu exact qui serait envoyé), publication verrouillée.
 * Aucune annonce n'est créée ni modifiée sans les trois verrous (voir publicationGate).
 */

const MULTIPLE_ACCOUNTS = "Plusieurs comptes eBay sont connectés à cette organisation : choisissez le compte de publication (connectionId).";

type EbayConnectionChoice = { id: string; reason: null } | { id: null; reason: "none" | "multiple" };

/**
 * Compte eBay visé (I-31) : celui désigné par `connectionId` (connecté, de CETTE organisation), ou le
 * seul compte connecté. Plusieurs comptes sans choix explicite : aucun n'est pris au hasard.
 */
async function chooseEbayConnection(ctx: OrgContext, connectionId?: string | null): Promise<EbayConnectionChoice> {
  let q = ctx.supabase.from("channel_connections").select("id, status").eq("organization_id", ctx.organization.id).eq("provider", "ebay").eq("status", "connected");
  if (connectionId) q = q.eq("id", connectionId);
  const { data, error } = await q.order("created_at", { ascending: true }).limit(2);
  if (error) throw fromPostgrestError(error);
  const rows = (data ?? []) as { id: string }[];
  if (connectionId && rows.length === 0) throw new AppError("NOT_FOUND", "Compte eBay introuvable ou non connecté dans cette organisation.");
  if (rows.length === 0) return { id: null, reason: "none" };
  if (rows.length > 1) return { id: null, reason: "multiple" };
  return { id: rows[0]!.id, reason: null };
}

/**
 * Contrôle préalable du SKU (I-31) : une annonce eBay ACTIVE de ce compte porte déjà ce SKU (annonce
 * créée sur eBay ou par l'API Trading, connue par la synchronisation). Publier créerait une seconde
 * annonce visible pour le même produit : refus, l'annonce existante se modifie sur eBay.
 */
async function activeListingWithSku(ctx: OrgContext, connectionId: string, sku: string): Promise<{ externalListingId: string; title: string } | null> {
  const { data, error } = await ctx.supabase
    .from("channel_listings")
    .select("external_listing_id, title")
    .eq("organization_id", ctx.organization.id)
    .eq("connection_id", connectionId)
    .eq("external_sku", sku)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error) throw fromPostgrestError(error);
  return data ? { externalListingId: data.external_listing_id, title: data.title } : null;
}

const duplicateSkuMessage = (sku: string, listing: { externalListingId: string }) =>
  `Le SKU « ${sku} » est déjà utilisé par l'annonce eBay active n° ${listing.externalListingId} de ce compte : modifiez cette annonce sur eBay, ou choisissez un autre SKU (sinon deux annonces seraient visibles pour le même produit).`;

/** Pré-remplissage à partir des vraies données du SKU (rien n'est inventé : champs inconnus vides). */
export async function prefillListing(ctx: OrgContext, skuId: string): Promise<EbayListingPrefillDTO> {
  const { data: sku, error } = await ctx.supabase
    .from("skus")
    .select("id, code, barcode, sale_price, currency, product:products(name, brand, attributes, description), variant:product_variants(name, condition, grade, attributes)")
    .eq("organization_id", ctx.organization.id)
    .eq("id", skuId)
    .maybeSingle();
  if (error) throw fromPostgrestError(error);
  if (!sku) throw new AppError("NOT_FOUND", "SKU introuvable.");
  const { data: inv } = await ctx.supabase.from("v_stock_overview").select("quantity_available").eq("organization_id", ctx.organization.id).eq("sku_id", skuId).maybeSingle();
  const product = (Array.isArray(sku.product) ? sku.product[0] : sku.product) as { name: string; brand: string | null; attributes: Record<string, unknown> | null; description: string | null } | null;
  const variant = (Array.isArray(sku.variant) ? sku.variant[0] : sku.variant) as { name: string; condition: string; grade: string | null; attributes: Record<string, unknown> | null } | null;
  const attrs = { ...(product?.attributes ?? {}), ...(variant?.attributes ?? {}) } as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const model = str(attrs.model);
  const storage = str(attrs.storage);
  const color = str(attrs.color);
  const aspects: Record<string, string[]> = {};
  if (product?.brand) aspects.Marque = [product.brand];
  if (model) aspects["Modèle"] = [model];
  if (storage) aspects["Capacité de stockage"] = [storage];
  if (color) aspects.Couleur = [color];
  const title = [product?.name, variant?.name && variant.name !== "Standard" ? variant.name : null].filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 80);
  return {
    draft: {
      sku: sku.code,
      marketplaceId: "EBAY_FR",
      title,
      description: product?.description ?? "",
      categoryId: "",
      condition: null,
      price: sku.sale_price,
      currency: "EUR",
      quantity: Math.max(0, inv?.quantity_available ?? 0),
      imageUrls: [],
      aspects,
      brand: product?.brand ?? undefined,
      ean: sku.barcode && /^\d{8,14}$/.test(sku.barcode) ? sku.barcode : undefined,
    },
    notes: [
      "Choisissez la catégorie eBay et l'état : MON STOCK ne convertit pas les grades A/B/C en états eBay (aucune équivalence officielle).",
      "Ajoutez au moins une photo (URL HTTPS).",
      ...(variant?.grade ? [`Grade MON STOCK : ${variant.grade} — à décrire dans la description de l'état.`] : []),
    ],
  };
}

/** Politiques métier et emplacements du compte eBay connecté (lecture seule). */
export async function ebayAccountSetup(ctx: OrgContext, connectionId?: string | null): Promise<EbayPoliciesDTO> {
  const env = ebayEnv();
  if (!env) return { configured: false, connected: false, fulfillment: [], payment: [], return: [], locations: [], errors: ["Clés eBay non configurées sur le serveur."] };
  const conn = await chooseEbayConnection(ctx, connectionId);
  if (!conn.id) return { configured: true, connected: conn.reason === "multiple", fulfillment: [], payment: [], return: [], locations: [], errors: [conn.reason === "multiple" ? MULTIPLE_ACCOUNTS : "Aucun compte eBay connecté."] };
  const cfg = createEbayConfig(env);
  const auth = connectorAuthFor(conn.id);
  const errors: string[] = [];
  const read = async <T,>(path: string, key: string, map: (x: Record<string, unknown>) => T): Promise<T[]> => {
    try {
      const json = (await ebayRestGet(auth, `${cfg.apiBase}${path}`, key, { marketplaceId: "EBAY_FR" })) as Record<string, unknown>;
      return ((json[key] as Record<string, unknown>[] | undefined) ?? []).map(map);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
      return [];
    }
  };
  const policy = (idKey: string) => (x: Record<string, unknown>) => ({ id: String(x[idKey] ?? ""), name: String(x.name ?? "") });
  const [fulfillment, payment, ret, locations] = await Promise.all([
    read("/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_FR", "fulfillmentPolicies", policy("fulfillmentPolicyId")),
    read("/sell/account/v1/payment_policy?marketplace_id=EBAY_FR", "paymentPolicies", policy("paymentPolicyId")),
    read("/sell/account/v1/return_policy?marketplace_id=EBAY_FR", "returnPolicies", policy("returnPolicyId")),
    read("/sell/inventory/v1/location?limit=100", "locations", (x) => ({ id: String(x.merchantLocationKey ?? ""), name: String((x as { name?: string }).name ?? x.merchantLocationKey ?? "") })),
  ]);
  return { configured: true, connected: true, fulfillment, payment, return: ret, locations, errors: [...new Set(errors)] };
}

/** `connectionId` : compte eBay de publication, obligatoire quand plusieurs comptes sont connectés (I-31). */
export const listingRequestSchema = z.object({ draft: z.unknown(), confirm: z.boolean().default(false), connectionId: z.string().uuid().optional() });

/** Contrôle + simulation : aucune requête à eBay, contenu exact affiché. */
export async function checkListing(ctx: OrgContext, input: z.infer<typeof listingRequestSchema>): Promise<EbayListingCheckDTO> {
  const check = checkListingDraft(input.draft);
  const conn = ebayEnv() ? await chooseEbayConnection(ctx, input.connectionId) : null;
  const gate = publicationGate({ enabledFlag: process.env.EBAY_LISTING_ENABLED, isAdmin: ctx.role === "owner" || ctx.role === "admin", confirm: true, connected: Boolean(conn?.id) || conn?.reason === "multiple" });
  const blockers = [...gate.reasons];
  if (conn && !conn.id && conn.reason === "multiple") blockers.push(MULTIPLE_ACCOUNTS);
  const duplicate = conn?.id && check.draft ? await activeListingWithSku(ctx, conn.id, check.draft.sku) : null;
  if (duplicate && check.draft) blockers.push(duplicateSkuMessage(check.draft.sku, duplicate));
  return {
    ok: check.ok,
    errors: check.errors,
    warnings: check.warnings,
    payload: check.draft ? { inventoryItem: buildInventoryItem(check.draft), offer: buildOffer(check.draft) } : null,
    publication: { allowed: check.ok && gate.allowed && blockers.length === 0, blockers },
  };
}

/** Publication réelle — uniquement si les trois verrous sont levés, le compte choisi et le SKU libre. */
export async function publishListingForOrg(ctx: OrgContext, input: z.infer<typeof listingRequestSchema>) {
  const check = checkListingDraft(input.draft);
  if (!check.ok || !check.draft) throw new AppError("VALIDATION", check.errors[0] ?? "Annonce invalide.");
  const env = ebayEnv();
  const conn = env ? await chooseEbayConnection(ctx, input.connectionId) : null;
  if (conn && !conn.id && conn.reason === "multiple") throw new AppError("VALIDATION", MULTIPLE_ACCOUNTS);
  const gate = publicationGate({ enabledFlag: process.env.EBAY_LISTING_ENABLED, isAdmin: ctx.role === "owner" || ctx.role === "admin", confirm: input.confirm, connected: Boolean(conn?.id) });
  if (!gate.allowed || !env || !conn?.id) throw new AppError("FORBIDDEN", gate.reasons.join(" "));
  const duplicate = await activeListingWithSku(ctx, conn.id, check.draft.sku);
  if (duplicate) throw new AppError("CONFLICT", duplicateSkuMessage(check.draft.sku, duplicate));
  return publishListing(connectorAuthFor(conn.id), createEbayConfig(env).apiBase, check.draft as ListingDraft);
}

export const disconnectSchema = z.object({ connectionId: z.string().uuid() });

/** Déconnexion d'un compte eBay de l'organisation (administrateur) : tokens supprimés. */
export async function disconnectEbay(ctx: OrgContext, connectionId: string) {
  const { data } = await ctx.supabase.from("channel_connections").select("id").eq("organization_id", ctx.organization.id).eq("id", connectionId).maybeSingle();
  if (!data) throw new AppError("NOT_FOUND", "Connexion introuvable dans cette organisation.");
  return disconnectConnection(connectionId, ctx.organization.id);
}
