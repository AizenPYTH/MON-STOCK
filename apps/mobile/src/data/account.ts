import { accountDeleteInputSchema, type AccountDeletionResultDTO } from "@/features/mobile-api/contract";
import { callApi } from "~/lib/api";
import { UserFacingError } from "~/lib/errors";

/**
 * Suppression DÉFINITIVE du compte (M-01) : route serveur POST /account/delete. Le serveur revérifie
 * le jeton, refuse si l'utilisateur est le seul propriétaire d'une organisation partagée, supprime
 * les organisations dont il est le seul membre, ses adhésions, son profil puis son identifiant.
 * Pas d'en-tête d'organisation : la suppression porte sur le compte, pas sur une organisation.
 */
export async function deleteMyAccount(confirmation: string, fetchImpl?: typeof fetch): Promise<AccountDeletionResultDTO> {
  const parsed = accountDeleteInputSchema.safeParse({ confirmation });
  if (!parsed.success) throw new UserFacingError(parsed.error.issues[0]?.message ?? "Confirmation invalide.", "VALIDATION");
  return callApi<AccountDeletionResultDTO>("/account/delete", { method: "POST", body: { confirmation: parsed.data.confirmation }, timeoutMs: 120_000, fetchImpl });
}
