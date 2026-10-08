import type { Json } from "@/db/database.types";
import type { AdapterSourceConfig, ConfigField, CredentialField, RetrievalMethod } from "@/integrations/sourcing/core";

/**
 * Module pur : lecture / construction de la configuration d'une source pilotée par un
 * adaptateur (supplier_sources.config = { adapter, ...réglages, urls, parser, max_pages }).
 */

/** Adaptateur public tel que transmis au client (sans fonctions). */
export interface PublicAdapterOption {
  key: string;
  label: string;
  description: string;
  method: RetrievalMethod;
  /** champs de réglage propres à l'adaptateur (hors `urls` / `max_pages`, saisis par des champs dédiés) */
  configFields: ConfigField[];
  capabilities: { search: boolean; catalog: boolean; stockQuantity: boolean };
  /** « fixtures » = non testé en conditions réelles */
  verification: "fixtures" | "live";
}

/** Connecteur « compte fournisseur » tel que transmis au client (sans fonctions). */
export interface AccountConnectorOption {
  key: string;
  label: string;
  description: string;
  accessConditions: string;
  credentialFields: CredentialField[];
}

/** Clés réservées de `config` saisies par des champs dédiés du formulaire (jamais par un champ `cfg_<nom>`). */
export const RESERVED_CONFIG_KEYS: ReadonlySet<string> = new Set(["adapter", "urls", "parser", "max_pages"]);

/** Champs de réglage à afficher pour un adaptateur (les clés réservées ont leurs propres champs). */
export function adapterSettingFields(fields: ConfigField[]): ConfigField[] {
  return fields.filter((f) => !RESERVED_CONFIG_KEYS.has(f.name));
}

const RESERVED_KEYS = RESERVED_CONFIG_KEYS;

export interface StoredSourceConfig {
  adapter: string | null;
  urls: string[];
  parser: string | null;
  maxPages: number | null;
  settings: Record<string, string>;
}

export function readStoredSourceConfig(config: Json | null | undefined): StoredSourceConfig {
  const c = config && typeof config === "object" && !Array.isArray(config) ? (config as Record<string, unknown>) : {};
  const settings: Record<string, string> = {};
  for (const [k, v] of Object.entries(c)) if (!RESERVED_KEYS.has(k) && typeof v === "string" && v.trim()) settings[k] = v;
  return {
    adapter: typeof c.adapter === "string" && c.adapter.trim() ? c.adapter : null,
    urls: Array.isArray(c.urls) ? c.urls.filter((u): u is string => typeof u === "string") : [],
    parser: typeof c.parser === "string" ? c.parser : null,
    maxPages: typeof c.max_pages === "number" ? c.max_pages : null,
    settings,
  };
}

/** Configuration passée à l'adaptateur (test de connexion, recherche) à partir d'une ligne supplier_sources. */
export function adapterSourceConfigFromRow(row: { base_url: string | null; config: Json | null; default_currency: string | null; default_tax_type: "ht" | "ttc" | "unknown"; country: string | null }): AdapterSourceConfig {
  const stored = readStoredSourceConfig(row.config);
  return {
    baseUrl: row.base_url ? row.base_url.replace(/\/+$/, "") : null,
    settings: { ...stored.settings, urls: stored.urls, ...(stored.maxPages !== null ? { max_pages: stored.maxPages } : {}) },
    defaultCurrency: row.default_currency,
    defaultTaxType: row.default_tax_type,
    defaultCountry: row.country,
  };
}

/** Valeurs `cfg_<nom>` d'un FormData → réglages { nom: valeur } pour les champs déclarés par l'adaptateur. */
export function settingsFromFormData(formData: FormData, fields: ConfigField[]): { settings: Record<string, string>; errors: Record<string, string[]> } {
  const settings: Record<string, string> = {};
  const errors: Record<string, string[]> = {};
  for (const f of adapterSettingFields(fields)) {
    const v = String(formData.get(`cfg_${f.name}`) ?? "").trim();
    if (v) settings[f.name] = v.slice(0, 2000);
    else if (f.required) errors[`cfg_${f.name}`] = [`${f.label} : champ requis.`];
  }
  return { settings, errors };
}

/** URLs http(s) présentes dans les réglages (un gabarit `{query}` est remplacé par un terme d'essai) : soumises à robots.txt. */
export function urlsFromSettings(settings: Record<string, string>, sampleQuery = "test"): string[] {
  const out: string[] = [];
  for (const v of Object.values(settings)) {
    const candidate = v.replace(/\{query\}/gi, encodeURIComponent(sampleQuery));
    try {
      const u = new URL(candidate);
      if (u.protocol === "http:" || u.protocol === "https:") out.push(u.toString());
    } catch {
      /* pas une URL : réglage simple */
    }
  }
  return Array.from(new Set(out));
}

/** L'attestation d'accès automatisé est exigée pour les pages / JSON publics (lecture d'un site tiers). */
export function attestationRequired(method: RetrievalMethod): boolean {
  return method === "public_html" || method === "public_json";
}
