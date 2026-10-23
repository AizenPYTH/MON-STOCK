import { CARRIER_LABEL, type CarrierCode, type ParcelTone } from "@/domain/tools/tracking";
import type { ShippingOption } from "@/domain/tools/shipping";

/**
 * Textes d'affichage des outils (module pur, partagé par les pages et les composants client) :
 * mêmes formulations que l'application iPhone. Valeur inconnue → « — », jamais 0.
 */

export const UNKNOWN = "—";

/** « 2026-10-12 » → « 12/10/2026 » ; null → null. */
export function frDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** « 2026-10-12 » → « 12/10 » (bandeau du convertisseur simple). */
export function frDay(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** Date ISO → « 12/10/2026 14:05 » (heure telle que fournie) ; date seule → « 12/10/2026 ». */
export function frDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ""}`;
}

/** Nombre JS → saisie française (« 12,9 ») ; null → « ». */
export function toFrInput(n: number | null | undefined): string {
  return n === null || n === undefined ? "" : String(n).replace(".", ",");
}

/** Pourcentage déjà arrondi (calculateurs de marge) → « 12,5 % » ; null → « — ». */
export function pctText(v: number | null): string {
  return v === null ? UNKNOWN : `${String(v).replace(".", ",")} %`;
}

/** Délai d'une option d'expédition (« 2 j », « 2–4 j », « Délai non communiqué »). */
export function transitText(o: Pick<ShippingOption, "transitDaysMin" | "transitDaysMax">): string {
  if (o.transitDaysMin === null && o.transitDaysMax === null) return "Délai non communiqué";
  if (o.transitDaysMin === o.transitDaysMax || o.transitDaysMax === null) return `${o.transitDaysMin ?? o.transitDaysMax} j`;
  return `${o.transitDaysMin ?? "?"}–${o.transitDaysMax} j`;
}

/** Nature du prix d'une option : grille (estimation) ou devis avec HT/TTC seulement si connu. */
export function priceTaxText(o: Pick<ShippingOption, "origin" | "priceTax">): string {
  if (o.origin === "manual") return "estimation (votre grille)";
  return o.priceTax === "incl" ? "TTC" : o.priceTax === "excl" ? "HT" : "HT/TTC inconnu";
}

export function trackingText(tracking: boolean | null): string {
  return tracking === true ? "Suivi inclus" : tracking === false ? "Sans suivi" : "Suivi : non précisé";
}

/** Date du prix d'une option : heure du devis (UTC) ou date de vérification de la grille. */
export function quotedAtText(o: Pick<ShippingOption, "origin" | "quotedAt">): string {
  if (o.origin === "api") return `Devis du ${frDate(o.quotedAt) ?? UNKNOWN}${o.quotedAt && o.quotedAt.length >= 16 ? ` ${o.quotedAt.slice(11, 16)} UTC` : ""}`;
  return o.quotedAt ? `Grille vérifiée le ${frDate(o.quotedAt)}` : "Grille : date de vérification non renseignée";
}

export function carrierText(p: { carrierCode: CarrierCode | null; carrierLabel: string | null }): string {
  if (p.carrierLabel) return p.carrierLabel;
  return p.carrierCode ? CARRIER_LABEL[p.carrierCode] : "Transporteur non déterminé";
}

/** Source du suivi : API officielles La Poste / DHL ou agrégateur Ship24 (aucune affiliation). */
export function trackingSourceText(provider: string | null): string | null {
  return provider === "laposte" ? "API La Poste Suivi" : provider === "dhl" ? "API DHL Suivi" : provider === "ship24" ? "Ship24" : provider;
}

/** Couleurs des statuts de colis (point et texte), mêmes tonalités que l'application. */
export const PARCEL_TONE_CLASS: Record<ParcelTone, { dot: string; text: string }> = {
  problem: { dot: "bg-danger", text: "text-danger" },
  progress: { dot: "bg-foreground", text: "text-foreground" },
  unverified: { dot: "bg-amber", text: "text-warning" },
  delivered: { dot: "bg-success", text: "text-success" },
  waiting: { dot: "bg-ink-4", text: "text-muted" },
};

/** Symboles de l'onglet devise du convertisseur simple. */
export const FX_SYMBOL: Record<string, string> = { USD: "$", GBP: "£", CHF: "CHF", CNY: "¥", HKD: "HK$", JPY: "¥", PLN: "zł" };

/** Source du taux affichée (« BCE » pour la BCE). */
export function fxSourceText(source: string): string {
  return source.toUpperCase() === "ECB" ? "BCE" : source;
}

/** Erreur Postgres de doublon (contrainte unique). */
export function isDuplicateError(e: unknown): boolean {
  if (!e || typeof e !== "object") return /duplicate|23505|unique/i.test(String(e));
  const o = e as { code?: unknown; message?: unknown };
  return o.code === "23505" || /duplicate|23505|unique/i.test(String(o.message ?? ""));
}
