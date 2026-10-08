import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext } from "@/features/auth/dal";
import { PageHeader, Callout, EmptyState } from "@/components/ui/page";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { formatDateTime, formatRelative, formatTime } from "@/lib/format";
import { listSyncRuns } from "@/features/integrations/queries";
import { CONNECTION_STATUS_LABEL, formatDuration, formatRunSummary, PROVIDER_LABEL, readStats, SYNC_STATUS_LABEL, SYNC_TRIGGER_LABEL } from "@/features/integrations/format";

export const metadata: Metadata = { title: "Synchronisation" };

const STATUS_BADGE: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = { success: "success", partial: "warning", failed: "danger", running: "info" };

export default async function SyncPage() {
  const ctx = await requireOrgContext();
  const { runs, connections, error } = await listSyncRuns(ctx, 30);
  const lastByConnection = new Map<string, (typeof runs)[number]>();
  for (const r of runs) if (r.source_ref && !lastByConnection.has(r.source_ref)) lastByConnection.set(r.source_ref, r);
  const activeConnections = [...connections.values()].filter((c) => c.status !== "disconnected");

  return (
    <>
      <PageHeader title="Synchronisation" description="Chaque run est tracé : annonces analysées, commandes récupérées, mouvements de stock et erreurs. Rien n'est supposé réussi." actions={<ButtonLink href="/settings/integrations" variant="secondary">Intégrations</ButtonLink>} />
      {error ? (
        <Callout tone="danger" title="Impossible de charger l'historique" className="mb-5">
          {error}
        </Callout>
      ) : null}

      {activeConnections.length > 0 ? (
        <div className="mb-6 grid gap-4 md:grid-cols-2">
          {activeConnections.map((c) => {
            const last = lastByConnection.get(c.id);
            return (
              <Card key={c.id}>
                <CardHeader title={`${PROVIDER_LABEL[c.provider] ?? c.provider} · ${c.external_username ?? "compte inconnu"}`} description={c.last_sync_at ? `Dernière synchronisation : ${formatTime(c.last_sync_at)} (${formatRelative(c.last_sync_at)})` : "Jamais synchronisé"} actions={<Badge variant={c.status === "connected" ? "success" : c.status === "expired" ? "danger" : "warning"}>{CONNECTION_STATUS_LABEL[c.status] ?? c.status}</Badge>} />
                <CardContent className="text-sm">
                  {last ? (
                    <Link href={`/settings/sync/${last.id}` as never} className="hover:underline">
                      {formatRunSummary(last)}
                    </Link>
                  ) : (
                    <span className="text-muted">Aucun run enregistré.</span>
                  )}
                  {c.last_error ? <p className="mt-1 text-xs text-danger">{c.last_error}</p> : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}

      {runs.length === 0 ? (
        <EmptyState title="Aucune synchronisation enregistrée." description="Connectez un canal puis lancez une synchronisation depuis la page Intégrations." action={<ButtonLink href="/settings/integrations" variant="secondary">Aller aux intégrations</ButtonLink>} />
      ) : (
        <Card>
          <CardHeader title="Derniers runs" description={`${runs.length} run(s) les plus récents`} />
          <CardContent className="p-0">
            <Table className="min-w-[960px]">
              <THead>
                <tr>
                  <TH>Début</TH>
                  <TH>Fin</TH>
                  <TH align="right">Durée</TH>
                  <TH>Statut</TH>
                  <TH>Déclencheur</TH>
                  <TH>Canal</TH>
                  <TH align="right">Listings</TH>
                  <TH align="right">Commandes</TH>
                  <TH align="right">Stock</TH>
                  <TH align="right">Erreurs</TH>
                  <TH></TH>
                </tr>
              </THead>
              <TBody>
                {runs.map((r) => {
                  const s = readStats(r.stats);
                  const conn = r.source_ref ? connections.get(r.source_ref) : undefined;
                  return (
                    <TR key={r.id}>
                      <TD className="whitespace-nowrap">{formatDateTime(r.started_at)}</TD>
                      <TD className="whitespace-nowrap text-muted">{r.finished_at ? formatTime(r.finished_at) : "—"}</TD>
                      <TD align="right">{formatDuration(r.duration_ms)}</TD>
                      <TD>
                        <Badge variant={STATUS_BADGE[r.status] ?? "neutral"}>{SYNC_STATUS_LABEL[r.status] ?? r.status}</Badge>
                      </TD>
                      <TD>{SYNC_TRIGGER_LABEL[r.trigger] ?? r.trigger}</TD>
                      <TD className="text-xs">
                        {PROVIDER_LABEL[r.provider] ?? r.provider}
                        {conn?.external_username ? <span className="text-muted"> · {conn.external_username}</span> : null}
                      </TD>
                      <TD align="right" title={`${s.listings_upserted} enregistrées · ${s.listings_ended} terminées · ${s.listings_auto_mapped} auto-associées · ${s.suggestions_created} suggestions`}>
                        {s.listings_fetched}
                      </TD>
                      <TD align="right" title={`${s.orders_created} nouvelles · ${s.orders_updated} mises à jour · ${s.items_unmapped} lignes sans SKU`}>
                        {s.orders_fetched}
                      </TD>
                      <TD align="right" title={`${s.inventory_changes} mouvements · ${s.inventory_pushed} quantités envoyées`}>
                        {s.inventory_changes}
                      </TD>
                      <TD align="right" className={r.error_count > 0 ? "text-danger" : ""}>
                        {r.error_count}
                      </TD>
                      <TD align="right">
                        <Link href={`/settings/sync/${r.id}` as never} className="text-xs text-accent hover:underline">
                          Détail
                        </Link>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
