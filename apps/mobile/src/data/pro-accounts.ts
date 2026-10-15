import type { ProAccountsHubDTO } from "@/features/mobile-api/contract";
import { callApi } from "~/lib/api";

/**
 * « Connectez vos comptes » : comptes fournisseurs professionnels (statut réel) et sources
 * publiques. Les identifiants saisis partent uniquement vers le serveur MON STOCK, qui les chiffre ;
 * ils ne sont jamais conservés dans l'application ni renvoyés.
 */
export type { ProAccountDTO, ProAccountsHubDTO, PublicSourceDTO } from "@/features/mobile-api/contract";

export function fetchProAccounts(organizationId: string): Promise<ProAccountsHubDTO> {
  return callApi<ProAccountsHubDTO>("/sourcing/accounts", { organizationId });
}

export function connectProAccount(organizationId: string, input: { key: string; credentials: Record<string, string> }): Promise<{ connectionId: string; ok: boolean; message: string }> {
  return callApi("/sourcing/accounts/connect", { method: "POST", organizationId, timeoutMs: 60_000, body: input });
}

export function syncProAccount(organizationId: string, connectionId: string): Promise<{ status: string; message: string }> {
  return callApi("/sourcing/accounts/sync", { method: "POST", organizationId, timeoutMs: 180_000, body: { connectionId } });
}

export function disconnectProAccount(organizationId: string, connectionId: string): Promise<{ message: string }> {
  return callApi("/sourcing/accounts/disconnect", { method: "POST", organizationId, body: { connectionId } });
}

export function fetchSupplierOffers(organizationId: string, supplierId: string): Promise<import("@/features/mobile-api/contract").SupplierOffersDTO> {
  return callApi("/sourcing/supplier-offers", { organizationId, query: { supplierId } });
}
