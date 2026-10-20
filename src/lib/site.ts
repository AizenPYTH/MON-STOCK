/**
 * Adresse publique du site (métadonnées, robots, sitemap). NEXT_PUBLIC_APP_URL en priorité ; sur
 * Vercel sans cette variable, l'adresse de production fournie par la plateforme ; sinon localhost.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}
