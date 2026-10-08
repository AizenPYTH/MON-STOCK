import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { PageHeader, EmptyState, Callout } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { listStock, POST_FILTER_LIMIT } from "@/features/stock/queries";
import { stockListParamsSchema } from "@/features/stock/schemas";
import { StockFilters } from "@/features/stock/components/stock-filters";
import { StockTable } from "@/features/stock/components/stock-table";

export const metadata: Metadata = { title: "Stock" };

export default async function StockPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const raw = await searchParams;
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val) flat[k] = val;
  }
  const parsed = stockListParamsSchema.safeParse(flat);
  const params = parsed.success ? parsed.data : stockListParamsSchema.parse({});
  const result = await listStock(ctx, params);
  const hasFilters = Object.keys(flat).some((k) => k !== "page" && k !== "sort" && k !== "archived");
  const archived = Boolean(params.archived);

  const makeHref = (page: number) => {
    const sp = new URLSearchParams(flat);
    sp.set("page", String(page));
    return `/stock?${sp.toString()}`;
  };

  return (
    <>
      <PageHeader
        title={archived ? "Stock archivé" : "Stock"}
        description={
          archived
            ? "SKU archivés : masqués des listes et des analyses, historique conservé. Réactivez un produit depuis sa fiche (Modifier)."
            : "Tout votre stock, un seul endroit. Un SKU = une unité de stock ; les annonces marketplace y sont rattachées."
        }
        actions={
          <>
            <ButtonLink href={archived ? "/stock" : "/stock?archived=1"} variant="ghost">
              {archived ? "Voir le stock actif" : "Voir les archivés"}
            </ButtonLink>
            {canWrite(ctx.role) && !archived ? (
              <ButtonLink href="/stock/new">
                <Plus className="h-4 w-4" /> Nouveau produit
              </ButtonLink>
            ) : null}
          </>
        }
      />
      <StockFilters params={params} facets={result.facets} />
      {result.truncated ? (
        <Callout tone="warning" className="mb-3">
          Statut calculé sur les {POST_FILTER_LIMIT.toLocaleString("fr-FR")} premiers SKU correspondant aux autres filtres : affinez la recherche pour un résultat exhaustif.
        </Callout>
      ) : null}
      {result.rows.length === 0 ? (
        result.total > 0 ? (
          <EmptyState title="Cette page n'existe plus." description={`La liste compte ${result.total} SKU : revenez à la première page.`} action={<ButtonLink href={makeHref(1)} variant="secondary">Première page</ButtonLink>} />
        ) : archived && !hasFilters ? (
          <EmptyState title="Aucun produit archivé." action={<ButtonLink href="/stock" variant="secondary">Voir le stock actif</ButtonLink>} />
        ) : hasFilters ? (
          <EmptyState title="Aucun SKU ne correspond à ces filtres." action={<ButtonLink href={archived ? "/stock?archived=1" : "/stock"} variant="secondary">Réinitialiser les filtres</ButtonLink>} />
        ) : (
          <EmptyState
            title="Vous n'avez encore aucun produit en stock."
            description="Créez votre premier produit et son SKU, ou connectez eBay pour importer vos annonces puis les associer à des SKU."
            action={
              <div className="flex gap-2">
                {canWrite(ctx.role) ? <ButtonLink href="/stock/new">Créer un produit</ButtonLink> : null}
                <ButtonLink href="/settings/integrations" variant="secondary">
                  Connecter eBay
                </ButtonLink>
              </div>
            }
          />
        )
      ) : (
        <div className="space-y-3">
          <StockTable rows={result.rows} />
          <Pagination page={result.page} pageSize={result.pageSize} total={result.total} makeHref={makeHref} />
        </div>
      )}
    </>
  );
}
