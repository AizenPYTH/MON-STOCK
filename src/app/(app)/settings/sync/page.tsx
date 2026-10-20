import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireOrgContext } from "@/features/auth/dal";
import { Callout, EmptyState } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Panel } from "@/components/instrument";
import { cn } from "@/lib/utils";
import { formatDateTime, formatRelative, formatTime } from "@/lib/format";
import { listSyncRuns } from "@/features/integrations/queries";
import { CONNECTION_STATUS_LABEL, formatDuration, formatRunSummary, PROVIDER_LABEL, readStats, SYNC_STATUS_LABEL, SYNC_TRIGGER_LABEL } from "@/features/integrations/format";
import { connectionTone } from "@/features/integrations/components/labels";
import { SettingsSectionHeader } from "@/features/organizations/components/settings-section-header";

export const metadata: Metadata = { title: "Synchronisation" };

const STATUS_BADGE: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = { success: "success", partial: "warning", failed: "danger", running: "info" };
const DOT: Record<string, string> = { success: "bg-success", warning: "bg-amber", danger: "bg-red", info: "bg-info", neutral: "bg-ink-4" };

export default async function SyncPage() {
  const ctx = await requireOrgContext();
  const { runs, connections, error } = await listSyncRuns(ctx, 30);
  const lastByConnection = new Map<string, (typeof runs)[number]>();
  for (const r of runs) if (r.source_ref && !lastByConnection.has(r.source_ref)) lastByConnection.set(r.source_ref, r);
  const activeConnections = [...connections.values()].filter((c) => c.status !== "disconnected");

  return (
    <>
      <SettingsSectionHeader
        title="Synchronisation"
        description="Chaque passage est tracé : annonces analysées, commandes récupérées, mouvements de stock et erreurs."
        actions={
          <ButtonLink href="/settings/integrations" variant="secondary" size="sm">
            Intégrations
          </ButtonLink>
        }
      />
      {error ? (
        <Callout tone="danger" title="Impossible de charger l'historique">
          {error}
        </Callout>
      ) : null}

      {activeConnections.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {activeConnections.map((c) => {
            const last = lastByConnection.get(c.id);
            const tone = connectionTone(c.status);
            return (
              <Panel key={c.id} className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-[15px] font-bold text-foreground">
                      {PROVIDER_LABEL[c.provider] ?? c.provider} · {c.external_username ?? "compte inconnu"}
                    </h3>
                    <p className="text-[12.5px] font-semibold text-ink-3">{c.last_sync_at ? `Dernière synchronisation ${formatRelative(c.last_sync_at)} (${formatTime(c.last_sync_at)})` : "Jamais synchronisé"}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-bold text-foreground">
                    <span aria-hidden="true" className={cn("h-[7px] w-[7px] rounded-full", DOT[tone])} />
                    {CONNECTION_STATUS_LABEL[c.status] ?? c.status}
                  </span>
                </div>
                {last ? (
                  <Link href={`/settings/sync/${last.id}` as never} className="text-[13px] font-semibold text-muted hover:text-foreground hover:underline">
                    {formatRunSummary(last)}
                  </Link>
                ) : (
                  <span className="text-[13px] font-semibold text-ink-3">Aucun passage enregistré.</span>
                )}
                {c.last_error ? <p className="text-xs font-semibold text-danger">{c.last_error}</p> : null}
              </Panel>
            );
          })}
        </div>
      ) : null}

      {runs.length === 0 ? (
        <EmptyState title="Aucune synchronisation enregistrée." description="Connectez un canal puis lancez une synchronisation depuis la page Intégrations." action={<ButtonLink href="/settings/integrations" variant="secondary">Aller aux intégrations</ButtonLink>} />
      ) : (
        <section aria-labelledby="runs-title" className="space-y-2">
          <h3 id="runs-title" className="ms-mono text-[11px] leading-[14px] text-muted">
            Derniers passages <span className="ms-code text-foreground">{runs.length}</span>
          </h3>
          <Table className="min-w-[860px]">
            <THead>
              <tr>
                <TH>Démarré</TH>
                <TH align="right">Durée</TH>
                <TH>Déclencheur</TH>
                <TH>Canal</TH>
                <TH>Statut</TH>
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
                return (
                  <TR key={r.id} className="font-semibold">
                    <TD className="whitespace-nowrap">
                      <Link href={`/settings/sync/${r.id}` as never} className="hover:underline">
                        {formatDateTime(r.started_at)}
                      </Link>
                    </TD>
                    <TD align="right" className="text-muted">
                      {formatDuration(r.duration_ms)}
                    </TD>
                    <TD className="text-muted">{SYNC_TRIGGER_LABEL[r.trigger] ?? r.trigger}</TD>
                    <TD className="text-xs text-muted">
                      {PROVIDER_LABEL[r.provider] ?? r.provider}
                      {conn?.external_username ? <span> · {conn.external_username}</span> : null}
                    </TD>
                    <TD>
                      <Badge variant={STATUS_BADGE[r.status] ?? "neutral"}>{SYNC_STATUS_LABEL[r.status] ?? r.status}</Badge>
                    </TD>
                    <TD align="right" className="font-bold" title={`${s.listings_upserted} enregistrées · ${s.listings_ended} terminées · ${s.listings_auto_mapped} auto-associées · ${s.suggestions_created} suggestions`}>
                      {s.listings_fetched}
                    </TD>
                    <TD align="right" className="font-bold" title={`${s.orders_created} nouvelles · ${s.orders_updated} mises à jour · ${s.items_unmapped} lignes sans SKU`}>
                      {s.orders_fetched}
                    </TD>
                    <TD align="right" className="font-bold" title={`${s.inventory_changes} mouvements · ${s.inventory_pushed} quantités envoyées`}>
                      {s.inventory_changes}
                    </TD>
                    <TD align="right" className={cn("font-bold", r.error_count > 0 ? "text-danger" : "")}>
                      {r.error_count}
                    </TD>
                    <TD align="right">
                      <Link href={`/settings/sync/${r.id}` as never} aria-label={`Détail du passage du ${formatDateTime(r.started_at)}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 hover:bg-line-soft hover:text-foreground">
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
      <p className="text-[12.5px] font-semibold text-ink-3">Rien n&apos;est supposé réussi : les compteurs reflètent ce qui a réellement été traité.</p>
    </>
  );
}
