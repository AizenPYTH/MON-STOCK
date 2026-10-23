import "server-only";
/**
 * Point d'entrée serveur de la suppression de compte (M-01), partagé par :
 *  - l'Edge Function : POST /account/delete (server/edge/api.ts) ;
 *  - le site web : Server Action à brancher (voir docs/MOBILE.md §10).
 *
 * L'appelant fournit le client Supabase de l'utilisateur et son identifiant APRÈS avoir revérifié
 * le jeton (`auth.getUser()`). Le client service_role est créé ici, côté serveur uniquement.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createLogger } from "@/lib/logger";
import { disconnectConnection } from "@/services/channels/connection-store";
import { deleteAccount } from "@/services/account/delete-account";
import { supabaseAccountDeletionPorts } from "@/services/account/supabase-ports";
import type { AccountDeletionResultDTO } from "@/features/mobile-api/contract";

export { deleteAccount, isAccountDeleteConfirmation, soleOwnerBlockers } from "@/services/account/delete-account";
export type { AccountDeletionPorts, AccountDeletionPlanRow } from "@/services/account/delete-account";
export { supabaseAccountDeletionPorts } from "@/services/account/supabase-ports";

const log = createLogger("ACCOUNT");

export async function deleteAccountForUser(userClient: SupabaseClient<Database>, userId: string, confirmation: unknown): Promise<AccountDeletionResultDTO> {
  const ports = supabaseAccountDeletionPorts({
    user: userClient,
    admin: createAdminSupabaseClient(),
    disconnectChannel: (connectionId, organizationId) => disconnectConnection(connectionId, organizationId),
  });
  return deleteAccount(ports, { userId, confirmation }, log);
}
