/**
 * Nettoie une valeur collée dans un tableau de bord (Vercel…) : espaces, retours à la ligne et
 * guillemets autour. Chaîne vide → undefined.
 */
export function cleanEnvValue(value: string | undefined): string | undefined {
  const v = value?.trim().replace(/^(["'])(.*)\1$/, "$2").trim();
  return v ? v : undefined;
}

/** Adresse saisie sans schéma (`mon-stock.vercel.app`) → `https://…` ; `/` final retiré. */
export function normalizeBaseUrl(value: string | undefined): string | undefined {
  const v = cleanEnvValue(value);
  if (!v) return undefined;
  return (/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`).replace(/\/+$/, "");
}

/**
 * Adresse publique du site (métadonnées, robots, sitemap, liens des e-mails). NEXT_PUBLIC_APP_URL
 * en priorité ; sur Vercel sans cette variable, l'adresse de production fournie par la plateforme ;
 * sinon localhost.
 */
export function siteUrl(): string {
  const explicit = normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL);
  if (explicit && URL.canParse(explicit)) return explicit;
  const vercel = normalizeBaseUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL);
  if (vercel) return vercel;
  return "http://localhost:3000";
}

type EnvLike = Record<string, string | undefined>;

/**
 * URL Supabase publique NORMALISÉE (espaces, guillemets, schéma manquant, `/` final) : exactement la
 * valeur de `publicEnv()`, mais lisible hors `server-only` (proxy, next.config, instrumentation) —
 * W-08 : une valeur collée telle quelle doit fonctionner partout, pas seulement dans les pages.
 */
export function publicSupabaseUrl(env: EnvLike = process.env): string | undefined {
  const v = normalizeBaseUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  return v && URL.canParse(v) ? v : undefined;
}

/** Clé anon Supabase nettoyée (même règle que `publicEnv()`). */
export function publicSupabaseAnonKey(env: EnvLike = process.env): string | undefined {
  return cleanEnvValue(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Aperçu visuel (base en mémoire) : MONSTOCK_WEB_PREVIEW=1 ET URL Supabase « preview.invalid ».
 * Règle UNIQUE pour le proxy et le client serveur (même normalisation), impossible sur un vrai
 * déploiement (l'URL y désigne le vrai projet).
 */
export function isWebPreviewEnv(env: EnvLike = process.env): boolean {
  if (env.MONSTOCK_WEB_PREVIEW !== "1") return false;
  const url = publicSupabaseUrl(env);
  return url !== undefined && new URL(url).host === "preview.invalid";
}
