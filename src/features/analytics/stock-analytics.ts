import "server-only";
import { cache } from "react";
import type { OrgContext } from "@/features/auth/dal";
import type { StockOverviewRow } from "@/db/types";
import { fromPostgrestError } from "@/lib/errors";
import { enrichStockRow, type MarginContext, type StockRowView } from "@/features/stock/model";
import { getMarginContext } from "@/features/stock/queries";
import { groupStockViews, type StockAnalytics } from "@/features/analytics/stock.pure";

/** Borne de chargement : au-delà, les compteurs sont signalés comme des minima (truncated). */
export const STOCK_VIEWS_MAX = 5000;
const PAGE = 1000;

export interface StockViewsBundle {
  views: StockRowView[];
  marginCtx: MarginContext;
  truncated: boolean;
  now: Date;
}

/**
 * Charge toutes les lignes actives de v_stock_overview (par pages de 1000, bornées) et les enrichit
 * avec les services du domaine. Mémoïsé par requête : dashboard, alertes et insights partagent le même chargement.
 */
export const loadStockViews = cache(async (ctx: OrgContext): Promise<StockViewsBundle> => {
  const orgId = ctx.organization.id;
  const marginCtx = await getMarginContext(ctx);
  const rows: StockOverviewRow[] = [];
  let from = 0;
  let truncated = false;
  for (;;) {
    const { data, error } = await ctx.supabase
      .from("v_stock_overview")
      .select("*")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("sku_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw fromPostgrestError(error);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
    if (from >= STOCK_VIEWS_MAX) {
      truncated = true;
      break;
    }
  }
  const now = new Date();
  return { views: rows.map((r) => enrichStockRow(r, marginCtx, now)), marginCtx, truncated, now };
});

export const getStockAnalytics = cache(async (ctx: OrgContext): Promise<StockAnalytics> => {
  const bundle = await loadStockViews(ctx);
  return groupStockViews(bundle.views, bundle.now, { truncated: bundle.truncated, currency: ctx.organization.default_currency });
});
