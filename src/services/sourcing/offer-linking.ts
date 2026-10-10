import "server-only";
import { z } from "zod";
import type { OrgContext } from "@/features/auth/dal";
import type { MatchSuggestionDTO } from "@/features/mobile-api/contract";
import { AppError, fromPostgrestError } from "@/lib/errors";
import { applyConfirmedMatch } from "@/services/sourcing/matching-service";

/**
 * Rapprochement offre fournisseur ↔ SKU (nécessaire au radar d'opportunités). Les correspondances
 * exactes (EAN, référence fabricant) sont confirmées automatiquement à l'import ; les autres sont
 * des SUGGESTIONS que l'utilisateur confirme ou rejette. Écritures sous RLS (rôle rédacteur).
 */

type Supabase = OrgContext["supabase"];

export async function confirmOfferLink(orgId: string, supabase: Supabase, userId: string, offerId: string, skuId: string, sourcingProductId: string | null): Promise<void> {
  const { data: existing } = await supabase.from("product_matches").select("id, status").eq("organization_id", orgId).eq("offer_id", offerId).eq("sku_id", skuId).maybeSingle();
  const now = new Date().toISOString();
  if (existing) await supabase.from("product_matches").update({ status: "confirmed", decided_by: userId, decided_at: now }).eq("id", existing.id);
  else await supabase.from("product_matches").insert({ organization_id: orgId, offer_id: offerId, sourcing_product_id: sourcingProductId, sku_id: skuId, confidence: 1, method: "supplier_sku", reasons: ["Association confirmée manuellement"], status: "confirmed", created_by: userId, decided_by: userId, decided_at: now });
  // Les autres suggestions de cette offre sont closes.
  await supabase.from("product_matches").update({ status: "rejected", decided_by: userId, decided_at: now }).eq("organization_id", orgId).eq("offer_id", offerId).neq("sku_id", skuId).eq("status", "suggested");
  await applyConfirmedMatch(supabase, orgId, { offerId, skuId, sourcingProductId });
}

export async function listMatchSuggestions(ctx: OrgContext, limit = 100): Promise<MatchSuggestionDTO[]> {
  const { data, error } = await ctx.supabase
    .from("product_matches")
    .select("id, confidence, method, reasons, offer:sourcing_offers(id, title_original, normalized_price, normalized_currency, supplier:suppliers(name)), sku:skus(id, code, product:products(name), variant:product_variants(name))")
    .eq("organization_id", ctx.organization.id)
    .eq("status", "suggested")
    .not("offer_id", "is", null)
    .order("confidence", { ascending: false })
    .limit(limit);
  if (error) throw fromPostgrestError(error);
  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  return (data ?? []).flatMap((m) => {
    const offer = one(m.offer as unknown as { id: string; title_original: string; normalized_price: number | null; normalized_currency: string | null; supplier: { name: string } | null });
    const sku = one(m.sku as unknown as { id: string; code: string; product: { name: string } | null; variant: { name: string } | null });
    if (!offer || !sku) return [];
    return [
      {
        matchId: m.id,
        confidence: m.confidence,
        method: m.method,
        reasons: Array.isArray(m.reasons) ? (m.reasons as string[]) : [],
        offer: { id: offer.id, title: offer.title_original, price: offer.normalized_price, currency: offer.normalized_currency, supplierName: one(offer.supplier)?.name ?? "Fournisseur" },
        sku: { id: sku.id, code: sku.code, name: [one(sku.product)?.name, one(sku.variant)?.name].filter(Boolean).join(" · ") },
      },
    ];
  });
}

export const matchDecisionSchema = z.object({ matchId: z.string().uuid(), decision: z.enum(["confirm", "reject"]) });

export async function decideMatch(ctx: OrgContext, input: z.infer<typeof matchDecisionSchema>): Promise<{ status: "confirmed" | "rejected" }> {
  const orgId = ctx.organization.id;
  const { data: match } = await ctx.supabase.from("product_matches").select("id, offer_id, sku_id, sourcing_product_id, status").eq("organization_id", orgId).eq("id", input.matchId).maybeSingle();
  if (!match) throw new AppError("NOT_FOUND", "Correspondance introuvable.");
  if (match.status !== "suggested") throw new AppError("CONFLICT", "Cette correspondance a déjà été traitée.");
  if (input.decision === "reject") {
    const { error } = await ctx.supabase.from("product_matches").update({ status: "rejected", decided_by: ctx.user.id, decided_at: new Date().toISOString() }).eq("organization_id", orgId).eq("id", match.id);
    if (error) throw fromPostgrestError(error);
    return { status: "rejected" };
  }
  if (!match.offer_id) throw new AppError("VALIDATION", "Correspondance sans offre.");
  await confirmOfferLink(orgId, ctx.supabase, ctx.user.id, match.offer_id, match.sku_id, match.sourcing_product_id);
  return { status: "confirmed" };
}
