import "server-only";
import { cache } from "react";
import type { OrgContext } from "@/features/auth/dal";
import type { StockOverviewRow } from "@/db/types";
import { fromPostgrestError } from "@/lib/errors";
import { fetchRowsUpTo } from "@/lib/supabase/paginate";
import { enrichStockRow, type MarginContext, type StockRowView } from "@/features/stock/model";
import { getMarginContext } from "@/features/stock/queries";
import { groupStockViews, type StockAnalytics } from "@/features/analytics/stock.pure";

/** Borne de chargement : au-delà, les compteurs sont signalés comme des minima (truncated). */
export const STOCK_VIEWS_MAX = 5000;

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
  let loaded: { rows: StockOverviewRow[]; truncated: boolean };
  try {
    loaded = await fetchRowsUpTo<StockOverviewRow>(
      (from, to) => ctx.supabase.from("v_stock_overview").select("*").eq("organization_id", orgId).eq("is_active", true).order("sku_id", { ascending: true }).range(from, to),
      STOCK_VIEWS_MAX,
    );
  } catch (e) {
    throw fromPostgrestError(e as Parameters<typeof fromPostgrestError>[0]);
  }
  const { rows, truncated } = loaded;
  const now = new Date();
  return { views: rows.map((r) => enrichStockRow(r, marginCtx, now)), marginCtx, truncated, now };
});

export const getStockAnalytics = cache(async (ctx: OrgContext): Promise<StockAnalytics> => {
  const bundle = await loadStockViews(ctx);
  return groupStockViews(bundle.views, bundle.now, { truncated: bundle.truncated, currency: ctx.organization.default_currency });
});
