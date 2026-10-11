/**
 * Lecture à voix haute des réponses du conseiller (synthèse vocale DE L'APPAREIL, via expo-speech).
 *
 * Aucun service payant ni envoi de texte à un tiers : la voix française du téléphone est utilisée
 * (la meilleure qualité disponible, « Améliorée » si l'utilisateur l'a installée). Le module natif
 * est chargé paresseusement : absent (ancien build, tests), la lecture est simplement indisponible
 * et la réponse reste affichée à l'écran.
 */
type SpeechModule = typeof import("expo-speech");

let cached: SpeechModule | null | undefined;

function speechModule(): SpeechModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("expo-speech") as SpeechModule;
  } catch {
    cached = null;
  }
  return cached;
}

/** Longueur lue au maximum : au-delà, la suite reste à l'écran (réponses trop longues). */
export const MAX_SPOKEN_CHARS = 700;

/**
 * Texte → phrase lisible : sans balises, listes, symboles ni URL ; montants et pourcentages
 * prononçables ; coupé proprement à la fin d'une phrase.
 */
export function speakableText(raw: string, max = MAX_SPOKEN_CHARS): string {
  let t = raw
    .replace(/\(réponse interrompue[^)]*\)/gi, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`#>|]/g, "")
    .replace(/^\s*[–•-]\s+/gm, "")
    .replace(/≈\s?/g, "environ ")
    .replace(/(\d)\s?%/g, "$1 pour cent")
    .replace(/(\d)\s?€/g, "$1 euros")
    .replace(/\s*→\s*/g, " puis ")
    .replace(/\bu\.\s/g, "unités ")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length > max) {
    const cut = t.slice(0, max);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
    t = `${(end > max * 0.4 ? cut.slice(0, end + 1) : cut).trim()} La suite est affichée à l'écran.`;
  }
  return t;
}

/** Découpe en phrases (lecture progressive, arrêt rapide entre deux phrases). */
export function splitSentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

let preferredVoice: string | null | undefined;

async function frenchVoice(mod: SpeechModule): Promise<string | null> {
  if (preferredVoice !== undefined) return preferredVoice;
  try {
    const voices = await mod.getAvailableVoicesAsync();
    const fr = voices.filter((v) => v.language?.toLowerCase().startsWith("fr"));
    const best = fr.find((v) => v.language === "fr-FR" && String(v.quality) === "Enhanced") ?? fr.find((v) => v.language === "fr-FR") ?? fr[0];
    preferredVoice = best?.identifier ?? null;
  } catch {
    preferredVoice = null;
  }
  return preferredVoice;
}

export function ttsAvailable(): boolean {
  return speechModule() !== null;
}

export interface SpeakHandlers {
  onStart?: () => void;
  onDone?: () => void;
  onStopped?: () => void;
  onError?: (message: string) => void;
}

/** Lit le texte (phrase par phrase). Toute lecture en cours est interrompue d'abord. */
export async function speak(text: string, handlers: SpeakHandlers = {}): Promise<boolean> {
  const mod = speechModule();
  const spoken = speakableText(text);
  if (!mod || !spoken) {
    handlers.onDone?.();
    return false;
  }
  try {
    await mod.stop();
    const voice = await frenchVoice(mod);
    const sentences = splitSentences(spoken);
    let stopped = false;
    const onStopped = () => {
      if (stopped) return;
      stopped = true;
      handlers.onStopped?.();
    };
    sentences.forEach((s, i) => {
      mod.speak(s, {
        language: "fr-FR",
        voice: voice ?? undefined,
        rate: 1.0,
        // session audio gérée par le système : la voix baisse la musique au lieu de la couper
        useApplicationAudioSession: false,
        onStart: i === 0 ? handlers.onStart : undefined,
        onDone: i === sentences.length - 1 ? handlers.onDone : undefined,
        onStopped,
        onError: () => handlers.onError?.("La lecture vocale a échoué. La réponse reste affichée."),
      });
    });
    return true;
  } catch {
    handlers.onError?.("La lecture vocale a échoué. La réponse reste affichée.");
    return false;
  }
}

export async function stopSpeaking(): Promise<void> {
  try {
    await speechModule()?.stop();
  } catch {
    // rien à arrêter
  }
}
