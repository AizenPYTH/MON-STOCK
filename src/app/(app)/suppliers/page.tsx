import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { listSuppliers } from "@/features/suppliers/queries";
import { formatRelative } from "@/lib/format";
import { SOURCE_TYPE_LABEL } from "@/features/sourcing/labels";

export const metadata: Metadata = { title: "Fournisseurs" };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const sp = await searchParams;
  const archived = sp.archived === "1";
  const rows = await listSuppliers(ctx, { archived });
  const writable = canWrite(ctx.role);
  return (
    <>
      <PageHeader
        title="Fournisseurs"
        description="Vos fournisseurs, leurs sources (flux, pages publiques autorisées, saisie manuelle) et votre historique d'achats."
        actions={
          <>
            <ButtonLink href={archived ? "/suppliers" : "/suppliers?archived=1"} variant="ghost">
              {archived ? "Voir les actifs" : "Voir les archivés"}
            </ButtonLink>
            {writable ? (
              <ButtonLink href="/suppliers/new">
                <Plus className="h-4 w-4" /> Ajouter un fournisseur
              </ButtonLink>
            ) : null}
          </>
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          title={archived ? "Aucun fournisseur archivé." : "Vous n'avez encore ajouté aucun fournisseur."}
          description={archived ? undefined : "Ajoutez un fournisseur, puis saisissez ses offres, importez son flux CSV/XML/JSON ou déclarez une page publique autorisée."}
          action={writable && !archived ? <ButtonLink href="/suppliers/new">Ajouter un fournisseur</ButtonLink> : undefined}
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Fournisseur</TH>
              <TH>Pays</TH>
              <TH>Score</TH>
              <TH align="right">Offres actives</TH>
              <TH>Sources</TH>
              <TH>Dernière synchronisation</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map(({ supplier, offersCount, sourcesCount, sourceTypes, lastSyncAt }) => (
              <TR key={supplier.id}>
                <TD>
                  <Link href={`/suppliers/${supplier.id}` as never} className="font-medium hover:underline">
                    {supplier.name}
                  </Link>
                  {supplier.company ? <div className="text-xs text-muted">{supplier.company}</div> : null}
                </TD>
                <TD>{supplier.country ?? "—"}</TD>
                <TD>{supplier.internal_score === null ? <span className="text-xs text-muted">Données insuffisantes</span> : <Badge variant="success">{Math.round(supplier.internal_score)}/100</Badge>}</TD>
                <TD align="right">{offersCount}</TD>
                <TD>
                  {sourcesCount === 0 ? (
                    <span className="text-xs text-muted">Aucune source</span>
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
                <TD className="text-xs text-muted">{lastSyncAt ? formatRelative(lastSyncAt) : "Jamais"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
