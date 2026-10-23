import { Check, ChevronRight, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { formatDuration } from "@/features/integrations/format";
import type { LiveSearchSummary } from "@/services/sourcing/live-search.types";
import type { OfferQueryStage } from "@/services/sourcing/offer-query";

interface Step {
  key: string;
  label: string;
  detail: string;
  tone: "done" | "muted" | "warn";
}

/**
 * Bandeau du pipeline de recherche : chaque étape affiche un chiffre réel issu du résumé
 * de recherche en direct ou du résultat. Aucune étape n'est marquée « réussie » sans donnée.
 */
export function PipelineStrip({ live, total, duplicatesCollapsed, connectedSources, stage, className }: { live: LiveSearchSummary | null; total: number; duplicatesCollapsed: number; connectedSources: number; stage: OfferQueryStage; className?: string }) {
  const queried = live ? live.sources.filter((s) => s.status === "ok" || s.status === "cached").length : 0;
  const failed = live ? live.sources.filter((s) => s.status === "error" || s.status === "timeout" || s.status === "robots_disallowed").length : 0;
  const stageLabel = stage === "identifier" ? "identifiant exact" : stage === "structured" ? "attributs normalisés" : stage === "text" ? "texte" : stage === "filters_only" ? "filtres" : "aucun critère";
  const steps: Step[] = [
    { key: "search", label: "Recherche", detail: stageLabel, tone: stage === "none" ? "muted" : "done" },
    live
      ? { key: "sources", label: "Sources", detail: `${queried} / ${live.sources.length} interrogée(s)${failed > 0 ? ` · ${failed} en erreur` : ""}`, tone: live.sources.length === 0 ? "muted" : failed > 0 && queried === 0 ? "warn" : "done" }
      : { key: "sources", label: "Sources", detail: connectedSources === 0 ? "aucune connectée" : "non interrogées (offres enregistrées)", tone: "muted" },
    live
      ? { key: "fetch", label: "Récupération", detail: `${formatNumber(live.found)} offre(s) récupérée(s) · ${formatNumber(live.stored)} enregistrée(s) · ${formatDuration(live.durationMs)}`, tone: live.found > 0 ? "done" : "muted" }
      : { key: "fetch", label: "Récupération", detail: "offres enregistrées uniquement", tone: "muted" },
    { key: "normalize", label: "Normalisation", detail: "prix, devise, HT/TTC, attributs", tone: total > 0 ? "done" : "muted" },
    { key: "match", label: "Matching", detail: "EAN / MPN / attributs", tone: total > 0 ? "done" : "muted" },
    { key: "dedupe", label: "Déduplication", detail: `${formatNumber(duplicatesCollapsed)} doublon(s) fusionné(s)`, tone: duplicatesCollapsed > 0 ? "done" : "muted" },
    { key: "compare", label: "Comparaison", detail: "prix comparables, coût rendu, marge", tone: total > 0 ? "done" : "muted" },
    { key: "results", label: "Résultats", detail: `${formatNumber(total)} offre(s)`, tone: total > 0 ? "done" : "muted" },
  ];
  return (
    <ol className={cn("flex flex-wrap items-stretch gap-1 rounded-2xl border border-border bg-surface p-2 text-[11.5px]", className)} aria-label="Pipeline de recherche">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1">
          <div className={cn("rounded-[10px] px-2.5 py-1.5", s.tone === "done" ? "bg-surface-2 text-foreground" : s.tone === "warn" ? "bg-warning-soft text-warning-ink" : "text-muted")}>
            <div className="ms-mono flex items-center gap-1 text-[10px] leading-[13px]">
              {s.tone === "done" ? <Check aria-hidden="true" className="h-3 w-3 text-success" strokeWidth={2.75} /> : s.tone === "warn" ? <TriangleAlert aria-hidden="true" className="h-3 w-3" /> : null}
              {s.label}
            </div>
            <div className={cn("mt-0.5 font-semibold leading-4 tnum", s.tone === "done" ? "text-muted-strong" : "")}>{s.detail}</div>
          </div>
          {i < steps.length - 1 ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-4" aria-hidden /> : null}
        </li>
      ))}
    </ol>
  );
}
