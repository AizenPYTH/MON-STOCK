import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext, canWrite, isAdmin } from "@/features/auth/dal";
import { PageHeader, EmptyState, Stat, Section, Callout } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { SourceOverviewDTO } from "@/features/mobile-api/contract";
import { listSourcesForOrg } from "@/services/sourcing/source-sync";
import { sourceLibrary } from "@/services/sourcing/source-library";
import { formatDateTime, formatNumber } from "@/lib/format";
import { ageText, groupLibrary, groupSources, isFailing, PRIMARY_ACTION_LABEL, SOURCE_STATUS_VARIANT, sourcesStats } from "@/features/sources/labels";
import { ScheduleSourceForm, SyncSourceForm, ToggleSourceForm } from "@/features/sources/components/source-forms";
import { LibraryCard } from "@/features/sources/components/library-list";
import { SupplierBadge } from "@/features/directory/components/supplier-badge";

export const metadata: Metadata = { title: "Mes sources" };

function SourcesTable({ sources, caption, writer, admin }: { sources: SourceOverviewDTO[]; caption: string; writer: boolean; admin: boolean }) {
  return (
    <Table className="min-w-[1180px]">
      <caption className="sr-only">{caption}</caption>
      <THead>
        <tr>
          <TH scope="col">Source</TH>
          <TH scope="col">Statut</TH>
          <TH scope="col" align="right">
            Offres exploitables
          </TH>
          <TH scope="col">Données</TH>
          <TH scope="col">Planification</TH>
          <TH scope="col">Actions</TH>
        </tr>
      </THead>
      <TBody>
        {sources.map((s) => {
          const failing = isFailing(s);
          return (
            <TR key={s.id} className={failing ? "bg-danger-soft/30" : undefined}>
              <TD className="max-w-[300px]">
                <div className="flex items-center gap-2.5">
                  <SupplierBadge name={s.supplierName ?? s.name} size="sm" />
                  <div className="min-w-0">
                    <Link href={`/suppliers/${s.supplierId}` as never} className="block truncate font-medium hover:underline">
                      {s.supplierName ?? s.name}
                    </Link>
                    <div className="truncate text-xs text-muted">
                      {s.methodLabel}
                      {s.country ? ` · ${s.country}` : ""}
                    </div>
                  </div>
                </div>
              </TD>
              <TD>
                <Badge variant={failing ? "danger" : SOURCE_STATUS_VARIANT[s.status]}>{s.statusLabel}</Badge>
                {s.consecutiveFailures > 0 || s.lastError ? (
                  <p className="mt-1 max-w-[260px] text-xs text-danger">
                    {s.consecutiveFailures > 0 ? `${s.consecutiveFailures} échec(s) consécutif(s). ` : ""}
                    {s.lastError ?? ""}
                  </p>
                ) : null}
              </TD>
              <TD align="right">{formatNumber(s.activeOffers)}</TD>
              <TD className="whitespace-nowrap text-xs">
                <div>Données {ageText(s.lastSuccessfulSyncAt)}</div>
                <div className="text-muted">Dernier succès : {s.lastSuccessfulSyncAt ? formatDateTime(s.lastSuccessfulSyncAt) : "jamais"}</div>
              </TD>
              <TD className="text-xs">
                {s.schedulable ? (
                  <>
                    <div>{s.frequencyLabel}</div>
                    {s.nextRunAt && s.frequency !== "manual" ? <div className="text-muted">Prochain passage : {formatDateTime(s.nextRunAt)}</div> : null}
                    {admin && s.status !== "disabled" ? (
                      <div className="mt-1.5">
                        <ScheduleSourceForm sourceId={s.id} frequency={s.frequency} sourceName={s.supplierName ?? s.name} />
                      </div>
                    ) : null}
                  </>
                ) : s.kind === "live_search" ? (
                  <span className="text-muted">Interrogée à chaque recherche : rien à planifier.</span>
                ) : (
                  <span className="text-muted">Mise à jour à chaque nouvel import.</span>
                )}
              </TD>
              <TD>
                <div className="flex flex-col items-start gap-1.5">
                  {writer && s.primaryAction === "sync_now" ? <SyncSourceForm sourceId={s.id} label={PRIMARY_ACTION_LABEL.sync_now} disabled={!s.canSyncNow} variant={failing ? "primary" : "secondary"} /> : null}
                  {writer && s.primaryAction === "import_file" ? (
                    <ButtonLink href={`/sourcing/imports/new?supplierId=${s.supplierId}`} variant={failing ? "primary" : "secondary"} size="sm">
                      {PRIMARY_ACTION_LABEL.import_file}
                    </ButtonLink>
                  ) : null}
                  {admin ? <ToggleSourceForm sourceId={s.id} disabled={s.status === "disabled"} sourceName={s.supplierName ?? s.name} /> : null}
                  {!writer && !admin ? <span className="text-xs text-muted">Lecture seule</span> : null}
                  {writer && !admin && s.primaryAction === "enable" ? <span className="text-xs text-muted">Réactivation réservée aux administrateurs.</span> : null}
                </div>
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}

export default async function SourcesPage() {
  const ctx = await requireOrgContext();
  const [sources, library] = await Promise.all([listSourcesForOrg(ctx), sourceLibrary(ctx)]);
  const writer = canWrite(ctx.role);
  const admin = isAdmin(ctx.role);
  const stats = sourcesStats(sources);
  const groups = groupSources(sources);
  const lib = groupLibrary(library.entries);

  return (
    <>
      <PageHeader
        eyebrow="Sourcing"
        title="Mes sources"
        description="Chaque source de l'organisation avec son statut RÉEL (connectée seulement après une synchronisation réussie), ses offres exploitables, l'âge des données et le prochain passage."
        actions={
          <>
            <ButtonLink href="/sourcing/imports" variant="secondary">
              Historique des imports
            </ButtonLink>
            <ButtonLink href="/suppliers/accounts" variant="secondary">
              Comptes fournisseurs
            </ButtonLink>
            {writer ? (
              <ButtonLink href="/sourcing/sources/new-feed" variant="secondary">
                Ajouter un flux autorisé
              </ButtonLink>
            ) : null}
            {writer ? <ButtonLink href="/sourcing/imports/new">Importer un fichier</ButtonLink> : null}
          </>
        }
      />

      {sources.length === 0 ? (
        <EmptyState
          className="mb-6"
          title="Aucune source pour l'instant"
          description="Connectez votre premier fournisseur : importez sa liste de stock, ajoutez le lien de flux qu'il vous a fourni ou activez un catalogue public de la bibliothèque ci-dessous."
          action={<ButtonLink href="/suppliers/directory">Explorer l'annuaire des fournisseurs</ButtonLink>}
        />
      ) : (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <Stat label="Actives" value={formatNumber(stats.active)} hint={`sur ${formatNumber(stats.total)} source${stats.total > 1 ? "s" : ""}`} tone={stats.active > 0 ? "success" : undefined} />
          <Stat label="À corriger" value={formatNumber(stats.toFix)} hint={stats.toFix ? "en échec" : "aucune"} tone={stats.toFix ? "danger" : undefined} />
          <Stat label="Offres exploitables" value={formatNumber(stats.offers)} hint={stats.lastSuccess ? `Dernière mise à jour ${ageText(stats.lastSuccess)}` : "Jamais mises à jour"} />
        </div>
      )}

      <div className="space-y-8">
        {groups.automatic.length > 0 ? (
          <Section title={`Synchronisation automatique (${groups.automatic.length})`} description="Pages publiques attestées, flux distants autorisés et API fournisseurs.">
            <SourcesTable sources={groups.automatic} caption="Sources à synchronisation automatique" writer={writer} admin={admin} />
          </Section>
        ) : null}
        {groups.live.length > 0 ? (
          <Section title={`Recherche en direct (${groups.live.length})`} description="Interrogées à chaque recherche de produit : leurs offres se mettent à jour quand vous cherchez, sans synchronisation.">
            <SourcesTable sources={groups.live} caption="Sources interrogées en direct" writer={writer} admin={admin} />
          </Section>
        ) : null}
        {groups.manual.length > 0 ? (
          <Section title={`Fichiers et saisie (${groups.manual.length})`} description="Mises à jour à chaque nouvel import. Pour les automatiser, demandez au fournisseur un lien de flux (CSV / XML) ou une API.">
            <SourcesTable sources={groups.manual} caption="Sources alimentées par fichier ou saisie" writer={writer} admin={admin} />
          </Section>
        ) : null}

        <section id="bibliotheque" aria-labelledby="bibliotheque-title" className="space-y-4">
          <div>
            <h2 id="bibliotheque-title" className="text-base font-semibold">
              Bibliothèque de sources publiques
            </h2>
            <p className="text-sm text-muted">Vérifiées par le serveur : robots.txt respecté, produits avec prix réellement obtenus. Une source non vérifiée n&apos;est jamais présentée comme connectée.</p>
          </div>
          {library.entries.length === 0 ? <Callout tone="neutral">La bibliothèque est vide.</Callout> : null}
          {lib.active.length > 0 ? (
            <Section title={`Activées (${lib.active.length})`}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {lib.active.map((e) => (
                  <LibraryCard key={e.key} entry={e} canActivate={false} />
                ))}
              </div>
            </Section>
          ) : null}
          {lib.ready.length > 0 ? (
            <Section title={`Vérifiées, activables (${lib.ready.length})`} description={writer ? undefined : "Activation réservée aux rôles rédacteur et administrateur."}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {lib.ready.map((e) => (
                  <LibraryCard key={e.key} entry={e} canActivate={writer} />
                ))}
              </div>
            </Section>
          ) : null}
          {lib.blocked.length > 0 ? (
            <Section title={`Non activables (${lib.blocked.length})`} description="Résultat de la dernière vérification réelle. Ces fournisseurs n'exposent pas leur catalogue publiquement (compte professionnel, robots.txt, site non lisible) ou attendent des clés d'API.">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {lib.blocked.map((e) => (
                  <LibraryCard key={e.key} entry={e} canActivate={false} />
                ))}
              </div>
            </Section>
          ) : null}
        </section>
      </div>
    </>
  );
}
