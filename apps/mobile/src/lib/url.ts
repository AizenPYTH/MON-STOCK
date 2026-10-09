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
