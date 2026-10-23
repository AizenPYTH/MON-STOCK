import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RotateCw } from "lucide-react";
import { canWrite, requireOrgContext } from "@/features/auth/dal";
import { Callout } from "@/components/ui/page";
import { MonoTitle, Panel } from "@/components/instrument";
import { cn } from "@/lib/utils";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { ButtonLink } from "@/components/ui/button";
import { formatDateTime, formatNumber } from "@/lib/format";
import { getSyncRunDetail } from "@/features/integrations/queries";
import { formatDuration, PROVIDER_LABEL, readStats, SYNC_TRIGGER_LABEL } from "@/features/integrations/format";
import { SyncNowForm } from "@/features/integrations/components/sync-now-form";
import { RunStatusBadge } from "@/features/integrations/components/run-status";
import { BUDGET_RESUME_CODE, runIssueCount, runStoppedByBudget } from "@/features/integrations/components/sync-status";
import { SettingsSectionHeader } from "@/features/organizations/components/settings-section-header";

export const metadata: Metadata = { title: "Détail de la synchronisation" };

/**
 * W-10 : durée maximale (s) des Server Actions de la page, dont « Synchroniser maintenant ». Valeur
 * littérale exigée par Next.js : DOIT rester égale à WEB_SYNC_ACTION_MAX_DURATION_S (test unitaire).
 */
export const maxDuration = 120;

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
  // Arrêt programmé (budget de temps) : reprise normale au prochain passage, pas une erreur.
  const resume = runStoppedByBudget(run);
  const issues = runIssueCount(run);
  const realErrors = errors.filter((e) => e.code !== BUDGET_RESUME_CODE);

  const retry = needsReconnect ? (
    <ButtonLink href="/settings/integrations" variant="secondary" size="sm">
      Reconnecter eBay
    </ButtonLink>
  ) : canRetry ? (
    <SyncNowForm connectionId={connection!.id} label={resume ? "Reprendre maintenant" : "Relancer la synchronisation"} pendingText="Synchronisation en cours…" variant="secondary" size="sm" />
  ) : null;

  return (
    <>
      <SettingsSectionHeader
        back={{ href: "/settings/sync", label: "Synchronisation" }}
        title={`Passage du ${formatDateTime(run.started_at)}`}
        description={`${PROVIDER_LABEL[run.provider] ?? run.provider}${connection?.external_username ? ` · ${connection.external_username}` : ""} · déclenchement ${SYNC_TRIGGER_LABEL[run.trigger]?.toLowerCase() ?? run.trigger}`}
        actions={<RunStatusBadge run={run} size="md" />}
      />

      {resume ? (
        <Callout tone="info" icon={<RotateCw />} title="Reprise au prochain passage" action={retry}>
          Ce passage a atteint son budget de temps et s&apos;est arrêté proprement après la dernière étape confirmée. Tout ce qui est compté ci-dessous est enregistré ; aucune donnée n&apos;est perdue et le passage suivant reprend automatiquement la suite.
          {issues > 0 ? <span className="mt-1 block text-xs">{issues} autre(s) erreur(s) réelle(s) sur ce passage, listée(s) ci-dessous : elles seront reprises au prochain run.</span> : null}
        </Callout>
      ) : run.status === "failed" || run.status === "partial" ? (
        <Callout tone={run.status === "failed" ? "danger" : "warning"} title={run.status === "failed" ? "Échec de la synchronisation" : "Synchronisation partielle"} action={retry}>
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
          Ce run n&apos;est pas terminé. Rechargez la page pour voir son résultat (un run sans fin enregistrée après 15 min est marqué interrompu).
        </Callout>
      ) : null}

      <Panel className="p-4 sm:p-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          {[
            { label: "Statut", value: <RunStatusBadge run={run} /> },
            { label: "Début", value: formatDateTime(run.started_at) },
            { label: "Fin", value: run.finished_at ? formatDateTime(run.finished_at) : "En cours" },
            { label: "Durée", value: formatDuration(run.duration_ms) },
            { label: "Enregistrements traités", value: formatNumber(run.records_processed) },
            { label: "Identifiant", value: <span className="ms-code break-all text-xs font-medium text-muted-strong">{run.id}</span> },
          ].map((it) => (
            <div key={it.label} className="min-w-0">
              <dt className="ms-mono text-[10.5px] leading-[14px] text-ink-3">{it.label}</dt>
              <dd className="mt-1 text-[14px] font-bold text-foreground tnum">{it.value}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <section aria-labelledby="counters-title" className="space-y-2">
        <MonoTitle title="Ce qui a été traité" as="div" />
        <h3 id="counters-title" className="sr-only">
          Ce qui a été traité
        </h3>
        <Panel className="overflow-hidden">
          <dl className="-mb-px -mr-px grid grid-cols-2 sm:grid-cols-4">
            {[
              { label: "Annonces analysées", value: s.listings_fetched, hint: `${formatNumber(s.listings_upserted)} enregistrées · ${formatNumber(s.listings_ended)} terminées` },
              { label: "Associées automatiquement", value: s.listings_auto_mapped, hint: `${formatNumber(s.suggestions_created)} suggestion(s) créée(s)` },
              { label: "Commandes récupérées", value: s.orders_fetched, hint: `${formatNumber(s.orders_created)} nouvelles · ${formatNumber(s.orders_updated)} mises à jour` },
              { label: "Lignes sans SKU", value: s.items_unmapped, hint: "Ventes non déduites du stock", tone: s.items_unmapped > 0 ? "warning" : undefined },
              { label: "Stocks modifiés", value: s.inventory_changes, hint: "Mouvements de stock appliqués" },
              { label: "Quantités envoyées", value: s.inventory_pushed, hint: "Vers le canal (si activé)" },
              { label: "Erreurs", value: issues, hint: issues > 0 ? "Détail ci-dessous" : resume ? "Arrêt programmé non compté" : "Aucune", tone: issues > 0 ? "danger" : undefined },
            ].map((it) => (
              <div key={it.label} className="min-w-0 border-b border-r border-line-soft px-4 py-3">
                <dt className="ms-mono truncate text-[10.5px] leading-[14px] text-ink-3">{it.label}</dt>
                <dd className={cn("mt-1 text-[22px] font-semibold leading-7 tracking-[-0.3px] tnum", it.tone === "danger" ? "text-danger" : it.tone === "warning" ? "text-warning" : "text-foreground")}>{formatNumber(it.value)}</dd>
                <dd className="text-xs font-semibold leading-4 text-ink-3">
                  {it.hint}
                </dd>
              </div>
            ))}
          </dl>
        </Panel>
      </section>

      <section aria-labelledby="errors-title" className="space-y-2">
        <MonoTitle title="Journal du passage" count={errors.length} as="div" right={errors.length > 0 ? <span className="text-xs font-semibold text-ink-3">Aucun secret n&apos;est enregistré dans les détails.</span> : undefined} />
        <h3 id="errors-title" className="sr-only">
          Journal du passage
        </h3>
        {errors.length === 0 ? (
          <Panel className="px-4 py-5 text-sm font-semibold text-muted">Aucune erreur sur ce passage.</Panel>
        ) : (
          <Table className="min-w-[760px]" stackOnMobile caption={`Journal du passage : ${realErrors.length} erreur(s)${resume ? " et l'arrêt programmé" : ""}`}>
            <THead>
              <tr>
                <TH>Type</TH>
                <TH>Message</TH>
                <TH>Entité</TH>
                <TH>Détails</TH>
              </tr>
            </THead>
            <TBody>
              {errors.map((e) => {
                const isResume = e.code === BUDGET_RESUME_CODE;
                return (
                  <TR key={e.id} className="align-top">
                    <TD primary>
                      <span className="flex flex-col items-start gap-1">
                        {isResume ? (
                          <StatusBadge tone="info" icon={<RotateCw />}>
                            Reprise programmée
                          </StatusBadge>
                        ) : (
                          <StatusBadge tone="danger">Erreur</StatusBadge>
                        )}
                        <span className="ms-code text-[11px] font-medium text-ink-3">{e.code}</span>
                      </span>
                    </TD>
                    <TD label="Message" className="max-w-[420px] whitespace-pre-wrap text-left text-sm font-medium text-foreground">
                      {e.message}
                    </TD>
                    <TD label="Entité" className="text-xs text-muted">
                      {e.entity_type ?? "—"}
                      {e.entity_ref ? <span className="ms-code block break-all">{e.entity_ref}</span> : null}
                    </TD>
                    <TD label="Détails">
                      {e.details && Object.keys(e.details as object).length > 0 ? (
                        <details>
                          <summary className="inline-flex min-h-8 cursor-pointer items-center text-xs font-bold text-interactive">Afficher</summary>
                          <pre className="ms-code mt-1 max-w-[360px] overflow-x-auto rounded-lg border border-line-soft bg-surface-2 p-2 text-left text-[11px] text-muted-strong">{JSON.stringify(e.details, null, 2)}</pre>
                        </details>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </section>
    </>
  );
}
