import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Dictée vocale (reconnaissance de la parole d'iOS, via expo-speech-recognition).
 *
 * Le module natif est chargé paresseusement : absent (Expo Go, tests, ancien build), la dictée est
 * simplement signalée indisponible — l'écran garde la saisie au clavier, rien ne plante.
 * Le texte reconnu est ensuite COMPRIS côté serveur (Claude) : ce hook ne fait que transcrire.
 */
type SpeechModule = typeof import("expo-speech-recognition").ExpoSpeechRecognitionModule;
type Subscription = { remove: () => void };

let cached: SpeechModule | null | undefined;

function speechModule(): SpeechModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = (require("expo-speech-recognition") as typeof import("expo-speech-recognition")).ExpoSpeechRecognitionModule ?? null;
  } catch {
    cached = null;
  }
  return cached;
}

/** Message utilisateur pour un code d'erreur de la reconnaissance vocale. */
export function speechErrorMessage(code: string): string | null {
  switch (code) {
    case "aborted":
    case "no-speech":
      return null;
    case "not-allowed":
      return "Micro ou reconnaissance vocale refusés : autorisez-les dans Réglages → Mon Stock Pro.";
    case "network":
      return "La reconnaissance vocale a besoin d'Internet. Vérifiez la connexion.";
    case "language-not-supported":
      return "La dictée en français n'est pas disponible sur cet appareil.";
    case "audio-capture":
    case "interrupted":
      return "Le micro a été interrompu. Réessayez.";
    case "busy":
      return "La dictée est déjà en cours.";
    default:
      return "La dictée a échoué. Réessayez ou écrivez votre texte.";
  }
}

export interface Dictation {
  available: boolean;
  listening: boolean;
  /** texte reconnu (provisoire pendant l'écoute, définitif ensuite) */
  transcript: string;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

export function useDictation(options: { onFinal?: (text: string) => void } = {}): Dictation {
  const mod = speechModule();
  const [available] = useState(() => {
    try {
      return Boolean(mod?.isRecognitionAvailable());
    } catch {
      return false;
    }
  });
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const finalRef = useRef("");
  const lastRef = useRef("");
  const onFinal = useRef(options.onFinal);
  useEffect(() => {
    onFinal.current = options.onFinal;
  });

  useEffect(() => {
    if (!mod || !available) return;
    const subs: Subscription[] = [];
    const on = (event: string, fn: (e: never) => void) => {
      try {
        subs.push((mod as unknown as { addListener: (e: string, f: (e: never) => void) => Subscription }).addListener(event, fn));
      } catch {
        // écouteur indisponible : ignoré
      }
    };
    on("start", () => setListening(true));
    on("end", () => {
      setListening(false);
      // En mode continu, iOS ne marque pas toujours le dernier résultat comme définitif.
      const text = (finalRef.current || lastRef.current).trim();
      if (text) onFinal.current?.(text);
    });
    on("result", (e: { results: { transcript: string }[]; isFinal: boolean }) => {
      const text = e.results[0]?.transcript ?? "";
      setTranscript(text);
      lastRef.current = text;
      if (e.isFinal) finalRef.current = text;
    });
    on("error", (e: { error: string }) => {
      setListening(false);
      setError(speechErrorMessage(e.error));
    });
    return () => subs.forEach((s) => s.remove());
  }, [mod, available]);

  const start = useCallback(async () => {
    if (!mod) return;
    setError(null);
    setTranscript("");
    finalRef.current = "";
    lastRef.current = "";
    try {
      const perm = await mod.requestPermissionsAsync();
      if (!perm.granted) {
        setError(speechErrorMessage("not-allowed"));
        return;
      }
      mod.start({ lang: "fr-FR", interimResults: true, continuous: true, addsPunctuation: true, contextualStrings: ["iPhone", "Samsung", "Galaxy", "Go", "To", "grade A", "grade B", "grade C", "reconditionné", "eBay", "SKU"] });
    } catch {
      setListening(false);
      setError(speechErrorMessage("unknown"));
    }
  }, [mod]);

  const stop = useCallback(() => {
    try {
      mod?.stop();
    } catch {
      setListening(false);
    }
  }, [mod]);

  const reset = useCallback(() => {
    finalRef.current = "";
    lastRef.current = "";
    setTranscript("");
    setError(null);
  }, []);

  return { available, listening, transcript, error, start, stop, reset };
}
