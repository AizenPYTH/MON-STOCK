import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import type { AdvisorActionStatus, AdvisorActionType, AdvisorCardDTO, AdvisorStatusDTO } from "@/features/mobile-api/contract";
import { callEdgeApi } from "@/lib/edge-api";
import { fromPostgrestError, toUserMessage } from "@/lib/errors";
import { actionToDTO } from "@/services/ai/advisor-actions";
import { actionIdsOf, replaceActionInCards, sanitizeStoredCards, sanitizeStoredSources } from "@/features/advisor/view.pure";

/**
 * Données du conseiller pour le web. État et limites : Edge `/advisor/status` (la configuration IA
 * vit côté Edge). Historique : lecture directe en base sous RLS, comme l'application iPhone
 * (uniquement les conversations de l'utilisateur connecté).
 */

export interface AdvisorStatusView {
  status: AdvisorStatusDTO | null;
  /** message si l'état n'a pas pu être lu (le conseiller peut alors être indisponible) */
  error: string | null;
  /** questions comptées dans l'heure glissante (journal ai_usage_events, type « assistant ») ; null si illisible */
  usedThisHour: number | null;
}

export async function getAdvisorStatus(ctx: OrgContext, now: Date = new Date()): Promise<AdvisorStatusView> {
  const [status, used] = await Promise.all([
    callEdgeApi<AdvisorStatusDTO>(ctx, "/advisor/status", { timeoutMs: 15_000 }).then(
      (s) => ({ s, e: null as string | null }),
      (e: unknown) => ({ s: null, e: toUserMessage(e) }),
    ),
    ctx.supabase
      .from("ai_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.user.id)
      .eq("kind", "assistant")
      .gte("created_at", new Date(now.getTime() - 3_600_000).toISOString()),
  ]);
  return { status: status.s, error: status.e, usedThisHour: used.error ? null : (used.count ?? 0) };
}

export interface AdvisorConversation {
  id: string;
  title: string;
  lastMessageAt: string;
}

export async function listConversations(ctx: OrgContext): Promise<AdvisorConversation[]> {
  const { data, error } = await ctx.supabase
    .from("advisor_conversations")
    .select("id, title, last_message_at")
    .eq("organization_id", ctx.organization.id)
    .order("last_message_at", { ascending: false })
    .limit(50);
  if (error) throw fromPostgrestError(error);
  return (data ?? []).map((c) => ({ id: c.id, title: c.title, lastMessageAt: c.last_message_at }));
}

export interface AdvisorStoredMessage {
  id: string;
  role: "user" | "assistant" | "notice";
  content: string;
  cards: AdvisorCardDTO[];
  sources: string[];
  interrupted: boolean;
  createdAt: string;
}

export interface AdvisorConversationDetail {
  conversation: AdvisorConversation;
  messages: AdvisorStoredMessage[];
}

/**
 * Conversation et messages (200 au plus). Les cartes d'action enregistrées avec le message
 * gardent le statut du moment de la préparation : on relit le statut RÉEL de chaque action
 * (table advisor_actions, RLS : les siennes) pour ne jamais proposer de confirmer une action
 * déjà exécutée ou annulée.
 */
export async function getConversation(ctx: OrgContext, conversationId: string): Promise<AdvisorConversationDetail | null> {
  const orgId = ctx.organization.id;
  const [conv, msgs] = await Promise.all([
    ctx.supabase.from("advisor_conversations").select("id, title, last_message_at").eq("organization_id", orgId).eq("id", conversationId).maybeSingle(),
    ctx.supabase
      .from("advisor_messages")
      .select("id, role, content, cards, sources, interrupted, created_at")
      .eq("organization_id", orgId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200),
  ]);
  if (conv.error) throw fromPostgrestError(conv.error);
  if (msgs.error) throw fromPostgrestError(msgs.error);
  if (!conv.data) return null;

  const messages: AdvisorStoredMessage[] = (msgs.data ?? []).map((m) => ({
    id: m.id,
    role: m.role === "user" || m.role === "notice" ? m.role : "assistant",
    content: m.content,
    cards: sanitizeStoredCards(m.cards),
    sources: sanitizeStoredSources(m.sources),
    interrupted: m.interrupted,
    createdAt: m.created_at,
  }));

  const ids = [...new Set(messages.flatMap((m) => actionIdsOf(m.cards)))];
  if (ids.length > 0) {
    const { data: actions } = await ctx.supabase
      .from("advisor_actions")
      .select("id, kind, status, summary, amount, currency, expires_at, result, error")
      .eq("organization_id", orgId)
      .in("id", ids);
    for (const a of actions ?? []) {
      const dto = actionToDTO({
        id: a.id,
        kind: a.kind as AdvisorActionType,
        status: a.status as AdvisorActionStatus,
        summary: a.summary,
        amount: a.amount,
        currency: a.currency,
        expires_at: a.expires_at,
        result: a.result && typeof a.result === "object" && !Array.isArray(a.result) ? (a.result as Record<string, unknown>) : null,
        error: a.error,
      });
      for (const m of messages) m.cards = replaceActionInCards(m.cards, dto);
    }
  }

  return { conversation: { id: conv.data.id, title: conv.data.title, lastMessageAt: conv.data.last_message_at }, messages };
}
