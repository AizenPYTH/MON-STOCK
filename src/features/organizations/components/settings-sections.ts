/**
 * Sous-navigation des Réglages (module pur, testé) : sections dans l'ordre du handoff v5.
 * « Coûts du radar » vit sous /radar/settings (même page que le radar) : la section est un lien.
 */
export type SettingsSectionId = "organization" | "users" | "integrations" | "sync" | "radar-costs" | "billing" | "account";

export interface SettingsSection {
  id: SettingsSectionId;
  href: string;
  label: string;
  /** La section sort de /settings (lien vers une autre partie de l'application). */
  external?: boolean;
}

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { id: "organization", href: "/settings/organization", label: "Organisation" },
  { id: "users", href: "/settings/users", label: "Membres et invitations" },
  { id: "integrations", href: "/settings/integrations", label: "Intégrations" },
  { id: "sync", href: "/settings/sync", label: "Synchronisation" },
  { id: "radar-costs", href: "/radar/settings", label: "Coûts du radar", external: true },
  { id: "billing", href: "/settings/billing", label: "Facturation" },
  // Compte personnel (et non de l'organisation) : identité, organisations, suppression du compte.
  { id: "account", href: "/settings/account", label: "Mon compte" },
];

/**
 * Section active pour un chemin : correspondance exacte ou route imbriquée
 * (`/settings/sync/<run>` → Synchronisation, `/settings/integrations/mapping` → Intégrations).
 */
export function activeSettingsSection(pathname: string): SettingsSectionId | null {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  for (const s of SETTINGS_SECTIONS) {
    if (path === s.href || path.startsWith(`${s.href}/`)) return s.id;
  }
  return null;
}
