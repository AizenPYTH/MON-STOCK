import "server-only";
import { loadRecentPriceHistory } from "@/services/sourcing/price-history-query";
import { z } from "zod";
import { createAdminSupabaseClient, type AdminSupabaseClient } from "@/lib/supabase/admin";
import { createLogger } from "@/lib/logger";
import type { Json } from "@/db/database.types";
import { parseQuery, type ParsedQuery } from "@/domain/sourcing/query-parser";
import { detectOpportunities, type OpportunityKind } from "@/domain/sourcing/opportunities";
import { findOffers, type OfferFilters } from "@/services/sourcing/offer-query";
import { finishSyncRun, startSyncRun } from "@/services/sourcing/sync-runs";

/**
 * SourcingAlertService — évalue les alertes actives contre les offres courantes et crée
 * des événements (uniques par alerte / offre / type). Messages explicites, jamais inventés.
 */
const log = createLogger("SOURCING_ALERTS");

export const alertCriteriaSchema = z.object({
  max_price: z.number().positive().optional(),
  min_quantity: z.number().int().min(0).optional(),
  countries: z.array(z.string().length(2)).optional(),
  max_moq: z.number().int().min(1).optional(),
  grades: z.array(z.string().max(5)).optional(),
  condition: z.enum(["new", "refurbished", "used"]).optional(),
  max_delivery_days: z.number().int().min(0).optional(),
  supplier_id: z.string().uuid().optional(),
});
export type AlertCriteria = z.infer<typeof alertCriteriaSchema>;

export function criteriaToFilters(c: AlertCriteria): OfferFilters {
  return { maxPrice: c.max_price, minQuantity: c.min_quantity, countries: c.countries, maxMoq: c.max_moq, grades: c.grades, condition: c.condition, maxDeliveryDays: c.max_delivery_days, supplierId: c.supplier_id };
}

function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

type EventKind = "price_below_threshold" | "price_drop" | "new_stock" | "low_stock" | "new_offer";

const OPPORTUNITY_TO_EVENT: Partial<Record<OpportunityKind, EventKind>> = { price_drop: "price_drop", new_stock: "new_stock", low_stock: "low_stock" };

export interface AlertEvaluation {
  alertId: string;
  matched: number;
  created: number;
}

export async function evaluateAlert(admin: AdminSupabaseClient, alert: { id: string; organization_id: string; query_text: string; parsed: Json; criteria: Json; sku_id: string | null; created_at: string; last_checked_at: string | null }, orgCurrency: string, now: Date): Promise<AlertEvaluation> {
  const criteria = alertCriteriaSchema.safeParse(alert.criteria ?? {});
  const c: AlertCriteria = criteria.success ? criteria.data : {};
  const parsed: ParsedQuery = parseQuery(alert.query_text);
  const { offers } = await findOffers(admin, alert.organization_id, parsed, criteriaToFilters(c), { includeSkuId: alert.sku_id });
  const events: Array<{ offer_id: string; kind: EventKind; message: string }> = [];
  const since = alert.last_checked_at ?? alert.created_at;

  const considered = offers.slice(0, 200);
  const offerIds = considered.map((o) => o.id);
  const historySince = new Date(now.getTime() - 60 * 86_400_000).toISOString();
  // Historiques lus offre par offre, du plus récent au plus ancien : une requête groupée plafonnée
  // (PostgREST renvoie au plus 1 000 lignes) privait les offres à historique clairsemé de leurs relevés.
  const priceHistoryResult = offerIds.length ? await loadRecentPriceHistory(admin, alert.organization_id, offerIds, historySince, { perOffer: 60 }) : { rows: [], failedOfferIds: [], cappedOfferIds: [] };
  const priceByOffer = new Map<string, Array<{ price: number; recordedAt: string }>>();
  for (const p of priceHistoryResult.rows) {
    const list = priceByOffer.get(p.offer_id) ?? [];
    list.push({ price: Number(p.original_price), recordedAt: p.recorded_at });
    priceByOffer.set(p.offer_id, list);
  }
  for (const list of priceByOffer.values()) list.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  type StockPoint = { availableQuantity: number | null; stockStatus: (typeof considered)[number]["stock_status"]; recordedAt: string };
  const stockByOffer = new Map<string, StockPoint[]>();
  let nextStock = 0;
  const stockWorker = async () => {
    while (nextStock < offerIds.length) {
      const offerId = offerIds[nextStock++]!;
      const { data } = await admin
        .from("supplier_stock_history")
        .select("available_quantity, stock_status, recorded_at")
        .eq("organization_id", alert.organization_id)
        .eq("offer_id", offerId)
        .gte("recorded_at", historySince)
        .order("recorded_at", { ascending: false })
        .limit(2);
      stockByOffer.set(offerId, (data ?? []).map((st) => ({ availableQuantity: st.available_quantity, stockStatus: st.stock_status, recordedAt: st.recorded_at })));
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, offerIds.length) }, stockWorker));

  for (const o of considered) {
    const price = o.normalized_price ?? (o.original_currency.toUpperCase() === orgCurrency.toUpperCase() ? Number(o.original_price) : null);
    if (c.max_price !== undefined && price !== null && price <= c.max_price) {
      events.push({ offer_id: o.id, kind: "price_below_threshold", message: `Prix inférieur à votre seuil de ${money(c.max_price, orgCurrency)} : ${money(price, orgCurrency)} chez ${o.supplier?.name ?? "un fournisseur"}` });
    } else if (new Date(o.first_seen_at).getTime() >= new Date(since).getTime()) {
      events.push({ offer_id: o.id, kind: "new_offer", message: `Nouvelle offre correspondant à votre alerte${price !== null ? ` : ${money(price, orgCurrency)}` : ""} chez ${o.supplier?.name ?? "un fournisseur"}` });
    }
    const priceHistory = priceByOffer.get(o.id) ?? [];
    // Le dernier point d'historique stock est l'état courant : l'état précédent est le suivant.
    const stockHistory = (stockByOffer.get(o.id) ?? []).slice(1);
    const ops = detectOpportunities({ price: Number(o.original_price), currency: o.original_currency, availableQuantity: o.available_quantity, stockStatus: o.stock_status }, priceHistory, stockHistory, now);
    for (const op of ops) {
      const kind = OPPORTUNITY_TO_EVENT[op.kind];
      if (kind) events.push({ offer_id: o.id, kind, message: `${op.message} (${o.supplier?.name ?? "fournisseur"})` });
    }
  }

  let created = 0;
  if (events.length > 0) {
    const { data } = await admin
      .from("sourcing_alert_events")
      .upsert(
        events.map((e) => ({ organization_id: alert.organization_id, alert_id: alert.id, offer_id: e.offer_id, kind: e.kind, message: e.message, triggered_at: now.toISOString() })),
        { onConflict: "alert_id,offer_id,kind", ignoreDuplicates: true },
      )
      .select("id");
    created = data?.length ?? 0;
  }
  await admin.from("sourcing_alerts").update({ last_checked_at: now.toISOString(), ...(created > 0 ? { last_triggered_at: now.toISOString() } : {}) }).eq("id", alert.id);
  return { alertId: alert.id, matched: offers.length, created };
}

export interface AlertsRunSummary {
  organizations: number;
  alerts: number;
  events: number;
}

export async function evaluateSourcingAlerts(now: Date = new Date(), admin: AdminSupabaseClient = createAdminSupabaseClient(), organizationId?: string): Promise<AlertsRunSummary> {
  let q = admin.from("sourcing_alerts").select("id, organization_id, query_text, parsed, criteria, sku_id, created_at, last_checked_at, organization:organizations(default_currency)").eq("is_active", true).limit(1000);
  if (organizationId) q = q.eq("organization_id", organizationId);
  const { data: alerts, error: alertsError } = await q;
  if (alertsError) throw new Error(`Impossible de charger les alertes de sourcing : ${alertsError.message}`);
  const byOrg = new Map<string, NonNullable<typeof alerts>>();
  for (const a of alerts ?? []) byOrg.set(a.organization_id, [...(byOrg.get(a.organization_id) ?? []), a]);
  let totalEvents = 0;
  let totalAlerts = 0;
  for (const [orgId, list] of byOrg) {
    const run = await startSyncRun(admin, { organizationId: orgId, sourceKind: "sourcing_alerts", provider: "sourcing_alerts", trigger: organizationId ? "manual" : "scheduled" });
    let events = 0;
    let errors = 0;
    for (const a of list) {
      try {
        const r = await evaluateAlert(admin, a, a.organization?.default_currency ?? "EUR", now);
        events += r.created;
        totalAlerts++;
      } catch (e) {
        errors++;
        log.warn("alert evaluation failed", { alertId: a.id, error: e instanceof Error ? e.message : String(e) });
      }
    }
    totalEvents += events;
    await finishSyncRun(admin, run, { status: errors === 0 ? "success" : errors === list.length ? "failed" : "partial", recordsProcessed: list.length, errorCount: errors, stats: { events } });
  }
  return { organizations: byOrg.size, alerts: totalAlerts, events: totalEvents };
}
