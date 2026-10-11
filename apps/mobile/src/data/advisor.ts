import type { AdvisorActionDecisionDTO, AdvisorCardDTO, AdvisorChatRequest, AdvisorReplyDTO, AdvisorStatusDTO, AdvisorStreamEvent } from "@/features/mobile-api/contract";
import { apiBaseUrl, apiHeaders, callApi } from "~/lib/api";
import { OFFLINE_MESSAGE, UserFacingError } from "~/lib/errors";
import type { MobileSupabase } from "~/lib/supabase";

/**
 * Conseiller e-commerce IA. Le raisonnement (Claude) et l'accès aux données tournent sur le
 * serveur MON STOCK : le téléphone envoie la question (écrite ou transcrite par la dictée de
 * l'appareil) et reçoit la réponse au fil de l'eau (flux NDJSON). Aucune clé dans l'application.
 * L'historique est lu directement en base (RLS : uniquement les conversations de l'utilisateur).
 */

export const ADVISOR_TIMEOUT_MS = 150_000;

/** Découpe un tampon NDJSON : renvoie les événements complets et le reste non terminé. */
export function parseNdjson(buffer: string): { events: AdvisorStreamEvent[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events: AdvisorStreamEvent[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    try {
      events.push(JSON.parse(t) as AdvisorStreamEvent);
    } catch {
      // ligne illisible : ignorée (jamais interprétée)
    }
  }
  return { events, rest };
}

export async function streamAdvisorChat(
  organizationId: string,
  req: AdvisorChatRequest,
  onEvent: (e: AdvisorStreamEvent) => void,
  opts: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<AdvisorReplyDTO> {
  const headers = await apiHeaders(organizationId, "application/x-ndjson", true);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ADVISOR_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onAbort);
  if (opts.signal?.aborted) {
    // annulé avant le départ de la requête : rien n'est envoyé
    clearTimeout(timer);
    opts.signal.removeEventListener("abort", onAbort);
    throw new UserFacingError("Demande annulée.", "ABORTED");
  }
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(`${apiBaseUrl()}/advisor/chat`, { method: "POST", headers, body: JSON.stringify(req), signal: controller.signal });
  } catch (e) {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
    if (e instanceof Error && e.name === "AbortError") throw new UserFacingError(opts.signal?.aborted ? "Demande annulée." : "Le conseiller n'a pas répondu à temps. Réessayez.", opts.signal?.aborted ? "ABORTED" : "TIMEOUT");
    throw new UserFacingError(OFFLINE_MESSAGE, "OFFLINE");
  }
  try {
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.includes("ndjson")) {
      let message = res.status >= 500 ? "Le serveur MON STOCK est momentanément indisponible. Réessayez." : `Réponse inattendue du serveur (HTTP ${res.status}).`;
      let code = "SERVER";
      try {
        const json = (await res.json()) as { ok: boolean; error?: { code: string; message: string } };
        if (json && !json.ok && json.error) ({ message, code } = json.error);
      } catch {
        // corps illisible
      }
      throw new UserFacingError(message, code);
    }
    let reply: AdvisorReplyDTO | null = null;
    let failure: { code: string; message: string } | null = null;
    const handle = (events: AdvisorStreamEvent[]) => {
      for (const e of events) {
        if (e.type === "done") reply = e.reply;
        if (e.type === "error") failure = { code: e.code, message: e.message };
        onEvent(e);
      }
    };
    const body = res.body as (ReadableStream<Uint8Array> & { getReader?: () => ReadableStreamDefaultReader<Uint8Array> }) | null;
    if (body && typeof body.getReader === "function") {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseNdjson(buffer);
        buffer = parsed.rest;
        handle(parsed.events);
      }
      handle(parseNdjson(`${buffer}\n`).events);
    } else {
      // Repli (environnement sans flux) : réponse complète d'un coup, même format.
      handle(parseNdjson(`${await res.text()}\n`).events);
    }
    if (failure) throw new UserFacingError((failure as { message: string }).message, (failure as { code: string }).code);
    if (!reply) throw new UserFacingError("La réponse du conseiller a été coupée (connexion interrompue). Réessayez.", "INTERRUPTED");
    return reply;
  } catch (e) {
    if (e instanceof UserFacingError) throw e;
    if (e instanceof Error && e.name === "AbortError") throw new UserFacingError(opts.signal?.aborted ? "Demande annulée." : "Le conseiller n'a pas répondu à temps. Réessayez.", opts.signal?.aborted ? "ABORTED" : "TIMEOUT");
    throw new UserFacingError("La connexion a été interrompue pendant la réponse. Réessayez.", "INTERRUPTED");
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

export function confirmAdvisorAction(organizationId: string, actionId: string): Promise<AdvisorActionDecisionDTO> {
  return callApi<AdvisorActionDecisionDTO>("/advisor/actions/confirm", { method: "POST", organizationId, body: { actionId }, timeoutMs: 30_000 });
}

export function cancelAdvisorAction(organizationId: string, actionId: string): Promise<AdvisorActionDecisionDTO> {
  return callApi<AdvisorActionDecisionDTO>("/advisor/actions/cancel", { method: "POST", organizationId, body: { actionId }, timeoutMs: 30_000 });
}

export function fetchAdvisorStatus(organizationId: string): Promise<AdvisorStatusDTO> {
  return callApi<AdvisorStatusDTO>("/advisor/status", { organizationId });
}

export interface AdvisorConversation {
  id: string;
  title: string;
  lastMessageAt: string;
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

export async function fetchConversations(supabase: MobileSupabase, organizationId: string): Promise<AdvisorConversation[]> {
  const { data, error } = await supabase.from("advisor_conversations").select("id, title, last_message_at").eq("organization_id", organizationId).order("last_message_at", { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []).map((c) => ({ id: c.id, title: c.title, lastMessageAt: c.last_message_at }));
}

export async function fetchConversationMessages(supabase: MobileSupabase, organizationId: string, conversationId: string): Promise<AdvisorStoredMessage[]> {
  const { data, error } = await supabase
    .from("advisor_messages")
    .select("id, role, content, cards, sources, interrupted, created_at")
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((m) => ({
    id: m.id,
    role: m.role as AdvisorStoredMessage["role"],
    content: m.content,
    cards: Array.isArray(m.cards) ? (m.cards as unknown as AdvisorCardDTO[]) : [],
    sources: Array.isArray(m.sources) ? (m.sources as string[]) : [],
    interrupted: m.interrupted,
    createdAt: m.created_at,
  }));
}

export async function deleteConversation(supabase: MobileSupabase, organizationId: string, conversationId: string): Promise<void> {
  const { error } = await supabase.from("advisor_conversations").delete().eq("organization_id", organizationId).eq("id", conversationId);
  if (error) throw error;
}
