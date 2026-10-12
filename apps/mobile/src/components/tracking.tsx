import { CARRIER_LABEL, PROBLEM_STATUSES, TRACKING_STATUS_LABEL, type TrackingStatus } from "@/domain/tools/tracking";
import { StatusChip, type ChipTone } from "~/components/ui";
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
