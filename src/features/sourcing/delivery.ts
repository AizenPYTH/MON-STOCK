import { NOT_PROVIDED } from "@/lib/format";

/** « 3–5 jours », « 2 jours », « Non communiqué ». Module pur partagé par les cartes et le détail d'offre. */
export function deliveryLabel(min: number | null, max: number | null): string {
  if (min === null && max === null) return NOT_PROVIDED;
  if (min !== null && max !== null && min !== max) return `${min}–${max} jours`;
  const d = max ?? min;
  return `${d} jour${d && d > 1 ? "s" : ""}`;
}
