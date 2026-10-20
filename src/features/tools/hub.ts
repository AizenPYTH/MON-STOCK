import { div, formatDec, formatMoneyDec, formatPercent, fromNumber, HUNDRED, isNegative, isZero, mul, ONE, parseDecimal, PARSE_ERROR_LABEL, sub, ZERO, cmp, type Dec } from "@/domain/tools/decimal";
import { evaluateVatForm, RATE_ERROR_LABEL, type VatMode } from "@/domain/tools/vat";
import { EMPTY_EBAY_FEES, evaluateEbayFees, type EbayFeesInput } from "@/domain/tools/ebay-fees";
import { convertCurrency, rateAgeDays, type FxRate } from "@/domain/tools/currency";
import { parcelDisplay, type ParcelTone } from "@/domain/tools/tracking";
import type { RateCard } from "@/domain/tools/shipping";
import { carrierText, frDate, frDateTime, fxSourceText } from "@/features/tools/format";
import type { TrackedParcel } from "@/features/tools/parcels";

/**
 * Page « Outils » (module pur) : lignes de résultat des calculateurs côte à côte, calculées en
 * direct à partir de la saisie. Une ligne « saisi » reprend une valeur tapée ; les autres sont
 * calculées (« ≈ » quand elles reposent sur un taux de référence). Inconnu → « — », jamais 0.
 */

export const UNKNOWN = "—";

export type HubLineKind = "input" | "calc" | "total" | "muted";

export interface HubLine {
  label: string;
  value: string;
  kind: HubLineKind;
  /** estimation (taux de référence) : « ≈ » atténué devant la valeur */
  approx?: boolean;
  tone?: "success" | "danger" | "warning";
  /** précision à droite du libellé (âge d'un taux…) */
  aside?: { text: string; tone?: "warning" };
}

const money = (d: Dec | null) => (d ? formatMoneyDec(d) : UNKNOWN);

/** Champ vide → null ; invalide → message ; sinon valeur exacte. */
function readField(text: string): { value: Dec | null; error: string | null } {
  if (text.trim() === "") return { value: null, error: null };
  const r = parseDecimal(text);
  return r.ok ? { value: r.value, error: null } : { value: null, error: PARSE_ERROR_LABEL[r.error] };
}

/** Texte copié depuis une carte : une ligne par résultat, valeurs saisies marquées. */
export function hubCopyText(title: string, lines: HubLine[], note?: string | null): string {
  const body = lines.map((l) => `${l.label}${l.kind === "input" ? " (saisi)" : ""} : ${l.approx && l.value !== UNKNOWN ? "≈ " : ""}${l.value}`).join("\n");
  return `${title}\n${body}${note ? `\n${note}` : ""}`;
}

// ---------------------------------------------------------------------------
// TVA
// ---------------------------------------------------------------------------

export const VAT_HUB_MODES: { value: VatMode; label: string }[] = [
  { value: "ht_to_ttc", label: "HT → TTC" },
  { value: "ttc_to_ht", label: "TTC → HT" },
  { value: "vat_only", label: "TVA seule" },
];

/** « TVA seule » part d'un montant TTC (libellé explicite du champ). */
export function vatHub(mode: VatMode, amountText: string, rate: { rate: string; label: string }): { inputLabel: string; lines: HubLine[]; error: string | null } {
  const inputLabel = mode === "ht_to_ttc" ? "Montant HT" : "Montant TTC";
  const r = evaluateVatForm({ mode, amount: amountText, rate: rate.rate, vatOnlyBasis: "ttc" });
  const res = r.state === "ok" ? r.result : null;
  const error = r.state === "error" ? (r.field === "amount" ? PARSE_ERROR_LABEL[r.error as keyof typeof PARSE_ERROR_LABEL] : RATE_ERROR_LABEL[r.error]) : null;
  const vat: HubLine = { label: `TVA (${rate.label})`, value: money(res?.vat ?? null), kind: "calc" };
  const lines: HubLine[] =
    mode === "ht_to_ttc"
      ? [{ label: "Montant HT", value: money(res?.ht ?? null), kind: "input" }, vat, { label: "Montant TTC", value: money(res?.ttc ?? null), kind: "total" }]
      : mode === "ttc_to_ht"
        ? [{ label: "Montant TTC", value: money(res?.ttc ?? null), kind: "input" }, vat, { label: "Montant HT", value: money(res?.ht ?? null), kind: "total" }]
        : [{ label: "Montant TTC", value: money(res?.ttc ?? null), kind: "input" }, { label: "Montant HT", value: money(res?.ht ?? null), kind: "calc" }, { ...vat, kind: "total" }];
  return { inputLabel, lines, error };
}

// ---------------------------------------------------------------------------
// Marge
// ---------------------------------------------------------------------------

/**
 * Bénéfice = vente − achat − frais. Des frais non saisis ne sont pas inventés : la ligne le dit et
 * le bénéfice est alors « avant frais ».
 */
export function marginHub(achatText: string, venteText: string, fraisText: string): { lines: HubLine[]; error: string | null } {
  const achat = readField(achatText);
  const vente = readField(venteText);
  const frais = readField(fraisText);
  const error = vente.error ?? achat.error ?? frais.error;
  const ok = !error && achat.value !== null && vente.value !== null;
  const benefit = ok ? sub(sub(vente.value!, achat.value!), frais.value ?? ZERO) : null;
  const rate = benefit && !isZero(vente.value!) ? div(mul(benefit, HUNDRED), vente.value!) : null;
  const coef = ok && !isZero(achat.value!) ? div(vente.value!, achat.value!) : null;
  const signed = benefit ? `${isNegative(benefit) ? "" : "+"}${formatMoneyDec(benefit)}` : UNKNOWN;
  return {
    error,
    lines: [
      { label: "Prix de vente", value: money(vente.value), kind: "input" },
      { label: "Prix d'achat", value: money(achat.value), kind: "input" },
      frais.value ? { label: "Frais", value: money(frais.value), kind: "input" } : { label: "Frais", value: "non saisis", kind: "muted" },
      { label: frais.value || !ok ? "Bénéfice" : "Bénéfice avant frais", value: signed, kind: "total", tone: benefit && isNegative(benefit) ? "danger" : undefined },
      { label: "Taux de marge (sur prix de vente)", value: rate ? formatPercent(rate, 1) : UNKNOWN, kind: "calc" },
      { label: "Coefficient", value: coef ? formatDec(coef, 2) : UNKNOWN, kind: "muted" },
    ],
  };
}

// ---------------------------------------------------------------------------
// Frais eBay
// ---------------------------------------------------------------------------

export type EbayHubInput = Pick<EbayFeesInput, "itemPrice" | "shippingCharged" | "finalValueFeePercent" | "fixedFeePerOrder" | "promotedPercent">;

/** Aucun taux par défaut : commission et frais fixes non saisis sont listés, jamais comptés. */
export function ebayHub(input: EbayHubInput): { lines: HubLine[]; notEntered: string[]; error: string | null } {
  const c = evaluateEbayFees({ ...EMPTY_EBAY_FEES, ...input, feeOnShipping: true });
  if (c.state !== "ok") {
    return {
      error: c.state === "invalid" ? (Object.values(c.errors)[0] ?? null) : null,
      notEntered: [],
      lines: [
        { label: "Commission sur la valeur finale (objet + port)", value: UNKNOWN, kind: "calc" },
        { label: "Frais fixes par commande", value: UNKNOWN, kind: "calc" },
        { label: "Total des frais", value: UNKNOWN, kind: "calc" },
        { label: "Il vous reste", value: UNKNOWN, kind: "total" },
      ],
    };
  }
  const r = c.result;
  const lines: HubLine[] = r.fees.map((f) => ({ label: f.label, value: formatMoneyDec(f.amount), kind: "calc" as const }));
  lines.push({ label: "Total des frais", value: formatMoneyDec(r.totalFees), kind: "calc" });
  lines.push({ label: "Il vous reste", value: formatMoneyDec(r.netAfterFees), kind: "total", tone: isNegative(r.netAfterFees) ? "danger" : undefined });
  return { error: null, lines, notEntered: r.notEntered.filter((n) => n === "commission sur la valeur finale" || n === "frais fixes par commande") };
}

// ---------------------------------------------------------------------------
// Devises
// ---------------------------------------------------------------------------

/** Au-delà de 7 jours, l'âge du taux est signalé en ambre. */
export const STALE_RATE_DAYS = 7;

export function currencyHub(amountText: string, code: string | null, feePctText: string, rates: FxRate[], now: Date): { lines: HubLine[]; error: string | null } {
  const rate = code ? (rates.find((r) => r.currency === code) ?? null) : null;
  const age = rate ? rateAgeDays(rate.rateDate, now) : null;
  const rateLine: HubLine = rate
    ? {
        label: `Taux ${fxSourceText(rate.source)} du ${frDate(rate.rateDate) ?? UNKNOWN} · 1 ${rate.currency}`,
        value: `${formatDec(div(ONE, fromNumber(rate.rate)), 4)} €`,
        kind: "calc",
        aside: age !== null && age > 0 ? { text: `il y a ${age} j`, tone: age > STALE_RATE_DAYS ? "warning" : undefined } : undefined,
      }
    : { label: "Taux de référence", value: UNKNOWN, kind: "muted" };
  const feeEntered = feePctText.trim() !== "";
  const c = rate ? convertCurrency({ amount: amountText, from: rate.currency, to: "EUR", bankFeePercent: feePctText, bankFeeFixed: "" }, rates) : null;
  const res = c?.state === "ok" ? c.result : null;
  const error = c?.state === "invalid" ? (c.errors.amount ?? c.errors.bankFeePercent ?? c.errors.currency ?? null) : null;
  return {
    error,
    lines: [
      rateLine,
      { label: "Montant converti", value: money(res?.converted ?? null), kind: "calc", approx: true },
      feeEntered ? { label: "Frais bancaires", value: money(res?.bankFees ?? null), kind: "calc", approx: true } : { label: "Frais bancaires", value: "non saisis", kind: "muted" },
      { label: "Coût en euros", value: money(res?.totalWithFees ?? null), kind: "total", approx: true },
    ],
  };
}

// ---------------------------------------------------------------------------
// Frais de port (grilles saisies)
// ---------------------------------------------------------------------------

export const HUB_WEIGHTS: { kg: number; label: string }[] = [
  { kg: 0.25, label: "250 g" },
  { kg: 0.5, label: "500 g" },
  { kg: 1, label: "1 kg" },
  { kg: 2, label: "2 kg" },
];

export interface WeightRow {
  key: string;
  label: string;
  value: string;
  cheapest: boolean;
}

/**
 * Prix de la tranche de poids de chaque grille saisie (poids réel ; poids volumétrique, pays et
 * dimensions sont vérifiés dans le comparateur complet). « Le moins cher » seulement si toutes
 * les grilles comparées sont dans la même devise.
 */
export function shippingByWeight(cards: RateCard[], weightKg: number): { rows: WeightRow[]; outOfRange: number; oldestVerifiedAt: string | null; undated: number } {
  const priced: { key: string; label: string; price: Dec; currency: string }[] = [];
  let outOfRange = 0;
  for (const c of cards) {
    const band = [...c.bands].sort((a, b) => a.maxWeightKg - b.maxWeightKg).find((b) => weightKg <= b.maxWeightKg + 1e-9);
    const p = band ? parseDecimal(band.price) : null;
    if (!p?.ok) {
      outOfRange += 1;
      continue;
    }
    priced.push({ key: c.id, label: `${c.carrier}${c.service ? ` · ${c.service}` : ""}`, price: p.value, currency: c.currency });
  }
  const single = new Set(priced.map((p) => p.currency)).size === 1;
  priced.sort((a, b) => (a.currency !== b.currency ? a.currency.localeCompare(b.currency) : cmp(a.price, b.price)));
  const dates = cards.map((c) => c.verifiedAt).filter((d): d is string => Boolean(d)).sort();
  return {
    rows: priced.map((p, i) => ({ key: p.key, label: p.label, value: formatMoneyDec(p.price, p.currency), cheapest: single && priced.length > 1 && i === 0 })),
    outOfRange,
    oldestVerifiedAt: dates[0] ?? null,
    undated: cards.filter((c) => !c.verifiedAt).length,
  };
}

// ---------------------------------------------------------------------------
// Suivi de colis
// ---------------------------------------------------------------------------

/** Ligne d'un colis récent : statut relevé (ou « Non vérifié »), livraison datée si connue. */
export function parcelHubLine(p: TrackedParcel): { label: string; value: string; tone: ParcelTone } {
  const d = parcelDisplay(p);
  const when = p.status === "delivered" && p.deliveredAt ? ` · livré le ${frDateTime(p.deliveredAt)}` : d.verified && p.estimatedDelivery ? ` · livraison estimée ${frDate(p.estimatedDelivery)}` : "";
  return { label: `${carrierText(p)} · ${p.label || p.trackingNumber}`, value: `${d.label}${when}`, tone: d.tone };
}
