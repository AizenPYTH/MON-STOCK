import type { Json } from "@/db/database.types";
import { parseBands, parseCountryList, type RateBand, type RateCard } from "@/domain/tools/shipping";
import { toFrInput } from "@/features/tools/format";

/**
 * Grilles tarifaires saisies par l'organisation (module pur) : formulaire → saisie validée →
 * ligne `shipping_rate_cards`. Mêmes règles et mêmes messages que l'application iPhone.
 */

export interface RateCardInput {
  carrier: string;
  service: string;
  fromCountries: string[];
  toCountries: string[];
  bands: RateBand[];
  currency: string;
  maxLengthCm: number | null;
  maxDimensionsSumCm: number | null;
  volumetricDivisor: number | null;
  transitDaysMin: number | null;
  transitDaysMax: number | null;
  tracking: boolean | null;
  deliveryMode: string | null;
  notes: string | null;
  verifiedAt: string | null;
}

export function rateCardRow(input: RateCardInput) {
  return {
    carrier: input.carrier.trim().slice(0, 80),
    service: input.service.trim().slice(0, 80),
    from_countries: input.fromCountries,
    to_countries: input.toCountries,
    bands: input.bands as unknown as Json,
    currency: input.currency,
    max_length_cm: input.maxLengthCm,
    max_dimensions_sum_cm: input.maxDimensionsSumCm,
    volumetric_divisor: input.volumetricDivisor,
    transit_days_min: input.transitDaysMin,
    transit_days_max: input.transitDaysMax,
    tracking: input.tracking,
    delivery_mode: input.deliveryMode?.trim().slice(0, 80) || null,
    notes: input.notes?.trim().slice(0, 300) || null,
    verified_at: input.verifiedAt,
  };
}

/** Formulaire (texte saisi) d'une grille. */
export interface RateCardForm {
  carrier: string;
  service: string;
  fromText: string;
  toText: string;
  bands: { maxWeightKg: string; price: string }[];
  currency: string;
  maxLength: string;
  maxSum: string;
  divisor: string;
  dMin: string;
  dMax: string;
  tracking: boolean | null;
  deliveryMode: string;
  notes: string;
  verifiedToday: boolean;
}

export function rateCardFormFrom(card: RateCard | null): RateCardForm {
  return {
    carrier: card?.carrier ?? "",
    service: card?.service ?? "",
    fromText: card ? card.fromCountries.join(", ") : "FR",
    toText: card ? card.toCountries.join(", ") : "FR",
    bands: card?.bands.map((b) => ({ maxWeightKg: toFrInput(b.maxWeightKg), price: b.price.replace(".", ",") })) ?? [{ maxWeightKg: "", price: "" }],
    currency: card?.currency ?? "EUR",
    maxLength: toFrInput(card?.maxLengthCm ?? null),
    maxSum: toFrInput(card?.maxDimensionsSumCm ?? null),
    divisor: card?.volumetricDivisor ? String(card.volumetricDivisor) : "",
    dMin: card?.transitDaysMin === null || card?.transitDaysMin === undefined ? "" : String(card.transitDaysMin),
    dMax: card?.transitDaysMax === null || card?.transitDaysMax === undefined ? "" : String(card.transitDaysMax),
    tracking: card?.tracking ?? null,
    deliveryMode: card?.deliveryMode ?? "",
    notes: card?.notes ?? "",
    verifiedToday: card === null,
  };
}

/**
 * Validation du formulaire (première erreur rencontrée, comme l'application).
 * `previousVerifiedAt` : date de vérification conservée si « Tarifs vérifiés aujourd'hui » n'est pas coché.
 */
export function validateRateCardForm(f: RateCardForm, previousVerifiedAt: string | null, today: string): { ok: true; input: RateCardInput } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  if (!f.carrier.trim()) return fail("Indiquez le transporteur.");
  const from = parseCountryList(f.fromText);
  const to = parseCountryList(f.toText);
  if (from.invalid.length || to.invalid.length) return fail(`Codes pays invalides : ${[...from.invalid, ...to.invalid].join(", ")} (2 lettres, ex. FR, BE).`);
  const b = parseBands(f.bands);
  if (b.errors.length) return fail(b.errors[0]!);
  const read = (s: string, min: number, max: number, label: string): { value: number | null } | { error: string } => {
    if (s.trim() === "") return { value: null };
    const n = Number(s.trim().replace(",", "."));
    if (!Number.isFinite(n) || n < min || n > max) return { error: `${label} : valeur entre ${min} et ${max}.` };
    return { value: n };
  };
  const fields = [read(f.maxLength, 1, 600, "Plus grand côté"), read(f.maxSum, 1, 1000, "Somme des dimensions"), read(f.divisor, 1000, 10000, "Diviseur volumétrique"), read(f.dMin, 0, 90, "Délai minimal"), read(f.dMax, 0, 90, "Délai maximal")];
  const firstError = fields.find((x): x is { error: string } => "error" in x);
  if (firstError) return fail(firstError.error);
  const [ml, ms, dv, mn, mx] = fields.map((x) => ("value" in x ? x.value : null)) as (number | null)[];
  if (typeof mn === "number" && typeof mx === "number" && mn > mx) return fail("Le délai minimal dépasse le délai maximal.");
  const currency = f.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return fail("Devise : code ISO à 3 lettres (ex. EUR).");
  return {
    ok: true,
    input: {
      carrier: f.carrier.trim(),
      service: f.service.trim(),
      fromCountries: from.countries,
      toCountries: to.countries,
      bands: b.bands,
      currency,
      maxLengthCm: ml ?? null,
      maxDimensionsSumCm: ms ?? null,
      volumetricDivisor: dv === null || dv === undefined ? null : Math.round(dv),
      transitDaysMin: mn === null || mn === undefined ? null : Math.round(mn),
      transitDaysMax: mx === null || mx === undefined ? null : Math.round(mx),
      tracking: f.tracking,
      deliveryMode: f.deliveryMode.trim() || null,
      notes: f.notes.trim() || null,
      verifiedAt: f.verifiedToday ? today : previousVerifiedAt,
    },
  };
}

/** Grille existante dont seules les tranches changent (outil « Port » : prix d'un poids). */
export function rateCardInputWithBands(card: RateCard, bands: RateBand[], today: string): RateCardInput {
  return {
    carrier: card.carrier,
    service: card.service,
    fromCountries: card.fromCountries,
    toCountries: card.toCountries,
    bands,
    currency: card.currency,
    maxLengthCm: card.maxLengthCm,
    maxDimensionsSumCm: card.maxDimensionsSumCm,
    volumetricDivisor: card.volumetricDivisor,
    transitDaysMin: card.transitDaysMin,
    transitDaysMax: card.transitDaysMax,
    tracking: card.tracking,
    deliveryMode: card.deliveryMode,
    notes: card.notes,
    verifiedAt: today,
  };
}

/** Première grille d'un transporteur proposé par défaut (France → France), créée depuis l'outil « Port ». */
export function newPortRateCardInput(carrier: string, bands: RateBand[], today: string): RateCardInput {
  return { carrier, service: "", fromCountries: ["FR"], toCountries: ["FR"], bands, currency: "EUR", maxLengthCm: null, maxDimensionsSumCm: null, volumetricDivisor: null, transitDaysMin: null, transitDaysMax: null, tracking: null, deliveryMode: null, notes: null, verifiedAt: today };
}
