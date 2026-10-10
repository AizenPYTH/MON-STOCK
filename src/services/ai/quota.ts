import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import { AppError } from "@/lib/errors";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Quotas des fonctions IA (coût maîtrisé, abus limités) — journal ai_usage_events :
 *   - par utilisateur et par heure : 40 questions à l'assistant, 60 brouillons de produit ;
 *   - par organisation et par jour : 400 appels au total.
 * L'événement est enregistré AVANT l'appel à Claude (sous la session de l'utilisateur, RLS).
 */
export const AI_LIMITS = { assistantPerHour: 40, productDraftPerHour: 60, orgPerDay: 400 } as const;

export type AiKind = "assistant" | "product_draft";

export async function enforceAiQuota(ctx: Pick<OrgContext, "supabase" | "organization" | "user">, kind: AiKind, now: Date = new Date(), admin = createAdminSupabaseClient()): Promise<void> {
  const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  const [mine, org] = await Promise.all([
    ctx.supabase.from("ai_usage_events").select("id", { count: "exact", head: true }).eq("user_id", ctx.user.id).eq("kind", kind).gte("created_at", hourAgo),
    admin.from("ai_usage_events").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organization.id).gte("created_at", dayAgo),
  ]);
  const perHour = kind === "assistant" ? AI_LIMITS.assistantPerHour : AI_LIMITS.productDraftPerHour;
  if ((mine.count ?? 0) >= perHour) throw new AppError("RATE_LIMITED", `Limite atteinte : ${perHour} demandes à l'IA par heure. Réessayez plus tard.`);
  if ((org.count ?? 0) >= AI_LIMITS.orgPerDay) throw new AppError("RATE_LIMITED", `Limite quotidienne de l'organisation atteinte (${AI_LIMITS.orgPerDay} demandes à l'IA). Réessayez demain.`);
  const { error } = await ctx.supabase.from("ai_usage_events").insert({ organization_id: ctx.organization.id, user_id: ctx.user.id, kind });
  if (error) throw new AppError("FORBIDDEN", "Utilisation de l'IA non autorisée pour ce compte.");
}
