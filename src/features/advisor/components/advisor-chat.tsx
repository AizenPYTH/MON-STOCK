"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type Dispatch, type FormEvent, type KeyboardEvent, type ReactNode, type SetStateAction } from "react";
import Link from "next/link";
import { ArrowUp, AudioLines, Database, History, MessageSquarePlus, Mic, Sparkles, Square, TriangleAlert, Volume2, VolumeX } from "lucide-react";
import type { AdvisorActionDTO, AdvisorStreamEvent } from "@/features/mobile-api/contract";
import { ADVISOR_MESSAGE_MAX_CHARS } from "@/features/mobile-api/contract";
import { cn } from "@/lib/utils";
import { ADVISOR_CHAT_PATH, ADVISOR_CLIENT_TIMEOUT_MS, AdvisorStreamError, readAdvisorStream } from "@/features/advisor/stream";
import { ADVISOR_INTRO, ADVISOR_SUGGESTIONS, quotaView, replaceActionInCards, type ChatItem } from "@/features/advisor/view.pure";
import { cancelAdvisorActionAction, confirmAdvisorActionAction } from "@/features/advisor/actions";
import { rememberConversation } from "@/features/advisor/remember";
import { AdvisorCardView } from "@/features/advisor/components/advisor-card";
import { useDictation, useDictationSupported, useSpeaker, useVoicePrefs, VOICE_CHOICES } from "@/features/advisor/voice";

export type { ChatItem } from "@/features/advisor/view.pure";

/**
 * Conseiller e-commerce IA (web) : conversation écrite OU vocale, comme sur l'iPhone (dictée du
 * navigateur, réponse lue avec la voix de l'application), fondée sur les données réelles du compte
 * (outils exécutés sur le serveur, sous les droits de l'utilisateur). Réponse affichée au fil de
 * l'eau ; actions préparées exécutées seulement sur « Confirmer ». Même composant pour la page
 * (colonne unique, gros micro) et le panneau ⌘J.
 */

/** Mode conversation : l'écoute reste ouverte quelques secondes après la fin de la réponse lue. */
const CONVERSATION_GRACE_MS = 8_000;

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
  /** « page » : page dédiée, adresse synchronisée ; « panel » : panneau ⌘J */
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

  const [prefs, setPrefs] = useVoicePrefs();
  const speaker = useSpeaker(prefs.voice);
  const canDictate = useDictationSupported();
  const sendRef = useRef<(q: string, voice?: boolean) => void>(() => {});
  const listenAgainRef = useRef<() => void>(() => {});
  const dictation = useDictation(
    (heard) => sendRef.current(heard, true),
    () => listenAgainRef.current(),
  );
  // Mode conversation (comme ChatGPT) : après une question dictée, la réponse est lue PENDANT que
  // le micro écoute — parler coupe la voix — puis l'écoute continue pour la question suivante.
  const convRef = useRef<{ active: boolean; answer: string | null; endedAt: number | null }>({ active: false, answer: null, endedAt: null });
  const [conversing, setConversing] = useState(false);

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
    (id: string) => {
      setConversationId(id);
      if (page) setConversationInUrl(id);
    },
    [page],
  );

  const updateLast = useCallback((fn: (it: ChatItem) => ChatItem) => setItems((xs) => xs.map((it, i) => (i === xs.length - 1 ? fn(it) : it))), []);
  const disabled = configured === false;
  const quota = quotaView(used, perUserPerHour);

  async function send(question: string, voice = false) {
    const q = question.trim().slice(0, ADVISOR_MESSAGE_MAX_CHARS);
    if (!q || busy || disabled) return;
    speaker.stop();
    setText("");
    setBusy(true);
    setStatusDetail(null);
    setAnnounce("Le conseiller analyse vos données…");
    const replyKey = nextKey();
    setItems((xs) => [...xs, { key: nextKey(), role: "user", content: q, cards: [], sources: [] }, { key: replyKey, role: "assistant", content: "", cards: [], sources: [], streaming: true }]);
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
        body: JSON.stringify({ conversationId, message: q, voice }),
        signal: controller.signal,
        cache: "no-store",
      });
      const reply = await readAdvisorStream(res, (e: AdvisorStreamEvent) => {
        if (!counted) {
          counted = true;
          setUsed((u) => (u === null ? null : u + 1));
        }
        if (e.type === "conversation") adopt(e.conversationId);
        else if (e.type === "status") setStatusDetail(`Consultation : ${e.label}`);
        else if (e.type === "text") updateLast((it) => ({ ...it, content: it.content + e.delta }));
        else if (e.type === "card") updateLast((it) => ({ ...it, cards: [...it.cards, e.card] }));
      });
      adopt(reply.conversationId);
      updateLast((it) => ({ ...it, content: reply.answer, cards: reply.cards, sources: reply.sources, interrupted: reply.interrupted, streaming: false, messageId: reply.messageId }));
      setAnnounce(reply.interrupted ? "Réponse incomplète reçue." : "Réponse reçue.");
      // Question dictée (ou « lire les réponses ») : réponse lue avec la voix de l'application.
      if ((voice || prefs.autoRead) && reply.answer) {
        const conv = voice && prefs.conversation;
        convRef.current = { active: conv, answer: conv ? reply.answer : null, endedAt: null };
        setConversing(conv);
        speaker.speak(replyKey, reply.answer, reply.messageId, () => {
          convRef.current.endedAt = Date.now();
        });
        if (conv) listenDuring(reply.answer);
      } else if (voice) endConversation();
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      const message = aborted ? (timedOut ? "Le conseiller n'a pas répondu à temps. Réessayez." : "Demande arrêtée.") : e instanceof AdvisorStreamError ? e.message : "Le serveur MON STOCK est injoignable. Vérifiez votre connexion et réessayez.";
      if (e instanceof AdvisorStreamError && e.code === "RATE_LIMITED" && perUserPerHour !== null) setUsed((u) => (u === null ? u : Math.max(u, perUserPerHour)));
      updateLast((it) => (it.content ? { ...it, streaming: false, interrupted: true } : { ...it, content: message, error: true, streaming: false }));
      setAnnounce(message);
      endConversation();
    } finally {
      window.clearTimeout(timer);
      setBusy(false);
      setStatusDetail(null);
      abortRef.current = null;
      if (!voice) inputRef.current?.focus();
    }
  }
  useEffect(() => {
    sendRef.current = (q, voice) => void send(q, voice);
    listenAgainRef.current = () => {
      const c = convRef.current;
      // Silence ou écho seul : l'écoute reprend tant que le conseiller parle et quelques secondes après.
      if (c.active && (speaker.isSpeaking() || (c.endedAt !== null && Date.now() - c.endedAt < CONVERSATION_GRACE_MS))) listenDuring(c.answer);
      else endConversation();
    };
  });

  function listenDuring(answer: string | null) {
    dictation.start({
      conversation: true,
      echoOf: answer,
      onBargeIn: () => {
        if (!speaker.isSpeaking()) return;
        speaker.stop();
        convRef.current.endedAt = Date.now();
      },
    });
  }

  function endConversation() {
    convRef.current = { active: false, answer: null, endedAt: null };
    setConversing(false);
    dictation.cancel();
    speaker.stop();
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
    endConversation();
    setConversationId(null);
    setItems([]);
    setText("");
    if (page) setConversationInUrl(null);
    inputRef.current?.focus();
  }

  function toggleMic() {
    // Conversation : toucher le micro pendant que le conseiller parle lui coupe la parole.
    if (convRef.current.active && speaker.isSpeaking()) {
      speaker.stop();
      convRef.current.endedAt = Date.now();
      if (!dictation.listening) listenDuring(null);
      return;
    }
    if (dictation.listening) {
      if (dictation.transcript) dictation.stop();
      else endConversation();
      return;
    }
    // Hors conversation : toucher le micro pendant la lecture arrête la voix et écoute.
    speaker.stop();
    speaker.unlock();
    dictation.start();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) abortRef.current?.abort();
    else {
      speaker.unlock();
      void send(text);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      speaker.unlock();
      void send(text);
    }
  }

  const listening = dictation.listening;
  const empty = items.length === 0;
  const recent = page && !historyError ? (history ?? []).slice(0, 3) : [];

  const voiceBar = (
    <div className="flex flex-wrap items-center gap-2">
      {canDictate ? (
        <button
          type="button"
          onClick={() => setPrefs({ conversation: !prefs.conversation })}
          aria-pressed={prefs.conversation}
          title="Après une question dictée : la réponse est lue pendant que le micro écoute — parlez pour couper la parole au conseiller — puis l'écoute reprend"
          className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-bold", prefs.conversation ? "border-inverse bg-inverse text-on-inverse hover:bg-inverse-hover" : "border-border-strong bg-surface text-foreground hover:bg-surface-2", FOCUS)}
        >
          <AudioLines aria-hidden="true" className="h-3.5 w-3.5" />
          Conversation
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => setPrefs({ autoRead: !prefs.autoRead })}
        aria-pressed={prefs.autoRead}
        title="Lire à voix haute toutes les réponses (les questions dictées sont toujours lues)"
        className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-bold", prefs.autoRead ? "border-inverse bg-inverse text-on-inverse hover:bg-inverse-hover" : "border-border-strong bg-surface text-foreground hover:bg-surface-2", FOCUS)}
      >
        {prefs.autoRead ? <Volume2 aria-hidden="true" className="h-3.5 w-3.5" /> : <VolumeX aria-hidden="true" className="h-3.5 w-3.5" />}
        Lire les réponses
      </button>
      <label className="sr-only" htmlFor={`advisor-voice-${variant}`}>
        Voix du conseiller
      </label>
      <select
        id={`advisor-voice-${variant}`}
        value={prefs.voice}
        onChange={(e) => setPrefs({ voice: e.target.value === "cedar" ? "cedar" : "marin" })}
        className={cn("min-h-9 cursor-pointer rounded-full border border-border-strong bg-surface px-3 text-[12.5px] font-bold text-foreground hover:bg-surface-2", FOCUS)}
      >
        {VOICE_CHOICES.map((v) => (
          <option key={v.id} value={v.id}>
            Voix : {v.label}
          </option>
        ))}
      </select>
    </div>
  );

  const messages = (
    <>
      {notices}
      {empty && page ? (
        <div className="flex flex-col items-center gap-4 py-6 text-center sm:py-10">
          {canDictate ? (
            <>
              <button
                type="button"
                onClick={toggleMic}
                disabled={busy || disabled}
                aria-label={listening ? "Arrêter l'écoute et envoyer" : "Parler au conseiller"}
                className={cn("relative flex h-28 w-28 items-center justify-center rounded-full transition-[transform,background-color] duration-150 active:scale-95 disabled:opacity-50", listening ? "bg-danger-strong text-on-danger-strong ring-[12px] ring-danger-soft" : "bg-mint text-night ring-[12px] ring-mint/15 hover:bg-mint-pressed", FOCUS)}
              >
                {listening ? <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-danger-strong/30 motion-reduce:animate-none" /> : null}
                {listening ? <Square aria-hidden="true" className="relative h-8 w-8 fill-current" /> : <Mic aria-hidden="true" className="h-11 w-11" />}
              </button>
              <p className="mt-2 text-lg font-bold text-foreground">{listening ? "J'écoute… parlez maintenant" : "Touchez le micro et posez votre question"}</p>
              {listening && dictation.transcript ? <p className="max-w-[560px] text-[15px] font-semibold text-muted">« {dictation.transcript} »</p> : null}
            </>
          ) : (
            <p className="text-lg font-bold text-foreground">Posez votre question</p>
          )}
          <p className="max-w-[520px] text-[13.5px] font-semibold leading-[19px] text-ink-3">Le conseiller consulte les ventes, marges, stock, commandes et le compte eBay de {organizationName}, puis vous répond {canDictate ? "à l'écrit et à voix haute" : "à l'écrit"}.</p>
          {recent.length > 0 ? (
            <div className="flex flex-col items-center gap-1.5">
              <span className="ms-mono text-[10.5px] text-ink-3">Reprendre</span>
              <ul className="flex flex-wrap justify-center gap-1.5">
                {recent.map((h) => (
                  <li key={h.id}>
                    <Link href={`/advisor?conversation=${h.id}` as never} className={cn("inline-flex min-h-8 max-w-[260px] items-center rounded-full border border-border bg-surface px-3 text-[12.5px] font-semibold text-foreground hover:border-border-strong hover:bg-surface-2 pointer-coarse:min-h-10", FOCUS)}>
                      <span className="truncate">{h.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {empty && !page ? <p className="max-w-[92%] self-center px-3 text-center text-[13px] font-semibold leading-[18px] text-ink-3">Posez votre question comme à un collaborateur : le conseiller consulte les données de {organizationName}.</p> : null}
      {items.map((it) => (
        <MessageView key={it.key} item={it} statusDetail={it.streaming ? statusDetail : null} speaking={speaker.speakingKey === it.key} onSpeak={() => (speaker.speakingKey === it.key ? speaker.stop() : speaker.speak(it.key, it.content, it.messageId))}>
          {it.cards.map((c, i) => (
            <AdvisorCardView key={`${it.key}-c${i}`} card={c} busyActionId={busyActionId} canConfirm={canConfirm} onConfirm={(a) => void decide(a, "confirm")} onCancel={(a) => void decide(a, "cancel")} />
          ))}
        </MessageView>
      ))}
      <div ref={endRef} aria-hidden="true" className="scroll-mb-56" />
    </>
  );

  const suggestions = empty ? ADVISOR_SUGGESTIONS.slice(0, page ? 4 : 3) : [];

  const composer = (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      {suggestions.length > 0 ? (
        <ul aria-label="Questions suggérées" className={cn("flex flex-wrap gap-1.5", page && "justify-center")}>
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => {
                  speaker.unlock();
                  void send(s);
                }}
                disabled={busy || disabled}
                className={cn("relative min-h-8 rounded-full border border-border bg-surface px-3 py-1 text-left text-[12.5px] font-bold leading-[17px] text-foreground transition-colors duration-150 hover:border-border-strong hover:bg-surface-2 disabled:opacity-50", "after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']", FOCUS)}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {quota.reached && !busy ? (
        <p role="status" className="text-xs font-semibold text-danger">
          Limite horaire atteinte ({perUserPerHour} questions par heure). Réessayez plus tard.
        </p>
      ) : null}
      {conversing ? (
        <div role="status" className="ms-fade flex items-center gap-3 rounded-2xl bg-inverse px-4 py-2.5 text-on-inverse shadow-raised">
          <span aria-hidden="true" className={cn("h-2.5 w-2.5 shrink-0 rounded-full", speaker.speakingKey ? "ms-pulse bg-mint" : listening ? "animate-pulse bg-red motion-reduce:animate-none" : "ms-pulse bg-ink-4")} />
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
            {speaker.speakingKey ? "Le conseiller parle — parlez pour l'interrompre" : listening ? (dictation.transcript ? `« ${dictation.transcript} »` : "J'écoute…") : busy ? "Le conseiller réfléchit…" : "Conversation en pause"}
          </span>
          <button type="button" onClick={endConversation} className={cn("min-h-8 shrink-0 rounded-full border border-current/30 px-3 text-[12.5px] font-bold hover:bg-inverse-hover pointer-coarse:min-h-10", FOCUS)}>
            Terminer
          </button>
        </div>
      ) : null}
      {dictation.error ? (
        <p role="alert" className="text-xs font-semibold text-danger">
          {dictation.error}
        </p>
      ) : null}
      <div className={cn("flex items-end gap-2 rounded-2xl border bg-surface py-2 pl-3.5 pr-2 shadow-raised transition-[border-color,box-shadow] duration-150 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25", listening ? "border-danger" : "border-border-control")}>
        <label htmlFor={`advisor-input-${variant}`} className="sr-only">
          Votre question
        </label>
        <textarea
          ref={inputRef}
          id={`advisor-input-${variant}`}
          value={listening ? dictation.transcript : text}
          onChange={(e) => setText(e.target.value.slice(0, ADVISOR_MESSAGE_MAX_CHARS))}
          onKeyDown={onKeyDown}
          placeholder={disabled ? "Conseiller non activé sur le serveur" : listening ? "J'écoute…" : canDictate ? "Écrivez ou touchez le micro…" : "Écrivez votre question…"}
          rows={1}
          maxLength={ADVISOR_MESSAGE_MAX_CHARS}
          disabled={busy || disabled}
          readOnly={listening}
          className="max-h-48 min-h-[40px] flex-1 resize-none bg-transparent py-2 text-[15px] font-semibold leading-[21px] text-foreground placeholder:text-ink-4 focus:outline-none disabled:cursor-not-allowed"
        />
        {canDictate && !busy ? (
          <button
            type="button"
            onClick={toggleMic}
            disabled={disabled}
            aria-label={speaker.speakingKey ? "Couper la parole au conseiller" : listening ? "Arrêter l'écoute et envoyer" : "Parler au conseiller"}
            className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl disabled:opacity-50", listening ? "bg-danger-strong text-on-danger-strong" : "bg-surface-3 text-foreground hover:bg-selection", FOCUS)}
          >
            {listening ? <Square aria-hidden="true" className="h-3.5 w-3.5 fill-current" /> : <Mic aria-hidden="true" className="h-[18px] w-[18px]" />}
          </button>
        ) : null}
        {busy ? (
          <button type="submit" aria-label="Arrêter la réponse" className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-inverse text-on-inverse hover:bg-inverse-hover", FOCUS)}>
            <Square aria-hidden="true" className="h-3.5 w-3.5 fill-current" />
          </button>
        ) : (
          <button type="submit" disabled={!text.trim() || disabled || listening} aria-label="Envoyer la question" className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint text-night hover:bg-mint-pressed disabled:bg-surface-3 disabled:text-ink-4", FOCUS)}>
            <ArrowUp aria-hidden="true" className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>
      <p className="text-center text-xs font-semibold leading-[17px] text-ink-3">{ADVISOR_INTRO}</p>
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
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2">{voiceBar}</div>
        <div ref={logRef} role="log" aria-label="Conversation avec le conseiller" className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-4">
          {messages}
        </div>
        {live}
        <div className="shrink-0 border-t border-border bg-background px-4 pb-4 pt-3">{composer}</div>
      </div>
    );
  }

  return (
    <section aria-label="Conversation" className="mx-auto flex w-full max-w-[780px] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={newConversation} className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3 text-[12.5px] font-extrabold text-foreground hover:bg-surface-2 pointer-coarse:min-h-10", FOCUS)}>
            <MessageSquarePlus aria-hidden="true" className="h-3.5 w-3.5" />
            Nouvelle conversation
          </button>
          <Link href="/advisor/history" className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-bold text-muted-strong hover:bg-surface-3 hover:text-foreground pointer-coarse:min-h-10", FOCUS)}>
            <History aria-hidden="true" className="h-3.5 w-3.5" />
            Historique
          </Link>
        </div>
        {voiceBar}
      </div>
      <div ref={logRef} role="log" aria-label="Conversation avec le conseiller" className="flex flex-col gap-3.5">
        {messages}
      </div>
      {live}
      <div className="z-10 -mx-1 bg-background px-1 pb-3 pt-2 lg:sticky lg:bottom-0">{composer}</div>
    </section>
  );
}

function MessageView({ item, statusDetail, speaking, onSpeak, children }: { item: ChatItem; statusDetail: string | null; speaking: boolean; onSpeak: () => void; children: ReactNode }) {
  if (item.role === "notice") {
    return <p className={cn("max-w-[92%] self-center rounded-xl px-3 py-2 text-center text-[13px] font-semibold leading-[18px]", item.error ? "border border-danger-line bg-danger-soft text-danger-ink" : "bg-surface-3 text-muted")}>{item.content}</p>;
  }
  if (item.role === "user") {
    return <div className="ms-fade max-w-[80%] self-end whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-inverse px-4 py-3 text-[15px] font-semibold leading-[21px] text-on-inverse">{item.content}</div>;
  }
  if (item.streaming && !item.content) {
    return (
      <div role="status" className="ms-fade flex items-center gap-2.5 self-start rounded-2xl rounded-tl-md border border-border bg-surface px-4 py-3 text-sm font-semibold text-muted">
        <span aria-hidden="true" className="flex shrink-0 gap-1">
          <span className="ms-pulse h-1.5 w-1.5 rounded-full bg-foreground" />
          <span className="ms-pulse h-1.5 w-1.5 rounded-full bg-foreground [animation-delay:200ms]" />
          <span className="ms-pulse h-1.5 w-1.5 rounded-full bg-foreground [animation-delay:400ms]" />
        </span>
        <span className="min-w-0">
          Le conseiller analyse vos données…
          {statusDetail ? <span className="block truncate text-xs font-semibold text-ink-3">{statusDetail}</span> : null}
        </span>
      </div>
    );
  }
  return (
    <>
      <div className="ms-fade flex max-w-[88%] flex-col gap-1 self-start">
        <span aria-hidden="true" className="ms-mono flex items-center gap-1.5 px-1 text-[10px] leading-[13px] text-ink-3">
          <Sparkles className="h-3 w-3 text-success" /> Conseiller
        </span>
        <div className={cn("whitespace-pre-wrap break-words rounded-2xl rounded-tl-md border px-4 py-3 text-[15px] font-medium leading-[22px]", item.error ? "border-danger-line bg-danger-soft text-danger-ink" : "border-border bg-surface text-foreground")}>
          {item.content}
          {item.streaming ? <span aria-hidden="true" className="ms-pulse ml-0.5 text-ink-3">▍</span> : null}
        </div>
        {item.interrupted ? <span className="inline-flex items-center gap-1 self-start rounded-md bg-warning-soft px-2 py-0.5 text-[11px] font-bold text-warning-ink ring-1 ring-inset ring-warning-line"><TriangleAlert aria-hidden="true" className="h-3 w-3" /> Réponse incomplète</span> : null}
        {!item.streaming && !item.error && item.content ? (
          <button type="button" onClick={onSpeak} aria-pressed={speaking} className={cn("inline-flex min-h-8 items-center gap-1.5 self-start rounded-full px-2.5 text-[12.5px] font-bold text-muted hover:bg-surface-3 hover:text-foreground pointer-coarse:min-h-10", speaking && "bg-surface-3 text-foreground", FOCUS)}>
            {speaking ? <Square aria-hidden="true" className="h-3 w-3 fill-current" /> : <Volume2 aria-hidden="true" className="h-3.5 w-3.5" />}
            {speaking ? "Arrêter la lecture" : "Écouter"}
          </button>
        ) : null}
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
    <div role="status" className="self-stretch rounded-2xl border border-warning-line bg-warning-soft px-4 py-3 text-[13.5px] font-semibold leading-[19px] text-warning-ink">
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
