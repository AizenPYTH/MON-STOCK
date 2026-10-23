import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Fournisseurs favoris, mémorisés sur cet appareil pour l'organisation active (préférence
 * personnelle, aucune donnée sensible). Un petit magasin partagé garde tous les écrans synchronisés.
 */
const KEY = (orgId: string) => `monstock:supplier-favorites:${orgId}`;
const cache = new Map<string, Set<string>>();
const listeners = new Set<() => void>();

/** M-19 : efface tous les favoris de l'appareil (déconnexion, suppression de compte). */
export async function clearAllFavorites(): Promise<void> {
  cache.clear();
  listeners.forEach((l) => l());
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith("monstock:supplier-favorites:"));
    if (ours.length) await AsyncStorage.multiRemove(ours);
  } catch {
    // stockage indisponible : rien à effacer
  }
}

async function load(orgId: string): Promise<Set<string>> {
  const hit = cache.get(orgId);
  if (hit) return hit;
  let set = new Set<string>();
  try {
    const raw = await AsyncStorage.getItem(KEY(orgId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) set = new Set(parsed.filter((x): x is string => typeof x === "string").slice(0, 500));
  } catch {
    // stockage indisponible : favoris vides, l'application continue
  }
  cache.set(orgId, set);
  return set;
}

export async function toggleFavorite(orgId: string, key: string): Promise<boolean> {
  const set = new Set(await load(orgId));
  const now = !set.has(key);
  if (now) set.add(key);
  else set.delete(key);
  cache.set(orgId, set);
  listeners.forEach((l) => l());
  try {
    await AsyncStorage.setItem(KEY(orgId), JSON.stringify([...set]));
  } catch {
    // échec d'écriture : le favori reste actif pour la session
  }
  return now;
}

export function useSupplierFavorites(orgId: string) {
  const [favorites, setFavorites] = useState<Set<string>>(() => cache.get(orgId) ?? new Set());
  useEffect(() => {
    let alive = true;
    const refresh = () => void load(orgId).then((s) => alive && setFavorites(new Set(s)));
    refresh();
    listeners.add(refresh);
    return () => {
      alive = false;
      listeners.delete(refresh);
    };
  }, [orgId]);
  const toggle = useCallback((key: string) => toggleFavorite(orgId, key), [orgId]);
  return { favorites, toggle };
}
