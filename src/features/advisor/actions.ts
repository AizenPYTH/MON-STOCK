"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canWrite, requireOrgContextForAction } from "@/features/auth/dal";
import type { AdvisorActionDecisionDTO } from "@/features/mobile-api/contract";
import { callEdgeApi } from "@/lib/edge-api";
import { fromPostgrestError, toUserMessage } from "@/lib/errors";
import { fail, ok, type ActionResult } from "@/lib/result";
import { getAdvisorStatus, getConversation } from "@/features/advisor/queries";
import { chatItemsFrom, type ChatItem } from "@/features/advisor/view.pure";

/**
 * Décisions sur les actions PRÉPARÉES par le conseiller (bouton « Confirmer » / « Annuler »).
 * L'exécution a lieu sur l'Edge (`/advisor/actions/confirm|cancel`), qui revérifie propriétaire,
 * organisation, rôle, statut, expiration et état de l'objet avant d'agir : rien n'est exécuté ici.
 */

const actionId = z.string().uuid("Action invalide.");

export type AdvisorDecisionResult = ActionResult<AdvisorActionDecisionDTO>;

async function decide(id: string, kind: "confirm" | "cancel"): Promise<AdvisorDecisionResult> {
  const parsed = actionId.safeParse(id);
  if (!parsed.success) return fail("Action invalide.");
  try {
    // Confirmer modifie le stock ou un prix : rôle rédacteur exigé (l'Edge le revérifie).
    const ctx = await requireOrgContextForAction({ write: kind === "confirm" });
    const decision = await callEdgeApi<AdvisorActionDecisionDTO>(ctx, `/advisor/actions/${kind}`, { method: "POST", body: { actionId: parsed.data }, timeoutMs: 30_000 });
    if (kind === "confirm" && decision.action.status === "executed") {
      revalidatePath("/stock");
      revalidatePath("/dashboard");
    }
    return ok(decision);
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function confirmAdvisorActionAction(id: string): Promise<AdvisorDecisionResult> {
  return decide(id, "confirm");
}

export async function cancelAdvisorActionAction(id: string): Promise<AdvisorDecisionResult> {
  return decide(id, "cancel");
}

/** Supprime une conversation et ses messages (RLS : uniquement les siennes, comme sur iPhone). */
export async function deleteConversationAction(_prev: ActionResult<{ message: string }> | null, formData: FormData): Promise<ActionResult<{ message: string }>> {
  const id = z.string().uuid().safeParse(formData.get("conversationId"));
  if (!id.success) return fail("Conversation invalide.");
  try {
    const ctx = await requireOrgContextForAction();
    const { data, error } = await ctx.supabase.from("advisor_conversations").delete().eq("organization_id", ctx.organization.id).eq("id", id.data).select("id");
    if (error) return fail(toUserMessage(fromPostgrestError(error)));
    if (!data || data.length === 0) return fail("Cette conversation n'existe plus.");
    revalidatePath("/advisor/history");
    return ok({ message: "Conversation supprimée." });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

/** Données du panneau ⌘J : état réel du conseiller, quota, conversation reprise (la sienne seulement). */
export interface AdvisorPanelData {
  organizationName: string;
  /** false : IA non configurée ; null : état inconnu (serveur injoignable) */
  configured: boolean | null;
  statusError: string | null;
  perUserPerHour: number | null;
  usedThisHour: number | null;
  canConfirm: boolean;
  conversationId: string | null;
  items: ChatItem[];
}

export async function loadAdvisorPanelAction(conversationId: string | null): Promise<ActionResult<AdvisorPanelData>> {
  const requested = conversationId === null ? null : z.string().uuid().safeParse(conversationId);
  try {
    const ctx = await requireOrgContextForAction();
    const [status, conversation] = await Promise.all([getAdvisorStatus(ctx), requested?.success ? getConversation(ctx, requested.data).catch(() => null) : Promise.resolve(null)]);
    return ok({
      organizationName: ctx.organization.name,
      configured: status.status ? status.status.configured : null,
      statusError: status.error,
      perUserPerHour: status.status?.limits.perUserPerHour ?? null,
      usedThisHour: status.usedThisHour,
      canConfirm: canWrite(ctx.role),
      conversationId: conversation?.conversation.id ?? null,
      items: chatItemsFrom(conversation?.messages ?? []),
    });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}
