import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import type { SalesChannel } from "@/db/types";
import type { UnknownCost } from "@/domain/pricing/margin";
import { fromPostgrestError } from "@/lib/errors";
import type { MarginContext } from "@/features/stock/model";
import { loadStockViews } from "@/features/analytics/stock-analytics";
import { aggregateMargins, buildMarginLine, channelMarginContext, missingChannelFees, sortMarginLines, type MarginAggregate, type MarginLine } from "@/features/analytics/margins.pure";
import type { MarginsParams } from "@/features/analytics/schemas";

export const MARGINS_PAGE_SIZE = 50;

export interface ChannelFeeSummary {
  channel: SalesChannel;
  ctx: MarginContext;
  missing: UnknownCost[];
}

export interface MarginsData {
  channels: ChannelFeeSummary[];
  selectedChannel: SalesChannel | null;
  marginCtx: MarginContext;
  missingFees: UnknownCost[];
  lines: MarginLine[];
  total: number;
  page: number;
  pageSize: number;
  aggregate: MarginAggregate;
  truncated: boolean;
}

export async function getMarginsData(ctx: OrgContext, params: MarginsParams): Promise<MarginsData> {
  const [bundle, chRes] = await Promise.all([
    loadStockViews(ctx),
    ctx.supabase.from("sales_channels").select("*").eq("organization_id", ctx.organization.id).eq("is_active", true).order("created_at", { ascending: true }),
  ]);
  if (chRes.error) throw fromPostgrestError(chRes.error);
  const channels = chRes.data ?? [];
  const selected =
    (params.channel ? channels.find((c) => c.id === params.channel) : undefined) ??
    channels.find((c) => c.provider === "ebay") ??
    channels.find((c) => c.provider !== "manual") ??
    channels[0] ??
    null;
  const marginCtx = channelMarginContext(selected, ctx.organization.settings);

  let lines = bundle.views.map((v) => buildMarginLine(v.row, marginCtx));
  if (params.unknown) lines = lines.filter((l) => l.costPrice === null);
  if (params.min_margin !== undefined && Number.isFinite(params.min_margin)) {
    const min = params.min_margin;
    lines = lines.filter((l) => l.margin.netMarginPercent !== null && l.margin.netMarginPercent >= min);
  }
  const sorted = sortMarginLines(lines, params.sort);
  const aggregate = aggregateMargins(sorted);
  const from = (params.page - 1) * MARGINS_PAGE_SIZE;
  return {
    channels: channels.map((c) => {
      const cctx = channelMarginContext(c, ctx.organization.settings);
      return { channel: c, ctx: cctx, missing: missingChannelFees(cctx) };
    }),
    selectedChannel: selected,
    marginCtx,
    missingFees: missingChannelFees(marginCtx),
    lines: sorted.slice(from, from + MARGINS_PAGE_SIZE),
    total: sorted.length,
    page: params.page,
    pageSize: MARGINS_PAGE_SIZE,
    aggregate,
    truncated: bundle.truncated,
  };
}

/** Bénéfice estimé sur 30 jours avec le contexte de marge principal (dashboard). */
export async function getProfitEstimate(ctx: OrgContext): Promise<MarginAggregate> {
  const bundle = await loadStockViews(ctx);
  return aggregateMargins(bundle.views.map((v) => buildMarginLine(v.row, bundle.marginCtx)));
}
