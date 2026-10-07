"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContextForAction } from "@/features/auth/dal";
import { fail, ok, type ActionResult } from "@/lib/result";
import { fromPostgrestError, toUserMessage } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { computeRecommendations, persistRecommendations } from "@/features/analytics/replenishment";

const log = createLogger("ANALYTICS");

export type MessageResult = ActionResult<{ message: string }>;

const uuid = z.string().uuid();

function revalidateIntelligence() {
  revalidatePath("/dashboard");
  revalidatePath("/insights");
  revalidatePath("/stock/alerts");
}

/** Recalcule toutes les recommandations et enregistre un nouvel instantané (les précédentes ouvertes sont remplacées). */
export async function refreshRecommendationsAction(_prev: MessageResult | null, _formData: FormData): Promise<MessageResult> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const drafts = await computeRecommendations(ctx);
    const { inserted } = await persistRecommendations(ctx, drafts);
    log.info("recommendations refreshed", { orgId: ctx.organization.id, inserted });
    revalidateIntelligence();
    const needed = drafts.filter((d) => d.result.needed).length;
    return ok({
      message:
        inserted === 0
          ? "Aucun produit ne nécessite d'attention : rien à recommander pour le moment."
          : `${inserted} produit(s) analysé(s), ${needed} commande(s) recommandée(s).`,
    });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function dismissRecommendationAction(_prev: MessageResult | null, formData: FormData): Promise<MessageResult> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const id = uuid.safeParse(formData.get("id"));
    if (!id.success) return fail("Recommandation invalide.");
    const { data, error } = await ctx.supabase
      .from("replenishment_recommendations")
      .update({ status: "dismissed" })
      .eq("id", id.data)
      .eq("organization_id", ctx.organization.id)
      .eq("status", "open")
      .select("id");
    if (error) return fail(toUserMessage(fromPostgrestError(error)));
    if (!data || data.length === 0) return fail("Cette recommandation n'est plus ouverte.");
    revalidateIntelligence();
    return ok({ message: "Recommandation ignorée." });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

async function setAlertStatus(formData: FormData, status: "acknowledged" | "resolved"): Promise<MessageResult> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const id = uuid.safeParse(formData.get("id"));
    if (!id.success) return fail("Alerte invalide.");
    const { data, error } = await ctx.supabase
      .from("alerts")
      .update(status === "resolved" ? { status, resolved_at: new Date().toISOString() } : { status })
      .eq("id", id.data)
      .eq("organization_id", ctx.organization.id)
      .neq("status", "resolved")
      .select("id");
    if (error) return fail(toUserMessage(fromPostgrestError(error)));
    if (!data || data.length === 0) return fail("Cette alerte est déjà résolue.");
    revalidateIntelligence();
    return ok({ message: status === "resolved" ? "Alerte traitée." : "Alerte prise en compte." });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function acknowledgeAlertAction(_prev: MessageResult | null, formData: FormData): Promise<MessageResult> {
  return setAlertStatus(formData, "acknowledged");
}

export async function resolveAlertAction(_prev: MessageResult | null, formData: FormData): Promise<MessageResult> {
  return setAlertStatus(formData, "resolved");
}
