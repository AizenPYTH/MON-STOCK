import Link from "next/link";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { formatRelative } from "@/lib/format";
import type { SourceStatusItem } from "@/services/sourcing/search";
import { SOURCE_STATUS_LABEL, SOURCE_TYPE_LABEL } from "@/features/sourcing/labels";

export function SourcesPanel({ sources, accountConnectors = 0 }: { sources: SourceStatusItem[]; accountConnectors?: number }) {
  const connected = sources.filter((s) => s.connected).length;
  return (
    <Card>
      <CardHeader title="Sources" description={sources.length === 0 ? "Aucune source configurée." : `${connected} connectée(s) sur ${sources.length}.`} actions={<ButtonLink href="/suppliers" variant="ghost" size="sm">Gérer</ButtonLink>} />
      <CardContent className="p-0">
        {sources.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">Ajoutez un fournisseur, importez un flux CSV/XML/JSON ou déclarez une page publique autorisée pour alimenter le moteur.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {sources.slice(0, 30).map((s) => (
              <li key={`${s.kind}-${s.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 truncate">
                    <StatusDot tone={s.connected ? "success" : s.status === "error" ? "danger" : "neutral"} />
                    <span className="truncate font-medium">{s.name}</span>
                  </div>
                  <div className="truncate text-xs text-muted">
                    {s.supplierName} · {SOURCE_TYPE_LABEL[s.sourceType] ?? s.sourceType}
                    {s.lastSyncAt ? ` · sync ${formatRelative(s.lastSyncAt)}` : ""}
                  </div>
                  {s.lastError ? <div className="truncate text-xs text-danger">{s.lastError}</div> : null}
                </div>
                <Badge variant={s.connected ? "success" : s.status === "error" ? "danger" : "neutral"}>{s.connected ? "Connectée" : SOURCE_STATUS_LABEL[s.status] ?? "Source non connectée"}</Badge>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-border px-5 py-2 text-xs text-muted">
          {accountConnectors > 0 ? (
            <>
              Compte fournisseur / API : {accountConnectors} connecteur(s) disponible(s) — <Link href="/suppliers" className="underline">connecter un compte</Link> (identifiants chiffrés côté serveur).
            </>
          ) : (
            <>
              Compte fournisseur / API : <Link href="/suppliers" className="underline">aucun connecteur disponible pour l&apos;instant</Link>.
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
