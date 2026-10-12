import { CARRIER_LABEL, PROBLEM_STATUSES, TRACKING_STATUS_LABEL, type ParcelTone, type TrackingStatus } from "@/domain/tools/tracking";
import { StatusChip, type ChipTone } from "~/components/ui";
import { color } from "~/theme/tokens";
import { brandById, brandFromText, type BrandEntry } from "~/brands/registry";
import type { TrackedParcel } from "~/data/tracking";

export function statusTone(s: TrackingStatus): ChipTone {
  if (s === "delivered") return "success";
  if (PROBLEM_STATUSES.has(s)) return "danger";
  if (s === "out_for_delivery" || s === "available_for_pickup") return "accent";
  if (s === "unknown" || s === "not_found" || s === "pending") return "neutral";
  return "dark";
}

export function ParcelStatusChip({ status }: { status: TrackingStatus }) {
  return <StatusChip label={TRACKING_STATUS_LABEL[status] ?? status} tone={statusTone(status)} />;
}

export function carrierText(p: Pick<TrackedParcel, "carrierCode" | "carrierLabel">): string {
  if (p.carrierLabel) return p.carrierLabel;
  return p.carrierCode ? CARRIER_LABEL[p.carrierCode] : "Transporteur non déterminé";
}

/** Marque du transporteur (code détecté ou libellé saisi) ; null si inconnue. */
export function carrierBrand(p: Pick<TrackedParcel, "carrierCode" | "carrierLabel">): BrandEntry | null {
  return brandById(p.carrierCode) ?? brandFromText(p.carrierLabel);
}

/** Source du suivi : API officielles La Poste / DHL ou agrégateur Ship24 (aucune affiliation). */
export function trackingSourceText(provider: string | null): string | null {
  return provider === "laposte" ? "API La Poste Suivi" : provider === "dhl" ? "API DHL Suivi" : provider === "ship24" ? "Ship24" : provider;
}

/** Date ISO → « 12/10/2026 14:05 » (sans Intl) ; date seule → « 12/10/2026 ». */
export function frDateTime(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ""}`;
}

/** Couleurs de la maquette : point (fond clair), texte (contraste AA) et chiffre du bandeau nuit. */
export const PARCEL_TONE: Record<ParcelTone, { dot: string; text: string; onDark: string }> = {
  problem: { dot: color.danger, text: color.dangerInk, onDark: color.dangerOnDark },
  progress: { dot: color.brand, text: color.ink, onDark: color.inkOnDark },
  unverified: { dot: color.accent, text: color.accentInkOnSoft, onDark: color.accent },
  delivered: { dot: color.success, text: color.success, onDark: color.mint },
  waiting: { dot: color.ink3, text: color.ink3, onDark: color.inkOnDarkMuted },
};
