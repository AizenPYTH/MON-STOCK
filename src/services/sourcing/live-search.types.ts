/** Types du pipeline de recherche en direct (partagés entre services et interface). */
import type { RetrievalMethod } from "@/integrations/sourcing/core";

export type LiveSourceStatus =
  | "ok"                 // interrogée, offres récupérées (peut être 0)
  | "cached"             // résultat récent réutilisé (pas de nouvelle requête)
  | "no_search"          // l'adaptateur ne supporte pas la recherche en direct (catalogue synchronisé uniquement)
  | "account_required"   // compte / identifiants requis non fournis
  | "not_attested"       // accès automatisé non attesté par l'utilisateur
  | "robots_disallowed"  // robots.txt interdit les URLs de recherche
  | "error"              // erreur réseau / parsing
  | "timeout"
  | "skipped";           // hors budget (trop de sources)

export interface LiveSourceReport {
  sourceId: string;
  sourceName: string;
  supplierId: string;
  supplierName: string;
  adapterKey: string | null;
  method: RetrievalMethod | null;
  status: LiveSourceStatus;
  message: string | null;
  /** offres récupérées par la source pour cette requête */
  found: number;
  /** offres enregistrées / mises à jour en base (traçables) */
  stored: number;
  rejected: number;
  durationMs: number;
  requests: Array<{ url: string; status: number | null; durationMs: number; offers: number; error: string | null }>;
  checkedAt: string;
}

export interface LiveSearchSummary {
  query: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  sources: LiveSourceReport[];
  queried: number;
  found: number;
  stored: number;
  /** identifiants des offres (sourcing_offers.id) vues/mises à jour par cette recherche */
  offerIds: string[];
}
