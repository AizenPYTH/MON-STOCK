import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { activationCheck, PLATFORM_LABEL, PRICE_VISIBILITY_LABEL, ROBOTS_STATUS_LABEL, SUPPLIER_TYPE_LABEL } from "@/features/suppliers/discovered";
import type { PendingDiscoveredSource } from "@/features/suppliers/discovered-queries";
import { DiscoveredSourceActions } from "@/features/suppliers/components/discovered-source-actions";
import { listSourceAdapters } from "@/integrations/sourcing/registry";
import { formatRelative } from "@/lib/format";
import { safeExternalUrl } from "@/lib/utils";

/**
 * « Découvertes — à valider » : sources trouvées automatiquement, ni vérifiées ni connectées.
 * Activation uniquement par l'utilisateur, avec attestation ; « Compte requis » jamais activable comme source publique.
 */
export function DiscoveredSourcesPanel({ sources, writable, showSupplier = true, id = "decouvertes" }: { sources: PendingDiscoveredSource[]; writable: boolean; showSupplier?: boolean; id?: string }) {
  const adapters = listSourceAdapters().map((a) => ({ key: a.key, access: a.access, label: a.label }));
  return (
    <Card id={id}>
      <CardHeader title={`Découvertes — à valider (${sources.length})`} description="Sources trouvées automatiquement par la découverte. Ni vérifiées ni connectées : aucune n'est interrogée avant votre validation explicite." />
      <CardContent className="p-0">
        {sources.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">Aucune source découverte en attente de validation.</p>
        ) : (
          <ul className="divide-y divide-border">
            {sources.map((s) => {
              const check = activationCheck(s.info, adapters, s.robotsAllowed);
              const siteUrl = safeExternalUrl(s.baseUrl) ?? safeExternalUrl(s.info.sampleUrl);
              return (
                <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {siteUrl ? (
                        <a href={siteUrl} target="_blank" rel="noopener noreferrer nofollow" className="font-medium hover:underline">
                          {siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                        </a>
                      ) : (
                        <span className="font-medium">{s.name}</span>
                      )}
                      <Badge variant="warning">Découverte — à valider</Badge>
                      {!check.ok && check.accountRequired ? <Badge variant="danger">Compte requis</Badge> : null}
                    </div>
                    {showSupplier ? (
                      <div className="text-xs text-muted">
                        Fournisseur :{" "}
                        <Link href={`/suppliers/${s.supplierId}/sources` as never} className="underline-offset-2 hover:underline">
                          {s.supplierName}
                        </Link>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-1 text-xs">
                      <Badge variant="outline">
                        {SUPPLIER_TYPE_LABEL[s.info.supplierType] ?? s.info.supplierType}
                        {s.info.supplierTypeConfidence !== null ? ` (${Math.round(s.info.supplierTypeConfidence * 100)} %)` : ""}
                      </Badge>
                      <Badge variant="outline">{PLATFORM_LABEL[s.info.platform] ?? s.info.platform}</Badge>
                      <Badge variant={s.info.access === "public" ? "success" : s.info.access === "unknown" ? "neutral" : "warning"}>{s.info.accessLabel}</Badge>
                      <Badge variant="outline">{PRICE_VISIBILITY_LABEL[s.info.priceVisibility] ?? s.info.priceVisibility}</Badge>
                      <Badge variant={s.info.robotsStatus === "disallowed" || s.info.robotsStatus === "error" ? "danger" : "outline"}>{ROBOTS_STATUS_LABEL[s.info.robotsStatus] ?? s.info.robotsStatus}</Badge>
                      {s.info.suggestedAdapter ? <Badge variant="outline" className="font-mono">adaptateur suggéré : {s.info.suggestedAdapter}</Badge> : null}
                    </div>
                    <div className="text-xs text-muted">
                      Découverte {s.info.discoveredAt ? formatRelative(s.info.discoveredAt) : formatRelative(s.createdAt)}
                      {s.info.discoveredVia ? ` via ${s.info.discoveredVia}` : ""}
                      {s.info.discoveryQuery ? ` · requête « ${s.info.discoveryQuery} »` : ""}
                      {s.info.robotsDetail ? ` · ${s.info.robotsDetail}` : ""}
                      {s.info.probeError ? ` · sonde : ${s.info.probeError}` : ""}
                    </div>
                  </div>
                  {writable ? <div className="w-full max-w-sm"><DiscoveredSourceActions sourceId={s.id} canActivate={check.ok} blockedReason={check.ok ? null : check.reason} siteUrl={siteUrl} /></div> : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
