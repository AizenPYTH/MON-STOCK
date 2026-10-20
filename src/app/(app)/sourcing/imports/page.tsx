import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { PageHeader, EmptyState, Stat } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { listImportJobs } from "@/services/sourcing/catalog-import";
import { activeSupplierOptions } from "@/features/catalog-imports/queries";
import { countsText, fileSizeLabel, ignoredCount, IMPORT_MODE_LABEL, IMPORT_STATUS_LABEL, IMPORT_STATUS_VARIANT } from "@/features/catalog-imports/labels";
import { BreakdownBar } from "@/features/catalog-imports/components/breakdown-bar";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";

export const metadata: Metadata = { title: "Imports de catalogues" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function first(v: string | string[] | undefined): string {
  return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
}

export default async function CatalogImportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const sp = await searchParams;
  const supplierId = UUID.test(first(sp.supplierId)) ? first(sp.supplierId) : null;
  const limitRaw = Number(first(sp.limit));
  const limit = Number.isInteger(limitRaw) && limitRaw >= 1 && limitRaw <= 200 ? limitRaw : 50;
  const [jobs, suppliers] = await Promise.all([listImportJobs(ctx, { supplierId, limit }), activeSupplierOptions(ctx)]);
  const writer = canWrite(ctx.role);
  const failed = jobs.filter((j) => j.status === "failed" || j.status === "quarantined").length;
  const updated = jobs.reduce((a, j) => a + j.counts.created + j.counts.updated, 0);
  const ignored = jobs.reduce((a, j) => a + ignoredCount(j.counts), 0);
  const newHref = supplierId ? `/sourcing/imports/new?supplierId=${supplierId}` : "/sourcing/imports/new";

  return (
    <>
      <PageHeader
        eyebrow="Sourcing"
        title="Imports de catalogues"
        description="Historique des imports de l'organisation (fichiers et flux distants), du plus récent au plus ancien : empreinte du fichier, compteurs réels et lignes ignorées avec leur raison."
        actions={
          <>
            <ButtonLink href="/sourcing/sources" variant="secondary">
              Mes sources
            </ButtonLink>
            {writer ? <ButtonLink href={newHref}>Importer un catalogue</ButtonLink> : null}
          </>
        }
      />

      <form method="get" action="/sourcing/imports" className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface p-3">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="imports-supplier" className="mb-1 block text-xs font-medium text-muted">
            Fournisseur
          </label>
          <Select id="imports-supplier" name="supplierId" defaultValue={supplierId ?? ""}>
            <option value="">Tous les fournisseurs</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="imports-limit" className="mb-1 block text-xs font-medium text-muted">
            Nombre d&apos;imports
          </label>
          <Select id="imports-limit" name="limit" defaultValue={String(limit)}>
            {[20, 50, 100, 200].map((n) => (
              <option key={n} value={n}>
                {n} derniers
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          Appliquer
        </Button>
        {supplierId || limit !== 50 ? (
          <ButtonLink href="/sourcing/imports" variant="ghost">
            Réinitialiser
          </ButtonLink>
        ) : null}
      </form>

      {jobs.length > 0 ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Imports affichés" value={formatNumber(jobs.length)} hint={jobs.length >= limit ? `Les ${limit} plus récents` : "Tous les imports"} />
          <Stat label="Offres créées ou mises à jour" value={formatNumber(updated)} tone={updated > 0 ? "success" : undefined} />
          <Stat label="Lignes ignorées" value={formatNumber(ignored)} hint="Doublons, illisibles, rejetées, non reconnues" tone={ignored > 0 ? "warning" : undefined} />
          <Stat label="Imports en échec ou suspendus" value={formatNumber(failed)} tone={failed > 0 ? "danger" : undefined} />
        </div>
      ) : null}

      {jobs.length === 0 ? (
        <EmptyState
          title={supplierId ? "Aucun import pour ce fournisseur" : "Aucun import"}
          description="CSV, Excel, XML ou JSON reçu d'un fournisseur : l'aperçu est vérifié avant tout enregistrement."
          action={writer ? <ButtonLink href={newHref}>Importer un catalogue</ButtonLink> : undefined}
        />
      ) : (
        <Table className="min-w-[1100px]">
          <caption className="sr-only">Historique des imports de catalogues</caption>
          <THead>
            <tr>
              <TH scope="col">Date</TH>
              <TH scope="col">Fournisseur</TH>
              <TH scope="col">Fichier / flux</TH>
              <TH scope="col">Mode</TH>
              <TH scope="col">Statut</TH>
              <TH scope="col">Résultat</TH>
              <TH scope="col" className="w-48">
                Répartition
              </TH>
              <TH scope="col">
                <span className="sr-only">Détail</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {jobs.map((j) => {
              const failedJob = j.status === "failed" || j.status === "quarantined";
              return (
                <TR key={j.id}>
                  <TD className="whitespace-nowrap">
                    <div>{formatRelative(j.startedAt)}</div>
                    <div className="text-xs text-muted">{formatDateTime(j.startedAt)}</div>
                  </TD>
                  <TD>
                    {j.supplierId ? (
                      <Link href={`/sourcing/imports?supplierId=${j.supplierId}` as never} className="font-medium hover:underline">
                        {j.supplierName ?? "Fournisseur"}
                      </Link>
                    ) : (
                      <span className="text-muted">{j.supplierName ?? "—"}</span>
                    )}
                  </TD>
                  <TD className="max-w-[240px]">
                    <div className="truncate" title={j.fileName ?? undefined}>
                      {j.origin === "remote_feed" ? "Flux distant" : (j.fileName ?? "—")}
                    </div>
                    <div className="text-xs uppercase text-muted">
                      {j.format} · {fileSizeLabel(j.fileSize)}
                    </div>
                  </TD>
                  <TD className="text-xs">{IMPORT_MODE_LABEL[j.mode]}</TD>
                  <TD>
                    <Badge variant={IMPORT_STATUS_VARIANT[j.status]}>{IMPORT_STATUS_LABEL[j.status]}</Badge>
                  </TD>
                  <TD className={failedJob ? "max-w-[320px] text-xs text-danger" : "max-w-[320px] text-xs"}>{failedJob && j.message ? j.message : countsText(j.counts)}</TD>
                  <TD>{!failedJob && j.counts.read > 0 ? <BreakdownBar counts={j.counts} compact /> : <span className="text-xs text-muted">—</span>}</TD>
                  <TD align="right">
                    <Link href={`/sourcing/imports/${j.id}` as never} className="text-sm font-medium text-accent hover:underline">
                      Détail<span className="sr-only"> de l&apos;import {j.fileName ?? ""}</span>
                    </Link>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </>
  );
}
