/**
 * Squelette de parser dédié à une source publique. Copier ce dossier sous
 * src/integrations/suppliers/sources/<source-key>/ puis l'enregistrer dans ../registry.ts.
 *
 * Le parser reçoit le HTML déjà récupéré par le crawler (accès autorisé, robots.txt respecté)
 * et retourne des offres brutes. Aucun champ ne doit être deviné : absent → null.
 */
import type { RawOffer } from "@/domain/sourcing/types";
import type { SourceParser } from "@/services/sourcing/crawler/parsers/types";
import { parseJsonLdProducts } from "@/services/sourcing/crawler/parsers/jsonld-parser";
import { mapTemplateOffer } from "./mapper";

export const templateParser: SourceParser = {
  key: "_template",
  label: "Modèle de parser (non enregistré)",
  description: "Exemple : s'appuie sur le JSON-LD de la page puis applique un mapping spécifique.",
  parse(html: string, url: string): RawOffer[] {
    return parseJsonLdProducts(html, url).map(mapTemplateOffer);
  },
};
