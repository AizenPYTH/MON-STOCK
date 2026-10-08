/**
 * Contrats des connecteurs fournisseurs (API / compte fournisseur).
 *
 * Un connecteur n'accède qu'à des données que le vendeur est autorisé à consulter
 * (API officielle, compte fournisseur connecté par le vendeur). Les identifiants sont
 * chiffrés (supplier_connection_secrets, service_role uniquement) et ne transitent
 * jamais vers le navigateur.
 *
 * ÉTAT ACTUEL : aucun connecteur réel n'existe. Le registre est vide et l'interface
 * l'indique honnêtement (« Aucun connecteur fournisseur disponible pour l'instant »).
 */
import type { RawOffer } from "@/domain/sourcing/types";

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

export interface CredentialField {
  name: string;
  label: string;
  secret: boolean;
}

export interface ConnectorDescriptor {
  key: string;
  label: string;
  description: string;
  /** conditions d'accès (lien vers la documentation / l'accord fournisseur) */
  accessConditions: string;
  credentialFields: CredentialField[];
  create(): SupplierAPIConnector;
}

/** Registre des connecteurs : vide tant qu'aucun accord / API officielle n'est implémenté. */
export const SUPPLIER_CONNECTORS: readonly ConnectorDescriptor[] = [];

export const NO_CONNECTOR_MESSAGE = "Aucun connecteur fournisseur disponible pour l'instant.";

export function getConnectorDescriptor(key: string): ConnectorDescriptor | null {
  return SUPPLIER_CONNECTORS.find((c) => c.key === key) ?? null;
}
