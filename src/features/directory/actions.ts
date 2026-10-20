"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContextForAction } from "@/features/auth/dal";
import { fail, ok, type ActionResult } from "@/lib/result";
import { toUserMessage } from "@/lib/errors";
import { activateLibrarySourceFor, getLibrarySource } from "@/services/sourcing/source-library";

/** Même contrat que POST /sourcing/library/activate (Edge) : clé + attestation obligatoire. */
const activateSchema = z.object({
  key: z.string().min(1).max(80),
  attest: z.literal(true, { error: "Confirmez avoir lu les conditions d'utilisation de la source." }),
});

/**
 * Active une source vérifiée de la bibliothèque (rôle rédacteur, comme l'Edge). L'attestation
 * (conditions lues, accès automatisé autorisé) est enregistrée avec la date et l'utilisateur.
 */
export async function activateLibrarySourceAction(_prev: ActionResult<{ message: string }> | null, formData: FormData): Promise<ActionResult<{ message: string }>> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = activateSchema.safeParse({ key: String(formData.get("key") ?? ""), attest: formData.get("attest") === "on" || formData.get("attest") === "true" });
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Demande invalide.");
    const source = getLibrarySource(parsed.data.key);
    const attestation = `Conditions d'utilisation (${source?.termsUrl ?? ""}) déclarées lues et accès automatisé attesté par l'utilisateur ${ctx.user.email ?? ctx.user.id} le ${new Date().toISOString()} (site web).`;
    const r = await activateLibrarySourceFor(ctx.supabase, ctx.organization.id, parsed.data.key, attestation);
    revalidatePath("/sourcing/sources");
    revalidatePath("/suppliers/directory", "layout");
    return ok({ message: r.alreadyActive ? "Cette source était déjà activée dans votre organisation." : `${source?.name ?? "Source"} activée : elle sera interrogée à chaque recherche.` });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}
