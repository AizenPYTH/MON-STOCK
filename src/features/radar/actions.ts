"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContextForAction } from "@/features/auth/dal";
import { fail, ok, type ActionResult } from "@/lib/result";
import { toUserMessage } from "@/lib/errors";
import { stockErrorMessage } from "@/features/stock/db-errors";
import { saveCostSettings } from "@/services/radar/radar";
import { parseDraftQuantity, parseSettingsForm } from "@/features/radar/settings-form";
import { internalRoute } from "@/lib/routes";

type MessageResult = ActionResult<{ message: string }>;

const uuid = z.string().uuid();

/** Paramètres de coûts du radar : administrateur uniquement (comme POST /radar/settings). */
export async function saveRadarSettingsAction(_prev: MessageResult | null, formData: FormData): Promise<MessageResult> {
  try {
    const ctx = await requireOrgContextForAction({ admin: true });
    const parsed = parseSettingsForm(formData);
    if (!parsed.ok) return fail(parsed.error, { fieldErrors: parsed.fieldErrors });
    await saveCostSettings(ctx, parsed.settings);
  } catch (e) {
    return fail(toUserMessage(e));
  }
  revalidatePath("/radar");
  revalidatePath("/radar/settings");
  revalidatePath("/sourcing");
  return ok({ message: "Paramètres de coûts enregistrés. Les bénéfices du radar et les marges de la recherche sont recalculés." });
}

/**
 * Enregistrer / retirer une offre pour la comparer plus tard (prix figé à l'enregistrement).
 * Écriture sous RLS, rôle rédacteur, même organisation — comme l'application iPhone.
 */
export async function toggleSavedOfferAction(_prev: MessageResult | null, formData: FormData): Promise<MessageResult> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const offerId = uuid.safeParse(formData.get("offer_id"));
    if (!offerId.success) return fail("Offre invalide.");
    const orgId = ctx.organization.id;
    const { data: offer } = await ctx.supabase.from("sourcing_offers").select("id, normalized_price, normalized_currency").eq("organization_id", orgId).eq("id", offerId.data).maybeSingle();
    if (!offer) return fail("Offre introuvable.");
    const { data: existing } = await ctx.supabase.from("sourcing_saved_offers").select("id").eq("organization_id", orgId).eq("offer_id", offer.id).maybeSingle();
    let message: string;
    if (existing) {
      const { error } = await ctx.supabase.from("sourcing_saved_offers").delete().eq("organization_id", orgId).eq("offer_id", offer.id);
      if (error) return fail(toUserMessage(error));
      message = "Offre retirée de vos offres enregistrées.";
    } else {
      const { error } = await ctx.supabase.from("sourcing_saved_offers").insert({ organization_id: orgId, offer_id: offer.id, price_at_save: offer.normalized_price, currency_at_save: offer.normalized_currency?.toUpperCase() ?? null, created_by: ctx.user.id });
      if (error && error.code !== "23505") return fail(toUserMessage(error));
      message = "Offre enregistrée au prix actuel.";
    }
    revalidatePath("/radar");
    revalidatePath(`/radar/${offer.id}`);
    return ok({ message });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

/**
 * Brouillon de commande fournisseur (statut « draft », jamais envoyé) avec une ligne : l'offre ×
 * quantité. Fournisseur, SKU et prix relus en base (jamais pris du formulaire). Rôle rédacteur.
 */
export async function createRadarDraftAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let target: string;
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const offerId = uuid.safeParse(formData.get("offer_id"));
    if (!offerId.success) return fail("Offre invalide.");
    const orgId = ctx.organization.id;
    const { data: offer } = await ctx.supabase.from("sourcing_offers").select("id, supplier_id, sku_id, normalized_price, normalized_currency, moq").eq("organization_id", orgId).eq("id", offerId.data).maybeSingle();
    if (!offer) return fail("Offre introuvable.");
    if (!offer.sku_id) return fail("Associez d'abord cette offre à un SKU.");
    if (offer.normalized_price === null) return fail("Prix de l'offre inconnu : brouillon impossible.");
    const qty = parseDraftQuantity(formData.get("quantity"), offer.moq);
    if (!qty.ok) return fail(qty.error, { fieldErrors: { quantity: [qty.error] } });
    const currency = (offer.normalized_currency ?? ctx.organization.default_currency).toUpperCase();
    const { data: po, error } = await ctx.supabase
      .from("purchase_orders")
      .insert({ organization_id: orgId, supplier_id: offer.supplier_id, currency, status: "draft", created_by: ctx.user.id, notes: "Brouillon préparé depuis le radar d'achat (web)." })
      .select("id")
      .single();
    if (error || !po) return fail(stockErrorMessage(error ?? { message: "Commande non créée" }));
    const { error: itemError } = await ctx.supabase.from("purchase_order_items").insert({ organization_id: orgId, purchase_order_id: po.id, sku_id: offer.sku_id, offer_id: offer.id, quantity_ordered: qty.quantity, unit_cost: offer.normalized_price, currency });
    if (itemError) {
      // pas de brouillon vide orphelin (un brouillon est supprimable)
      await ctx.supabase.from("purchase_orders").delete().eq("id", po.id).eq("organization_id", orgId);
      return fail(stockErrorMessage(itemError));
    }
    target = `/suppliers/${offer.supplier_id}/orders?po=${po.id}`;
    revalidatePath(`/suppliers/${offer.supplier_id}/orders`);
  } catch (e) {
    return fail(toUserMessage(e));
  }
  redirect(internalRoute(target));
}
