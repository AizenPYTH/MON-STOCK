import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { EmptyState } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { MonoTitle, Paper, Scene, SceneHeader, StageStats } from "@/components/instrument";
import { listImportJobs } from "@/services/sourcing/catalog-import";
import { activeSupplierOptions } from "@/features/catalog-imports/queries";
import { ignoredCount } from "@/features/catalog-imports/labels";
import { ImportHistory } from "@/features/catalog-imports/components/import-history";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Imports de catalogues" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function first(v: string | string[] | undefined): string {
  return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
}

const control = "h-10 rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-foreground";

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
  const supplierName = supplierId ? (suppliers.find((s) => s.id === supplierId)?.name ?? null) : null;

  return (
    <>
      <Scene>
        <SceneHeader
          eyebrow="Sourcing · imports de catalogues"
          title="Imports de catalogues"
          description="Fichiers et flux distants, du plus récent au plus ancien : compteurs réels et lignes ignorées avec leur raison."
          actions={
            <>
              <ButtonLink href="/sourcing/sources" variant="night">
                Sources &amp; flux
              </ButtonLink>
              {writer ? (
                <ButtonLink href={newHref}>
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  Importer un catalogue
                </ButtonLink>
              ) : null}
            </>
          }
        />
        <StageStats
          className="mt-6 max-w-[760px]"
          stats={[
            { label: "Imports affichés", value: formatNumber(jobs.length) },
            { label: "Offres créées ou mises à jour", value: formatNumber(updated), tone: updated > 0 ? "mint" : undefined },
            { label: "Lignes ignorées", value: formatNumber(ignored), tone: ignored > 0 ? "warning" : undefined },
            { label: "En échec ou suspendus", value: formatNumber(failed), tone: failed > 0 ? "danger" : undefined },
          ]}
        />
      </Scene>
      <Paper>
        <form method="get" action="/sourcing/imports" className="mb-4 flex flex-wrap items-end gap-2">
          <label className="flex min-w-[220px] flex-[1_1_260px] flex-col gap-1 sm:max-w-[360px]">
            <span className="ms-mono text-[10px] leading-[13px] text-ink-3">Fournisseur</span>
            <select name="supplierId" defaultValue={supplierId ?? ""} className={control}>
              <option value="">Tous les fournisseurs</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="ms-mono text-[10px] leading-[13px] text-ink-3">Nombre d&apos;imports</span>
            <select name="limit" defaultValue={String(limit)} className={control}>
              {[20, 50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n} derniers
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="h-10 rounded-xl border border-border bg-surface px-4 text-sm font-bold hover:bg-line-soft">
            Appliquer
          </button>
          {supplierId || limit !== 50 ? (
            <ButtonLink href="/sourcing/imports" variant="ghost">
              Tout effacer
            </ButtonLink>
          ) : null}
        </form>

        <MonoTitle title={supplierName ? `Historique · ${supplierName}` : "Historique des imports"} count={jobs.length} className="mb-2.5" />
        {jobs.length === 0 ? (
          <EmptyState
            title={supplierId ? "Aucun import pour ce fournisseur" : "Aucun import"}
            description="CSV, Excel, XML ou JSON reçu d'un fournisseur : l'aperçu est vérifié avant tout enregistrement."
            action={writer ? <ButtonLink href={newHref}>Importer un catalogue</ButtonLink> : undefined}
          />
        ) : (
          <ImportHistory jobs={jobs} wide />
        )}
        <p className="mt-3 text-xs font-semibold leading-[17px] text-ink-3">Chaque ligne ouvre le rapport de l&apos;import (lignes ignorées et leur raison, export CSV). Un même fichier (contenu identique) n&apos;est jamais réimporté sans votre confirmation.</p>
      </Paper>
    </>
  );
}
