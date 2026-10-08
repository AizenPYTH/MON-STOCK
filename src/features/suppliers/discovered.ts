/**
 * Sources DÉCOUVERTES automatiquement (services/sourcing/discovery) : lecture de leur
 * configuration et règles de validation. Module pur (testé).
 *
 * Une source découverte n'est que « Découverte — à valider » : ni vérifiée, ni connectée.
 * Elle n'est activée (config.adapter = config.suggested_adapter, automated_access_confirmed = true,
 * status = active) que sur action explicite de l'utilisateur avec attestation des conditions
 * d'utilisation. Une source « compte requis » / « protégée » / à accès non déterminé ne peut
 * jamais être activée comme source publique.
 */
import type { Json } from "@/db/database.types";

export type DiscoveredAccess = "public" | "account" | "protected" | "unknown";
export type DiscoveredValidation = "pending" | "validated" | "dismissed";

export interface DiscoveredSourceInfo {
  discovered: boolean;
  dismissed: boolean;
  validation: DiscoveredValidation | null;
  access: DiscoveredAccess;
  accessLabel: string;
  platform: string;
  suggestedAdapter: string | null;
  priceVisibility: string;
  robotsStatus: string;
  robotsAllowed: boolean | null;
  robotsDetail: string | null;
  supplierType: string;
  supplierTypeConfidence: number | null;
  sampleUrl: string | null;
  discoveryQuery: string | null;
  discoveredAt: string | null;
  discoveredVia: string | null;
  probeError: string | null;
}

export const DISCOVERED_ACCESS_LABEL: Record<DiscoveredAccess, string> = {
  public: "Accès public",
  account: "Compte requis",
  protected: "Compte requis / protégé",
  unknown: "Accès non déterminé",
};

export const PRICE_VISIBILITY_LABEL: Record<string, string> = {
  public: "Prix visibles sans compte",
  after_login: "Prix après connexion",
  unknown: "Visibilité des prix non déterminée",
};

export const ROBOTS_STATUS_LABEL: Record<string, string> = {
  allowed: "robots.txt : autorisé",
  missing: "robots.txt absent (aucune restriction déclarée)",
  disallowed: "robots.txt : interdit",
  error: "robots.txt inaccessible",
  not_checked: "robots.txt non vérifié",
};

export const PLATFORM_LABEL: Record<string, string> = {
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  jsonld: "Données produit JSON-LD",
  unknown: "Plateforme non identifiée",
};

export const SUPPLIER_TYPE_LABEL: Record<string, string> = {
  wholesaler: "Grossiste",
  distributor: "Distributeur",
  refurbisher: "Reconditionneur",
  liquidation: "Déstockage / liquidation",
  broker: "Broker",
  b2b_marketplace: "Marketplace B2B",
  unknown: "Type non déterminé",
};

function obj(config: Json | null | undefined): Record<string, unknown> {
  return config && typeof config === "object" && !Array.isArray(config) ? (config as Record<string, unknown>) : {};
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function readDiscoveredConfig(config: Json | null | undefined): DiscoveredSourceInfo {
  const c = obj(config);
  const access: DiscoveredAccess = c.access === "public" || c.access === "account" || c.access === "protected" ? c.access : "unknown";
  const validation = c.validation === "pending" || c.validation === "validated" || c.validation === "dismissed" ? c.validation : null;
  return {
    discovered: c.discovered === true,
    dismissed: c.dismissed === true || validation === "dismissed",
    validation,
    access,
    accessLabel: DISCOVERED_ACCESS_LABEL[access],
    platform: str(c.platform) ?? "unknown",
    suggestedAdapter: str(c.suggested_adapter),
    priceVisibility: str(c.price_visibility) ?? "unknown",
    robotsStatus: str(c.robots_status) ?? "not_checked",
    robotsAllowed: typeof c.robots_allowed === "boolean" ? c.robots_allowed : null,
    robotsDetail: str(c.robots_detail),
    supplierType: str(c.supplier_type) ?? "unknown",
    supplierTypeConfidence: typeof c.supplier_type_confidence === "number" ? c.supplier_type_confidence : null,
    sampleUrl: str(c.sample_url),
    discoveryQuery: str(c.discovery_query),
    discoveredAt: str(c.discovered_at),
    discoveredVia: str(c.discovered_via),
    probeError: str(c.probe_error),
  };
}

/** Source découverte en attente de décision : découverte, non attestée, non ignorée. */
export function isPendingDiscovered(row: { config: Json | null | undefined; automated_access_confirmed: boolean }): boolean {
  const info = readDiscoveredConfig(row.config);
  return info.discovered && !row.automated_access_confirmed && !info.dismissed;
}

export interface AdapterRef {
  key: string;
  access: "public" | "account";
  label?: string;
}

export type ActivationCheck = { ok: true; adapterKey: string } | { ok: false; reason: string; accountRequired: boolean };

/**
 * Peut-on activer cette source découverte comme source PUBLIQUE ? (sans l'attestation, vérifiée par l'action)
 * Refus : compte requis / protégé / accès non déterminé, robots.txt interdit, aucun adaptateur public suggéré.
 */
export function activationCheck(info: DiscoveredSourceInfo, adapters: readonly AdapterRef[], robotsAllowedColumn: boolean | null): ActivationCheck {
  if (!info.discovered) return { ok: false, reason: "Cette source n'a pas été découverte automatiquement.", accountRequired: false };
  if (info.dismissed) return { ok: false, reason: "Source ignorée : réactivez-la depuis la page du fournisseur si besoin.", accountRequired: false };
  if (info.access === "account" || info.access === "protected") return { ok: false, reason: `${info.accessLabel} : cette source ne peut pas être activée comme source publique. Connectez un compte fournisseur (API officielle) ou ignorez-la.`, accountRequired: true };
  if (info.access === "unknown") return { ok: false, reason: "Accès non déterminé (page non sondée) : une source n'est jamais présumée publique. Déclarez-la manuellement après vérification.", accountRequired: false };
  if (robotsAllowedColumn === false || info.robotsStatus === "disallowed") return { ok: false, reason: "robots.txt interdit l'accès automatisé : activation impossible.", accountRequired: false };
  if (info.robotsStatus === "error" || info.robotsStatus === "not_checked") return { ok: false, reason: "robots.txt non vérifié ou inaccessible : activation impossible par prudence.", accountRequired: false };
  const adapter = info.suggestedAdapter ? adapters.find((a) => a.key === info.suggestedAdapter) : null;
  if (!adapter) return { ok: false, reason: info.suggestedAdapter ? `Adaptateur suggéré « ${info.suggestedAdapter} » indisponible.` : "Aucun adaptateur compatible détecté : déclarez la source manuellement (page publique) après vérification.", accountRequired: false };
  if (adapter.access !== "public") return { ok: false, reason: "L'adaptateur suggéré exige un compte : activation publique impossible.", accountRequired: true };
  return { ok: true, adapterKey: adapter.key };
}

/** Configuration après validation : adaptateur suggéré recopié, trace de la validation (qui, quand). */
export function activatedConfig(config: Json | null | undefined, adapterKey: string, by: { userId: string; at: Date }): Record<string, unknown> {
  return { ...obj(config), adapter: adapterKey, validation: "validated", validated_at: by.at.toISOString(), validated_by: by.userId, dismissed: false };
}

/** Configuration après « Ignorer ». */
export function dismissedConfig(config: Json | null | undefined, by: { userId: string; at: Date }): Record<string, unknown> {
  return { ...obj(config), dismissed: true, validation: "dismissed", dismissed_at: by.at.toISOString(), dismissed_by: by.userId };
}
