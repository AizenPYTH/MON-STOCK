import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { PageHeader, Callout, DescriptionList, Stat } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getImportJob } from "@/services/sourcing/catalog-import";
import { isAppError } from "@/lib/errors";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fileSizeLabel, ignoredCount, IMPORT_MODE_LABEL, IMPORT_STATUS_LABEL, IMPORT_STATUS_VARIANT, isIssueKind, ISSUE_KIND_HINT, ISSUE_KIND_LABEL, issuesCsv, type IssueKind } from "@/features/catalog-imports/labels";
import { BreakdownBar } from "@/features/catalog-imports/components/breakdown-bar";

export const metadata: Metadata = { title: "Rapport d'import" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHOWN_ROWS = 300;

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
  const kindParam = Array.isArray(sp.kind) ? sp.kind[0] : sp.kind;
  const kind: IssueKind | null = isIssueKind(kindParam) ? kindParam : null;
  const byKind = new Map<IssueKind, number>();
  for (const i of job.issues) byKind.set(i.kind, (byKind.get(i.kind) ?? 0) + 1);
  const kinds = [...byKind.entries()].sort((a, b) => b[1] - a[1]);
  const shown = kind ? job.issues.filter((i) => i.kind === kind) : job.issues;
  const failed = job.status === "failed" || job.status === "quarantined";
  const c = job.counts;
  const retryHref = `/sourcing/imports/new?${new URLSearchParams({ ...(job.supplierId ? { supplierId: job.supplierId } : {}), ...(job.supplierName ? { supplierName: job.supplierName } : {}) }).toString()}`;
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(issuesCsv(job))}`;
  const csvName = `rapport-import-${(job.supplierName ?? "fournisseur").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${job.startedAt.slice(0, 10)}.csv`;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={"/sourcing/imports" as never} className="hover:underline">
            Sourcing · Imports
          </Link>
        }
        title={job.supplierName ?? "Import"}
        description={`${job.origin === "remote_feed" ? "Flux distant" : (job.fileName ?? "Fichier")} · ${IMPORT_MODE_LABEL[job.mode]} · ${formatDateTime(job.startedAt)} (${formatRelative(job.startedAt)})`}
        actions={
          <>
            <Badge variant={IMPORT_STATUS_VARIANT[job.status]}>{IMPORT_STATUS_LABEL[job.status]}</Badge>
            {canWrite(ctx.role) && (job.status === "failed" || job.status === "partial" || job.status === "quarantined") ? (
              <ButtonLink href={retryHref} variant="secondary">
                Relancer un import corrigé
              </ButtonLink>
            ) : null}
          </>
        }
      />

      {failed ? (
        <Callout tone="danger" className="mb-5" title={job.status === "quarantined" ? "Import suspendu par le contrôle de qualité : rien n'a été écrit" : "Le fichier n'a pas été importé"}>
          {job.message ?? "Aucun détail fourni par le serveur."}
        </Callout>
      ) : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Lignes lues" value={formatNumber(c.read)} hint={`${formatNumber(c.valid)} valides`} />
        <Stat label="Offres créées" value={formatNumber(c.created)} tone={c.created > 0 ? "success" : undefined} />
        <Stat label="Mises à jour / inchangées" value={`${formatNumber(c.updated)} / ${formatNumber(c.unchanged)}`} />
        <Stat label="Lignes ignorées" value={formatNumber(ignoredCount(c))} hint={`${formatNumber(c.invalid)} illisibles · ${formatNumber(c.duplicates)} doublons · ${formatNumber(c.rejected)} rejetées · ${formatNumber(c.unrecognized)} non reconnues`} tone={ignoredCount(c) > 0 ? "warning" : undefined} />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader title="Répartition des lignes" />
          <CardContent className="space-y-3">
            {c.read > 0 ? <BreakdownBar counts={c} /> : <p className="text-sm text-muted">Aucune ligne lue.</p>}
            {!failed && job.message ? <p className="text-xs text-muted-strong">{job.message}</p> : null}
            {c.expired > 0 ? (
              <p className="text-xs text-muted-strong">
                {formatNumber(c.expired)} offre{c.expired > 1 ? "s" : ""} absente{c.expired > 1 ? "s" : ""} du catalogue complet : marquée{c.expired > 1 ? "s" : ""} expirée{c.expired > 1 ? "s" : ""} (historique conservé).
              </p>
            ) : null}
            {job.truncated ? <p className="text-xs text-danger">Fichier tronqué : seules les premières lignes ont été traitées.</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Fichier" />
          <CardContent>
            <DescriptionList
              className="sm:grid-cols-1"
              items={[
                { label: "Origine", value: job.origin === "remote_feed" ? "Flux distant autorisé" : "Fichier importé" },
                { label: "Nom", value: job.fileName ?? "—" },
                { label: "Format · taille", value: `${job.format.toUpperCase()} · ${fileSizeLabel(job.fileSize)}` },
                { label: "Terminé", value: job.finishedAt ? formatDateTime(job.finishedAt) : job.status === "running" ? "En cours" : "—" },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={`Rapport d'erreurs (${formatNumber(job.issues.length)}${job.issues.length >= 500 ? ", 500 premières" : ""})`}
          description={kind ? ISSUE_KIND_HINT[kind] : job.issues.length ? `${formatNumber(job.issues.length)} ligne${job.issues.length > 1 ? "s" : ""} à vérifier, en ${kinds.length} catégorie${kinds.length > 1 ? "s" : ""}.` : undefined}
          actions={
            job.issues.length > 0 ? (
              <a href={csvHref} download={csvName} className={buttonClasses("secondary", "sm")}>
                <Download aria-hidden="true" className="h-3.5 w-3.5" />
                Exporter (CSV)
              </a>
            ) : null
          }
        />
        {job.issues.length === 0 ? (
          <CardContent className="text-sm text-success">Aucune ligne ignorée.</CardContent>
        ) : (
          <>
            <nav aria-label="Filtrer par type de ligne" className="flex flex-wrap gap-2 border-b border-border px-5 py-3">
              <Link href={`/sourcing/imports/${job.id}` as never} aria-current={kind === null ? "page" : undefined} className={cn("rounded-md border px-2.5 py-1 text-xs font-medium", kind === null ? "border-foreground bg-foreground text-white" : "border-border hover:bg-surface-muted")}>
                Toutes ({formatNumber(job.issues.length)})
              </Link>
              {kinds.map(([k, n]) => (
                <Link key={k} href={`/sourcing/imports/${job.id}?kind=${k}` as never} aria-current={kind === k ? "page" : undefined} className={cn("rounded-md border px-2.5 py-1 text-xs font-medium", kind === k ? "border-foreground bg-foreground text-white" : "border-border hover:bg-surface-muted")}>
                  {ISSUE_KIND_LABEL[k]} ({formatNumber(n)})
                </Link>
              ))}
            </nav>
            <Table className="min-w-[760px]">
              <caption className="sr-only">Lignes ignorées et leur raison</caption>
              <THead>
                <tr>
                  <TH scope="col">Ligne</TH>
                  <TH scope="col">Type</TH>
                  <TH scope="col">Référence</TH>
                  <TH scope="col">Raison</TH>
                </tr>
              </THead>
              <TBody>
                {shown.slice(0, SHOWN_ROWS).map((i, k) => (
                  <TR key={`${i.line ?? "x"}-${k}`}>
                    <TD className="font-mono text-xs">{i.line ?? "—"}</TD>
                    <TD>
                      <Badge variant={i.kind === "invalid" || i.kind === "rejected" ? "danger" : i.kind === "unrecognized" ? "warning" : i.kind === "warning" ? "info" : "neutral"}>{ISSUE_KIND_LABEL[i.kind]}</Badge>
                    </TD>
                    <TD className="font-mono text-xs">{i.reference ?? "—"}</TD>
                    <TD className="text-sm">{i.message}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {shown.length > SHOWN_ROWS ? <p className="px-5 py-3 text-xs text-muted">… {formatNumber(shown.length - SHOWN_ROWS)} autres lignes dans le CSV exporté.</p> : null}
          </>
        )}
      </Card>
    </>
  );
}
