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

async function connectedEbay(ctx: OrgContext): Promise<{ id: string } | null> {
  const { data, error } = await ctx.supabase.from("channel_connections").select("id, status").eq("organization_id", ctx.organization.id).eq("provider", "ebay").eq("status", "connected").limit(1).maybeSingle();
  if (error) throw fromPostgrestError(error);
  return data ? { id: data.id } : null;
}

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
export async function ebayAccountSetup(ctx: OrgContext): Promise<EbayPoliciesDTO> {
  const env = ebayEnv();
  if (!env) return { configured: false, connected: false, fulfillment: [], payment: [], return: [], locations: [], errors: ["Clés eBay non configurées sur le serveur."] };
  const conn = await connectedEbay(ctx);
  if (!conn) return { configured: true, connected: false, fulfillment: [], payment: [], return: [], locations: [], errors: ["Aucun compte eBay connecté."] };
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

export const listingRequestSchema = z.object({ draft: z.unknown(), confirm: z.boolean().default(false) });

/** Contrôle + simulation : aucune requête à eBay, contenu exact affiché. */
export async function checkListing(ctx: OrgContext, input: z.infer<typeof listingRequestSchema>): Promise<EbayListingCheckDTO> {
  const check = checkListingDraft(input.draft);
  const conn = ebayEnv() ? await connectedEbay(ctx) : null;
  const gate = publicationGate({ enabledFlag: process.env.EBAY_LISTING_ENABLED, isAdmin: ctx.role === "owner" || ctx.role === "admin", confirm: true, connected: Boolean(conn) });
  return {
    ok: check.ok,
    errors: check.errors,
    warnings: check.warnings,
    payload: check.draft ? { inventoryItem: buildInventoryItem(check.draft), offer: buildOffer(check.draft) } : null,
    publication: { allowed: check.ok && gate.allowed, blockers: gate.reasons },
  };
}

/** Publication réelle — uniquement si les trois verrous sont levés. */
export async function publishListingForOrg(ctx: OrgContext, input: z.infer<typeof listingRequestSchema>) {
  const check = checkListingDraft(input.draft);
  if (!check.ok || !check.draft) throw new AppError("VALIDATION", check.errors[0] ?? "Annonce invalide.");
  const env = ebayEnv();
  const conn = env ? await connectedEbay(ctx) : null;
  const gate = publicationGate({ enabledFlag: process.env.EBAY_LISTING_ENABLED, isAdmin: ctx.role === "owner" || ctx.role === "admin", confirm: input.confirm, connected: Boolean(conn) });
  if (!gate.allowed || !env || !conn) throw new AppError("FORBIDDEN", gate.reasons.join(" "));
  return publishListing(connectorAuthFor(conn.id), createEbayConfig(env).apiBase, check.draft as ListingDraft);
}

export const disconnectSchema = z.object({ connectionId: z.string().uuid() });

/** Déconnexion d'un compte eBay de l'organisation (administrateur) : tokens supprimés. */
export async function disconnectEbay(ctx: OrgContext, connectionId: string) {
  const { data } = await ctx.supabase.from("channel_connections").select("id").eq("organization_id", ctx.organization.id).eq("id", connectionId).maybeSingle();
  if (!data) throw new AppError("NOT_FOUND", "Connexion introuvable dans cette organisation.");
  return disconnectConnection(connectionId, ctx.organization.id);
}
