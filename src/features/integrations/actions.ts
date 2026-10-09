"use server";
import { revalidatePath } from "next/cache";
import { requireOrgContextForAction } from "@/features/auth/dal";
import { fail, ok, type ActionResult } from "@/lib/result";
import { AppError, fromPostgrestError, isAppError, toUserMessage } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isConnectorError, connectorErrorToAppError } from "@/integrations/core/errors";
import { getConnector } from "@/integrations/core/registry";
import type { SyncRunResult } from "@/services/sync/engine";
import { pushQuantityToChannel } from "@/services/sync/inventory-push";
import { connectorAuthFor, disconnectConnection } from "@/services/channels/connection-store";
import { searchSkus } from "@/features/stock/queries";
import { syncConnectionNow } from "@/features/integrations/sync-service";
import {
  checkboxOn,
  connectionSettingsSchema,
  disconnectSchema,
  fieldErrorsOf,
  listingIdSchema,
  mapListingSchema,
  pushQuantitySchema,
  suggestionIdSchema,
  syncNowSchema,
} from "@/features/integrations/schemas";

const log = createLogger("INTEGRATIONS");

function revalidateAll() {
  for (const p of ["/settings/integrations", "/settings/integrations/mapping", "/settings/integrations/ebay/setup", "/settings/sync", "/stock", "/dashboard"]) revalidatePath(p);
}

function failFrom(e: unknown): ActionResult<never> {
  if (isConnectorError(e)) {
    const app = connectorErrorToAppError(e);
    return fail(app.message, { code: app.code, action: app.action });
  }
  if (isAppError(e)) return fail(e.message, { code: e.code, action: e.action });
  return fail(toUserMessage(e));
}

export type SyncActionData = { runId: string; status: SyncRunResult["status"]; summary: string; durationMs: number; errorSummary: string | null; stats: SyncRunResult["stats"] };

/** [Synchroniser maintenant] : exécute réellement le moteur et renvoie le résultat du run. */
export async function syncNowAction(_prev: ActionResult<SyncActionData> | null, formData: FormData): Promise<ActionResult<SyncActionData>> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = syncNowSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Paramètres invalides.", { fieldErrors: fieldErrorsOf(parsed.error.issues) });
    const { result, summary } = await syncConnectionNow(ctx, parsed.data.connection_id, { trigger: parsed.data.trigger, scope: parsed.data.scope });
    revalidateAll();
    if (result.status === "failed") {
      return fail(result.errorSummary ?? "La synchronisation a échoué.", { code: "SYNC_FAILED", action: { label: "Voir le détail", href: `/settings/sync/${result.runId}` } });
    }
    return ok({ runId: result.runId, status: result.status, summary, durationMs: result.durationMs, errorSummary: result.errorSummary, stats: result.stats });
  } catch (e) {
    return failFrom(e);
  }
}

export async function disconnectConnectionAction(_prev: ActionResult<{ note: string }> | null, formData: FormData): Promise<ActionResult<{ note: string }>> {
  try {
    const ctx = await requireOrgContextForAction({ admin: true });
    const parsed = disconnectSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Confirmez la déconnexion.", { fieldErrors: fieldErrorsOf(parsed.error.issues) });
    const result = await disconnectConnection(parsed.data.connection_id, ctx.organization.id);
    log.info("connexion déconnectée par un administrateur", { connectionId: parsed.data.connection_id, userId: ctx.user.id });
    revalidateAll();
    return ok({ note: result.note });
  } catch (e) {
    return failFrom(e);
  }
}

export async function updateConnectionSettingsAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContextForAction({ admin: true });
    const parsed = connectionSettingsSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Vérifiez les paramètres.", { fieldErrors: fieldErrorsOf(parsed.error.issues) });
    const d = parsed.data;
    const { data, error } = await ctx.supabase
      .from("channel_connections")
      .update({ auto_sync: checkboxOn(d.auto_sync), sync_interval_minutes: d.sync_interval_minutes, push_inventory: checkboxOn(d.push_inventory) })
      .eq("id", d.connection_id)
      .eq("organization_id", ctx.organization.id)
      .select("id")
      .maybeSingle();
    if (error) return fail(toUserMessage(fromPostgrestError(error)));
    if (!data) return fail("Connexion introuvable dans votre organisation.");
    revalidateAll();
    return ok(undefined);
  } catch (e) {
    return failFrom(e);
  }
}

function translateMapError(e: { code?: string; message?: string }): string {
  if (e.message?.includes("LISTING_NOT_FOUND")) return "Annonce introuvable.";
  if (e.message?.includes("SKU_NOT_FOUND")) return "SKU introuvable dans votre organisation.";
  return toUserMessage(fromPostgrestError(e));
}

export async function mapListingAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = mapListingSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Sélectionnez un SKU.", { fieldErrors: fieldErrorsOf(parsed.error.issues) });
    const { error } = await ctx.supabase.rpc("map_listing_to_sku", { p_listing_id: parsed.data.listing_id, p_sku_id: parsed.data.sku_id, p_source: "manual" });
    if (error) return fail(translateMapError(error));
    revalidateAll();
    return ok(undefined);
  } catch (e) {
    return failFrom(e);
  }
}

export async function acceptSuggestionAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = suggestionIdSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Suggestion invalide.");
    const { data: suggestion } = await ctx.supabase.from("mapping_suggestions").select("listing_id, sku_id, status").eq("id", parsed.data.suggestion_id).eq("organization_id", ctx.organization.id).maybeSingle();
    if (!suggestion) return fail("Suggestion introuvable.");
    if (suggestion.status !== "pending") return fail("Cette suggestion a déjà été traitée.");
    const { error } = await ctx.supabase.rpc("map_listing_to_sku", { p_listing_id: suggestion.listing_id, p_sku_id: suggestion.sku_id, p_source: "suggestion_accepted" });
    if (error) return fail(translateMapError(error));
    revalidateAll();
    return ok(undefined);
  } catch (e) {
    return failFrom(e);
  }
}

export async function rejectSuggestionAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = suggestionIdSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Suggestion invalide.");
    const { data: suggestion, error } = await ctx.supabase
      .from("mapping_suggestions")
      .update({ status: "rejected", decided_by: ctx.user.id, decided_at: new Date().toISOString() })
      .eq("id", parsed.data.suggestion_id)
      .eq("organization_id", ctx.organization.id)
      .eq("status", "pending")
      .select("listing_id")
      .maybeSingle();
    if (error) return fail(toUserMessage(fromPostgrestError(error)));
    if (!suggestion) return fail("Suggestion introuvable ou déjà traitée.");
    const { count } = await ctx.supabase.from("mapping_suggestions").select("id", { count: "exact", head: true }).eq("listing_id", suggestion.listing_id).eq("status", "pending");
    if ((count ?? 0) === 0) {
      await ctx.supabase.from("channel_listings").update({ mapping_status: "unmapped" }).eq("id", suggestion.listing_id).eq("mapping_status", "suggested");
    }
    revalidateAll();
    return ok(undefined);
  } catch (e) {
    return failFrom(e);
  }
}

async function setMappingStatus(formData: FormData, status: "ignored" | "unmapped"): Promise<ActionResult> {
  const ctx = await requireOrgContextForAction({ write: true });
  const parsed = listingIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Annonce invalide.");
  const { data, error } = await ctx.supabase
    .from("channel_listings")
    .update({ mapping_status: status, sku_id: null, mapping_source: null, mapped_at: null, mapped_by: null })
    .eq("id", parsed.data.listing_id)
    .eq("organization_id", ctx.organization.id)
    .select("id")
    .maybeSingle();
  if (error) return fail(toUserMessage(fromPostgrestError(error)));
  if (!data) return fail("Annonce introuvable.");
  revalidateAll();
  return ok(undefined);
}

export async function ignoreListingAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    return await setMappingStatus(formData, "ignored");
  } catch (e) {
    return failFrom(e);
  }
}

export async function restoreListingAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    return await setMappingStatus(formData, "unmapped");
  } catch (e) {
    return failFrom(e);
  }
}

/** Retire l'association : le stock n'est pas modifié (les ventes passées restent rattachées au SKU). */
export async function unmapListingAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    return await setMappingStatus(formData, "unmapped");
  } catch (e) {
    return failFrom(e);
  }
}

export type PushQuantityData = { quantity: number; warnings: string[]; listingTitle: string };

/** « Pousser la quantité vers eBay » : action manuelle, explicite, par annonce (ReviseInventoryStatus). */
export async function pushListingQuantityAction(_prev: ActionResult<PushQuantityData> | null, formData: FormData): Promise<ActionResult<PushQuantityData>> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = pushQuantitySchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Confirmez l'envoi de la quantité.", { fieldErrors: fieldErrorsOf(parsed.error.issues) });
    const { data: listing } = await ctx.supabase
      .from("channel_listings")
      .select("id, title, external_listing_id, external_variation_id, external_sku, sku_id, quantity_available, connection_id, provider, mapping_status, status")
      .eq("id", parsed.data.listing_id)
      .eq("organization_id", ctx.organization.id)
      .maybeSingle();
    if (!listing) return fail("Annonce introuvable.");
    if (listing.mapping_status !== "mapped" || !listing.sku_id) return fail("Associez d'abord cette annonce à un SKU.");
    if (listing.status !== "active") return fail("Cette annonce n'est plus active sur le canal.");
    if (!listing.connection_id) return fail("Cette annonce n'est rattachée à aucune connexion.");
    const { data: connection } = await ctx.supabase.from("channel_connections").select("id, status, provider").eq("id", listing.connection_id).eq("organization_id", ctx.organization.id).maybeSingle();
    if (!connection) return fail("Connexion introuvable.");
    if (connection.status !== "connected" && connection.status !== "error") {
      throw new AppError("CONNECTION_EXPIRED", "Impossible d'envoyer la quantité : la connexion eBay n'est plus valide.", { action: { label: "Reconnecter eBay", href: "/settings/integrations" } });
    }
    const { data: inventory } = await ctx.supabase.from("inventory").select("quantity_available").eq("sku_id", listing.sku_id).eq("organization_id", ctx.organization.id).maybeSingle();
    if (!inventory || inventory.quantity_available === null) return fail("Stock interne introuvable pour ce SKU.");
    const quantity = Math.max(0, inventory.quantity_available);
    const connector = getConnector(connection.provider);
    const result = await pushQuantityToChannel(createAdminSupabaseClient(), connector, connectorAuthFor(connection.id), listing, quantity);
    log.info("quantité poussée manuellement", { listingId: listing.id, userId: ctx.user.id, quantity: result.quantity });
    revalidateAll();
    return ok({ quantity: result.quantity, warnings: result.warnings, listingTitle: listing.title });
  } catch (e) {
    return failFrom(e);
  }
}

export type SkuSearchRow = { sku_id: string; code: string; product_name: string; variant_name: string | null; brand: string | null; quantity_available: number | null };

/** Recherche de SKU pour l'association manuelle (lecture seule). */
export async function searchSkusAction(q: string): Promise<ActionResult<SkuSearchRow[]>> {
  try {
    const ctx = await requireOrgContextForAction();
    const rows = await searchSkus(ctx, q.slice(0, 120), 15);
    return ok(
      rows
        .filter((r): r is typeof r & { sku_id: string; code: string } => Boolean(r.sku_id && r.code))
        .map((r) => ({ sku_id: r.sku_id, code: r.code, product_name: r.product_name ?? "", variant_name: r.variant_name, brand: r.brand, quantity_available: r.quantity_available })),
    );
  } catch (e) {
    return failFrom(e);
  }
}
