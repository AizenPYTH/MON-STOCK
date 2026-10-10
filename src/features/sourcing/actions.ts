"use server";
import { confirmOfferLink } from "@/services/sourcing/offer-linking";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrgContextForAction } from "@/features/auth/dal";
import { fail, ok, type ActionResult } from "@/lib/result";
import { fromPostgrestError, toUserMessage } from "@/lib/errors";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/db/database.types";
import { alertFormSchema, fieldErrorsOf, linkOfferSchema, matchDecisionSchema, offerStatusSchema, parseCountries } from "@/features/sourcing/schemas";
import { parseQuery } from "@/domain/sourcing/query-parser";
import { applyConfirmedMatch } from "@/services/sourcing/matching-service";
import { evaluateSourcingAlerts, type AlertCriteria } from "@/services/sourcing/alerts";
import { searchSkus } from "@/features/stock/queries";
import { getOfferMatchSuggestions, type OfferMatchSuggestion } from "@/features/sourcing/queries";

export interface SkuSearchResult {
  skuId: string;
  code: string;
  label: string;
  costPrice: number | null;
  salePrice: number | null;
}

type MessageResult = ActionResult<{ message: string }>;

/** Recherche de SKU pour l'association manuelle (appelée depuis un composant client). */
export async function searchSkusAction(q: string): Promise<ActionResult<SkuSearchResult[]>> {
  try {
    const ctx = await requireOrgContextForAction();
    const rows = await searchSkus(ctx, String(q ?? "").slice(0, 120), 20);
    return ok(
      rows
        .filter((r) => r.sku_id && r.code)
        .map((r) => ({ skuId: r.sku_id!, code: r.code!, label: `${r.product_name ?? ""}${r.variant_name && r.variant_name !== "Standard" ? ` · ${r.variant_name}` : ""}`, costPrice: r.cost_price, salePrice: r.sale_price })),
    );
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

/** Suggestions de correspondance calculées à l'ouverture du dialogue d'association. */
export async function suggestMatchesAction(offerId: string): Promise<ActionResult<OfferMatchSuggestion[]>> {
  try {
    const ctx = await requireOrgContextForAction();
    const { data: offer } = await ctx.supabase.from("sourcing_offers").select("id, title_original, ean, mpn, external_product_id, brand").eq("organization_id", ctx.organization.id).eq("id", String(offerId ?? "")).maybeSingle();
    if (!offer) return ok([]);
    return ok(await getOfferMatchSuggestions(ctx, offer));
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

async function confirmLink(ctxOrgId: string, supabase: Awaited<ReturnType<typeof requireOrgContextForAction>>["supabase"], userId: string, offerId: string, skuId: string, sourcingProductId: string | null): Promise<void> {
  await confirmOfferLink(ctxOrgId, supabase, userId, offerId, skuId, sourcingProductId);
}

export async function linkOfferToSkuAction(_prev: ActionResult<{ skuCode: string }> | null, formData: FormData): Promise<ActionResult<{ skuCode: string }>> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = linkOfferSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Vérifiez le SKU choisi.", { fieldErrors: fieldErrorsOf(parsed.error.issues) });
    const { offer_id, sku_id } = parsed.data;
    const [{ data: offer }, { data: sku }] = await Promise.all([
      ctx.supabase.from("sourcing_offers").select("id, supplier_id, normalized_product_id").eq("organization_id", ctx.organization.id).eq("id", offer_id).maybeSingle(),
      ctx.supabase.from("skus").select("id, code").eq("organization_id", ctx.organization.id).eq("id", sku_id).maybeSingle(),
    ]);
    if (!offer) return fail("Offre introuvable.");
    if (!sku) return fail("SKU introuvable.");
    await confirmLink(ctx.organization.id, ctx.supabase, ctx.user.id, offer.id, sku.id, offer.normalized_product_id);
    revalidatePath(`/sourcing/offers/${offer.id}`);
    revalidatePath(`/suppliers/${offer.supplier_id}/offers`);
    revalidatePath(`/stock/${encodeURIComponent(sku.code)}`);
    revalidatePath("/sourcing/matches");
    return ok({ skuCode: sku.code });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function unlinkOfferAction(_prev: MessageResult | null, formData: FormData): Promise<MessageResult> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const offerId = String(formData.get("offer_id") ?? "");
    const { data: offer } = await ctx.supabase.from("sourcing_offers").select("id, supplier_id, sku_id").eq("organization_id", ctx.organization.id).eq("id", offerId).maybeSingle();
    if (!offer) return fail("Offre introuvable.");
    if (!offer.sku_id) return ok({ message: "Cette offre n'est associée à aucun SKU." });
    const { error } = await ctx.supabase.from("sourcing_offers").update({ sku_id: null }).eq("organization_id", ctx.organization.id).eq("id", offer.id);
    if (error) return fail(toUserMessage(fromPostgrestError(error)));
    await ctx.supabase.from("product_matches").update({ status: "rejected", decided_by: ctx.user.id, decided_at: new Date().toISOString() }).eq("organization_id", ctx.organization.id).eq("offer_id", offer.id).eq("sku_id", offer.sku_id);
    revalidatePath(`/sourcing/offers/${offer.id}`);
    revalidatePath(`/suppliers/${offer.supplier_id}/offers`);
    return ok({ message: "Offre dissociée du SKU." });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function setOfferStatusAction(_prev: MessageResult | null, formData: FormData): Promise<MessageResult> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = offerStatusSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Statut d'offre invalide.");
    const { data: offer } = await ctx.supabase.from("sourcing_offers").select("id, supplier_id").eq("organization_id", ctx.organization.id).eq("id", parsed.data.offer_id).maybeSingle();
    if (!offer) return fail("Offre introuvable.");
    const { error } = await ctx.supabase.from("sourcing_offers").update({ status: parsed.data.status, expired_at: null }).eq("organization_id", ctx.organization.id).eq("id", offer.id);
    if (error) return fail(toUserMessage(fromPostgrestError(error)));
    revalidatePath(`/sourcing/offers/${offer.id}`);
    revalidatePath(`/suppliers/${offer.supplier_id}/offers`);
    revalidatePath("/sourcing");
    return ok({ message: parsed.data.status === "rejected" ? "Offre rejetée : exclue des recherches." : "Offre réactivée." });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function decideMatchAction(_prev: MessageResult | null, formData: FormData): Promise<MessageResult> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = matchDecisionSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Décision invalide.");
    const { data: match } = await ctx.supabase.from("product_matches").select("id, offer_id, sku_id, sourcing_product_id, status").eq("organization_id", ctx.organization.id).eq("id", parsed.data.match_id).maybeSingle();
    if (!match) return fail("Correspondance introuvable.");
    if (match.status !== "suggested") return fail("Cette correspondance a déjà été traitée.");
    const now = new Date().toISOString();
    if (parsed.data.decision === "reject") {
      await ctx.supabase.from("product_matches").update({ status: "rejected", decided_by: ctx.user.id, decided_at: now }).eq("organization_id", ctx.organization.id).eq("id", match.id);
    } else if (match.offer_id) {
      await confirmLink(ctx.organization.id, ctx.supabase, ctx.user.id, match.offer_id, match.sku_id, match.sourcing_product_id);
    } else {
      await ctx.supabase.from("product_matches").update({ status: "confirmed", decided_by: ctx.user.id, decided_at: now }).eq("organization_id", ctx.organization.id).eq("id", match.id);
      await applyConfirmedMatch(ctx.supabase, ctx.organization.id, { offerId: null, skuId: match.sku_id, sourcingProductId: match.sourcing_product_id });
    }
    revalidatePath("/sourcing/matches");
    if (match.offer_id) revalidatePath(`/sourcing/offers/${match.offer_id}`);
    return ok({ message: parsed.data.decision === "reject" ? "Correspondance rejetée." : "Correspondance confirmée." });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

// ---------------------------------------------------------------------------
// Alertes
// ---------------------------------------------------------------------------
function criteriaFromForm(d: ReturnType<typeof alertFormSchema.parse>): AlertCriteria {
  const grades = (d.grades ?? "")
    .split(/[,\s;]+/)
    .map((g) => g.trim().toUpperCase())
    .filter((g) => /^[ABC]\+?$/.test(g));
  const c: AlertCriteria = {};
  if (d.max_price !== "" && d.max_price !== undefined) c.max_price = d.max_price;
  if (d.min_quantity !== "" && d.min_quantity !== undefined) c.min_quantity = d.min_quantity;
  const countries = parseCountries(d.countries || undefined);
  if (countries) c.countries = countries;
  if (d.max_moq !== "" && d.max_moq !== undefined) c.max_moq = d.max_moq;
  if (grades.length > 0) c.grades = grades;
  if (d.condition) c.condition = d.condition;
  if (d.max_delivery_days !== "" && d.max_delivery_days !== undefined) c.max_delivery_days = d.max_delivery_days;
  return c;
}

export async function saveAlertAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = alertFormSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Vérifiez les champs du formulaire.", { fieldErrors: fieldErrorsOf(parsed.error.issues) });
    const d = parsed.data;
    const q = parseQuery(d.query_text);
    const payload = {
      name: d.name,
      query_text: d.query_text,
      parsed: { kind: q.kind, ean: q.ean, mpn: q.mpn, criteria: q.criteria, tokens: q.tokens } as unknown as NonNullable<Json>,
      criteria: criteriaFromForm(d) as unknown as NonNullable<Json>,
      sku_id: d.sku_id ? d.sku_id : null,
    };
    if (d.alert_id) {
      const { error } = await ctx.supabase.from("sourcing_alerts").update(payload).eq("organization_id", ctx.organization.id).eq("id", d.alert_id);
      if (error) return fail(toUserMessage(fromPostgrestError(error)));
    } else {
      const { error } = await ctx.supabase.from("sourcing_alerts").insert({ organization_id: ctx.organization.id, user_id: ctx.user.id, is_active: true, ...payload });
      if (error) return fail(toUserMessage(fromPostgrestError(error)));
    }
  } catch (e) {
    return fail(toUserMessage(e));
  }
  revalidatePath("/sourcing/alerts");
  redirect("/sourcing/alerts");
}

export async function toggleAlertAction(_prev: MessageResult | null, formData: FormData): Promise<MessageResult> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const id = String(formData.get("alert_id") ?? "");
    const active = String(formData.get("active") ?? "true") === "true";
    const { error } = await ctx.supabase.from("sourcing_alerts").update({ is_active: active }).eq("organization_id", ctx.organization.id).eq("id", id);
    if (error) return fail(toUserMessage(fromPostgrestError(error)));
    revalidatePath("/sourcing/alerts");
    return ok({ message: active ? "Alerte réactivée." : "Alerte mise en pause." });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function deleteAlertAction(_prev: MessageResult | null, formData: FormData): Promise<MessageResult> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const id = String(formData.get("alert_id") ?? "");
    const { error } = await ctx.supabase.from("sourcing_alerts").delete().eq("organization_id", ctx.organization.id).eq("id", id);
    if (error) return fail(toUserMessage(fromPostgrestError(error)));
    revalidatePath("/sourcing/alerts");
    return ok({ message: "Alerte supprimée." });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function markAlertEventsSeenAction(_prev: MessageResult | null, formData: FormData): Promise<MessageResult> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const alertId = String(formData.get("alert_id") ?? "");
    let q = ctx.supabase.from("sourcing_alert_events").update({ seen_at: new Date().toISOString() }).eq("organization_id", ctx.organization.id).is("seen_at", null);
    if (alertId) q = q.eq("alert_id", alertId);
    const { error } = await q;
    if (error) return fail(toUserMessage(fromPostgrestError(error)));
    revalidatePath("/sourcing/alerts");
    return ok({ message: "Événements marqués comme vus." });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function evaluateAlertsNowAction(_prev: ActionResult<{ message: string }> | null, _formData: FormData): Promise<ActionResult<{ message: string }>> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const r = await evaluateSourcingAlerts(new Date(), createAdminSupabaseClient(), ctx.organization.id);
    revalidatePath("/sourcing/alerts");
    return ok({ message: `${r.alerts} alerte(s) évaluée(s), ${r.events} nouvel(le)(s) événement(s).` });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}
