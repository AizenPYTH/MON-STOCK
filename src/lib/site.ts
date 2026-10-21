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
