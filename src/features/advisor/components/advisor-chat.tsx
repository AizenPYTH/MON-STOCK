"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type Dispatch, type FormEvent, type KeyboardEvent, type ReactNode, type SetStateAction } from "react";
import Link from "next/link";
import { ArrowUp, Database, MessageSquarePlus, Square } from "lucide-react";
import type { AdvisorActionDTO, AdvisorStreamEvent } from "@/features/mobile-api/contract";
import { ADVISOR_MESSAGE_MAX_CHARS } from "@/features/mobile-api/contract";
import { cn } from "@/lib/utils";
import { ADVISOR_CHAT_PATH, ADVISOR_CLIENT_TIMEOUT_MS, AdvisorStreamError, readAdvisorStream } from "@/features/advisor/stream";
import { ADVISOR_INTRO, ADVISOR_SUGGESTIONS, conversationTitleFrom, quotaView, replaceActionInCards, type ChatItem } from "@/features/advisor/view.pure";
import { cancelAdvisorActionAction, confirmAdvisorActionAction } from "@/features/advisor/actions";
import { rememberConversation } from "@/features/advisor/remember";
import { AdvisorCardView } from "@/features/advisor/components/advisor-card";

export type { ChatItem } from "@/features/advisor/view.pure";

/**
 * Conseiller e-commerce IA (web, v5) : conversation ÉCRITE fondée sur les données réelles du
 * compte (calculs et outils exécutés sur le serveur, sous les droits de l'utilisateur). Réponse
 * affichée au fil de l'eau ; actions préparées exécutées seulement sur « Confirmer ». Même
 * composant pour la page (historique à gauche) et le panneau ⌘J.
 */

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

let seq = 0;
const nextKey = () => `k${Date.now().toString(36)}-${++seq}`;

function setConversationInUrl(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("conversation", id);
  else url.searchParams.delete("conversation");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
}

// ---------------------------------------------------------------------------
// Quota partagé (scène ou en-tête du panneau ↔ conversation)
// ---------------------------------------------------------------------------

type Usage = { used: number | null; setUsed: Dispatch<SetStateAction<number | null>>; limit: number | null };
const UsageContext = createContext<Usage | null>(null);

/** Compteur de questions de l'heure partagé entre l'affichage du quota et la conversation. */
export function AdvisorUsageProvider({ initialUsed, limit, children }: { initialUsed: number | null; limit: number | null; children: ReactNode }) {
  const [used, setUsed] = useState<number | null>(initialUsed);
  return <UsageContext.Provider value={{ used, setUsed, limit }}>{children}</UsageContext.Provider>;
}

/** Quota réel (statut serveur + journal d'usage) ; « — » si l'un des deux est indisponible. */
export function AdvisorQuota({ variant }: { variant: "scene" | "panel" }) {
  const usage = useContext(UsageContext);
  const q = quotaView(usage?.used ?? null, usage?.limit ?? null);
  if (variant === "panel") {
    return <span className="ms-code truncate text-[10px] leading-[13px] tracking-[0.04em] text-on-night-muted">{q.ratio === null ? "Quota : —" : q.text}</span>;
  }
  return (
    <div className="flex w-[260px] max-w-full flex-col gap-1.5">
      <span className="ms-mono text-[10px] leading-[13px] text-on-night-subtle">Quota</span>
      <span className={cn("text-sm font-bold tnum", q.reached ? "text-danger-on-night" : "text-on-night")}>{q.text}</span>
      <span
        role={q.ratio === null ? undefined : "meter"}
        aria-label={q.ratio === null ? undefined : "Questions utilisées cette heure"}
        aria-valuemin={q.ratio === null ? undefined : 0}
        aria-valuemax={q.ratio === null ? undefined : (usage?.limit ?? undefined)}
        aria-valuenow={q.ratio === null ? undefined : Math.min(usage?.used ?? 0, usage?.limit ?? 0)}
        className="block h-1 overflow-hidden rounded-sm bg-night-stroke"
      >
        {q.ratio === null ? null : <span className={cn("ms-grow-x block h-1", q.reached ? "bg-danger-on-night" : "bg-mint")} style={{ width: `${Math.max(q.ratio * 100, q.ratio > 0 ? 2 : 0)}%` }} />}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------

export interface AdvisorHistoryEntry {
  id: string;
  title: string;
  /** date relative déjà formatée (« il y a 2 h », « 12/10 ») */
  when: string;
}

export function AdvisorChat({
  organizationName,
  initialConversationId,
  initialItems,
  configured,
  canConfirm,
  perUserPerHour,
  usedThisHour,
  variant = "page",
  history,
  historyError,
  onConversationChange,
  notices,
}: {
  organizationName: string;
  initialConversationId: string | null;
  initialItems: ChatItem[];
  /** false : IA non configurée côté serveur ; null : état inconnu (l'envoi reste possible, l'erreur sera expliquée) */
  configured: boolean | null;
  canConfirm: boolean;
  perUserPerHour: number | null;
  usedThisHour: number | null;
  /** « page » : historique à gauche, adresse synchronisée ; « panel » : panneau ⌘J */
  variant?: "page" | "panel";
  /** conversations récentes (page) ; null si illisibles */
  history?: AdvisorHistoryEntry[] | null;
  historyError?: string | null;
  onConversationChange?: (id: string | null) => void;
  /** messages d'état à afficher en tête (non configuré, serveur injoignable…) */
  notices?: ReactNode;
}) {
  const shared = useContext(UsageContext);
  const [localUsed, setLocalUsed] = useState<number | null>(usedThisHour);
  const used = shared ? shared.used : localUsed;
  const setUsed = shared ? shared.setUsed : setLocalUsed;
  const page = variant === "page";

  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [items, setItems] = useState<ChatItem[]>(initialItems);
  const [localHistory, setLocalHistory] = useState<AdvisorHistoryEntry[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const changeRef = useRef(onConversationChange);
  useEffect(() => {
    changeRef.current = onConversationChange;
  }, [onConversationChange]);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    rememberConversation(conversationId);
    changeRef.current?.(conversationId);
  }, [conversationId]);
  useEffect(() => {
    if (!page) {
      const el = logRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    } else if (items.length > 0) endRef.current?.scrollIntoView({ block: "nearest" });
  }, [items, page]);

  const adopt = useCallback(
    (id: string, question: string) => {
      setConversationId(id);
      if (page) setConversationInUrl(id);
      if (page && history && !history.some((h) => h.id === id)) setLocalHistory((xs) => (xs.some((h) => h.id === id) ? xs : [{ id, title: conversationTitleFrom(question), when: "à l'instant" }, ...xs]));
    },
    [page, history],
  );

  const updateLast = useCallback((fn: (it: ChatItem) => ChatItem) => setItems((xs) => xs.map((it, i) => (i === xs.length - 1 ? fn(it) : it))), []);
  const disabled = configured === false;
  const quota = quotaView(used, perUserPerHour);

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
        if (e.type === "conversation") adopt(e.conversationId, q);
        else if (e.type === "status") setStatusDetail(`Consultation : ${e.label}`);
        else if (e.type === "text") updateLast((it) => ({ ...it, content: it.content + e.delta }));
        else if (e.type === "card") updateLast((it) => ({ ...it, cards: [...it.cards, e.card] }));
      });
      adopt(reply.conversationId, q);
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
      inputRef.current?.focus();
    }
  }

  async function decide(action: AdvisorActionDTO, kind: "confirm" | "cancel") {
    setBusyActionId(action.id);
    try {
      const r = kind === "confirm" ? await confirmAdvisorActionAction(action.id) : await cancelAdvisorActionAction(action.id);
      if (!r.ok) {
        setItems((xs) => [...xs, { key: nextKey(), role: "notice", content: r.error, cards: [], sources: [], error: true }]);
        setAnnounce(r.error);
        return;
      }
      setItems((xs) => [...xs.map((it) => ({ ...it, cards: replaceActionInCards(it.cards, r.data.action) })), { key: nextKey(), role: "notice", content: r.data.message, cards: [], sources: [] }]);
      setAnnounce(r.data.message);
    } catch {
      const message = "Le serveur n'a pas répondu. Réessayez.";
      setItems((xs) => [...xs, { key: nextKey(), role: "notice", content: message, cards: [], sources: [], error: true }]);
      setAnnounce(message);
    } finally {
      setBusyActionId(null);
    }
  }

  function newConversation() {
    abortRef.current?.abort();
    setConversationId(null);
    setItems([]);
    setText("");
    if (page) setConversationInUrl(null);
    inputRef.current?.focus();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) abortRef.current?.abort();
    else void send(text);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(text);
    }
  }

  const suggestions = page && items.length === 0 ? ADVISOR_SUGGESTIONS : ADVISOR_SUGGESTIONS.slice(0, 3);

  const messages = (
    <>
      <p className="max-w-[92%] self-center rounded-xl bg-line-soft px-3 py-2 text-center text-[13px] font-semibold leading-[18px] text-muted">{ADVISOR_INTRO}</p>
      {notices}
      {items.length === 0 ? (
        <p className="max-w-[92%] self-center px-3 text-center text-[13px] font-semibold leading-[18px] text-ink-3">
          Posez votre question comme à un collaborateur : le conseiller consulte les ventes, marges, stock, commandes et expéditions de {organizationName}.
        </p>
      ) : null}
      {items.map((it) => (
        <MessageView key={it.key} item={it} statusDetail={it.streaming ? statusDetail : null}>
          {it.cards.map((c, i) => (
            <AdvisorCardView key={`${it.key}-c${i}`} card={c} busyActionId={busyActionId} canConfirm={canConfirm} onConfirm={(a) => void decide(a, "confirm")} onCancel={(a) => void decide(a, "cancel")} />
          ))}
        </MessageView>
      ))}
      <div ref={endRef} aria-hidden="true" className="scroll-mb-56" />
    </>
  );

  const composer = (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <ul aria-label="Questions suggérées" className="flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <li key={s}>
            <button type="button" onClick={() => void send(s)} disabled={busy || disabled} className={cn("relative min-h-8 rounded-full border border-border bg-surface px-3 py-1 text-left text-[12.5px] font-bold leading-[17px] hover:bg-line-soft disabled:opacity-50", "after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']", FOCUS)}>
              {s}
            </button>
          </li>
        ))}
      </ul>
      {quota.reached && !busy ? (
        <p role="status" className="text-xs font-semibold text-danger">
          Limite horaire atteinte ({perUserPerHour} questions par heure). Réessayez plus tard.
        </p>
      ) : null}
      <div className="flex items-end gap-2 rounded-2xl border border-border-strong bg-surface py-2 pl-3.5 pr-2 focus-within:ring-2 focus-within:ring-ring">
        <label htmlFor={`advisor-input-${variant}`} className="sr-only">
          Votre question
        </label>
        <textarea
          ref={inputRef}
          id={`advisor-input-${variant}`}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, ADVISOR_MESSAGE_MAX_CHARS))}
          onKeyDown={onKeyDown}
          placeholder={disabled ? "Conseiller non activé sur le serveur" : "Posez une question sur vos ventes, votre stock, vos fournisseurs…"}
          rows={2}
          maxLength={ADVISOR_MESSAGE_MAX_CHARS}
          disabled={busy || disabled}
          aria-describedby={`advisor-hint-${variant}`}
          className="max-h-48 min-h-[50px] flex-1 resize-none bg-transparent py-1 text-[15px] font-semibold leading-[21px] text-foreground placeholder:text-ink-4 focus:outline-none disabled:cursor-not-allowed"
        />
        {busy ? (
          <button type="submit" aria-label="Arrêter la réponse" className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-night text-on-night hover:bg-night-raised", FOCUS)}>
            <Square aria-hidden="true" className="h-3.5 w-3.5 fill-current" />
          </button>
        ) : (
          <button type="submit" disabled={!text.trim() || disabled} aria-label="Envoyer la question" className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint text-night hover:bg-mint-pressed disabled:bg-line-soft disabled:text-ink-4", FOCUS)}>
            <ArrowUp aria-hidden="true" className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>
      <p id={`advisor-hint-${variant}`} className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-xs font-semibold leading-[17px] text-ink-3">
        <span>Entrée pour envoyer · Maj+Entrée pour aller à la ligne. Les réponses citent vos données ; aucune action n&apos;est exécutée sans « Confirmer ».</span>
        {text.length > ADVISOR_MESSAGE_MAX_CHARS * 0.8 ? (
          <span className="tnum">
            {text.length} / {ADVISOR_MESSAGE_MAX_CHARS}
          </span>
        ) : null}
      </p>
    </form>
  );

  const live = (
    <div className="sr-only" aria-live="polite">
      {announce}
    </div>
  );

  if (!page) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={logRef} role="log" aria-label="Conversation avec le conseiller" className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-4">
          {messages}
        </div>
        {live}
        <div className="shrink-0 border-t border-border bg-background px-4 pb-4 pt-3">{composer}</div>
      </div>
    );
  }

  const entries = [...localHistory, ...(history ?? [])];
  return (
    <div className="flex flex-wrap items-start gap-6">
      <aside aria-label="Historique des conversations" className="flex min-w-[min(240px,100%)] flex-[0_1_280px] flex-col gap-2.5 max-lg:order-last xl:sticky xl:top-[72px]">
        <button type="button" onClick={newConversation} className={cn("flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border-strong bg-surface text-sm font-extrabold hover:bg-line-soft", FOCUS)}>
          <MessageSquarePlus aria-hidden="true" className="h-4 w-4" />
          Nouvelle conversation
        </button>
        <h2 className="ms-mono text-[11px] leading-[22px] tracking-[0.08em] text-muted">Historique</h2>
        {historyError ? (
          <p role="alert" className="text-[13px] font-semibold text-danger">
            Historique illisible : {historyError}
          </p>
        ) : entries.length === 0 ? (
          <p className="text-[13px] font-semibold text-ink-3">Aucune conversation pour le moment.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {entries.map((h) => {
              const active = h.id === conversationId;
              return (
                <li key={h.id}>
                  <Link
                    href={`/advisor?conversation=${h.id}` as never}
                    aria-current={active ? "page" : undefined}
                    className={cn("flex flex-col gap-0.5 rounded-xl px-3 py-2.5 hover:bg-selection", active && "bg-selection", FOCUS)}
                  >
                    <span className={cn("line-clamp-2 text-sm leading-[19px]", active ? "font-bold" : "font-semibold")}>{h.title}</span>
                    <span className="ms-code text-[10.5px] text-ink-3">{h.when}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <Link href="/advisor/history" className={cn("inline-flex min-h-10 items-center rounded px-1 text-[13px] font-bold hover:underline hover:underline-offset-2", FOCUS)}>
          Gérer les conversations
        </Link>
      </aside>
      <section aria-label="Conversation" className="flex min-w-0 max-w-[820px] flex-[1_1_560px] flex-col gap-4">
        <div ref={logRef} role="log" aria-label="Conversation avec le conseiller" className="flex flex-col gap-3.5">
          {messages}
        </div>
        {live}
        <div className="z-10 -mx-1 bg-background px-1 pb-3 pt-2 lg:sticky lg:bottom-0">{composer}</div>
      </section>
    </div>
  );
}

function MessageView({ item, statusDetail, children }: { item: ChatItem; statusDetail: string | null; children: ReactNode }) {
  if (item.role === "notice") {
    return <p className={cn("max-w-[92%] self-center rounded-xl px-3 py-2 text-center text-[13px] font-semibold leading-[18px]", item.error ? "bg-danger-soft text-danger" : "bg-line-soft text-muted")}>{item.content}</p>;
  }
  if (item.role === "user") {
    return <div className="ms-fade max-w-[80%] self-end whitespace-pre-wrap break-words rounded-2xl bg-foreground px-3.5 py-3 text-[15px] font-semibold leading-[21px] text-on-night">{item.content}</div>;
  }
  if (item.streaming && !item.content) {
    return (
      <div role="status" className="flex items-center gap-2.5 self-start rounded-2xl bg-line-soft px-3 py-2.5 text-sm font-semibold text-muted">
        <span aria-hidden="true" className="ms-pulse h-2 w-2 shrink-0 rounded-full bg-foreground" />
        <span className="min-w-0">
          Le conseiller analyse vos données…
          {statusDetail ? <span className="block truncate text-xs font-semibold text-ink-3">{statusDetail}</span> : null}
        </span>
      </div>
    );
  }
  return (
    <>
      <div className="flex max-w-[88%] flex-col gap-1 self-start">
        <div className={cn("whitespace-pre-wrap break-words rounded-2xl border px-3.5 py-3 text-[15px] font-medium leading-[21px]", item.error ? "border-danger-line bg-danger-soft text-danger" : "border-border bg-surface text-foreground")}>
          {item.content}
          {item.streaming ? <span aria-hidden="true" className="ms-pulse ml-0.5 text-ink-3">▍</span> : null}
        </div>
        {item.interrupted ? <span className="self-start rounded-md bg-warning-soft px-2 py-0.5 text-[11px] font-bold text-warning">Réponse incomplète</span> : null}
        {item.sources.length > 0 ? (
          <p className="flex items-start gap-1 px-1 text-[12.5px] font-semibold text-ink-3">
            <Database aria-hidden="true" className="mt-[3px] h-3 w-3 shrink-0" />
            <span>Données consultées : {item.sources.join(", ")}</span>
          </p>
        ) : null}
      </div>
      {children}
    </>
  );
}

export function AdvisorNotConfigured() {
  return (
    <div role="status" className="self-stretch rounded-2xl border border-[#f1dcb8] bg-warning-soft px-4 py-3 text-[13.5px] font-semibold leading-[19px] text-warning">
      <p className="font-bold">Le conseiller n&apos;est pas encore activé sur le serveur.</p>
      <p className="mt-0.5">La clé OPENAI_API_KEY doit être ajoutée par l&apos;administrateur dans les secrets du serveur MON STOCK.</p>
    </div>
  );
}

/** État du conseiller illisible (serveur injoignable, aperçu…) : l'envoi reste possible. */
export function AdvisorStatusUnavailable({ message }: { message: string }) {
  return (
    <div role="status" className="self-stretch rounded-2xl border border-border bg-surface px-4 py-3 text-[13.5px] font-semibold leading-[19px] text-muted">
      <p className="font-bold text-foreground">État du conseiller indisponible.</p>
      <p className="mt-0.5">{message} Vous pouvez tout de même poser une question : un message clair s&apos;affichera si le conseiller ne peut pas répondre.</p>
    </div>
  );
}
