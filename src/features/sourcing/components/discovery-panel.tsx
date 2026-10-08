import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { DiscoveryPanelData } from "@/services/sourcing/discovery/search-discovery";
import type { DiscoveryCandidateStatus, DiscoveryReportCandidate } from "@/services/sourcing/discovery/discovery-service";
import { PLATFORM_LABEL, ROBOTS_STATUS_LABEL } from "@/features/suppliers/discovered";
import { safeExternalUrl } from "@/lib/utils";

const STATUS_LABEL: Record<DiscoveryCandidateStatus, string> = { new: "Nouvelle — à valider", already_known: "Déjà connue", rejected: "Écartée", skipped: "Non analysée" };
const STATUS_VARIANT: Record<DiscoveryCandidateStatus, "warning" | "neutral" | "danger" | "outline"> = { new: "warning", already_known: "neutral", rejected: "danger", skipped: "outline" };

function accessVariant(c: DiscoveryReportCandidate): "success" | "warning" | "danger" | "neutral" {
  return c.access === "public" ? "success" : c.access === "account" || c.access === "protected" ? "warning" : "neutral";
}

function CandidateRow({ c }: { c: DiscoveryReportCandidate }) {
  const href = safeExternalUrl(c.sampleUrl) ?? safeExternalUrl(`https://${c.domain}`);
  return (
    <li className="px-5 py-2.5 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="font-medium hover:underline">
              {c.domain}
            </a>
          ) : (
            <span className="font-medium">{c.domain}</span>
          )}
          {c.name && c.name !== c.domain ? <span className="ml-1 text-xs text-muted">{c.name}</span> : null}
        </div>
        <Badge variant={STATUS_VARIANT[c.status]}>{STATUS_LABEL[c.status]}</Badge>
      </div>
      {c.status !== "rejected" ? (
        <div className="mt-1 flex flex-wrap gap-1 text-xs">
          <Badge variant="outline">{c.typeLabel}</Badge>
          <Badge variant="outline">{PLATFORM_LABEL[c.platform] ?? c.platform}</Badge>
          <Badge variant={accessVariant(c)}>{c.accessLabel}</Badge>
          <Badge variant="outline">{c.priceVisibilityLabel}</Badge>
          <Badge variant={c.robots === "disallowed" || c.robots === "error" ? "danger" : "outline"}>{ROBOTS_STATUS_LABEL[c.robots] ?? c.robots}</Badge>
        </div>
      ) : null}
      <div className="mt-1 text-xs text-muted">{c.reason}</div>
      {c.status === "new" && c.sourceId ? (
        <Link href="#decouvertes" className="mt-1 inline-block text-xs font-medium text-foreground underline">
          À valider
        </Link>
      ) : null}
    </li>
  );
}

/**
 * « Sources découvertes » : fournisseurs trouvés via l'API de recherche web configurée.
 * Une source découverte n'est JAMAIS interrogée ni attestée automatiquement : CTA « À valider ».
 */
export function DiscoveryPanel({ discovery }: { discovery: DiscoveryPanelData }) {
  const report = discovery.report;
  const candidates = report?.candidates ?? [];
  const shown = [...candidates].sort((a, b) => order(a.status) - order(b.status)).slice(0, 25);
  return (
    <Card>
      <CardHeader title="Sources découvertes" description={discovery.message} />
      <CardContent className="p-0">
        {discovery.state === "disabled" ? (
          <div className="space-y-2 px-5 py-4 text-sm text-muted">
            <p>Découverte désactivée : aucune API de recherche configurée. Seules vos sources enregistrées sont interrogées.</p>
            {discovery.isAdmin ? (
              <div className="rounded-lg bg-surface-muted/60 px-3 py-2 text-xs">
                <p className="font-medium text-foreground">Activer la découverte (administrateurs)</p>
                <p className="mt-1">
                  Dans les variables d&apos;environnement du serveur : <code className="font-mono">SOURCING_DISCOVERY_PROVIDER=brave</code> et <code className="font-mono">BRAVE_SEARCH_API_KEY=&lt;clé&gt;</code> (API officielle Brave Search, clé personnelle). Au plus 6 requêtes par recherche, mises en cache 24 h. Voir docs/sourcing-discovery.md.
                </p>
              </div>
            ) : (
              <p className="text-xs">Demandez à un administrateur de l&apos;organisation de configurer une API de recherche.</p>
            )}
          </div>
        ) : !report ? (
          <p className="px-5 py-4 text-sm text-muted">{discovery.state === "done" ? "Aucun candidat." : discovery.message}</p>
        ) : shown.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">Aucun fournisseur candidat trouvé pour cette recherche.</p>
        ) : (
          <>
            <p className="px-5 pt-3 text-xs text-muted">
              {report.counts.new} nouvelle(s) · {report.counts.already_known} déjà connue(s) · {report.counts.rejected} écartée(s){report.counts.skipped ? ` · ${report.counts.skipped} non analysée(s)` : ""}. Une source découverte n&apos;est ni vérifiée ni connectée : validez-la (attestation des conditions d&apos;utilisation) avant toute interrogation.
            </p>
            <ul className="divide-y divide-border">
              {shown.map((c) => (
                <CandidateRow key={`${c.domain}-${c.status}`} c={c} />
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function order(s: DiscoveryCandidateStatus): number {
  return s === "new" ? 0 : s === "already_known" ? 1 : s === "skipped" ? 2 : 3;
}
