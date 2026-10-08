import type { RawOffer } from "@/domain/sourcing/types";

/**
 * Un parser de source transforme le HTML d'une page publique en offres brutes.
 * Il ne fait aucune requête réseau lui-même : le crawler lui fournit le HTML.
 */
export interface SourceParser {
  key: string;
  label: string;
  /** description honnête de ce que le parser sait extraire */
  description: string;
  parse(html: string, url: string): RawOffer[];
}
