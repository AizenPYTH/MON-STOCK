import { z } from "zod";
import { RANKING_MODES } from "@/domain/sourcing/scoring";
import type { OfferFilters } from "@/services/sourcing/offer-query";

const optionalText = z.string().trim().max(120).optional();
const optionalMoney = z.union([z.literal(""), z.coerce.number().min(0)]).optional();
const optionalInt = z.union([z.literal(""), z.coerce.number().int().min(0)]).optional();

export const SOURCE_TYPES = ["PUBLIC_WEB", "API", "CSV", "XML", "JSON", "SUPPLIER_ACCOUNT", "MANUAL", "PARTNER_FEED"] as const;

export const sourcingSearchParamsSchema = z.object({
  q: z.string().trim().max(200).optional(),
  sku: z.string().trim().max(64).optional(),
  category: optionalText,
  brand: optionalText,
  model: optionalText,
  storage: optionalText,
  color: optionalText,
  condition: z.enum(["new", "refurbished", "used"]).optional(),
  grade: z.string().trim().max(5).optional(),
  qty: z.coerce.number().int().min(1).optional(),
  max_price: z.coerce.number().positive().optional(),
  country: z.string().trim().max(60).optional(),
  max_delivery: z.coerce.number().int().min(0).optional(),
  max_moq: z.coerce.number().int().min(1).optional(),
  tax: z.enum(["ht", "ttc"]).optional(),
  supplier: z.string().uuid().optional(),
  source: z.enum(SOURCE_TYPES).optional(),
  availability: z.enum(["in_stock", "any"]).optional(),
  sort: z.enum(RANKING_MODES).default("best_offer"),
  page: z.coerce.number().int().min(1).default(1),
  /** live=0 : recherche dans les offres enregistrées uniquement (sans interroger les sources) */
  live: z.enum(["0", "1"]).optional(),
});
export type SourcingSearchParams = z.infer<typeof sourcingSearchParamsSchema>;

export function parseCountries(text: string | undefined): string[] | undefined {
  if (!text) return undefined;
  const list = text
    .split(/[,\s;]+/)
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c));
  return list.length > 0 ? Array.from(new Set(list)) : undefined;
}

export function toOfferFilters(p: SourcingSearchParams): OfferFilters {
  const clean = (s: string | undefined) => (s && s.length > 0 ? s : undefined);
  return {
    category: clean(p.category),
    brand: clean(p.brand),
    model: clean(p.model),
    storage: clean(p.storage),
    color: clean(p.color),
    condition: p.condition,
    grade: clean(p.grade),
    quantity: p.qty,
    maxPrice: p.max_price,
    countries: parseCountries(p.country),
    maxDeliveryDays: p.max_delivery,
    maxMoq: p.max_moq,
    taxType: p.tax,
    supplierId: p.supplier,
    sourceType: p.source,
    availability: p.availability,
    sort: p.sort,
    page: p.page,
  };
}

export const alertFormSchema = z.object({
  alert_id: z.string().uuid().optional().or(z.literal("")),
  name: z.string().trim().min(1, "Le nom de l'alerte est requis.").max(120),
  query_text: z.string().trim().min(1, "Indiquez le produit recherché.").max(200),
  max_price: optionalMoney,
  min_quantity: optionalInt,
  countries: z.string().trim().max(60).optional().or(z.literal("")),
  max_moq: z.union([z.literal(""), z.coerce.number().int().min(1)]).optional(),
  grades: z.string().trim().max(40).optional().or(z.literal("")),
  condition: z.enum(["", "new", "refurbished", "used"]).optional(),
  max_delivery_days: optionalInt,
  sku_id: z.string().uuid().optional().or(z.literal("")),
});

export const matchDecisionSchema = z.object({ match_id: z.string().uuid(), decision: z.enum(["confirm", "reject"]) });
export const linkOfferSchema = z.object({ offer_id: z.string().uuid(), sku_id: z.string().uuid("Choisissez un SKU.") });
export const offerStatusSchema = z.object({ offer_id: z.string().uuid(), status: z.enum(["rejected", "active"]) });

export function fieldErrorsOf(issues: Array<{ path: PropertyKey[]; message: string }>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const i of issues) (out[String(i.path[0] ?? "_")] ??= []).push(i.message);
  return out;
}
