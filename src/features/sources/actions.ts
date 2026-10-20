"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContextForAction } from "@/features/auth/dal";
import { fail, ok, type ActionResult } from "@/lib/result";
import { toUserMessage } from "@/lib/errors";
import type { CatalogPreviewDTO } from "@/features/mobile-api/contract";
import { setSourceSchedule, sourceScheduleSchema, syncSourceNow } from "@/services/sourcing/source-sync";
import { createRemoteFeed, previewRemoteFeed, remoteFeedCreateSchema, remoteFeedPreviewSchema } from "@/services/sourcing/remote-feeds";
import { validationMessage } from "@/features/catalog-imports/request";

/**
 * Sources et flux distants — mêmes droits que l'Edge Function :
 *   « Synchroniser maintenant » (POST /sourcing/sources/sync)       rédacteur
 *   fréquence / activation      (POST /sourcing/sources/schedule)   administrateur
 *   aperçu d'un flux            (POST /sourcing/feeds/preview)      rédacteur
 *   ajout d'un flux             (POST /sourcing/feeds)              rédacteur, attestation obligatoire
 * Les identifiants d'un flux sont chiffrés par le serveur et ne sont jamais renvoyés.
 */

export type MessageResult = ActionResult<{ message: string; tone: "success" | "error" }>;

function revalidateSources() {
  revalidatePath("/sourcing/sources");
  revalidatePath("/suppliers/directory", "layout");
  revalidatePath("/suppliers/accounts");
}

export async function syncSourceAction(_prev: MessageResult | null, formData: FormData): Promise<MessageResult> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const id = z.string().uuid().safeParse(String(formData.get("sourceId") ?? ""));
    if (!id.success) return fail("Source invalide.");
    const r = await syncSourceNow(ctx, id.data);
    revalidateSources();
    return ok({ message: r.message || "Synchronisation terminée.", tone: r.status === "failed" || r.status === "refused" ? "error" : "success" });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function scheduleSourceAction(_prev: MessageResult | null, formData: FormData): Promise<MessageResult> {
  try {
    const ctx = await requireOrgContextForAction({ admin: true });
    const enabledRaw = formData.get("enabled");
    const frequencyRaw = formData.get("frequency");
    const parsed = sourceScheduleSchema.safeParse({
      sourceId: String(formData.get("sourceId") ?? ""),
      ...(typeof frequencyRaw === "string" && frequencyRaw ? { frequency: frequencyRaw } : {}),
      ...(enabledRaw === "true" || enabledRaw === "false" ? { enabled: enabledRaw === "true" } : {}),
    });
    if (!parsed.success) return fail("Réglage invalide.");
    if (parsed.data.frequency === undefined && parsed.data.enabled === undefined) return fail("Aucun changement demandé.");
    const s = await setSourceSchedule(ctx, parsed.data);
    revalidateSources();
    const message = parsed.data.enabled === false ? "Source désactivée." : parsed.data.enabled === true ? "Source réactivée." : `Fréquence enregistrée : ${s.frequencyLabel}.`;
    return ok({ message, tone: "success" });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

/** Aperçu d'un flux distant : rien n'est enregistré (rédacteur). */
export async function previewRemoteFeedAction(input: unknown): Promise<ActionResult<CatalogPreviewDTO>> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = remoteFeedPreviewSchema.safeParse(input);
    if (!parsed.success) return fail(validationMessage(parsed.error.issues));
    return ok(await previewRemoteFeed(ctx, parsed.data));
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

/** Ajout du flux (rédacteur) : attestation d'accord du fournisseur exigée par le schéma. */
export async function createRemoteFeedAction(input: unknown): Promise<ActionResult<{ supplierId: string; sourceId: string }>> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = remoteFeedCreateSchema.safeParse(input);
    if (!parsed.success) return fail(validationMessage(parsed.error.issues));
    const r = await createRemoteFeed(ctx, parsed.data);
    revalidateSources();
    // les identifiants éventuels (en-tête, mot de passe) ne sont jamais renvoyés
    return ok({ supplierId: r.supplierId, sourceId: r.sourceId });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}
