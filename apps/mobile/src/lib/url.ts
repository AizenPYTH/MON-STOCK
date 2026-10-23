/**
 * URL externe affichable (lien « Voir la source »). Les URL proviennent de données tierces :
 * seules http(s) sans identifiants intégrés sont acceptées — jamais javascript:, data:, intent:…
 */
export function safeExternalUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Ouvre une URL tierce dans le navigateur intégré APRÈS validation (M-17) ; `false` si l'adresse
 * est refusée (schéma non http(s), identifiants intégrés…) — rien n'est alors ouvert.
 */
export async function openExternalUrl(raw: unknown): Promise<boolean> {
  const safe = safeExternalUrl(raw);
  if (!safe) return false;
  // Import différé : module natif (tests sans environnement natif).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const WebBrowser = require("expo-web-browser") as typeof import("expo-web-browser");
  try {
    await WebBrowser.openBrowserAsync(safe);
    return true;
  } catch {
    return false;
  }
}
