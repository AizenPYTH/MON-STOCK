"use server";
/**
 * Suppression du compte depuis le site web (audit M-01) : Server Action FINE au-dessus du service
 * partagé avec l'Edge Function (POST /account/delete) — `src/services/account`. Aucune règle métier
 * ici : authentification revérifiée (getUser), confirmation validée par le schéma du contrat, puis
 * le service fait tout le reste (refus « seul propriétaire », organisations, données, identifiant).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser, SESSION_EXPIRED_MESSAGE } from "@/features/auth/dal";
import { accountDeleteInputSchema, type AccountDeletionResultDTO } from "@/features/mobile-api/contract";
import { deleteAccountForUser } from "@/services/account";
import { fail, ok, type ActionResult } from "@/lib/result";
import { toUserMessage } from "@/lib/errors";
import { createLogger } from "@/lib/logger";

const log = createLogger("ACCOUNT");

export async function deleteMyAccountAction(_prev: ActionResult<AccountDeletionResultDTO> | null, formData: FormData): Promise<ActionResult<AccountDeletionResultDTO>> {
  // L'identifiant supprimé est TOUJOURS celui de la session vérifiée (jamais une valeur du formulaire).
  const user = await getCurrentUser();
  if (!user) return fail(SESSION_EXPIRED_MESSAGE, { action: { label: "Se reconnecter", href: "/login" } });

  const parsed = accountDeleteInputSchema.safeParse({ confirmation: formData.get("confirmation") ?? "" });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Confirmation invalide.";
    return fail(message, { fieldErrors: { confirmation: [message] } });
  }

  const supabase = await createServerSupabaseClient();
  let result: AccountDeletionResultDTO;
  try {
    result = await deleteAccountForUser(supabase as unknown as SupabaseClient<Database>, user.id, parsed.data.confirmation);
  } catch (e) {
    return fail(toUserMessage(e));
  }

  // Le compte n'existe plus : la session locale est fermée (cookies effacés). Un échec ici ne change
  // rien à la suppression, déjà faite côté serveur.
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch (e) {
    log.warn("fermeture de session après suppression de compte non confirmée", { reason: toUserMessage(e) });
  }
  return ok(result);
}
