import { useEffect, useState } from "react";

/**
 * Voix préférée du conseiller (marin / cedar), mémorisée sur l'appareil (préférence non
 * sensible, sans données personnelles). Défaut : marin.
 */
export const VOICE_CHOICES = [
  { id: "marin", label: "Marin" },
  { id: "cedar", label: "Cedar" },
] as const;
export type VoiceId = (typeof VOICE_CHOICES)[number]["id"];
export const DEFAULT_VOICE: VoiceId = "marin";
const KEY = "advisor_voice";

type Store = { getItemAsync(k: string): Promise<string | null>; setItemAsync(k: string, v: string): Promise<void> };
function store(): Store | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-secure-store") as Store;
  } catch {
    return null;
  }
}

const isVoice = (v: unknown): v is VoiceId => VOICE_CHOICES.some((c) => c.id === v);
let current: VoiceId | null = null;
const listeners = new Set<(v: VoiceId) => void>();

export async function getVoice(): Promise<VoiceId> {
  if (current) return current;
  try {
    const v = await store()?.getItemAsync(KEY);
    current = isVoice(v) ? v : DEFAULT_VOICE;
  } catch {
    current = DEFAULT_VOICE;
  }
  return current;
}

export async function setVoice(v: VoiceId): Promise<void> {
  current = v;
  listeners.forEach((l) => l(v));
  try {
    await store()?.setItemAsync(KEY, v);
  } catch {
    // préférence non enregistrée : gardée pour la session
  }
}

export function useVoicePreference(): [VoiceId, (v: VoiceId) => void] {
  const [voice, set] = useState<VoiceId>(current ?? DEFAULT_VOICE);
  useEffect(() => {
    let alive = true;
    void getVoice().then((v) => alive && set(v));
    listeners.add(set);
    return () => {
      alive = false;
      listeners.delete(set);
    };
  }, []);
  return [voice, (v) => void setVoice(v)];
}
