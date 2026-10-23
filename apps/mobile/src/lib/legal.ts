import * as WebBrowser from "expo-web-browser";
import { appConfig, DEFAULT_SITE_URL } from "~/lib/config";

/**
 * Pages légales et support du site public (M-06, App Store 5.1.1(i)) : ouvertes dans le
 * navigateur intégré (Safari), jamais recopiées dans l'application (une seule version qui fait foi).
 */
export const LEGAL_PAGES = [
  { key: "privacy", label: "Politique de confidentialité", path: "/confidentialite" },
  { key: "terms", label: "Conditions d'utilisation", path: "/conditions" },
  { key: "notice", label: "Mentions légales", path: "/mentions-legales" },
  { key: "support", label: "Aide et contact", path: "/support" },
] as const;

export type LegalPageKey = (typeof LEGAL_PAGES)[number]["key"];

export function legalUrl(key: LegalPageKey): string {
  const base = appConfig.ok ? appConfig.config.siteUrl : DEFAULT_SITE_URL;
  const page = LEGAL_PAGES.find((p) => p.key === key)!;
  return `${base}${page.path}`;
}

export async function openLegalPage(key: LegalPageKey): Promise<void> {
  await WebBrowser.openBrowserAsync(legalUrl(key)).catch(() => undefined);
}
