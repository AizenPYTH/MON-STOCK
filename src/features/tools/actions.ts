"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContextForAction } from "@/features/auth/dal";
import { shippingQuoteRequestSchema, type ShippingQuotesDTO, type TrackingRefreshDTO } from "@/features/mobile-api/contract";
import { PORT_DEFAULT_CARRIERS, PORT_WEIGHTS, setBandPrice } from "@/domain/tools/quick-calc";
import { rateCardFromRow } from "@/domain/tools/shipping";
import { canonicalTrackingNumber, CARRIER_LABEL, validateTrackingNumber, TRACKING_NUMBER_ERROR_LABEL, type CarrierCode } from "@/domain/tools/tracking";
import { callEdgeApi } from "@/lib/edge-api";
import { fromPostgrestError, toUserMessage } from "@/lib/errors";
import { orIlikeAny } from "@/lib/postgrest";
import { fail, ok, type ActionResult } from "@/lib/result";
import type { OrgContext } from "@/features/auth/dal";
import { isDuplicateError } from "@/features/tools/format";
import { batchSummary, orderLinkLabel, parcelUpdateRow, type ParcelPatch } from "@/features/tools/parcels";
import { newPortRateCardInput, rateCardInputWithBands, rateCardRow, validateRateCardForm, type RateCardForm, type RateCardInput } from "@/features/tools/rate-cards";

/**
 * Actions des outils : mêmes écritures que l'application iPhone (grilles tarifaires, colis
 * suivis, sous RLS), et appels au serveur MON STOCK (Edge) pour ce qui dépend de secrets tiers
 * (devis des plateformes d'expédition, interrogation des API de suivi).
 */

const uuid = z.string().uuid();
const today = () => new Date().toISOString().slice(0, 10);
const DUPLICATE_PARCEL = "Ce numéro est déjà suivi dans cette organisation.";

function revalidateShipping() {
  revalidatePath("/tools/shipping");
  revalidatePath("/tools/shipping-rates");
}

function revalidateTracking(id?: string) {
  revalidatePath("/tools/tracking");
  if (id) revalidatePath(`/tools/tracking/${id}`);
}

// ---------------------------------------------------------------------------
// Expédition
// ---------------------------------------------------------------------------

/** Devis réels des plateformes connectées côté serveur (consultation de tarifs uniquement). */
export async function requestShippingQuotesAction(request: unknown): Promise<ActionResult<ShippingQuotesDTO>> {
  try {
    const ctx = await requireOrgContextForAction();
    const parsed = shippingQuoteRequestSchema.safeParse(request);
    if (!parsed.success) return fail("Colis ou trajet invalide : vérifiez le poids, les dimensions, les pays et les codes postaux.");
    return ok(await callEdgeApi<ShippingQuotesDTO>(ctx, "/shipping/quotes", { method: "POST", body: parsed.data }));
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

async function readCard(ctx: OrgContext, id: string) {
  const { data, error } = await ctx.supabase
    .from("shipping_rate_cards")
    .select("id, carrier, service, from_countries, to_countries, bands, currency, max_length_cm, max_dimensions_sum_cm, volumetric_divisor, transit_days_min, transit_days_max, tracking, delivery_mode, notes, verified_at")
    .eq("organization_id", ctx.organization.id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw fromPostgrestError(error);
  return data ? rateCardFromRow(data) : null;
}

async function writeCard(ctx: OrgContext, id: string | null, input: RateCardInput): Promise<string> {
  if (id) {
    const { error } = await ctx.supabase.from("shipping_rate_cards").update(rateCardRow(input)).eq("organization_id", ctx.organization.id).eq("id", id);
    if (error) throw fromPostgrestError(error);
    return id;
  }
  const { data, error } = await ctx.supabase.from("shipping_rate_cards").insert({ ...rateCardRow(input), organization_id: ctx.organization.id }).select("id").single();
  if (error || !data) throw fromPostgrestError(error ?? { message: "Grille non enregistrée." });
  return data.id;
}

/** Création (id null) ou modification d'une grille tarifaire. */
export async function saveRateCardAction(id: string | null, form: RateCardForm): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    if (id !== null && !uuid.safeParse(id).success) return fail("Grille introuvable.");
    const existing = id ? await readCard(ctx, id) : null;
    if (id && !existing) return fail("Grille introuvable : elle a peut-être été supprimée.");
    const v = validateRateCardForm(form, existing?.verifiedAt ?? null, today());
    if (!v.ok) return fail(v.error);
    const saved = await writeCard(ctx, id, v.input);
    revalidateShipping();
    return ok({ id: saved });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function deleteRateCardAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    if (!uuid.safeParse(id).success) return fail("Grille introuvable.");
    const { error } = await ctx.supabase.from("shipping_rate_cards").delete().eq("organization_id", ctx.organization.id).eq("id", id);
    if (error) return fail(toUserMessage(fromPostgrestError(error)));
    revalidateShipping();
    return ok(undefined);
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

/**
 * Outil « Port » : fixe VOTRE prix pour un poids dans une grille existante, ou crée la première
 * grille d'un transporteur proposé (France → France). Prix vide = tranche retirée.
 */
export async function savePortPriceAction(v: { cardId: string | null; carrier: string | null; weightKg: number; price: string }): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    if (!PORT_WEIGHTS.some((w) => w.kg === v.weightKg)) return fail("Poids non proposé par l'outil.");
    const price = String(v.price ?? "").slice(0, 24);
    let input: RateCardInput | null = null;
    let id: string | null = null;
    if (v.cardId) {
      if (!uuid.safeParse(v.cardId).success) return fail("Grille introuvable.");
      const card = await readCard(ctx, v.cardId);
      if (!card) return fail("Grille introuvable : elle a peut-être été supprimée.");
      input = rateCardInputWithBands(card, setBandPrice(card.bands, v.weightKg, price), today());
      id = card.id;
    } else if (v.carrier && PORT_DEFAULT_CARRIERS.includes(v.carrier) && price.trim()) {
      input = newPortRateCardInput(v.carrier, setBandPrice([], v.weightKg, price), today());
    }
    if (!input) return fail("Saisissez un prix.");
    if (input.bands.length === 0) return fail("Une grille garde au moins un prix : gérez-la depuis « Mes grilles tarifaires ».");
    await writeCard(ctx, id, input);
    revalidateShipping();
    return ok(undefined);
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

// ---------------------------------------------------------------------------
// Suivi de colis
// ---------------------------------------------------------------------------

const carrierSchema = z.enum(Object.keys(CARRIER_LABEL) as [CarrierCode, ...CarrierCode[]]);

const newParcelSchema = z.object({
  trackingNumber: z.string().max(80),
  carrierCode: carrierSchema.nullable(),
  carrierSource: z.enum(["auto", "manual"]),
  label: z.string().max(200),
  orderId: uuid.nullable(),
  destinationCountry: z.string().regex(/^[A-Z]{2}$/, "Pays de destination : code à 2 lettres (ex. FR).").nullable(),
});

export type NewParcelInput = z.infer<typeof newParcelSchema>;

async function refreshViaEdge(ctx: OrgContext, parcelId: string): Promise<TrackingRefreshDTO> {
  return callEdgeApi<TrackingRefreshDTO>(ctx, "/tracking/refresh", { method: "POST", body: { parcelId } });
}

async function assertOrder(ctx: OrgContext, orderId: string): Promise<boolean> {
  const { data } = await ctx.supabase.from("orders").select("id").eq("organization_id", ctx.organization.id).eq("id", orderId).maybeSingle();
  return Boolean(data);
}

async function insertParcel(ctx: OrgContext, p: NewParcelInput & { trackingNumber: string }): Promise<{ id: string } | { duplicate: true } | { error: string }> {
  const { data, error } = await ctx.supabase
    .from("tracked_parcels")
    .insert({ organization_id: ctx.organization.id, tracking_number: p.trackingNumber, carrier_code: p.carrierCode, carrier_source: p.carrierSource, label: p.label.trim().slice(0, 120), order_id: p.orderId, destination_country: p.destinationCountry })
    .select("id")
    .single();
  if (error) return isDuplicateError(error) ? { duplicate: true } : { error: toUserMessage(fromPostgrestError(error)) };
  return { id: data.id };
}

export interface AddParcelResult {
  id: string;
  /** message de confirmation (suivi récupéré, ou raison de son indisponibilité) */
  message: string;
}

/** Ajout d'un colis puis première interrogation de l'API de suivi (si configurée sur le serveur). */
export async function addParcelAction(raw: NewParcelInput): Promise<ActionResult<AddParcelResult>> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = newParcelSchema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Saisie invalide.");
    const v = validateTrackingNumber(parsed.data.trackingNumber);
    if (!v.ok) return fail(TRACKING_NUMBER_ERROR_LABEL[v.error]);
    if (parsed.data.orderId && !(await assertOrder(ctx, parsed.data.orderId))) return fail("Commande introuvable dans cette organisation.");
    const inserted = await insertParcel(ctx, { ...parsed.data, trackingNumber: canonicalTrackingNumber(v.number) });
    if ("duplicate" in inserted) return fail(DUPLICATE_PARCEL);
    if ("error" in inserted) return fail(inserted.error);
    let message = "Colis ajouté.";
    try {
      const r = await refreshViaEdge(ctx, inserted.id);
      message = r.checked ? "Colis ajouté et suivi récupéré." : (r.message ?? "Colis ajouté.");
    } catch (e) {
      message = `Colis ajouté ; suivi indisponible : ${toUserMessage(e)}`;
    }
    revalidateTracking(inserted.id);
    return ok({ id: inserted.id, message });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export interface BatchResult {
  added: number;
  duplicates: number;
  /** numéros non ajoutés (gardés dans la liste) */
  failed: string[];
  summary: string;
}

/** Ajout en série : chaque numéro est ajouté puis suivi ; les doublons sont signalés, pas bloquants. */
export async function addParcelsBatchAction(items: { number: string; carrier: CarrierCode | null }[]): Promise<ActionResult<BatchResult>> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    if (!Array.isArray(items) || items.length === 0) return fail("Aucun numéro à suivre.");
    if (items.length > 100) return fail("100 numéros au maximum par envoi.");
    let added = 0;
    let duplicates = 0;
    const failed: string[] = [];
    for (const it of items) {
      const v = validateTrackingNumber(String(it?.number ?? ""));
      const carrier = carrierSchema.nullable().safeParse(it?.carrier ?? null);
      if (!v.ok || !carrier.success) {
        failed.push(String(it?.number ?? ""));
        continue;
      }
      const r = await insertParcel(ctx, { trackingNumber: canonicalTrackingNumber(v.number), carrierCode: carrier.data, carrierSource: "auto", label: "", orderId: null, destinationCountry: null });
      if ("duplicate" in r) duplicates++;
      else if ("error" in r) failed.push(v.number);
      else {
        added++;
        try {
          await refreshViaEdge(ctx, r.id);
        } catch {
          // Le colis est ajouté ; il sera suivi à la prochaine actualisation planifiée.
        }
      }
    }
    revalidateTracking();
    return ok({ added, duplicates, failed, summary: batchSummary(added, duplicates, failed.length) });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

/** Interroge l'API de suivi maintenant (serveur MON STOCK). */
export async function refreshParcelAction(id: string): Promise<ActionResult<TrackingRefreshDTO>> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    if (!uuid.safeParse(id).success) return fail("Colis introuvable.");
    const r = await refreshViaEdge(ctx, id);
    revalidateTracking(id);
    return ok(r);
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

const patchSchema = z.object({
  label: z.string().max(200).optional(),
  carrierCode: carrierSchema.nullable().optional(),
  orderId: uuid.nullable().optional(),
  archived: z.boolean().optional(),
});

/** Nom, transporteur (puis nouvelle interrogation), commande associée, archivage. */
export async function updateParcelAction(id: string, patch: ParcelPatch): Promise<ActionResult<{ message: string | null }>> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    if (!uuid.safeParse(id).success) return fail("Colis introuvable.");
    const parsed = patchSchema.safeParse(patch);
    if (!parsed.success) return fail("Modification invalide.");
    if (parsed.data.orderId && !(await assertOrder(ctx, parsed.data.orderId))) return fail("Commande introuvable dans cette organisation.");
    const row = parcelUpdateRow(parsed.data, new Date());
    if (Object.keys(row).length === 0) return ok({ message: null });
    const { error } = await ctx.supabase.from("tracked_parcels").update(row).eq("organization_id", ctx.organization.id).eq("id", id);
    if (error) return fail(toUserMessage(fromPostgrestError(error)));
    let message: string | null = null;
    if (parsed.data.carrierCode !== undefined) {
      try {
        const r = await refreshViaEdge(ctx, id);
        message = r.checked ? "Transporteur modifié, suivi actualisé." : (r.message ?? "Transporteur modifié.");
      } catch (e) {
        message = `Transporteur modifié ; suivi indisponible : ${toUserMessage(e)}`;
      }
    }
    revalidateTracking(id);
    return ok({ message });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function deleteParcelAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    if (!uuid.safeParse(id).success) return fail("Colis introuvable.");
    const { error } = await ctx.supabase.from("tracked_parcels").delete().eq("organization_id", ctx.organization.id).eq("id", id);
    if (error) return fail(toUserMessage(fromPostgrestError(error)));
    revalidateTracking();
    return ok(undefined);
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

/** Commandes récentes pour l'association facultative (numéro et acheteur uniquement). */
export async function searchOrdersForLinkAction(q: string): Promise<ActionResult<{ id: string; label: string }[]>> {
  try {
    const ctx = await requireOrgContextForAction();
    let query = ctx.supabase.from("orders").select("id, order_number, external_order_id, buyer_username, placed_at").eq("organization_id", ctx.organization.id);
    const search = String(q ?? "").trim() ? orIlikeAny(["order_number", "external_order_id", "buyer_username"], String(q).slice(0, 80)) : null;
    if (search) query = query.or(search);
    const { data, error } = await query.order("placed_at", { ascending: false }).limit(15);
    if (error) return fail(toUserMessage(fromPostgrestError(error)));
    return ok((data ?? []).map((o) => ({ id: o.id, label: orderLinkLabel(o) })));
  } catch (e) {
    return fail(toUserMessage(e));
  }
}
