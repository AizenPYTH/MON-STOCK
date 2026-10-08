import Link from "next/link";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatDuration } from "@/features/integrations/format";
import { formatNumber, formatRelative } from "@/lib/format";
import type { LiveSearchSummary, LiveSourceReport } from "@/services/sourcing/live-search.types";
import { LIVE_SOURCE_STATUS_LABEL, LIVE_SOURCE_STATUS_VARIANT, RETRIEVAL_METHOD_LABEL } from "@/features/sourcing/labels";

function dotTone(s: LiveSourceReport["status"]): "success" | "warning" | "danger" | "neutral" | "info" {
  const v = LIVE_SOURCE_STATUS_VARIANT[s];
  return v === "success" || v === "warning" || v === "danger" || v === "info" ? v : "neutral";
}

function statusText(s: LiveSourceReport): string {
  switch (s.status) {
    case "ok":
      return `${formatNumber(s.found)} trouvée(s) · ${formatNumber(s.stored)} enregistrée(s)${s.rejected > 0 ? ` · ${formatNumber(s.rejected)} rejetée(s)` : ""}`;
    case "cached":
      return `Résultat récent réutilisé · ${formatNumber(s.found)} offre(s)`;
    case "no_search":
      return "Cette source ne supporte pas la recherche en direct : offres issues du catalogue synchronisé.";
    case "account_required":
      return s.message ?? "Identifiants du compte fournisseur manquants ou non testés.";
    case "not_attested":
      return s.message ?? "Attestez l'autorisation d'accès automatisé dans la configuration de la source.";
    case "robots_disallowed":
      return s.message ?? "Les URLs de recherche sont interdites par robots.txt.";
    case "error":
    case "timeout":
      return s.message ?? (s.status === "timeout" ? "Délai dépassé." : "Erreur inconnue.");
    case "skipped":
      return s.message ?? "Trop de sources pour cette recherche : non interrogée.";
    default:
      return s.message ?? "";
  }
}

/** « Sources interrogées » : compte rendu honnête, source par source, de la recherche en direct. */
export function LiveSourcesPanel({ summary, liveEnabled, toggleHref, hasQuery }: { summary: LiveSearchSummary | null; liveEnabled: boolean; toggleHref: string; hasQuery: boolean }) {
  const description = !hasQuery ? "Lancez une recherche : chaque source connectée est interrogée en direct." : !liveEnabled ? "Recherche dans les offres enregistrées uniquement : aucune source n'a été interrogée." : summary ? `${summary.queried} source(s) interrogée(s) en ${formatDuration(summary.durationMs)} · ${formatNumber(summary.found)} offre(s) récupérée(s).` : "Aucun compte rendu de recherche en direct disponible.";
  return (
    <Card>
      <CardHeader
        title="Sources interrogées"
        description={description}
        actions={
          hasQuery ? (
            <Link href={toggleHref as never} className="text-xs font-medium text-muted-strong underline-offset-2 hover:underline">
              {liveEnabled ? "Rechercher sans interroger les sources" : "Interroger les sources en direct"}
            </Link>
          ) : null
        }
      />
      <CardContent className="p-0">
        {!summary || summary.sources.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">{summary && liveEnabled ? "Aucune source connectée n'a pu être interrogée." : "Aucune source interrogée."}</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {summary.sources.map((s) => (
              <li key={s.sourceId} className="px-5 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusDot tone={dotTone(s.status)} />
                      <span className="truncate font-medium">{s.sourceName}</span>
                    </div>
                    <div className="truncate text-xs text-muted">
                      <Link href={`/suppliers/${s.supplierId}/sources` as never} className="hover:underline">
                        {s.supplierName}
                      </Link>
                      {" · "}
                      {s.method ? RETRIEVAL_METHOD_LABEL[s.method] ?? s.method : "Méthode non communiquée"}
                      {s.adapterKey ? <span className="font-mono"> · {s.adapterKey}</span> : null}
                    </div>
                  </div>
                  <Badge variant={LIVE_SOURCE_STATUS_VARIANT[s.status] ?? "neutral"}>{LIVE_SOURCE_STATUS_LABEL[s.status] ?? s.status}</Badge>
                </div>
                <div className={`mt-1 text-xs ${s.status === "error" || s.status === "timeout" || s.status === "robots_disallowed" ? "text-danger" : "text-muted"}`}>{statusText(s)}</div>
                <div className="mt-0.5 text-xs text-muted">
                  {formatDuration(s.durationMs)}
                  {s.requests.length > 0 ? ` · ${s.requests.length} requête(s)` : ""}
                  {" · "}Vérifié {formatRelative(s.checkedAt)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
