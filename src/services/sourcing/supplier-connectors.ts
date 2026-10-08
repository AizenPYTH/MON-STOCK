import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { getConnectorDescriptor, NO_CONNECTOR_MESSAGE, SUPPLIER_CONNECTORS, type ConnectorDescriptor, type SupplierCredentials } from "@/integrations/suppliers/core";
import { PARTNER_FEED_STATUS } from "@/integrations/suppliers/partner-feed";

/**
 * Service des connexions fournisseurs (comptes / API). L'architecture (connexions +
 * secrets chiffrés + registre) est en place ; aucun connecteur réel n'est disponible.
 */
export function listAvailableConnectors(): readonly ConnectorDescriptor[] {
  return SUPPLIER_CONNECTORS;
}

export function connectorsStatusMessage(): string {
  return `${NO_CONNECTOR_MESSAGE} ${PARTNER_FEED_STATUS.message}`;
}

/** Crée une connexion (insert serveur : la RLS interdit l'insertion côté utilisateur) et chiffre les identifiants. */
export async function createSupplierConnection(input: { organizationId: string; supplierId: string; sourceId?: string | null; connectorKey: string; credentials: SupplierCredentials }): Promise<string> {
  const descriptor = getConnectorDescriptor(input.connectorKey);
  if (!descriptor) throw new AppError("NOT_IMPLEMENTED", NO_CONNECTOR_MESSAGE);
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("supplier_connections")
    .insert({ organization_id: input.organizationId, supplier_id: input.supplierId, source_id: input.sourceId ?? null, connector_key: input.connectorKey, status: "pending" })
    .select("id")
    .single();
  if (error || !data) throw new AppError("INTERNAL", `Connexion non créée : ${error?.message ?? "inconnu"}`);
  await storeConnectionCredentials(data.id, input.credentials);
  return data.id;
}

export async function storeConnectionCredentials(connectionId: string, credentials: SupplierCredentials): Promise<void> {
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("supplier_connection_secrets").upsert({ connection_id: connectionId, credentials_enc: encryptSecret(JSON.stringify(credentials)), key_version: 1, updated_at: new Date().toISOString() });
  if (error) throw new AppError("INTERNAL", `Identifiants non enregistrés : ${error.message}`);
}

export async function loadConnectionCredentials(connectionId: string): Promise<SupplierCredentials | null> {
  const admin = createAdminSupabaseClient();
  const { data } = await admin.from("supplier_connection_secrets").select("credentials_enc").eq("connection_id", connectionId).maybeSingle();
  if (!data?.credentials_enc) return null;
  return JSON.parse(decryptSecret(data.credentials_enc)) as SupplierCredentials;
}

/** Synchronisation d'une connexion : impossible tant qu'aucun connecteur n'existe. */
export async function syncSupplierConnection(connectionId: string): Promise<never> {
  const admin = createAdminSupabaseClient();
  const { data } = await admin.from("supplier_connections").select("connector_key").eq("id", connectionId).maybeSingle();
  const descriptor = data ? getConnectorDescriptor(data.connector_key) : null;
  if (!descriptor) throw new AppError("NOT_IMPLEMENTED", NO_CONNECTOR_MESSAGE);
  // Point d'extension : connector.connect(credentials) → fetchCatalog() → storeOffer().
  throw new AppError("NOT_IMPLEMENTED", `Le connecteur « ${descriptor.label} » n'est pas encore opérationnel.`);
}
