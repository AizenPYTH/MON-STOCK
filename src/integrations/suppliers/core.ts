/**
 * Contrats des connecteurs fournisseurs (API / compte fournisseur).
 *
 * Un connecteur n'accède qu'à des données que le vendeur est autorisé à consulter
 * (API officielle, compte fournisseur connecté par le vendeur). Les identifiants sont
 * chiffrés (supplier_connection_secrets, service_role uniquement) et ne transitent
 * jamais vers le navigateur.
 *
 * Les connecteurs sont dérivés des adaptateurs de source `access: "account"`
 * (src/integrations/sourcing/<key>) : un connecteur = un adaptateur + une session
 * (identifiants déchiffrés) exposant l'interface historique SupplierAPIConnector.
 */
import type { RawOffer } from "@/domain/sourcing/types";
import { parseQuery } from "@/domain/sourcing/query-parser";
import type { AdapterRunContext, AdapterSourceConfig, ConfigField, CredentialField, SourceAdapter } from "@/integrations/sourcing/core";
import { listAccountAdapters } from "@/integrations/sourcing/registry";

export type SupplierCredentials = Record<string, string>;

export interface ConnectorAccountInfo {
  accountId: string | null;
  name: string | null;
  currency: string | null;
}

export interface CatalogPage {
  offers: RawOffer[];
  nextCursor: string | null;
}

export interface SupplierAPIConnector {
  readonly key: string;
  /** Initialise la session avec les identifiants déchiffrés (jamais stockés en clair). */
  connect(credentials: SupplierCredentials): Promise<void>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
  fetchCatalog(options?: { cursor?: string | null; limit?: number }): Promise<CatalogPage>;
  fetchOffers(query?: string): Promise<RawOffer[]>;
  getAccountInfo(): Promise<ConnectorAccountInfo>;
}

export type { CredentialField };

export interface ConnectorDescriptor {
  key: string;
  label: string;
  description: string;
  /** conditions d'accès (lien vers la documentation / l'accord fournisseur) */
  accessConditions: string;
  credentialFields: CredentialField[];
  /** réglages optionnels de la source rattachée (bac à sable, langue…) */
  configFields: ConfigField[];
  /** « fixtures » = implémenté d'après la documentation publique, non exercé en conditions réelles */
  verification: SourceAdapter["verification"];
  /** adaptateur sous-jacent (recherche en direct, catalogue, test) */
  adapter: SourceAdapter;
  create(config?: AdapterSourceConfig, ctx?: Partial<AdapterRunContext>): SupplierAPIConnector;
}

const DEFAULT_CONFIG: AdapterSourceConfig = { baseUrl: null, settings: {}, defaultCurrency: null, defaultTaxType: "unknown", defaultCountry: null };

function accessConditionsOf(adapter: SourceAdapter): string {
  return `Accès réservé aux titulaires d'un compte ${adapter.label.replace(/\s*\(.*\)$/, "")} : identifiants fournis par le vendeur, chiffrés côté serveur, utilisés uniquement pour l'API officielle (${adapter.method === "official_api" ? "API officielle" : "compte fournisseur"}). ${adapter.verification === "fixtures" ? "Connecteur implémenté d'après la documentation publique et vérifié sur fixtures uniquement : non exercé en conditions réelles depuis cet environnement." : ""}`.trim();
}

function createConnector(adapter: SourceAdapter, config: AdapterSourceConfig, base: Partial<AdapterRunContext>): SupplierAPIConnector {
  let credentials: SupplierCredentials | null = null;
  const ctx = (): AdapterRunContext => ({ userAgent: base.userAgent ?? "MonStockBot/0.1", ...base, credentials: credentials ?? undefined });
  return {
    key: adapter.key,
    async connect(creds) {
      credentials = creds;
    },
    async testConnection() {
      if (!credentials) return { ok: false, message: "Connexion non initialisée (identifiants absents)." };
      return adapter.testConnection(config, ctx());
    },
    async fetchCatalog(options = {}) {
      if (!credentials) throw new Error("Connexion non initialisée (identifiants absents).");
      if (!adapter.fetchCatalog) return { offers: [], nextCursor: null };
      const page = await adapter.fetchCatalog(config, options.cursor ?? null, ctx());
      return { offers: options.limit ? page.offers.slice(0, options.limit) : page.offers, nextCursor: page.nextCursor };
    },
    async fetchOffers(query) {
      if (!credentials) throw new Error("Connexion non initialisée (identifiants absents).");
      if (!query?.trim()) return [];
      const result = await adapter.search(config, parseQuery(query), query, ctx());
      return result.offers;
    },
    async getAccountInfo() {
      // Aucun adaptateur ne retourne d'informations de compte vérifiées : rien n'est supposé.
      return { accountId: null, name: null, currency: null };
    },
  };
}

function toDescriptor(adapter: SourceAdapter): ConnectorDescriptor {
  return {
    key: adapter.key,
    label: adapter.label,
    description: adapter.description,
    accessConditions: accessConditionsOf(adapter),
    credentialFields: adapter.credentialFields,
    configFields: adapter.configFields,
    verification: adapter.verification,
    adapter,
    create: (config = DEFAULT_CONFIG, ctx = {}) => createConnector(adapter, config, ctx),
  };
}

/** Registre des connecteurs : un par adaptateur de source à accès « compte ». */
export const SUPPLIER_CONNECTORS: readonly ConnectorDescriptor[] = listAccountAdapters().map(toDescriptor);

/** Message affiché uniquement lorsque le registre est vide. */
export const NO_CONNECTOR_MESSAGE = "Aucun connecteur fournisseur disponible pour l'instant.";

export function getConnectorDescriptor(key: string): ConnectorDescriptor | null {
  return SUPPLIER_CONNECTORS.find((c) => c.key === key) ?? null;
}
