import type { Metadata } from "next";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { EmptyState } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { MonoTitle, Paper, Scene, SceneHeader } from "@/components/instrument";
import { listImportJobs } from "@/services/sourcing/catalog-import";
import { activeSupplierOptions } from "@/features/catalog-imports/queries";
import { ImportWizard } from "@/features/catalog-imports/components/import-wizard";
import { ImportHistory } from "@/features/catalog-imports/components/import-history";

export const metadata: Metadata = { title: "Importer un catalogue" };

function first(v: string | string[] | undefined): string {
  return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
}

const HISTORY_SHOWN = 6;

export default async function NewCatalogImportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const sp = await searchParams;
  if (!canWrite(ctx.role)) {
    return (
      <>
        <Scene>
          <SceneHeader eyebrow="Sourcing · imports de catalogues" title="Importer un catalogue" back={{ href: "/sourcing/imports", label: "Imports" }} />
        </Scene>
        <Paper>
          <EmptyState title="Lecture seule" description="Votre rôle ne permet pas d'importer un catalogue dans cette organisation." action={<ButtonLink href="/sourcing/imports" variant="secondary">Historique des imports</ButtonLink>} />
        </Paper>
      </>
    );
  }
  const [suppliers, jobs] = await Promise.all([activeSupplierOptions(ctx), listImportJobs(ctx, { limit: HISTORY_SHOWN + 1 })]);
  const supplierId = first(sp.supplierId);
  const shown = jobs.slice(0, HISTORY_SHOWN);
  const history = (
    <>
      <MonoTitle title="Historique des imports" count={jobs.length > HISTORY_SHOWN ? `${HISTORY_SHOWN}+` : jobs.length} right={jobs.length > HISTORY_SHOWN ? <ButtonLink href="/sourcing/imports" variant="link" className="text-[13px] font-bold">Tout voir</ButtonLink> : undefined} />
      {shown.length ? <ImportHistory jobs={shown} /> : <p className="rounded-2xl border border-dashed border-border-strong bg-surface px-4 py-5 text-sm font-semibold text-muted">Aucun import pour l&apos;instant.</p>}
      <p className="text-xs font-semibold leading-[17px] text-ink-3">Un même fichier (contenu identique) n&apos;est jamais réimporté sans votre confirmation.</p>
    </>
  );
  return <ImportWizard suppliers={suppliers} orgCurrency={ctx.organization.default_currency} initialSupplierId={/^[0-9a-f-]{36}$/i.test(supplierId) ? supplierId : null} initialSupplierName={first(sp.supplierName).slice(0, 160)} history={history} />;
}
