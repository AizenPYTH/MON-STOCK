"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContextForAction } from "@/features/auth/dal";
import { fail, ok, type ActionResult } from "@/lib/result";
import { toUserMessage } from "@/lib/errors";
import { connectProAccount, disconnectProAccount, syncProAccount } from "@/services/sourcing/pro-accounts";
import { credentialsFromFormData } from "@/features/pro-accounts/credentials";

/**
 * Comptes fournisseurs professionnels — mêmes droits que l'Edge Function :
 *   connexion  (POST /sourcing/accounts/connect)    rédacteur
 *   synchro    (POST /sourcing/accounts/sync)       rédacteur
 *   déconnexion (POST /sourcing/accounts/disconnect) administrateur
 * Les identifiants saisis ne sont jamais renvoyés au navigateur (ni dans le résultat, ni dans les journaux).
 */

export type AccountActionResult = ActionResult<{ message: string; ok: boolean }>;

const keySchema = z.string().min(1).max(80);
const connectionIdSchema = z.string().uuid("Connexion invalide.");

function revalidateAccounts() {
  revalidatePath("/suppliers/accounts");
  revalidatePath("/suppliers/directory", "layout");
  revalidatePath("/sourcing/sources");
}

export async function connectProAccountAction(_prev: AccountActionResult | null, formData: FormData): Promise<AccountActionResult> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const key = keySchema.safeParse(String(formData.get("key") ?? ""));
    if (!key.success) return fail("Fournisseur inconnu.");
    const credentials = credentialsFromFormData(formData);
    const r = await connectProAccount(ctx, { key: key.data, credentials });
    revalidateAccounts();
    // seul le verdict du test réel du serveur est renvoyé (aucun identifiant)
    return ok({ ok: r.ok, message: r.message });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function syncProAccountAction(_prev: AccountActionResult | null, formData: FormData): Promise<AccountActionResult> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const id = connectionIdSchema.safeParse(String(formData.get("connectionId") ?? ""));
    if (!id.success) return fail("Connexion invalide.");
    const r = await syncProAccount(ctx, id.data);
    revalidateAccounts();
    return ok({ ok: r.status !== "failed", message: r.message });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function disconnectProAccountAction(_prev: AccountActionResult | null, formData: FormData): Promise<AccountActionResult> {
  try {
    const ctx = await requireOrgContextForAction({ admin: true });
    const id = connectionIdSchema.safeParse(String(formData.get("connectionId") ?? ""));
    if (!id.success) return fail("Connexion invalide.");
    const r = await disconnectProAccount(ctx, id.data);
    revalidateAccounts();
    return ok({ ok: true, message: r.message });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}
