import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import type { DailySalesRow } from "@/db/types";
import { dayKey, shiftDayKey } from "@/features/analytics/series.pure";
import { loadStockViews } from "@/features/analytics/stock-analytics";
import { fromPostgrestError } from "@/lib/errors";
import { analysisSpanDays, computeAnalysis, pickTopAlert, type AnalysisData, type AnalysisPeriod } from "@/features/analysis/analysis.pure";

/**
 * Analyse web : mêmes lectures que l'application iPhone, sous RLS avec la session de
 * l'utilisateur — v_daily_sales (CA et commandes par jour civil de Paris), v_stock_overview
 * (unités vendues 7/30/90 j, stock, coûts ; enrichie par le domaine partagé) et alerts (ouvertes).
 */

export interface AnalysisPageData extends AnalysisData {
  topAlert: { id: string; title: string; message: string | null; severity: string } | null;
  /** plus de 5 000 SKU actifs : seuls les premiers sont analysés */
  truncated: boolean;
  skuCount: number;
  generatedAt: string;
}

export async function getAnalysis(ctx: OrgContext, period: AnalysisPeriod, now: Date = new Date()): Promise<AnalysisPageData> {
  const orgId = ctx.organization.id;
  const from = shiftDayKey(dayKey(now), -(analysisSpanDays(period) - 1));
  const [bundle, daily, alerts] = await Promise.all([
    loadStockViews(ctx),
    ctx.supabase.from("v_daily_sales").select("*").eq("organization_id", orgId).gte("day", from).order("day", { ascending: true }),
    ctx.supabase.from("alerts").select("id, title, message, severity, created_at").eq("organization_id", orgId).eq("status", "open").order("created_at", { ascending: false }).limit(50),
  ]);
  if (daily.error) throw fromPostgrestError(daily.error);
  const data = computeAnalysis({ rows: (daily.data ?? []) as DailySalesRow[], views: bundle.views, currency: ctx.organization.default_currency, period, now, topLimit: 10 });
  const top = alerts.error ? null : pickTopAlert(alerts.data ?? []);
  return {
    ...data,
    topAlert: top ? { id: top.id, title: top.title, message: top.message, severity: top.severity } : null,
    truncated: bundle.truncated,
    skuCount: bundle.views.length,
    generatedAt: now.toISOString(),
  };
}
