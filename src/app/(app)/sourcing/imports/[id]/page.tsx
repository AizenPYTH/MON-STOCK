import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CircleCheck, Download, TriangleAlert } from "lucide-react";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { ButtonLink } from "@/components/ui/button";
import { FilterChip, MonoTitle, MonoLabel, Panel, Paper, Scene, SceneHeader, SplitBar, StageStats } from "@/components/instrument";
import { getImportJob, listImportJobs } from "@/services/sourcing/catalog-import";
import { isAppError } from "@/lib/errors";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { durationLabel, fileSizeLabel, ignoredCount, IMPORT_MODE_LABEL, IMPORT_STATUS_LABEL, IMPORT_STATUS_SHORT, IMPORT_STATUS_TONE, importSegments, isIssueKind, ISSUE_KIND_HINT, ISSUE_KIND_LABEL, issuesCsv, upToDateCount, type IssueKind } from "@/features/catalog-imports/labels";
import { StatusPill } from "@/features/catalog-imports/components/status-pill";
import { ImportProgress } from "@/features/catalog-imports/components/import-progress";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { buttonClasses } from "@/components/ui/button";
import { ImportHistory } from "@/features/catalog-imports/components/import-history";

export const metadata: Metadata = { title: "Rapport d'import" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHOWN_ROWS = 300;
const MESSAGE_TONE = { success: "border-success-line bg-success-soft text-success-ink", warning: "border-warning-line bg-warning-soft text-warning-ink", danger: "border-danger-line bg-danger-soft text-danger-ink", info: "border-info-line bg-info-soft text-info-ink", neutral: "border-border bg-surface-2 text-muted-strong" } as const;
/** Type de ligne → statut lisible (icône + texte) : bloquante en rouge, à vérifier en ambre, simple remarque en bleu. */
const KIND_TONE: Record<IssueKind, StatusTone> = { invalid: "danger", rejected: "danger", duplicate: "neutral", unrecognized: "warning", warning: "info" };

export default async function ImportJobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  let job: Awaited<ReturnType<typeof getImportJob>>;
  try {
    job = await getImportJob(ctx, id);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const others = job.supplierId ? await listImportJobs(ctx, { supplierId: job.supplierId, limit: 6 }) : [];
  const kindParam = Array.isArray(sp.kind) ? sp.kind[0] : sp.kind;
  const kind: IssueKind | null = isIssueKind(kindParam) ? kindParam : null;
  const byKind = new Map<IssueKind, number>();
  for (const i of job.issues) byKind.set(i.kind, (byKind.get(i.kind) ?? 0) + 1);
  const kinds = [...byKind.entries()].sort((a, b) => b[1] - a[1]);
  const shown = kind ? job.issues.filter((i) => i.kind === kind) : job.issues;
  const written = job.status === "completed" || job.status === "partial";
  const c = job.counts;
  const tone = IMPORT_STATUS_TONE[job.status];
  const duration = durationLabel(job.startedAt, job.finishedAt);
  const retryHref = `/sourcing/imports/new?${new URLSearchParams({ ...(job.supplierId ? { supplierId: job.supplierId } : {}), ...(job.supplierName ? { supplierName: job.supplierName } : {}) }).toString()}`;
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(issuesCsv(job))}`;
  const csvName = `rapport-import-${(job.supplierName ?? "fournisseur").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${job.startedAt.slice(0, 10)}.csv`;
  const source = job.origin === "remote_feed" ? "Flux distant" : (job.fileName ?? "Fichier");
  const message =
    job.message ??
    (job.status === "quarantined" ? "Import suspendu par le contrôle de qualité : rien n'a été écrit." : job.status === "failed" ? "Le fichier n'a pas été importé. Aucun détail fourni par le serveur." : job.status === "skipped_duplicate" ? "Fichier déjà importé : rien n'a été modifié." : null);

  return (
    <>
      <Scene>
        <SceneHeader back={{ href: "/sourcing/imports", label: "Imports" }} eyebrow="Sourcing · rapport d'import" title={`Rapport · ${job.supplierName ?? "fournisseur inconnu"}`} />
        <p className="ms-code mt-1.5 break-words text-[11px] leading-[15px] text-on-night-muted">
          {[source, formatDateTime(job.startedAt), IMPORT_MODE_LABEL[job.mode], duration ? `en ${duration}` : null].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-5 flex flex-wrap items-end gap-x-14 gap-y-5">
          <div className="flex flex-col gap-1">
            <MonoLabel onNight>{written ? "Offres à jour après l'import" : "Lignes lues"}</MonoLabel>
            <p className="flex flex-wrap items-baseline gap-x-2.5">
              <span className="text-[48px] font-light leading-[50px] tracking-[-1.8px] text-on-night tnum">{formatNumber(written ? upToDateCount(c) : c.read)}</span>
              <span className="text-xl font-medium text-on-night-muted">{written ? "offres à jour" : "rien n'a été écrit"}</span>
            </p>
            <span className="mt-1 inline-flex items-center gap-2 text-[13px] font-bold">
              <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", tone === "success" ? "bg-mint" : tone === "danger" ? "bg-danger-on-night" : tone === "warning" ? "bg-amber" : "bg-on-night-muted")} />
              <span className={tone === "success" ? "text-mint" : tone === "danger" ? "text-danger-on-night" : tone === "warning" ? "text-amber" : "text-on-night-muted"}>{IMPORT_STATUS_LABEL[job.status]}</span>
            </span>
          </div>
          <StageStats
            className="min-w-0 flex-[1_1_440px] max-w-[620px]"
            stats={[
              ...(written ? [{ label: "Lignes lues", value: formatNumber(c.read) }] : []),
              { label: "Valides", value: formatNumber(c.valid) },
              { label: "Ignorées", value: formatNumber(ignoredCount(c)), tone: ignoredCount(c) > 0 ? "warning" : undefined },
              { label: "Expirées", value: formatNumber(c.expired) },
            ]}
          />
        </div>
      </Scene>
      <Paper>
        <div className="flex flex-wrap items-start gap-7">
          <div className="flex min-w-0 flex-[1_1_620px] flex-col gap-4">
            <Panel className="flex flex-col gap-4 p-5" as="section">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[17px] font-bold leading-[22px]">Répartition des lignes</h2>
                <StatusPill tone={tone}>{IMPORT_STATUS_SHORT[job.status]}</StatusPill>
              </div>
              {written && c.read > 0 ? <SplitBar segments={importSegments(c)} /> : <span aria-hidden="true" className="block h-3 rounded-full bg-track" />}
              {job.status === "running" ? <ImportProgress progress={job.progress} resumable={job.resumable} /> : null}
              {message ? <div className={cn("rounded-[14px] border px-4 py-3.5 text-sm font-semibold leading-5", MESSAGE_TONE[tone])}>{message}</div> : null}
              {c.expired > 0 ? (
                <p className="text-[13px] font-semibold text-muted tnum">
                  {formatNumber(c.expired)} offre{c.expired > 1 ? "s" : ""} absente{c.expired > 1 ? "s" : ""} du catalogue complet : marquée{c.expired > 1 ? "s" : ""} expirée{c.expired > 1 ? "s" : ""} (historique conservé).
                </p>
              ) : null}
              {job.truncated ? <p className="flex items-center gap-1.5 text-[13px] font-semibold text-danger"><TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />Fichier tronqué : seules les premières lignes ont été traitées.</p> : null}
              {canWrite(ctx.role) && (job.status === "failed" || job.status === "partial" || job.status === "quarantined") ? (
                <div className="flex flex-wrap gap-2.5">
                  <ButtonLink href={retryHref} variant={job.status === "partial" ? "secondary" : "primary"} size="lg">
                    {job.status === "partial" ? "Importer un fichier corrigé" : "Corriger les colonnes et réessayer"}
                  </ButtonLink>
                </div>
              ) : null}
              {job.status === "quarantined" ? <p className="text-[12.5px] font-semibold text-ink-3">« Importer quand même » se fait depuis l&apos;assistant, avec le fichier : le rapport ne conserve pas son contenu.</p> : null}
            </Panel>

            <section aria-labelledby="issues-title" className="flex flex-col gap-2.5">
              <MonoTitle
                title="Lignes ignorées ou signalées"
                count={job.issues.length >= 500 ? `${formatNumber(job.issues.length)} (500 premières)` : formatNumber(job.issues.length)}
                right={
                  job.issues.length > 0 ? (
                    <a href={csvHref} download={csvName} className={buttonClasses("secondary", "sm")}>
                      <Download aria-hidden="true" className="h-4 w-4" />
                      Exporter (CSV)
                    </a>
                  ) : undefined
                }
              />
              <h2 id="issues-title" className="sr-only">
                Lignes ignorées ou signalées
              </h2>
              {job.issues.length === 0 ? (
                <Panel className="flex items-center gap-2 px-4 py-4 text-sm font-semibold text-success">
                  <CircleCheck aria-hidden="true" className="h-4 w-4 shrink-0" />
                  Aucune ligne ignorée.
                </Panel>
              ) : (
                <>
                  <nav aria-label="Filtrer par type de ligne" className="flex flex-wrap gap-1.5">
                    <FilterChip href={`/sourcing/imports/${job.id}`} selected={kind === null} count={formatNumber(job.issues.length)}>
                      Toutes
                    </FilterChip>
                    {kinds.map(([k, n]) => (
                      <FilterChip key={k} href={`/sourcing/imports/${job.id}?kind=${k}`} selected={kind === k} count={formatNumber(n)}>
                        {ISSUE_KIND_LABEL[k]}
                      </FilterChip>
                    ))}
                  </nav>
                  {kind ? <p className="text-[13px] font-semibold text-muted">{ISSUE_KIND_HINT[kind]}</p> : null}
                  <Table density="compact" stackOnMobile wrapperClassName="rounded-2xl bg-surface" className="min-w-[620px] sm:table-fixed" caption="Lignes ignorées et leur raison">
                      <THead>
                        <tr>
                          <TH scope="col" className="w-[76px]">
                            Ligne
                          </TH>
                          <TH scope="col" className="w-[190px]">
                            Type
                          </TH>
                          <TH scope="col" className="w-[180px]">
                            Référence lue
                          </TH>
                          <TH scope="col">Problème</TH>
                        </tr>
                      </THead>
                      <TBody>
                        {shown.slice(0, SHOWN_ROWS).map((i, k) => (
                          <TR key={`${i.line ?? "x"}-${k}`} className="align-baseline">
                            <TD label="Ligne" className="ms-code text-[11.5px] text-muted tnum">
                              {i.line ?? "—"}
                            </TD>
                            <TD label="Type" primary>
                              <StatusBadge tone={KIND_TONE[i.kind]} title={ISSUE_KIND_HINT[i.kind]}>
                                {ISSUE_KIND_LABEL[i.kind]}
                              </StatusBadge>
                            </TD>
                            <TD label="Référence lue" className="ms-code truncate text-[11.5px] text-muted-strong" title={i.reference ?? undefined}>
                              {i.reference ?? "—"}
                            </TD>
                            <TD label="Problème" className="text-[13px] font-semibold leading-[18px] text-foreground">
                              {i.message}
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  {shown.length > SHOWN_ROWS ? <p className="text-xs font-semibold text-ink-3">… {formatNumber(shown.length - SHOWN_ROWS)} autres lignes dans le CSV exporté.</p> : null}
                </>
              )}
            </section>
          </div>

          <aside aria-label="Fichier et autres imports" className="flex min-w-0 flex-[0_1_380px] flex-col gap-4">
            <section className="flex flex-col gap-2.5">
              <MonoTitle title="Fichier" />
              <Panel className="divide-y divide-line-soft">
                {[
                  { k: "Origine", v: job.origin === "remote_feed" ? "Flux distant autorisé" : "Fichier importé" },
                  { k: "Nom", v: job.fileName ?? "—" },
                  { k: "Format · taille", v: `${job.format.toUpperCase()} · ${fileSizeLabel(job.fileSize)}` },
                  { k: "Commencé", v: `${formatDateTime(job.startedAt)} (${formatRelative(job.startedAt)})` },
                  { k: "Terminé", v: job.finishedAt ? formatDateTime(job.finishedAt) : job.status === "running" ? "En cours" : "—" },
                  { k: "Détail des ignorées", v: `${formatNumber(c.invalid)} illisibles · ${formatNumber(c.duplicates)} doublons · ${formatNumber(c.rejected)} rejetées · ${formatNumber(c.unrecognized)} non reconnues` },
                ].map((x) => (
                  <div key={x.k} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 px-4 py-2.5">
                    <span className="text-xs font-bold leading-[18px] text-ink-3">{x.k}</span>
                    <span className="break-words text-[13.5px] font-semibold leading-[19px]">{x.v}</span>
                  </div>
                ))}
              </Panel>
            </section>
            {others.length > 1 ? (
              <section className="flex flex-col gap-2.5">
                <MonoTitle title={`Imports · ${job.supplierName ?? "ce fournisseur"}`} count={others.length} />
                <ImportHistory jobs={others} currentId={job.id} />
              </section>
            ) : null}
          </aside>
        </div>
      </Paper>
    </>
  );
}
