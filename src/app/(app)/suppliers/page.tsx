import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { EmptyState } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { MonoTitle, Paper, Scene, SceneHeader, Segmented, StageStats } from "@/components/instrument";
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

/** Score interne : repère visuel du niveau (même seuils que le détail du score) ; le chiffre reste affiché. */
function scoreVariant(score: number): "success" | "info" | "neutral" {
  return score >= 70 ? "success" : score >= 45 ? "info" : "neutral";
}

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const sp = await searchParams;
  const archived = sp.archived === "1";
  const [rows, pendingDiscovered] = await Promise.all([listSuppliers(ctx, { archived }), archived ? Promise.resolve([]) : listPendingDiscoveredSources(ctx)]);
  const writable = canWrite(ctx.role);
  // Compteur inconnu (lecture en échec) : total inconnu « — », jamais 0 (W-14) ; borne atteinte : minimum (W-03).
  const offersKnown = rows.every((r) => r.offersCount !== null);
  const offers = offersKnown ? rows.reduce((a, r) => a + (r.offersCount ?? 0), 0) : null;
  const offersExact = rows.every((r) => r.offersCountExact);
  const withSource = rows.every((r) => r.sourcesCount !== null) ? rows.filter((r) => (r.sourcesCount ?? 0) > 0).length : null;
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
            { label: "Offres actives", value: offers !== null && !offersExact ? `au moins ${formatNumber(offers)}` : formatNumber(offers) },
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
          <Table stackOnMobile wrapperClassName="rounded-2xl" caption={archived ? "Fournisseurs archivés" : "Fournisseurs actifs"}>
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
                {rows.map(({ supplier, offersCount, offersCountExact, sourcesCount, sourceTypes, lastSyncAt }) => (
                  <TR key={supplier.id}>
                    <TD primary>
                      <Link href={`/suppliers/${supplier.id}`} className="flex min-w-0 items-center gap-2.5 rounded-lg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                        <SupplierBadge name={supplier.name} domain={domainOf(supplier.website)} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate font-bold">{supplier.name}</span>
                          {supplier.company ? <span className="block truncate text-xs font-semibold text-ink-3">{supplier.company}</span> : null}
                        </span>
                      </Link>
                    </TD>
                    <TD label="Pays" className="ms-code text-xs">{supplier.country ?? "—"}</TD>
                    <TD label="Score">{supplier.internal_score === null || supplier.internal_score === undefined || !Number.isFinite(Number(supplier.internal_score)) ? <span className="text-xs font-semibold text-ink-3">Données insuffisantes</span> : <Badge variant={scoreVariant(Number(supplier.internal_score))}>{Math.round(Number(supplier.internal_score))}/100</Badge>}</TD>
                    <TD label="Offres actives" align="right" className="font-bold">
                      {offersCount !== null && !offersCountExact ? <span title="Comptage partiel : borne de lecture atteinte">≥ {formatNumber(offersCount)}</span> : formatNumber(offersCount)}
                    </TD>
                    <TD label="Sources">
                      {sourcesCount === null ? (
                        <span className="text-xs font-semibold text-ink-3" aria-label="inconnu">
                          —
                        </span>
                      ) : sourcesCount === 0 ? (
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
                    <TD label="Dernière synchronisation" className="text-xs font-semibold text-muted">{lastSyncAt ? formatRelative(lastSyncAt) : "Jamais"}</TD>
                  </TR>
                ))}
              </TBody>
          </Table>
        )}
      </Paper>
    </>
  );
}
