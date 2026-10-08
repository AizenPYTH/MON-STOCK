"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Json } from "@/db/database.types";
import { requireOrgContextForAction } from "@/features/auth/dal";
import { activatedConfig, activationCheck, dismissedConfig, readDiscoveredConfig } from "@/features/suppliers/discovered";
import { listSourceAdapters } from "@/integrations/sourcing/registry";
import { fail, ok, type ActionResult } from "@/lib/result";
import { fromPostgrestError, toUserMessage } from "@/lib/errors";
import { createLogger } from "@/lib/logger";

const log = createLogger("DISCOVERED_SOURCES");

const sourceIdSchema = z.object({ source_id: z.string().uuid() });

function revalidate(supplierId: string): void {
  revalidatePath("/sourcing");
  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${supplierId}/sources`);
}

/**
 * « Valider et activer » une source découverte : attestation explicite obligatoire, accès public
 * uniquement (jamais un site à compte / protégé), robots.txt non bloquant, adaptateur suggéré
 * disponible. Copie config.suggested_adapter → config.adapter, automated_access_confirmed = true, status active.
 */
export async function validateDiscoveredSourceAction(_prev: ActionResult<{ message: string }> | null, formData: FormData): Promise<ActionResult<{ message: string }>> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = sourceIdSchema.safeParse({ source_id: formData.get("source_id") });
    if (!parsed.success) return fail("Source invalide.");
    if (formData.get("attestation") !== "on") return fail("Attestation requise : confirmez avoir vérifié que les conditions d'utilisation du site autorisent l'accès automatisé.", { fieldErrors: { attestation: ["Attestation requise."] } });
    const { data: source } = await ctx.supabase.from("supplier_sources").select("id, supplier_id, config, automated_access_confirmed, robots_allowed, source_type, base_url").eq("organization_id", ctx.organization.id).eq("id", parsed.data.source_id).maybeSingle();
    if (!source || source.source_type !== "PUBLIC_WEB") return fail("Source introuvable.");
    const info = readDiscoveredConfig(source.config);
    if (source.automated_access_confirmed) return fail("Source déjà validée.");
    const check = activationCheck(info, listSourceAdapters().map((a) => ({ key: a.key, access: a.access, label: a.label })), source.robots_allowed);
    if (!check.ok) return fail(check.reason);
    const now = new Date();
    const { error } = await ctx.supabase
      .from("supplier_sources")
      .update({
        config: activatedConfig(source.config, check.adapterKey, { userId: ctx.user.id, at: now }) as unknown as NonNullable<Json>,
        automated_access_confirmed: true,
        status: "active",
        access_conditions: `Accès automatisé attesté par l'utilisateur le ${now.toLocaleDateString("fr-FR")} (source découverte via ${info.discoveredVia ?? "recherche web"}, robots.txt : ${info.robotsStatus}).`,
        last_error: null,
      })
      .eq("organization_id", ctx.organization.id)
      .eq("id", source.id);
    if (error) return fail(toUserMessage(fromPostgrestError(error)));
    log.info("discovered source validated", { orgId: ctx.organization.id, sourceId: source.id, adapter: check.adapterKey });
    revalidate(source.supplier_id);
    return ok({ message: `Source validée et activée (adaptateur ${check.adapterKey}). Elle sera interrogée lors des prochaines recherches, robots.txt revérifié à chaque fois.` });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

/** « Ignorer » : status paused + config.dismissed = true (rien n'est supprimé). */
export async function dismissDiscoveredSourceAction(_prev: ActionResult<{ message: string }> | null, formData: FormData): Promise<ActionResult<{ message: string }>> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = sourceIdSchema.safeParse({ source_id: formData.get("source_id") });
    if (!parsed.success) return fail("Source invalide.");
    const { data: source } = await ctx.supabase.from("supplier_sources").select("id, supplier_id, config").eq("organization_id", ctx.organization.id).eq("id", parsed.data.source_id).maybeSingle();
    if (!source) return fail("Source introuvable.");
    if (!readDiscoveredConfig(source.config).discovered) return fail("Cette source n'a pas été découverte automatiquement.");
    const { error } = await ctx.supabase
      .from("supplier_sources")
      .update({ status: "paused", config: dismissedConfig(source.config, { userId: ctx.user.id, at: new Date() }) as unknown as NonNullable<Json> })
      .eq("organization_id", ctx.organization.id)
      .eq("id", source.id);
    if (error) return fail(toUserMessage(fromPostgrestError(error)));
    revalidate(source.supplier_id);
    return ok({ message: "Source ignorée (mise en pause). Elle ne sera ni interrogée ni reproposée." });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}
