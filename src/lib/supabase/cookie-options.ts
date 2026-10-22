import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Attributs des cookies de session Supabase (W-05). Par défaut, `@supabase/ssr` pose des cookies
 * LISIBLES par JavaScript (`httpOnly: false`) : nécessaire seulement pour un client Supabase
 * navigateur, qui n'existe pas sur ce site (toutes les requêtes Supabase partent du serveur).
 * On les rend donc `httpOnly` (une XSS ne peut plus lire le jeton de rafraîchissement), `secure`
 * en HTTPS, `sameSite: lax` (protection CSRF de base, liens entrants conservés).
 */
export function sessionCookieOptions(secure: boolean): CookieOptionsWithName {
  return { path: "/", sameSite: "lax", httpOnly: true, secure };
}

/** Vrai si les cookies doivent porter `Secure` : HTTPS, ou production (Vercel est toujours en HTTPS). */
export function shouldUseSecureCookies(protocol: string | null | undefined, nodeEnv: string | undefined = process.env.NODE_ENV): boolean {
  return protocol === "https:" || nodeEnv === "production";
}
