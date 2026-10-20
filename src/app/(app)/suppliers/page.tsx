import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { EmptyState } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { MonoTitle, Panel, Paper, Scene, SceneHeader, Segmented, StageStats } from "@/components/instrument";
import { listSuppliers } from "@/features/suppliers/queries";
import { listPendingDiscoveredSources } from "@/features/suppliers/discovered-queries";
import { DiscoveredSourcesPanel } from "@/features/suppliers/components/discovered-sources";
import { SupplierBadge } from "@/features/directory/components/supplier-badge";
import { formatNumber, formatRelative } from "@/lib/format";
import { SOURCE_TYPE_LABEL } from "@/features/sourcing/labels";

export const metadata: Metadata = { title: "Fournisseurs" };

function domainOf(website: string | null): string | null {
  if (!website) return null;
  try {
    return new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname;
  } catch {
    return null;
  }
}

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const sp = await searchParams;
  const archived = sp.archived === "1";
  const [rows, pendingDiscovered] = await Promise.all([listSuppliers(ctx, { archived }), archived ? Promise.resolve([]) : listPendingDiscoveredSources(ctx)]);
  const writable = canWrite(ctx.role);
  const offers = rows.reduce((a, r) => a + r.offersCount, 0);
  const withSource = rows.filter((r) => r.sourcesCount > 0).length;
  return (
    <>
      <Scene>
        <SceneHeader
          eyebrow="Fournisseurs · mes fournisseurs"
          title="Fournisseurs"
          description="Vos fournisseurs, leurs sources (flux, pages publiques autorisées, saisie manuelle) et votre historique d'achats."
          actions={
            <>
              <ButtonLink href="/suppliers/directory" variant="night">
                Annuaire
              </ButtonLink>
              {writable ? (
                <ButtonLink href="/suppliers/new">
                  <Plus aria-hidden="true" className="h-4 w-4" /> Ajouter un fournisseur
                </ButtonLink>
              ) : null}
            </>
          }
        />
        <StageStats
          className="mt-6 max-w-[820px]"
          stats={[
            { label: archived ? "Archivés" : "Fournisseurs", value: formatNumber(rows.length) },
            { label: "Offres actives", value: formatNumber(offers) },
            { label: "Avec une source", value: formatNumber(withSource) },
            { label: "Découvertes à valider", value: archived ? null : formatNumber(pendingDiscovered.length), tone: pendingDiscovered.length > 0 ? "warning" : undefined, href: pendingDiscovered.length > 0 ? "#decouvertes" : undefined },
          ]}
        />
      </Scene>
      <Paper>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <MonoTitle title={archived ? "Fournisseurs archivés" : "Fournisseurs actifs"} count={rows.length} />
          <Segmented
            label="Fournisseurs affichés"
            options={[
              { href: "/suppliers", label: "Actifs", selected: !archived },
              { href: "/suppliers?archived=1", label: "Archivés", selected: archived },
            ]}
          />
        </div>
        {pendingDiscovered.length > 0 ? (
          <div className="mb-5">
            <DiscoveredSourcesPanel sources={pendingDiscovered} writable={writable} />
          </div>
        ) : null}
        {rows.length === 0 ? (
          <EmptyState
            title={archived ? "Aucun fournisseur archivé." : "Vous n'avez encore ajouté aucun fournisseur."}
            description={archived ? undefined : "Ajoutez un fournisseur, puis saisissez ses offres, importez son flux CSV/XML/JSON ou déclarez une page publique autorisée."}
            action={writable && !archived ? <ButtonLink href="/suppliers/new">Ajouter un fournisseur</ButtonLink> : undefined}
          />
        ) : (
          <Panel className="overflow-hidden">
            <Table>
              <caption className="sr-only">{archived ? "Fournisseurs archivés" : "Fournisseurs actifs"}</caption>
              <THead>
                <tr>
                  <TH scope="col">Fournisseur</TH>
                  <TH scope="col">Pays</TH>
                  <TH scope="col">Score</TH>
                  <TH scope="col" align="right">
                    Offres actives
                  </TH>
                  <TH scope="col">Sources</TH>
                  <TH scope="col">Dernière synchronisation</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map(({ supplier, offersCount, sourcesCount, sourceTypes, lastSyncAt }) => (
                  <TR key={supplier.id}>
                    <TD>
                      <Link href={`/suppliers/${supplier.id}` as never} className="flex items-center gap-2.5 hover:underline">
                        <SupplierBadge name={supplier.name} domain={domainOf(supplier.website)} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate font-bold">{supplier.name}</span>
                          {supplier.company ? <span className="block truncate text-xs font-semibold text-ink-3">{supplier.company}</span> : null}
                        </span>
                      </Link>
                    </TD>
                    <TD className="ms-code text-xs">{supplier.country ?? "—"}</TD>
                    <TD>{supplier.internal_score === null || supplier.internal_score === undefined || !Number.isFinite(Number(supplier.internal_score)) ? <span className="text-xs font-semibold text-ink-3">Données insuffisantes</span> : <Badge variant="success">{Math.round(Number(supplier.internal_score))}/100</Badge>}</TD>
                    <TD align="right" className="font-bold">
                      {formatNumber(offersCount)}
                    </TD>
                    <TD>
                      {sourcesCount === 0 ? (
                        <span className="text-xs font-semibold text-ink-3">Aucune source</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {sourceTypes.map((t) => (
                            <Badge key={t} variant="outline">
                              {SOURCE_TYPE_LABEL[t] ?? t}
                            </Badge>
                          ))}
                        </span>
                      )}
                    </TD>
                    <TD className="text-xs font-semibold text-muted">{lastSyncAt ? formatRelative(lastSyncAt) : "Jamais"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Panel>
        )}
      </Paper>
    </>
  );
}
