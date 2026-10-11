/**
 * Lecture à voix haute des réponses du conseiller.
 *
 * 1. Voix du SERVEUR (OpenAI, voix naturelles de type ChatGPT) quand le serveur l'annonce et que la
 *    réponse a un identifiant : l'audio est demandé à /advisor/speech (clé OpenAI côté serveur
 *    uniquement) et lu par expo-audio, même en mode silencieux.
 * 2. Sinon, ou en cas d'échec (réseau, délai, module absent) : voix française DE L'APPAREIL
 *    (expo-speech, « Améliorée » si installée).
 * Les modules natifs sont chargés paresseusement : absents (ancien build, tests), la lecture est
 * simplement indisponible et la réponse reste affichée à l'écran.
 */
import { speakableText, splitSentences } from "@/domain/ai/speakable";
import { apiBaseUrl, apiHeaders } from "~/lib/api";

export { MAX_SPOKEN_CHARS, speakableText, splitSentences } from "@/domain/ai/speakable";

type SpeechModule = typeof import("expo-speech");
type AudioModule = typeof import("expo-audio");
type AudioPlayer = ReturnType<AudioModule["createAudioPlayer"]>;

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

let audioCached: AudioModule | null | undefined;

function audioModule(): AudioModule | null {
  if (audioCached !== undefined) return audioCached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    audioCached = require("expo-audio") as AudioModule;
  } catch {
    audioCached = null;
  }
  return audioCached;
}

export function ttsAvailable(): boolean {
  return speechModule() !== null || audioModule() !== null;
}

/** Délai maximal (téléchargement + démarrage) avant repli sur la voix de l'appareil. */
export const SERVER_VOICE_TIMEOUT_MS = 15_000;
/** Nombre de réponses gardées en cache audio sur le téléphone. */
export const VOICE_CACHE_MAX_FILES = 40;

type FsModule = typeof import("expo-file-system");
let fsCached: FsModule | null | undefined;
function fsModule(): FsModule | null {
  if (fsCached !== undefined) return fsCached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    fsCached = require("expo-file-system") as FsModule;
  } catch {
    fsCached = null;
  }
  return fsCached;
}

let player: AudioPlayer | null = null;
let playerSubscription: { remove(): void } | null = null;
/** rappel « arrêtée » de la lecture serveur en cours (bouton ■, nouvelle question) */
let lastStopped: (() => void) | null = null;
/** chaque lecture demandée invalide les précédentes (aucune superposition d'audios) */
let generation = 0;

function releasePlayer() {
  lastStopped = null;
  try {
    playerSubscription?.remove();
    player?.pause();
    player?.remove();
  } catch {
    // déjà libéré
  }
  playerSubscription = null;
  player = null;
}

// Passage en arrière-plan : la lecture s'arrête (pas de voix « fantôme » hors de l'application).
let appStateHooked = false;
function hookAppState() {
  if (appStateHooked) return;
  appStateHooked = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppState } = require("react-native") as typeof import("react-native");
    AppState.addEventListener("change", (st) => {
      if (st !== "active") void stopSpeaking();
    });
  } catch {
    // environnement sans AppState (tests)
  }
}

function pruneCache(fs: FsModule, dir: InstanceType<FsModule["Directory"]>) {
  try {
    const files = dir.list().filter((f): f is InstanceType<FsModule["File"]> => f instanceof fs.File);
    if (files.length <= VOICE_CACHE_MAX_FILES) return;
    files
      .map((f) => ({ f, t: f.modificationTime ?? 0 }))
      .sort((x, y) => x.t - y.t)
      .slice(0, files.length - VOICE_CACHE_MAX_FILES)
      .forEach(({ f }) => f.delete());
  } catch {
    // cache best effort
  }
}

/**
 * Audio en cache local (une synthèse par réponse et par voix, jamais à chaque affichage) ; sinon
 * téléchargé une fois depuis le serveur. Rejette si le serveur répond en erreur (HTTP ≠ 2xx).
 */
async function cachedAudio(path: string, cacheName: string, organizationId: string): Promise<string> {
  const fs = fsModule();
  const url = `${apiBaseUrl()}${path}`;
  if (!fs) throw new Error("stockage indisponible");
  const dir = new fs.Directory(fs.Paths.cache, "advisor-voice");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const file = new fs.File(dir, cacheName);
  if (file.exists && (file.size ?? 0) > 0) return file.uri;
  const headers = await apiHeaders(organizationId, "audio/mpeg");
  const downloaded = await fs.File.downloadFileAsync(url, file, { headers, idempotent: true });
  pruneCache(fs, dir);
  return downloaded.uri;
}

/** Lecture d'un fichier local ; `true` quand la lecture a démarré, `false` sinon. */
async function playFile(uri: string, gen: number, handlers: SpeakHandlers): Promise<boolean> {
  const mod = audioModule();
  if (!mod || gen !== generation) return false;
  await mod.setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "duckOthers", shouldPlayInBackground: false }).catch(() => {});
  if (gen !== generation) return false;
  const p = mod.createAudioPlayer({ uri });
  player = p;
  return new Promise<boolean>((resolve) => {
    let started = false;
    const timer = setTimeout(() => {
      if (!started) {
        if (player === p) releasePlayer();
        resolve(false);
      }
    }, 5_000);
    playerSubscription = p.addListener("playbackStatusUpdate", (st) => {
      if (player !== p) return;
      if (!started && /fail|error/i.test(st.playbackState ?? "")) {
        clearTimeout(timer);
        releasePlayer();
        resolve(false);
        return;
      }
      if (!started && st.playing) {
        started = true;
        clearTimeout(timer);
        lastStopped = handlers.onStopped ?? null;
        handlers.onStart?.();
        resolve(true);
      }
      if (started && st.didJustFinish) {
        releasePlayer();
        handlers.onDone?.();
      }
    });
    p.play();
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("délai dépassé")), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function speakWithServerVoice(messageId: string, organizationId: string, voice: string, gen: number, handlers: SpeakHandlers): Promise<boolean> {
  if (!audioModule() || !fsModule()) return false;
  hookAppState();
  try {
    const q = `messageId=${encodeURIComponent(messageId)}&voice=${encodeURIComponent(voice)}`;
    const uri = await withTimeout(cachedAudio(`/advisor/speech?${q}`, `${messageId}-${voice}.mp3`, organizationId), SERVER_VOICE_TIMEOUT_MS);
    return await playFile(uri, gen, handlers);
  } catch {
    return false;
  }
}

/** Écoute du texte de démonstration avec une voix (comparaison marin / cedar), mis en cache. */
export async function playVoiceSample(voice: string, organizationId: string, handlers: SpeakHandlers = {}): Promise<boolean> {
  await stopSpeaking();
  const gen = generation;
  if (!audioModule() || !fsModule()) {
    handlers.onError?.("Lecture audio indisponible dans cette version de l'application.");
    return false;
  }
  hookAppState();
  try {
    const uri = await withTimeout(cachedAudio(`/advisor/voice-sample?voice=${encodeURIComponent(voice)}`, `sample-${voice}.mp3`, organizationId), SERVER_VOICE_TIMEOUT_MS);
    const ok = await playFile(uri, gen, handlers);
    if (!ok && gen === generation) handlers.onError?.("L'échantillon n'a pas pu être lu.");
    return ok;
  } catch {
    if (gen === generation) handlers.onError?.("Échantillon indisponible (serveur ou réseau). Réessayez.");
    return false;
  }
}

export interface SpeakOptions {
  /** identifiant de la réponse enregistrée (voix du serveur) */
  messageId?: string | null;
  organizationId?: string;
  /** le serveur annonce une voix (statut du conseiller) */
  serverVoice?: boolean;
  /** voix choisie par l'utilisateur (marin / cedar) */
  voice?: string;
}

export interface SpeakHandlers {
  onStart?: () => void;
  onDone?: () => void;
  onStopped?: () => void;
  onError?: (message: string) => void;
}

/**
 * Lit la réponse : voix du serveur si possible, sinon voix de l'appareil (phrase par phrase).
 * Toute lecture en cours est interrompue d'abord.
 */
export async function speak(text: string, handlers: SpeakHandlers = {}, opts: SpeakOptions = {}): Promise<boolean> {
  await stopSpeaking();
  const gen = generation;
  if (opts.serverVoice && opts.messageId && opts.organizationId) {
    if (await speakWithServerVoice(opts.messageId, opts.organizationId, opts.voice ?? "marin", gen, handlers)) return true;
  }
  // une autre lecture (ou un arrêt) a été demandée entre-temps : rien à dire
  if (gen !== generation) return false;
  return speakWithDevice(text, handlers);
}

async function speakWithDevice(text: string, handlers: SpeakHandlers): Promise<boolean> {
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
  generation += 1;
  if (player) {
    const onStopped = lastStopped;
    releasePlayer();
    onStopped?.();
  }
  try {
    await speechModule()?.stop();
  } catch {
    // rien à arrêter
  }
}
