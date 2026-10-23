/**
 * CORS de l'Edge Function (Q-22). L'application iPhone est un client natif : elle n'envoie pas
 * d'en-tête Origin et n'a pas besoin de CORS ; le site web appelle l'Edge depuis son serveur
 * (src/lib/edge-api.ts), sans CORS non plus. Seuls des navigateurs sur des origines CONNUES
 * reçoivent donc les en-têtes CORS :
 *  - l'origine du site (APP_URL, ou NEXT_PUBLIC_APP_URL) ;
 *  - les origines listées dans EDGE_CORS_ORIGINS (séparées par des virgules, https uniquement) ;
 *  - http://localhost:* et http://127.0.0.1:* en développement seulement : pile Supabase locale
 *    (SUPABASE_URL sur localhost) ou EDGE_CORS_ALLOW_LOCALHOST=1.
 * Une origine inconnue ne reçoit aucun en-tête Access-Control-Allow-Origin (le navigateur bloque la
 * lecture). Ce n'est pas une barrière d'authentification : chaque route valide le jeton.
 */
const ALLOW_HEADERS = "authorization, x-client-info, apikey, content-type, x-organization-id, x-request-id";
const ALLOW_METHODS = "GET, POST, OPTIONS";

type Env = Record<string, string | undefined>;

function originOf(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}

const isLoopback = (host: string) => host === "localhost" || host === "127.0.0.1" || host === "[::1]";

function localhostAllowed(env: Env): boolean {
  if (env.EDGE_CORS_ALLOW_LOCALHOST === "1" || env.EDGE_CORS_ALLOW_LOCALHOST === "true") return true;
  try {
    return isLoopback(new URL(env.SUPABASE_URL ?? "").hostname);
  } catch {
    return false;
  }
}

export function allowedOrigins(env: Env = process.env): Set<string> {
  const out = new Set<string>();
  for (const raw of [env.APP_URL, env.NEXT_PUBLIC_APP_URL]) {
    const o = originOf(raw);
    // L'origine du site doit être en https (sauf en développement local).
    if (o && (o.startsWith("https://") || localhostAllowed(env))) out.add(o);
  }
  for (const raw of (env.EDGE_CORS_ORIGINS ?? "").split(",")) {
    const o = originOf(raw);
    if (o?.startsWith("https://")) out.add(o);
  }
  // Le projet Supabase lui-même n'est pas une origine de navigateur : jamais ajouté.
  const supabase = originOf(env.SUPABASE_URL);
  if (supabase) out.delete(supabase);
  return out;
}

export function isAllowedOrigin(origin: string, env: Env = process.env): boolean {
  if (allowedOrigins(env).has(origin)) return true;
  if (!localhostAllowed(env)) return false;
  try {
    const u = new URL(origin);
    return u.protocol === "http:" && isLoopback(u.hostname) && u.origin === origin;
  } catch {
    return false;
  }
}

/** En-têtes CORS pour l'origine de la requête (seulement `Vary: Origin` si elle est absente ou inconnue). */
export function corsHeaders(origin: string | null, env: Env = process.env): Record<string, string> {
  if (!origin || !isAllowedOrigin(origin, env)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Allow-Methods": ALLOW_METHODS,
    "Access-Control-Expose-Headers": "x-request-id",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}
