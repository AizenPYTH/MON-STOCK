import type { SourceParser } from "@/services/sourcing/crawler/parsers/types";

/**
 * Parsers dédiés par source publique (voir README.md). Vide : aucune source réelle
 * n'est encore implémentée ; le parser générique « jsonld » reste disponible.
 */
export const SOURCE_PARSERS: readonly SourceParser[] = [];
