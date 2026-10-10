import { cmp, parseDecimal, toPlainDecimal, type Dec } from "./decimal";

/**
 * Comparateur de frais de port (module pur).
 *
 * Deux origines de prix, jamais mélangées sans le dire :
 *   - `api`    : devis renvoyé par une plateforme d'expédition connectée côté serveur (tarif réel
 *                de VOTRE compte au moment de la demande) ;
 *   - `manual` : grille saisie par l'utilisateur (ses tarifs négociés ou publics, à jour selon lui).
 * Aucun tarif de transporteur n'est fourni par MON STOCK : sans API ni grille, aucun prix.
 */

export interface Parcel {
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  fromCountry: string;
  toCountry: string;
  fromPostcode?: string | null;
  toPostcode?: string | null;
}

export interface RateBand {
  /** poids maximal facturable de la tranche (kg) */
  maxWeightKg: number;
  /** prix de la tranche (texte décimal exact, ex. « 7,35 ») */
  price: string;
}

/** Grille tarifaire saisie par l'utilisateur. */
export interface RateCard {
  id: string;
  carrier: string;
  service: string;
  /** pays d'origine acceptés (ISO2) ; vide = tous */
  fromCountries: string[];
  /** pays de destination couverts (ISO2) ; vide = tous */
  toCountries: string[];
  bands: RateBand[];
  currency: string;
  /** dimension la plus longue autorisée (cm) */
  maxLengthCm: number | null;
  /** somme longueur + largeur + hauteur maximale (cm) */
  maxDimensionsSumCm: number | null;
  /** diviseur du poids volumétrique (ex. 5000 : L×l×h cm ÷ 5000 = kg) ; null = poids réel seul */
  volumetricDivisor: number | null;
  transitDaysMin: number | null;
  transitDaysMax: number | null;
  tracking: boolean | null;
  /** remise en point relais, dépôt bureau, enlèvement… (texte libre) */
  deliveryMode: string | null;
  notes: string | null;
  /** date à laquelle l'utilisateur a vérifié la grille */
  verifiedAt: string | null;
}

export interface ShippingOption {
  key: string;
  origin: "api" | "manual";
  /** compte / plateforme ayant fourni le devis (api) */
  provider: string | null;
  carrier: string;
  service: string;
  price: Dec;
  currency: string;
  /** prix TTC / HT si connu */
  priceTax: "incl" | "excl" | "unknown";
  transitDaysMin: number | null;
  transitDaysMax: number | null;
  tracking: boolean | null;
  deliveryMode: string | null;
  restrictions: string[];
  billableWeightKg: number;
  quotedAt: string | null;
}

export interface Exclusion {
  key: string;
  carrier: string;
  service: string;
  reason: string;
}

export type ParcelError = Partial<Record<"weightKg" | "lengthCm" | "widthCm" | "heightCm" | "fromCountry" | "toCountry", string>>;

const num = (text: string) => {
  const r = parseDecimal(text);
  return r.ok ? Number(r.value.n) / Number(r.value.d) : null;
};

/** Saisie → colis (poids et dimensions > 0, pays ISO2). */
export function parseParcel(input: { weightKg: string; lengthCm: string; widthCm: string; heightCm: string; fromCountry: string; toCountry: string; fromPostcode?: string; toPostcode?: string }): { parcel: Parcel | null; errors: ParcelError } {
  const errors: ParcelError = {};
  const read = (k: "weightKg" | "lengthCm" | "widthCm" | "heightCm", max: number) => {
    const v = num(input[k]);
    if (input[k].trim() === "") errors[k] = "Champ requis.";
    else if (v === null || v <= 0) errors[k] = "Valeur positive requise.";
    else if (v > max) errors[k] = `Maximum ${max}.`;
    return v ?? 0;
  };
  const weightKg = read("weightKg", 1000);
  const lengthCm = read("lengthCm", 600);
  const widthCm = read("widthCm", 600);
  const heightCm = read("heightCm", 600);
  const iso = (v: string) => v.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso(input.fromCountry))) errors.fromCountry = "Code pays à 2 lettres (ex. FR).";
  if (!/^[A-Z]{2}$/.test(iso(input.toCountry))) errors.toCountry = "Code pays à 2 lettres (ex. DE).";
  if (Object.keys(errors).length > 0) return { parcel: null, errors };
  return {
    parcel: { weightKg, lengthCm, widthCm, heightCm, fromCountry: iso(input.fromCountry), toCountry: iso(input.toCountry), fromPostcode: input.fromPostcode?.trim() || null, toPostcode: input.toPostcode?.trim() || null },
    errors,
  };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function billableWeight(parcel: Parcel, divisor: number | null): number {
  if (!divisor || divisor <= 0) return parcel.weightKg;
  return round3(Math.max(parcel.weightKg, (parcel.lengthCm * parcel.widthCm * parcel.heightCm) / divisor));
}

/** Prix d'une grille pour ce colis, ou raison d'exclusion. */
export function quoteFromCard(card: RateCard, parcel: Parcel): { option: ShippingOption } | { exclusion: Exclusion } {
  const base = { key: `manual:${card.id}`, carrier: card.carrier, service: card.service };
  const exclude = (reason: string) => ({ exclusion: { ...base, reason } });
  if (card.fromCountries.length > 0 && !card.fromCountries.includes(parcel.fromCountry)) return exclude(`Départ ${parcel.fromCountry} non couvert par cette grille.`);
  if (card.toCountries.length > 0 && !card.toCountries.includes(parcel.toCountry)) return exclude(`Destination ${parcel.toCountry} non couverte par cette grille.`);
  const longest = Math.max(parcel.lengthCm, parcel.widthCm, parcel.heightCm);
  if (card.maxLengthCm !== null && longest > card.maxLengthCm) return exclude(`Plus grand côté ${longest} cm > ${card.maxLengthCm} cm autorisés.`);
  const dimSum = parcel.lengthCm + parcel.widthCm + parcel.heightCm;
  if (card.maxDimensionsSumCm !== null && dimSum > card.maxDimensionsSumCm) return exclude(`L + l + h = ${dimSum} cm > ${card.maxDimensionsSumCm} cm autorisés.`);
  const weight = billableWeight(parcel, card.volumetricDivisor);
  const bands = [...card.bands].sort((a, b) => a.maxWeightKg - b.maxWeightKg);
  const band = bands.find((b) => weight <= b.maxWeightKg + 1e-9);
  if (!band) return exclude(`Poids facturable ${weight} kg au-delà de la dernière tranche (${bands[bands.length - 1]?.maxWeightKg ?? 0} kg).`);
  const price = parseDecimal(band.price);
  if (!price.ok) return exclude("Prix de la tranche illisible : corrigez la grille.");
  const restrictions: string[] = [];
  if (weight > parcel.weightKg) restrictions.push(`Poids volumétrique appliqué : ${weight} kg (÷ ${card.volumetricDivisor}).`);
  if (card.notes) restrictions.push(card.notes);
  return {
    option: {
      ...base,
      origin: "manual",
      provider: null,
      price: price.value,
      currency: card.currency,
      priceTax: "unknown",
      transitDaysMin: card.transitDaysMin,
      transitDaysMax: card.transitDaysMax,
      tracking: card.tracking,
      deliveryMode: card.deliveryMode,
      restrictions,
      billableWeightKg: weight,
      quotedAt: card.verifiedAt,
    },
  };
}

export type ShippingSort = "price" | "speed";

/** Tri : prix (puis délai) ou rapidité (délai maximal connu, puis prix). Délai inconnu en dernier. */
export function sortOptions(options: ShippingOption[], sort: ShippingSort): ShippingOption[] {
  const speed = (o: ShippingOption) => o.transitDaysMax ?? o.transitDaysMin ?? Number.POSITIVE_INFINITY;
  return [...options].sort((a, b) => {
    // devises différentes : pas de comparaison de prix implicite (ordre par devise)
    if (a.currency !== b.currency && sort === "price") return a.currency.localeCompare(b.currency);
    const byPrice = cmp(a.price, b.price);
    const bySpeed = speed(a) - speed(b);
    if (sort === "price") return byPrice !== 0 ? byPrice : bySpeed;
    return bySpeed !== 0 ? bySpeed : byPrice;
  });
}

export function compareManualCards(cards: RateCard[], parcel: Parcel, sort: ShippingSort = "price"): { options: ShippingOption[]; excluded: Exclusion[] } {
  const options: ShippingOption[] = [];
  const excluded: Exclusion[] = [];
  for (const c of cards) {
    const q = quoteFromCard(c, parcel);
    if ("option" in q) options.push(q.option);
    else excluded.push(q.exclusion);
  }
  return { options: sortOptions(options, sort), excluded };
}

/** Badges « moins cher » / « plus rapide » parmi des options comparables (même devise). */
export function highlights(options: ShippingOption[]): { cheapest: string | null; fastest: string | null } {
  if (options.length === 0) return { cheapest: null, fastest: null };
  const currencies = new Set(options.map((o) => o.currency));
  const cheapest = currencies.size === 1 ? sortOptions(options, "price")[0]!.key : null;
  const withSpeed = options.filter((o) => o.transitDaysMax !== null || o.transitDaysMin !== null);
  const fastest = withSpeed.length > 0 ? sortOptions(withSpeed, "speed")[0]!.key : null;
  return { cheapest, fastest };
}

/** Devis d'API (texte décimal exact) → option comparable ; null si aucun prix exploitable. */
export function optionFromQuote(q: {
  key: string;
  providerLabel: string;
  carrier: string;
  service: string;
  priceInclVat: string | null;
  priceExclVat: string | null;
  currency: string;
  transitDaysMin: number | null;
  transitDaysMax: number | null;
  tracking: boolean | null;
  dropOff: boolean | null;
  deliveryToPickupPoint: boolean | null;
  restrictions: string[];
  quotedAt: string;
  estimatedDelivery: string | null;
}, parcel: Parcel): ShippingOption | null {
  const incl = q.priceInclVat ? parseDecimal(q.priceInclVat) : null;
  const excl = q.priceExclVat ? parseDecimal(q.priceExclVat) : null;
  const price = incl?.ok ? incl.value : excl?.ok ? excl.value : null;
  if (!price) return null;
  const modes: string[] = [];
  if (q.dropOff === true) modes.push("dépôt en point relais / bureau");
  if (q.dropOff === false) modes.push("enlèvement");
  if (q.deliveryToPickupPoint === true) modes.push("livraison en point relais");
  if (q.deliveryToPickupPoint === false) modes.push("livraison à domicile");
  const restrictions = [...q.restrictions];
  if (q.estimatedDelivery) restrictions.unshift(`Livraison estimée par la plateforme : ${q.estimatedDelivery.split("-").reverse().join("/")}.`);
  return {
    key: q.key,
    origin: "api",
    provider: q.providerLabel,
    carrier: q.carrier,
    service: q.service,
    price,
    currency: q.currency,
    priceTax: incl?.ok ? "incl" : "excl",
    transitDaysMin: q.transitDaysMin,
    transitDaysMax: q.transitDaysMax,
    tracking: q.tracking,
    deliveryMode: modes.length ? modes.join(", ") : null,
    restrictions,
    billableWeightKg: parcel.weightKg,
    quotedAt: q.quotedAt,
  };
}

/** Ligne `shipping_rate_cards` → grille (tranches invalides ignorées). */
export function rateCardFromRow(row: {
  id: string;
  carrier: string;
  service: string;
  from_countries: string[];
  to_countries: string[];
  bands: unknown;
  currency: string;
  max_length_cm: number | null;
  max_dimensions_sum_cm: number | null;
  volumetric_divisor: number | null;
  transit_days_min: number | null;
  transit_days_max: number | null;
  tracking: boolean | null;
  delivery_mode: string | null;
  notes: string | null;
  verified_at: string | null;
}): RateCard {
  const bands = (Array.isArray(row.bands) ? row.bands : [])
    .map((b) => b as { maxWeightKg?: unknown; price?: unknown })
    .filter((b): b is { maxWeightKg: number; price: string } => typeof b.maxWeightKg === "number" && b.maxWeightKg > 0 && typeof b.price === "string" && parseDecimal(b.price).ok);
  return {
    id: row.id,
    carrier: row.carrier,
    service: row.service,
    fromCountries: row.from_countries,
    toCountries: row.to_countries,
    bands,
    currency: row.currency.trim(),
    maxLengthCm: row.max_length_cm === null ? null : Number(row.max_length_cm),
    maxDimensionsSumCm: row.max_dimensions_sum_cm === null ? null : Number(row.max_dimensions_sum_cm),
    volumetricDivisor: row.volumetric_divisor,
    transitDaysMin: row.transit_days_min,
    transitDaysMax: row.transit_days_max,
    tracking: row.tracking,
    deliveryMode: row.delivery_mode,
    notes: row.notes,
    verifiedAt: row.verified_at,
  };
}

/** Liste « FR, BE de » → codes ISO2 valides (vide = tous les pays). */
export function parseCountryList(text: string): { countries: string[]; invalid: string[] } {
  const tokens = text.toUpperCase().split(/[\s,;]+/).filter(Boolean);
  const countries = [...new Set(tokens.filter((t) => /^[A-Z]{2}$/.test(t)))];
  return { countries, invalid: tokens.filter((t) => !/^[A-Z]{2}$/.test(t)) };
}

/** Tranches saisies (texte) → tranches validées, triées, sans doublon de poids. */
export function parseBands(rows: { maxWeightKg: string; price: string }[]): { bands: RateBand[]; errors: string[] } {
  const errors: string[] = [];
  const bands: RateBand[] = [];
  rows.forEach((r, i) => {
    if (r.maxWeightKg.trim() === "" && r.price.trim() === "") return;
    const w = parseDecimal(r.maxWeightKg);
    const p = parseDecimal(r.price);
    if (!w.ok || Number(w.value.n) / Number(w.value.d) <= 0) errors.push(`Tranche ${i + 1} : poids maximal invalide.`);
    else if (!p.ok) errors.push(`Tranche ${i + 1} : prix invalide.`);
    else bands.push({ maxWeightKg: Number(w.value.n) / Number(w.value.d), price: toPlainDecimal(p.value, 4) });
  });
  bands.sort((a, b) => a.maxWeightKg - b.maxWeightKg);
  for (let i = 1; i < bands.length; i++) if (bands[i]!.maxWeightKg === bands[i - 1]!.maxWeightKg) errors.push(`Deux tranches ont le même poids maximal (${bands[i]!.maxWeightKg} kg).`);
  if (bands.length === 0 && errors.length === 0) errors.push("Ajoutez au moins une tranche de poids avec son prix.");
  return { bands, errors };
}
