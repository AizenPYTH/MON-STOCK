import { useCallback, useEffect, useState } from "react";
import { securePreferences } from "~/lib/secure-store";

/**
 * Consentement explicite au traitement par un fournisseur d'IA tiers (OpenAI) — audit M-07 / Q-09,
 * règle App Store 5.1.2(i). Demandé AVANT le premier usage du conseiller, du brouillon de produit
 * par IA et de la voix de synthèse ; révocable dans Réglages. Mémorisé sur l'appareil, par
 * utilisateur, avec la version du texte : un texte modifié redemande l'accord.
 *
 * Tant que l'accord n'est pas donné, aucune de ces fonctions n'envoie quoi que ce soit au serveur.
 */
export const AI_CONSENT_VERSION = "2026-10-22";

export type AiConsentStatus = "loading" | "granted" | "missing";

const key = (userId: string) => `monstock.aiConsent.${userId}`;
const cache = new Map<string, boolean>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export async function readAiConsent(userId: string): Promise<boolean> {
  const hit = cache.get(userId);
  if (hit !== undefined) return hit;
  let ok = false;
  try {
    ok = (await securePreferences.getItem(key(userId))) === AI_CONSENT_VERSION;
  } catch {
    ok = false;
  }
  cache.set(userId, ok);
  return ok;
}

export async function setAiConsent(userId: string, granted: boolean): Promise<void> {
  cache.set(userId, granted);
  notify();
  try {
    if (granted) await securePreferences.setItem(key(userId), AI_CONSENT_VERSION);
    else await securePreferences.removeItem(key(userId));
  } catch {
    // trousseau indisponible : le choix vaut pour la session en cours
  }
}

/** Oubli complet (suppression de compte). */
export async function forgetAiConsent(userId: string): Promise<void> {
  cache.delete(userId);
  notify();
  try {
    await securePreferences.removeItem(key(userId));
  } catch {
    // rien à effacer
  }
}

export function useAiConsent(userId: string | null | undefined): { status: AiConsentStatus; grant: () => Promise<void>; revoke: () => Promise<void> } {
  const [status, setStatus] = useState<AiConsentStatus>(() => (userId && cache.has(userId) ? (cache.get(userId) ? "granted" : "missing") : "loading"));
  useEffect(() => {
    if (!userId) {
      setStatus("missing");
      return;
    }
    let alive = true;
    const refresh = () => void readAiConsent(userId).then((ok) => alive && setStatus(ok ? "granted" : "missing"));
    refresh();
    listeners.add(refresh);
    return () => {
      alive = false;
      listeners.delete(refresh);
    };
  }, [userId]);
  const grant = useCallback(async () => {
    if (userId) await setAiConsent(userId, true);
  }, [userId]);
  const revoke = useCallback(async () => {
    if (userId) await setAiConsent(userId, false);
  }, [userId]);
  return { status, grant, revoke };
}
