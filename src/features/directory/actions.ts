"use server";
import { revalidatePath } from "next/cache";
import { requireOrgContextForAction } from "@/features/auth/dal";
import { fail, ok, type ActionResult } from "@/lib/result";
import { toUserMessage } from "@/lib/errors";
import { activateLibrarySource, getLibrarySource, libraryActivateSchema } from "@/services/sourcing/source-library";

/**
 * Active une source vérifiée de la bibliothèque (rôle rédacteur, même contrat que l'Edge
 * POST /sourcing/library/activate). La validation humaine (utilisateur, date, page des
 * conditions lue) est enregistrée ; elle est exigée avec l'adresse de la page des conditions
 * quand MON STOCK ne l'a pas confirmée.
 */
export async function activateLibrarySourceAction(_prev: ActionResult<{ message: string }> | null, formData: FormData): Promise<ActionResult<{ message: string }>> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const termsUrl = String(formData.get("termsUrl") ?? "").trim();
    const parsed = libraryActivateSchema.safeParse({ key: String(formData.get("key") ?? ""), attest: formData.get("attest") === "on" || formData.get("attest") === "true", ...(termsUrl ? { termsUrl } : {}) });
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Demande invalide.");
    const source = getLibrarySource(parsed.data.key);
    const r = await activateLibrarySource(ctx, parsed.data.key, { termsUrl: parsed.data.termsUrl ?? null }, "web");
    revalidatePath("/sourcing/sources");
    revalidatePath("/suppliers/directory", "layout");
    return ok({ message: r.alreadyActive ? "Cette source était déjà activée dans votre organisation." : `${source?.name ?? "Source"} activée : elle sera interrogée à chaque recherche.` });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}
