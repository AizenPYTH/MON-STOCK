import { z } from "zod";
import { MARGIN_SORTS } from "@/features/analytics/margins.pure";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ");
const page = z.coerce.number().int().min(1).default(1);

export const ORDER_STATUSES = ["pending", "paid", "shipped", "delivered", "cancelled", "refunded", "unknown"] as const;

export const salesListParamsSchema = z.object({
  q: z.string().trim().max(120).optional(),
  channel: z.string().uuid().optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  inventory: z.enum(["pending"]).optional(),
  page,
});
export type SalesListParams = z.infer<typeof salesListParamsSchema>;

export const marginsParamsSchema = z.object({
  channel: z.string().uuid().optional(),
  unknown: z.enum(["1"]).optional(),
  min_margin: z.coerce.number().optional(),
  sort: z.enum(MARGIN_SORTS).default("profit_total"),
  page,
});
export type MarginsParams = z.infer<typeof marginsParamsSchema>;

export const ALERT_LEVEL_TABS = ["todo", "out_of_stock", "at_risk", "low", "normal"] as const;
export const alertsParamsSchema = z.object({
  level: z.enum(ALERT_LEVEL_TABS).default("todo"),
  page,
});
export type AlertsParams = z.infer<typeof alertsParamsSchema>;

/** Aplatissement des searchParams Next (tableaux → première valeur, vides ignorés). */
export function flattenSearchParams(raw: Record<string, string | string[] | undefined>): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val) flat[k] = val;
  }
  return flat;
}

export function parseParams<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false }; parse: (v: unknown) => T }, flat: Record<string, string>): T {
  const parsed = schema.safeParse(flat);
  return parsed.success ? parsed.data : schema.parse({});
}
