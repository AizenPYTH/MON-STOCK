/**
 * jsonld-public — mapping : complète les valeurs par défaut documentées par l'utilisateur
 * (devise, HT/TTC, pays) uniquement lorsque la page ne les déclare pas, et conserve la
 * provenance (URL de la page lue).
 */
import type { RawOffer } from "@/domain/sourcing/types";
import type { AdapterSourceConfig } from "@/integrations/sourcing/core";

export function mapJsonLdOffer(offer: RawOffer, config: AdapterSourceConfig, pageUrl: string): RawOffer {
  return {
    ...offer,
    currency: offer.currency ?? config.defaultCurrency ?? null,
    taxType: offer.taxType && offer.taxType !== "unknown" ? offer.taxType : config.defaultTaxType,
    country: offer.country ?? config.defaultCountry ?? null,
    url: offer.url ?? pageUrl,
    raw: { page_url: pageUrl, jsonld: offer.raw ?? null },
  };
}
