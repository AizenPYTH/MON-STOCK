import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrgContext } from "@/features/auth/dal";
import { PageHeader, DescriptionList, Stat, EmptyState, Callout } from "@/components/ui/page";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { getSyncRunDetail } from "@/features/integrations/queries";
import { formatDuration, formatRunSummary, PROVIDER_LABEL, readStats, SYNC_STATUS_LABEL, SYNC_TRIGGER_LABEL } from "@/features/integrations/format";

export const metadata: Metadata = { title: "Détail de la synchronisation" };

const STATUS_BADGE: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = { success: "success", partial: "warning", failed: "danger", running: "info" };

export default async function SyncRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const ctx = await requireOrgContext();
  const { runId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(runId)) notFound();
  const detail = await getSyncRunDetail(ctx, runId);
  if (!detail) notFound();
  const { run, errors, connection } = detail;
  const s = readStats(run.stats);

  return (
    <>
      <PageHeader
        eyebrow="Synchronisation"
        title={formatRunSummary(run)}
        description={`${PROVIDER_LABEL[run.provider] ?? run.provider}${connection?.external_username ? ` · ${connection.external_username}` : ""} · déclenchement ${SYNC_TRIGGER_LABEL[run.trigger]?.toLowerCase() ?? run.trigger}`}
        actions={<ButtonLink href="/settings/sync" variant="secondary">Historique</ButtonLink>}
      />
      {run.status === "failed" && run.error_summary ? (
        <Callout tone="danger" title="Échec" className="mb-5" action={connection?.status === "expired" ? <ButtonLink href="/settings/integrations" variant="secondary" size="sm">Reconnecter eBay</ButtonLink> : null}>
          {run.error_summary}
        </Callout>
      ) : null}

      <Card className="mb-6">
        <CardContent>
          <DescriptionList
            items={[
              { label: "Statut", value: <Badge variant={STATUS_BADGE[run.status] ?? "neutral"}>{SYNC_STATUS_LABEL[run.status] ?? run.status}</Badge> },
              { label: "Début", value: formatDateTime(run.started_at) },
              { label: "Fin", value: run.finished_at ? formatDateTime(run.finished_at) : "En cours" },
              { label: "Durée", value: formatDuration(run.duration_ms) },
              { label: "Enregistrements traités", value: run.records_processed },
              { label: "Identifiant", value: <span className="font-mono text-xs">{run.id}</span> },
            ]}
          />
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Listings analysés" value={s.listings_fetched} hint={`${s.listings_upserted} enregistrés · ${s.listings_ended} terminés`} />
        <Stat label="Associés automatiquement" value={s.listings_auto_mapped} hint={`${s.suggestions_created} suggestion(s) créée(s)`} />
        <Stat label="Commandes récupérées" value={s.orders_fetched} hint={`${s.orders_created} nouvelles · ${s.orders_updated} mises à jour`} />
        <Stat label="Lignes sans SKU" value={s.items_unmapped} tone={s.items_unmapped > 0 ? "warning" : "neutral"} hint="Ventes non déduites du stock" />
        <Stat label="Stocks modifiés" value={s.inventory_changes} hint="Mouvements de stock appliqués" />
        <Stat label="Quantités envoyées" value={s.inventory_pushed} hint="Vers le canal (si activé)" />
        <Stat label="Erreurs" value={s.errors} tone={s.errors > 0 ? "danger" : "neutral"} />
      </div>

      <Card>
        <CardHeader title="Erreurs" description={errors.length === 0 ? "Aucune erreur sur ce run." : `${errors.length} erreur(s) — aucun secret n'est enregistré dans les détails.`} />
        <CardContent className="p-0">
          {errors.length === 0 ? (
            <EmptyState title="Aucune erreur" className="border-0" />
          ) : (
            <Table className="min-w-[720px]">
              <THead>
                <tr>
                  <TH>Code</TH>
                  <TH>Message</TH>
                  <TH>Entité</TH>
                  <TH>Détails</TH>
                </tr>
              </THead>
              <TBody>
                {errors.map((e) => (
                  <TR key={e.id} className="align-top">
                    <TD className="font-mono text-xs">{e.code}</TD>
                    <TD className="max-w-[420px] whitespace-pre-wrap text-sm">{e.message}</TD>
                    <TD className="text-xs text-muted">
                      {e.entity_type ?? "—"}
                      {e.entity_ref ? <span className="block font-mono">{e.entity_ref}</span> : null}
                    </TD>
                    <TD>
                      {e.details && Object.keys(e.details as object).length > 0 ? (
                        <details>
                          <summary className="cursor-pointer text-xs text-muted">Afficher</summary>
                          <pre className="mt-1 max-w-[360px] overflow-x-auto rounded bg-surface-muted p-2 text-[11px]">{JSON.stringify(e.details, null, 2)}</pre>
                        </details>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
