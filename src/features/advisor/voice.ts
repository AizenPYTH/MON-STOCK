"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Voix du conseiller sur le web, comme sur l'iPhone :
 * - dictée : reconnaissance vocale du navigateur (Web Speech API, français) — Chrome, Edge,
 *   Safari ; absente de Firefox (le bouton micro est alors masqué, rien n'est simulé) ;
 * - lecture : la MÊME voix que l'application (OpenAI, via /api/advisor/speech → Edge) pour une
 *   réponse enregistrée ; à défaut (réponse sans identifiant, voix indisponible), la synthèse
 *   vocale du navigateur en français.
 */

// --- Dictée -----------------------------------------------------------------------------------

interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: RecognitionAlternative;
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [index: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noop = () => () => {};
/** Vrai si le navigateur sait dicter (false au rendu serveur : pas d'écart d'hydratation). */
export function useDictationSupported(): boolean {
  return useSyncExternalStore(noop, () => recognitionCtor() !== null, () => false);
}

function dictationError(code: string): string {
  if (code === "not-allowed" || code === "service-not-allowed") return "Micro refusé : autorisez le micro pour ce site dans votre navigateur.";
  if (code === "audio-capture") return "Aucun micro détecté.";
  if (code === "network") return "La dictée du navigateur demande une connexion internet.";
  return "La dictée s'est interrompue. Réessayez.";
}

export function useDictation(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const textRef = useRef("");
  const cancelledRef = useRef(false);
  const finalRef = useRef(onFinal);
  useEffect(() => {
    finalRef.current = onFinal;
  }, [onFinal]);
  useEffect(() => () => recRef.current?.abort(), []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || recRef.current) return;
    const rec = new Ctor();
    rec.lang = "fr-FR";
    rec.interimResults = true;
    // Comme l'iPhone en mode conversation : l'écoute s'arrête seule après une pause.
    rec.continuous = false;
    rec.maxAlternatives = 1;
    textRef.current = "";
    cancelledRef.current = false;
    setTranscript("");
    setError(null);
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i]?.[0]?.transcript ?? "";
      textRef.current = text.trim();
      setTranscript(textRef.current);
    };
    rec.onerror = (e) => {
      if (e.error !== "aborted" && e.error !== "no-speech") setError(dictationError(e.error));
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      const text = textRef.current;
      if (!cancelledRef.current && text) finalRef.current(text);
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      recRef.current = null;
      setError("Impossible de démarrer la dictée.");
    }
  }, []);

  /** Termine l'écoute et envoie ce qui a été entendu. */
  const stop = useCallback(() => recRef.current?.stop(), []);
  /** Abandonne l'écoute sans rien envoyer. */
  const cancel = useCallback(() => {
    cancelledRef.current = true;
    recRef.current?.abort();
  }, []);

  return { listening, transcript, error, start, stop, cancel };
}

// --- Lecture ----------------------------------------------------------------------------------

export const VOICE_CHOICES = [
  { id: "marin", label: "Marin" },
  { id: "cedar", label: "Cedar" },
] as const;
export type VoiceId = (typeof VOICE_CHOICES)[number]["id"];

const PREFS_KEY = "advisor_voice_prefs";
type VoicePrefs = { voice: VoiceId; autoRead: boolean };
// Comme sur l'iPhone : une question dictée reçoit une réponse lue ; « lire toutes les réponses » en option.
const DEFAULT_PREFS: VoicePrefs = { voice: "marin", autoRead: false };

function readPrefs(): VoicePrefs {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "null");
    if (!raw || typeof raw !== "object") return DEFAULT_PREFS;
    const r = raw as Partial<VoicePrefs>;
    return { voice: VOICE_CHOICES.some((c) => c.id === r.voice) ? (r.voice as VoiceId) : DEFAULT_PREFS.voice, autoRead: typeof r.autoRead === "boolean" ? r.autoRead : DEFAULT_PREFS.autoRead };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Préférences de voix (choix de la voix, lecture automatique), mémorisées dans ce navigateur. */
export function useVoicePrefs(): [VoicePrefs, (p: Partial<VoicePrefs>) => void] {
  const [prefs, setPrefs] = useState<VoicePrefs>(DEFAULT_PREFS);
  useEffect(() => {
    // Lu après le montage : le rendu serveur et le premier rendu client restent identiques.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(readPrefs());
  }, []);
  const update = useCallback((p: Partial<VoicePrefs>) => {
    setPrefs((cur) => {
      const next = { ...cur, ...p };
      try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        // stockage indisponible (navigation privée) : préférence valable pour cette page
      }
      return next;
    });
  }, []);
  return [prefs, update];
}

// WAV muet de 10 ms : « déverrouille » la lecture audio pendant le geste (Safari exige un clic).
const SILENCE = "data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";

/** Texte lisible à voix haute : sans puces, liens ni symboles de mise en forme. */
export function speakableText(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^\s*(?:[-–•*]|#+|>)\s+/gm, "")
    .replace(/[*_#`]/g, "")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim()
    .slice(0, 1500);
}

export function useSpeaker(voice: VoiceId) {
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tokenRef = useRef(0);

  const audio = useCallback(() => {
    audioRef.current ??= new Audio();
    return audioRef.current;
  }, []);

  /** À appeler pendant un clic (micro, envoi) pour que la réponse puisse être lue ensuite. */
  const unlock = useCallback(() => {
    const a = audio();
    if (!a.paused) return;
    a.onended = a.onerror = null;
    a.src = SILENCE;
    void a.play().catch(() => {});
  }, [audio]);

  const stop = useCallback(() => {
    tokenRef.current++;
    const a = audioRef.current;
    if (a) {
      a.onended = a.onerror = null;
      a.pause();
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeakingKey(null);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const speakWithBrowser = useCallback((key: string, text: string, token: number) => {
    if (!("speechSynthesis" in window) || tokenRef.current !== token) {
      setSpeakingKey(null);
      return;
    }
    const u = new SpeechSynthesisUtterance(speakableText(text));
    u.lang = "fr-FR";
    const fr = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("fr"));
    if (fr) u.voice = fr;
    u.onend = u.onerror = () => {
      if (tokenRef.current === token) setSpeakingKey(null);
    };
    setSpeakingKey(key);
    window.speechSynthesis.speak(u);
  }, []);

  const speak = useCallback(
    (key: string, text: string, messageId: string | null | undefined) => {
      stop();
      const token = ++tokenRef.current;
      if (!text.trim()) return;
      if (!messageId) {
        speakWithBrowser(key, text, token);
        return;
      }
      const a = audio();
      setSpeakingKey(key);
      a.onended = () => {
        if (tokenRef.current === token) setSpeakingKey(null);
      };
      a.onerror = () => {
        // voix du serveur indisponible (quota, réseau) : voix du navigateur
        if (tokenRef.current === token) speakWithBrowser(key, text, token);
      };
      a.src = `/api/advisor/speech?messageId=${encodeURIComponent(messageId)}&voice=${voice}`;
      void a.play().catch(() => {
        if (tokenRef.current === token) speakWithBrowser(key, text, token);
      });
    },
    [audio, stop, speakWithBrowser, voice],
  );

  return { speakingKey, speak, stop, unlock };
}
