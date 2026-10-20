"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Database, Plus, Sparkles, Square } from "lucide-react";
import type { AdvisorActionDTO, AdvisorCardDTO, AdvisorStreamEvent } from "@/features/mobile-api/contract";
import { ADVISOR_MESSAGE_MAX_CHARS } from "@/features/mobile-api/contract";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/page";
import { Label, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { ADVISOR_CHAT_PATH, ADVISOR_CLIENT_TIMEOUT_MS, AdvisorStreamError, readAdvisorStream } from "@/features/advisor/stream";
import { ADVISOR_SUGGESTIONS, replaceActionInCards } from "@/features/advisor/view.pure";
import { cancelAdvisorActionAction, confirmAdvisorActionAction } from "@/features/advisor/actions";
import { AdvisorCardView } from "@/features/advisor/components/advisor-card";

/**
 * Conseiller e-commerce IA (web) : conversation ÉCRITE fondée sur les données réelles du compte
 * (calculs et outils exécutés sur le serveur, sous les droits de l'utilisateur). La voix reste
 * sur iPhone. Réponse affichée au fil de l'eau ; actions préparées exécutées seulement sur
 * « Confirmer ».
 */

export type ChatItem = {
  key: string;
  role: "user" | "assistant" | "notice";
  content: string;
  cards: AdvisorCardDTO[];
  sources: string[];
  interrupted?: boolean;
  error?: boolean;
  streaming?: boolean;
};

let seq = 0;
const nextKey = () => `k${Date.now().toString(36)}-${++seq}`;

function setConversationInUrl(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("conversation", id);
  else url.searchParams.delete("conversation");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
}

export function AdvisorChat({
  organizationName,
  initialConversationId,
  initialItems,
  configured,
  canConfirm,
  perUserPerHour,
  usedThisHour,
}: {
  organizationName: string;
  initialConversationId: string | null;
  initialItems: ChatItem[];
  /** false : IA non configurée côté serveur ; null : état inconnu (l'envoi reste possible, l'erreur sera expliquée) */
  configured: boolean | null;
  canConfirm: boolean;
  perUserPerHour: number | null;
  usedThisHour: number | null;
}) {
  const toast = useToast();
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [items, setItems] = useState<ChatItem[]>(initialItems);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [used, setUsed] = useState<number | null>(usedThisHour);
  const [announce, setAnnounce] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items]);

  const updateLast = useCallback((fn: (it: ChatItem) => ChatItem) => setItems((xs) => xs.map((it, i) => (i === xs.length - 1 ? fn(it) : it))), []);
  const disabled = configured === false;
  const quotaReached = perUserPerHour !== null && used !== null && used >= perUserPerHour;

  async function send(question: string) {
    const q = question.trim().slice(0, ADVISOR_MESSAGE_MAX_CHARS);
    if (!q || busy || disabled) return;
    setText("");
    setBusy(true);
    setStatusDetail(null);
    setAnnounce("Le conseiller analyse vos données…");
    setItems((xs) => [...xs, { key: nextKey(), role: "user", content: q, cards: [], sources: [] }, { key: nextKey(), role: "assistant", content: "", cards: [], sources: [], streaming: true }]);
    const controller = new AbortController();
    abortRef.current = controller;
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, ADVISOR_CLIENT_TIMEOUT_MS);
    let counted = false;
    try {
      const res = await fetch(ADVISOR_CHAT_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        body: JSON.stringify({ conversationId, message: q }),
        signal: controller.signal,
        cache: "no-store",
      });
      const reply = await readAdvisorStream(res, (e: AdvisorStreamEvent) => {
        if (!counted) {
          counted = true;
          setUsed((u) => (u === null ? null : u + 1));
        }
        if (e.type === "conversation") {
          setConversationId(e.conversationId);
          setConversationInUrl(e.conversationId);
        } else if (e.type === "status") setStatusDetail(`Consultation : ${e.label}`);
        else if (e.type === "text") updateLast((it) => ({ ...it, content: it.content + e.delta }));
        else if (e.type === "card") updateLast((it) => ({ ...it, cards: [...it.cards, e.card] }));
      });
      setConversationId(reply.conversationId);
      setConversationInUrl(reply.conversationId);
      updateLast((it) => ({ ...it, content: reply.answer, cards: reply.cards, sources: reply.sources, interrupted: reply.interrupted, streaming: false }));
      setAnnounce(reply.interrupted ? "Réponse incomplète reçue." : "Réponse reçue.");
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      const message = aborted ? (timedOut ? "Le conseiller n'a pas répondu à temps. Réessayez." : "Demande arrêtée.") : e instanceof AdvisorStreamError ? e.message : "Le serveur MON STOCK est injoignable. Vérifiez votre connexion et réessayez.";
      if (e instanceof AdvisorStreamError && e.code === "RATE_LIMITED" && perUserPerHour !== null) setUsed((u) => (u === null ? u : Math.max(u, perUserPerHour)));
      updateLast((it) => (it.content ? { ...it, streaming: false, interrupted: true } : { ...it, content: message, error: true, streaming: false }));
      setAnnounce(message);
    } finally {
      window.clearTimeout(timer);
      setBusy(false);
      setStatusDetail(null);
      abortRef.current = null;
      document.getElementById("advisor-input")?.focus();
    }
  }

  async function decide(action: AdvisorActionDTO, kind: "confirm" | "cancel") {
    setBusyActionId(action.id);
    try {
      const r = kind === "confirm" ? await confirmAdvisorActionAction(action.id) : await cancelAdvisorActionAction(action.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setItems((xs) => [...xs.map((it) => ({ ...it, cards: replaceActionInCards(it.cards, r.data.action) })), { key: nextKey(), role: "notice", content: r.data.message, cards: [], sources: [] }]);
      setAnnounce(r.data.message);
    } catch {
      toast.error("Le serveur n'a pas répondu. Réessayez.");
    } finally {
      setBusyActionId(null);
    }
  }

  function newConversation() {
    abortRef.current?.abort();
    setConversationId(null);
    setItems([]);
    setText("");
    setConversationInUrl(null);
    document.getElementById("advisor-input")?.focus();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(text);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(text);
    }
  }

  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm text-muted">
          {conversationId ? "Conversation en cours" : "Nouvelle conversation"}
          {perUserPerHour !== null && used !== null ? (
            <Badge variant={quotaReached ? "danger" : "neutral"}>
              {Math.min(used, perUserPerHour)} / {perUserPerHour} questions cette heure
            </Badge>
          ) : null}
        </div>
        <Button variant="ghost" size="sm" onClick={newConversation}>
          <Plus aria-hidden="true" className="h-3.5 w-3.5" /> Nouvelle conversation
        </Button>
      </div>

      <div ref={logRef} role="log" aria-label="Conversation avec le conseiller" className="max-h-[62vh] min-h-[320px] flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {items.length === 0 ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles aria-hidden="true" className="h-5 w-5 text-accent" />
              <h2 className="text-base font-semibold text-foreground">Votre conseiller</h2>
            </div>
            <p className="max-w-2xl text-sm text-muted-strong">
              Écrivez-lui comme à un collaborateur : il consulte vos ventes, marges, stock, commandes et expéditions ({organizationName}), explique ses chiffres et peut préparer des actions que vous confirmez.
            </p>
            {perUserPerHour !== null ? <p className="text-xs text-muted">Limite : {perUserPerHour} questions par heure. Données manquantes signalées, jamais inventées.</p> : null}
            <ul className="grid gap-2 sm:grid-cols-2">
              {ADVISOR_SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => void send(s)}
                    disabled={busy || disabled}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-left text-sm text-foreground hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          items.map((it) => (
            <div key={it.key} className="space-y-2">
              {it.role === "assistant" && it.streaming && !it.content ? null : <Bubble item={it} />}
              {it.cards.length > 0 ? (
                <div className="grid max-w-3xl gap-2 lg:grid-cols-2">
                  {it.cards.map((c, i) => (
                    <AdvisorCardView key={`${it.key}-c${i}`} card={c} busyActionId={busyActionId} canConfirm={canConfirm} onConfirm={(a) => void decide(a, "confirm")} onCancel={(a) => void decide(a, "cancel")} />
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="sr-only" aria-live="polite">
        {announce}
      </div>

      <form onSubmit={onSubmit} className="space-y-2 border-t border-border px-4 py-3">
        {busy ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-muted px-3 py-2 text-sm">
            <div className="flex min-w-0 items-center gap-2">
              <Database aria-hidden="true" className="h-4 w-4 shrink-0 animate-pulse text-muted" />
              <span className="min-w-0">
                <span className="text-foreground">Le conseiller analyse vos données…</span>
                {statusDetail ? <span className="block truncate text-xs text-muted">{statusDetail}</span> : null}
              </span>
            </div>
            <Button variant="secondary" size="sm" onClick={() => abortRef.current?.abort()}>
              <Square aria-hidden="true" className="h-3 w-3 fill-current" /> Arrêter
            </Button>
          </div>
        ) : null}
        {quotaReached && !busy ? <p className="text-xs text-danger">Limite horaire atteinte ({perUserPerHour} questions par heure). Réessayez plus tard.</p> : null}
        <Label htmlFor="advisor-input" className="sr-only">
          Question au conseiller
        </Label>
        <div className="flex items-end gap-2">
          <Textarea
            id="advisor-input"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, ADVISOR_MESSAGE_MAX_CHARS))}
            onKeyDown={onKeyDown}
            placeholder={disabled ? "Conseiller non activé sur le serveur" : "Posez votre question… (Entrée pour envoyer, Maj+Entrée pour aller à la ligne)"}
            rows={2}
            maxLength={ADVISOR_MESSAGE_MAX_CHARS}
            disabled={busy || disabled}
            className="min-h-[44px] flex-1 resize-y"
            aria-describedby="advisor-input-hint"
          />
          <Button type="submit" disabled={!text.trim() || busy || disabled} aria-label="Envoyer la question" className="h-11 w-11 shrink-0 rounded-full p-0">
            <ArrowUp aria-hidden="true" className="h-5 w-5" />
          </Button>
        </div>
        <p id="advisor-input-hint" className="flex justify-between gap-2 text-xs text-muted">
          <span>La conversation vocale est disponible dans l&apos;application iPhone.</span>
          <span className="tnum">
            {text.length} / {ADVISOR_MESSAGE_MAX_CHARS}
          </span>
        </p>
      </form>
    </div>
  );
}

function Bubble({ item }: { item: ChatItem }) {
  if (item.role === "notice") {
    return <p className="mx-auto max-w-[92%] rounded-lg bg-surface-muted px-3 py-2 text-center text-xs text-muted-strong">{item.content}</p>;
  }
  const mine = item.role === "user";
  return (
    <div className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm",
          mine ? "bg-foreground text-white" : item.error ? "border border-red-200 bg-danger-soft text-red-800" : "border border-border bg-background text-foreground",
        )}
      >
        {item.content}
        {item.streaming ? <span aria-hidden="true" className="ml-0.5 animate-pulse text-muted">▍</span> : null}
      </div>
      {item.interrupted ? <Badge variant="warning">Réponse incomplète</Badge> : null}
      {item.sources.length > 0 ? (
        <p className="flex max-w-[92%] items-start gap-1 px-1 text-xs text-muted">
          <Database aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
          <span>Données consultées : {item.sources.join(", ")}</span>
        </p>
      ) : null}
    </div>
  );
}

export function AdvisorNotConfigured() {
  return (
    <Callout tone="warning" title="Le conseiller n'est pas encore activé sur le serveur.">
      La clé OPENAI_API_KEY doit être ajoutée par l&apos;administrateur dans les secrets du serveur MON STOCK.
    </Callout>
  );
}
