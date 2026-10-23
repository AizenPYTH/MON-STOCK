import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, RefreshCw, RotateCw } from "lucide-react";
import { requireOrgContext } from "@/features/auth/dal";
import { Alert, Callout, EmptyState } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { MonoTitle, Panel } from "@/components/instrument";
import { cn } from "@/lib/utils";
import { formatDateTime, formatNumber, formatRelative, formatTime } from "@/lib/format";
import { listSyncRuns } from "@/features/integrations/queries";
import { formatDuration, PROVIDER_LABEL, readStats, SYNC_TRIGGER_LABEL } from "@/features/integrations/format";
import { ConnectionStatusBadge, RunStatusBadge, RunSummary } from "@/features/integrations/components/run-status";
import { extraErrorsAfterResume, isBudgetResume, runIssueCount, runStoppedByBudget } from "@/features/integrations/components/sync-status";
import { SettingsSectionHeader } from "@/features/organizations/components/settings-section-header";

export const metadata: Metadata = { title: "Synchronisation" };

export default async function SyncPage() {
  const ctx = await requireOrgContext();
  const { runs, connections, error } = await listSyncRuns(ctx, 30);
  const lastByConnection = new Map<string, (typeof runs)[number]>();
  for (const r of runs) if (r.source_ref && !lastByConnection.has(r.source_ref)) lastByConnection.set(r.source_ref, r);
  const activeConnections = [...connections.values()].filter((c) => c.status !== "disconnected");
  const resumed = runs.filter((r) => runStoppedByBudget(r)).length;

  return (
    <>
      <SettingsSectionHeader
        title="Synchronisation"
        description="Chaque passage est tracé : annonces analysées, commandes récupérées, mouvements de stock et erreurs. Rien n'est supposé réussi : les compteurs reflètent ce qui a réellement été traité."
        actions={
          <ButtonLink href="/settings/integrations" variant="secondary" size="sm">
            Intégrations
          </ButtonLink>
        }
      />
      {error ? (
        <Alert tone="danger" title="Impossible de charger l'historique">
          {error}
        </Alert>
      ) : null}

      {activeConnections.length > 0 ? (
        <section aria-labelledby="connections-title" className="space-y-2">
          <MonoTitle title="Connexions" count={activeConnections.length} as="div" />
          <h3 id="connections-title" className="sr-only">
            Connexions
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            {activeConnections.map((c) => {
              const last = lastByConnection.get(c.id);
              const resume = isBudgetResume(c.last_error);
              const extra = extraErrorsAfterResume(c.last_error);
              return (
                <Panel key={c.id} className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="truncate text-[15px] font-bold text-foreground">
                        {PROVIDER_LABEL[c.provider] ?? c.provider} · {c.external_username ?? "compte inconnu"}
                      </h4>
                      <p className="text-[12.5px] font-semibold text-ink-3">{c.last_sync_at ? `Dernière synchronisation complète ${formatRelative(c.last_sync_at)} (${formatTime(c.last_sync_at)})` : "Jamais synchronisé entièrement"}</p>
                    </div>
                    <ConnectionStatusBadge status={c.status} size="sm" />
                  </div>
                  {last ? (
                    <Link href={`/settings/sync/${last.id}`} className="group flex items-center justify-between gap-2 rounded-xl border border-line-soft bg-surface-2 px-3 py-2.5 transition-colors hover:border-border-strong">
                      <RunSummary run={last} />
                      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-3 group-hover:text-foreground" />
                      <span className="sr-only">Détail du dernier passage</span>
                    </Link>
                  ) : (
                    <span className="text-[13px] font-semibold text-ink-3">Aucun passage enregistré.</span>
                  )}
                  {c.last_error && resume ? (
                    <p className="flex items-start gap-1.5 text-xs font-semibold text-info-ink">
                      <RotateCw aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
                      <span>
                        Budget de temps atteint : reprise automatique au prochain passage, aucune donnée perdue.
                        {extra > 0 ? ` ${extra} autre(s) erreur(s) à consulter.` : ""}
                      </span>
                    </p>
                  ) : c.last_error ? (
                    <p className="text-xs font-semibold text-danger">{c.last_error}</p>
                  ) : null}
                </Panel>
              );
            })}
          </div>
        </section>
      ) : null}

      {resumed > 0 ? (
        <Callout tone="info" icon={<RotateCw />} title="« Reprise prévue » n'est pas une erreur">
          Un passage qui atteint son budget de temps s&apos;arrête proprement après la dernière étape confirmée ; le passage suivant reprend là où il s&apos;est arrêté. Seules les erreurs réelles sont comptées dans la colonne Erreurs.
        </Callout>
      ) : null}

      {runs.length === 0 ? (
        <EmptyState
          icon={<RefreshCw />}
          title="Aucune synchronisation enregistrée"
          description="Connectez un canal puis lancez une synchronisation depuis la page Intégrations : chaque passage apparaîtra ici avec ses résultats réels."
          action={
            <ButtonLink href="/settings/integrations" variant="secondary">
              Aller aux intégrations
            </ButtonLink>
          }
        />
      ) : (
        <section aria-labelledby="runs-title" className="space-y-2">
          <MonoTitle title="Derniers passages" count={runs.length} as="div" />
          <h3 id="runs-title" className="sr-only">
            Derniers passages
          </h3>
          <Table className="min-w-[760px]" stackOnMobile caption="Derniers passages de synchronisation">
            <THead>
              <tr>
                <TH>Démarré</TH>
                <TH>Statut</TH>
                <TH align="right">Durée</TH>
                <TH align="right">Annonces</TH>
                <TH align="right">Commandes</TH>
                <TH align="right">Stock</TH>
                <TH align="right">Erreurs</TH>
                <TH>
                  <span className="sr-only">Détail</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {runs.map((r) => {
                const s = readStats(r.stats);
                const conn = r.source_ref ? connections.get(r.source_ref) : undefined;
                const issues = runIssueCount(r);
                return (
                  <TR key={r.id} className="font-semibold">
                    <TD primary className="whitespace-nowrap">
                      <Link href={`/settings/sync/${r.id}`} className="text-foreground hover:underline tnum">
                        {formatDateTime(r.started_at)}
                      </Link>
                      <span className="block text-xs font-semibold text-ink-3">
                        {SYNC_TRIGGER_LABEL[r.trigger] ?? r.trigger} · {PROVIDER_LABEL[r.provider] ?? r.provider}
                        {conn?.external_username ? ` · ${conn.external_username}` : ""}
                      </span>
                    </TD>
                    <TD label="Statut">
                      <RunStatusBadge run={r} />
                    </TD>
                    <TD label="Durée" align="right" className="text-muted">
                      {formatDuration(r.duration_ms)}
                    </TD>
                    <TD label="Annonces" align="right" className="font-bold" title={`${s.listings_upserted} enregistrées · ${s.listings_ended} terminées · ${s.listings_auto_mapped} auto-associées · ${s.suggestions_created} suggestions`}>
                      {formatNumber(s.listings_fetched)}
                    </TD>
                    <TD label="Commandes" align="right" className="font-bold" title={`${s.orders_created} nouvelles · ${s.orders_updated} mises à jour · ${s.items_unmapped} lignes sans SKU`}>
                      {formatNumber(s.orders_fetched)}
                    </TD>
                    <TD label="Stock" align="right" className="font-bold" title={`${s.inventory_changes} mouvements · ${s.inventory_pushed} quantités envoyées`}>
                      {formatNumber(s.inventory_changes)}
                    </TD>
                    <TD label="Erreurs" align="right" className={cn("font-bold", issues > 0 ? "text-danger" : "text-muted")} title={runStoppedByBudget(r) ? "L'arrêt programmé (budget de temps atteint) n'est pas compté comme une erreur." : undefined}>
                      {formatNumber(issues)}
                    </TD>
                    <TD align="right">
                      <Link href={`/settings/sync/${r.id}`} aria-label={`Détail du passage du ${formatDateTime(r.started_at)}`} className="hidden h-9 w-9 items-center justify-center rounded-lg text-ink-3 sm:inline-flex hover:bg-line-soft hover:text-foreground">
                        <ChevronRight aria-hidden="true" className="h-4 w-4" />
                      </Link>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </section>
      )}
    </>
  );
}
