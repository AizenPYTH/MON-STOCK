import type { RawOffer } from "@/domain/sourcing/types";

/** Adaptations propres à la source (libellés de grade, pays par défaut documenté…). */
export function mapTemplateOffer(offer: RawOffer): RawOffer {
  return { ...offer };
}
