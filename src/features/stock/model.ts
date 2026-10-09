import type { SalesChannel, StockOverviewRow } from "@/db/types";
import { computeDaysOfCover, computeVelocity, type VelocityResult } from "@/domain/inventory/velocity";
import { classifyStock, type StockClassification } from "@/domain/inventory/alerts";
import { computeMargin, type MarginResult } from "@/domain/pricing/margin";

/** Ligne de stock enrichie par les services du domaine (vitesse, couverture, statut, marge). */
export interface StockRowView {
  row: StockOverviewRow;
  velocity: VelocityResult;
  daysOfCover: number | null;
  classification: StockClassification;
  margin: MarginResult;
}

export interface MarginContext {
  feePercent: number | null;
  paymentFeePercent: number | null;
  paymentFeeFixed: number | null;
  shippingCost: number | null;
}

export function enrichStockRow(row: StockOverviewRow, marginCtx: MarginContext, now: Date = new Date()): StockRowView {
  const velocity = computeVelocity(
    {
      units7d: row.units_7d ?? 0,
      units30d: row.units_30d ?? 0,
      units90d: row.units_90d ?? 0,
      unitsPrev7d: row.units_prev_7d ?? 0,
      unitsPrev30d: row.units_prev_30d ?? 0,
      firstSaleAt: row.first_sale_at ? new Date(row.first_sale_at) : null,
      lastSaleAt: row.last_sale_at ? new Date(row.last_sale_at) : null,
    },
    { now },
  );
  const available = row.quantity_available ?? 0;
  const daysOfCover = computeDaysOfCover(available, velocity.dailyVelocity);
  const classification = classifyStock({
    available,
    reorderPoint: row.reorder_point ?? 0,
    safetyStock: row.safety_stock ?? 0,
    daysOfCover,
    leadTimeDays: row.lead_time_days ?? null,
  });
  const margin = computeMargin({
    salePrice: row.sale_price ?? null,
    costPrice: row.cost_price ?? null,
    feePercent: marginCtx.feePercent,
    paymentFeePercent: marginCtx.paymentFeePercent,
    paymentFeeFixed: marginCtx.paymentFeeFixed,
    shippingCost: marginCtx.shippingCost,
  });
  return { row, velocity, daysOfCover, classification, margin };
}

export function skuLabel(row: Pick<StockOverviewRow, "product_name" | "variant_name">): string {
  const v = row.variant_name && row.variant_name !== "Standard" ? ` · ${row.variant_name}` : "";
  return `${row.product_name ?? ""}${v}`;
}

/** Contexte de marge « par défaut » de l'organisation : canal principal (eBay si connecté, sinon manuel). */
export function marginContextFromChannels(channels: Pick<SalesChannel, "provider" | "fee_percent" | "payment_fee_percent" | "payment_fee_fixed" | "default_shipping_cost">[], orgSettings: unknown): MarginContext {
  const settings = (orgSettings ?? {}) as { default_shipping_cost?: number | null };
  const primary = channels.find((c) => c.provider === "ebay") ?? channels.find((c) => c.provider !== "manual") ?? channels[0];
  return {
    feePercent: primary?.fee_percent ?? null,
    paymentFeePercent: primary?.payment_fee_percent ?? null,
    paymentFeeFixed: primary?.payment_fee_fixed ?? null,
    shippingCost: primary?.default_shipping_cost ?? settings.default_shipping_cost ?? null,
  };
}
