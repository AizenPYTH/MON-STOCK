import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canWrite, requireOrgContext } from "@/features/auth/dal";
import { Callout } from "@/components/ui/page";
import { Panel } from "@/components/instrument";
import { cn } from "@/lib/utils";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { getSyncRunDetail } from "@/features/integrations/queries";
import { formatDuration, formatRunSummary, PROVIDER_LABEL, readStats, SYNC_STATUS_LABEL, SYNC_TRIGGER_LABEL } from "@/features/integrations/format";
import { SyncNowForm } from "@/features/integrations/components/sync-now-form";
import { SettingsSectionHeader } from "@/features/organizations/components/settings-section-header";

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
  const needsReconnect = connection?.status === "expired" || connection?.status === "pending";
  const canRetry = canWrite(ctx.role) && Boolean(connection) && (connection?.status === "connected" || connection?.status === "error");

  return (
    <>
      <SettingsSectionHeader
        back={{ href: "/settings/sync", label: "Synchronisation" }}
        title={`Passage du ${formatDateTime(run.started_at)}`}
        description={`${formatRunSummary(run)} — ${PROVIDER_LABEL[run.provider] ?? run.provider}${connection?.external_username ? ` · ${connection.external_username}` : ""} · déclenchement ${SYNC_TRIGGER_LABEL[run.trigger]?.toLowerCase() ?? run.trigger}`}
      />
      {run.status === "failed" || run.status === "partial" ? (
        <Callout
          tone={run.status === "failed" ? "danger" : "warning"}
          title={run.status === "failed" ? "Échec de la synchronisation" : "Synchronisation partielle"}
          
          action={
            needsReconnect ? (
              <ButtonLink href="/settings/integrations" variant="secondary" size="sm">
                Reconnecter eBay
              </ButtonLink>
            ) : canRetry ? (
              <SyncNowForm connectionId={connection!.id} label="Relancer la synchronisation" pendingText="Synchronisation en cours…" variant="secondary" size="sm" />
            ) : null
          }
        >
          {run.error_summary ?? (run.status === "failed" ? "La synchronisation a échoué." : "Certaines données n'ont pas pu être traitées.")}
          <span className="mt-1 block text-xs">
            {run.status === "partial"
              ? "Les éléments traités sont enregistrés ; les éléments en erreur (listés ci-dessous) seront repris automatiquement au prochain run."
              : needsReconnect
                ? "L'autorisation eBay n'est plus valide : reconnectez le compte depuis la page Intégrations."
                : "Aucune commande n'est perdue : la prochaine synchronisation reprend à partir du dernier point validé."}
          </span>
        </Callout>
      ) : null}
      {run.status === "running" ? (
        <Callout tone="info" title="Synchronisation en cours">
          Ce run n'est pas terminé. Rechargez la page pour voir son résultat (un run sans fin enregistrée après 15 min est marqué interrompu).
        </Callout>
      ) : null}

      <Panel className="p-4 sm:p-5">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
          {[
            { label: "Statut", value: <Badge variant={STATUS_BADGE[run.status] ?? "neutral"}>{SYNC_STATUS_LABEL[run.status] ?? run.status}</Badge> },
            { label: "Début", value: formatDateTime(run.started_at) },
            { label: "Fin", value: run.finished_at ? formatDateTime(run.finished_at) : "En cours" },
            { label: "Durée", value: formatDuration(run.duration_ms) },
            { label: "Enregistrements traités", value: run.records_processed },
            { label: "Identifiant", value: <span className="ms-code break-all text-xs">{run.id}</span> },
          ].map((it) => (
            <div key={it.label} className="min-w-0">
              <dt className="ms-mono text-[10px] leading-[13px] text-ink-3">{it.label}</dt>
              <dd className="mt-1 text-[14px] font-bold text-foreground tnum">{it.value}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel className="overflow-hidden">
        <dl className="grid grid-cols-2 py-1 sm:grid-cols-4">
          {[
            { label: "Annonces analysées", value: s.listings_fetched, hint: `${s.listings_upserted} enregistrées · ${s.listings_ended} terminées` },
            { label: "Associées automatiquement", value: s.listings_auto_mapped, hint: `${s.suggestions_created} suggestion(s) créée(s)` },
            { label: "Commandes récupérées", value: s.orders_fetched, hint: `${s.orders_created} nouvelles · ${s.orders_updated} mises à jour` },
            { label: "Lignes sans SKU", value: s.items_unmapped, hint: "Ventes non déduites du stock", tone: s.items_unmapped > 0 ? "warning" : undefined },
            { label: "Stocks modifiés", value: s.inventory_changes, hint: "Mouvements de stock appliqués" },
            { label: "Quantités envoyées", value: s.inventory_pushed, hint: "Vers le canal (si activé)" },
            { label: "Erreurs", value: s.errors, hint: s.errors > 0 ? "Détail ci-dessous" : "Aucune", tone: s.errors > 0 ? "danger" : undefined },
          ].map((it) => (
            <div key={it.label} className="min-w-0 px-4 py-3">
              <dt className="ms-mono truncate text-[10px] leading-[13px] text-ink-3">{it.label}</dt>
              <dd className={cn("mt-1 text-[20px] font-bold leading-[26px] tnum", it.tone === "danger" ? "text-danger" : it.tone === "warning" ? "text-warning" : "text-foreground")}>{it.value}</dd>
              <dd className="truncate text-xs font-semibold text-ink-3">{it.hint}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <section aria-labelledby="errors-title" className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="errors-title" className="ms-mono text-[11px] leading-[14px] text-muted">
            Erreurs <span className="ms-code text-foreground">{errors.length}</span>
          </h3>
          {errors.length > 0 ? <span className="text-xs font-semibold text-ink-3">Aucun secret n&apos;est enregistré dans les détails.</span> : null}
        </div>
          {errors.length === 0 ? (
            <Panel className="px-4 py-5 text-sm font-semibold text-muted">Aucune erreur sur ce passage.</Panel>
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
                    <TD className="ms-code text-xs">{e.code}</TD>
                    <TD className="max-w-[420px] whitespace-pre-wrap text-sm">{e.message}</TD>
                    <TD className="text-xs text-muted">
                      {e.entity_type ?? "—"}
                      {e.entity_ref ? <span className="ms-code block">{e.entity_ref}</span> : null}
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
      </section>
    </>
  );
}
