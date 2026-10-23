import type { ReactNode } from "react";
import { Rows3, Rows4, SlidersHorizontal } from "lucide-react";
import { FilterChip, Segmented } from "@/components/instrument";
import { Button, buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input, Select } from "@/components/ui/form";
import type { StockAnalytics } from "@/features/analytics/stock.pure";
import { activeSecondaryFilters, SORT_LABEL, WEB_SORTS, stockHref, type StockWebParams } from "@/features/stock-web/params";
import type { StockWebList } from "@/features/stock-web/queries";
import { CategorySelect, ColumnsMenu, StockSearch } from "@/features/stock-web/components/toolbar-client";
import { formatNumber } from "@/lib/format";

/** Barre d'outils du papier : recherche (« / »), puces de niveau, catégorie, filtres, densité, colonnes. */
export function StockToolbar({ flat, params, analytics, facets, summary }: { flat: Record<string, string>; params: StockWebParams; analytics: StockAnalytics; facets: StockWebList["facets"]; /** résumé du résultat (nombre, tri, réserves) affiché à gauche de la 2e ligne */ summary?: ReactNode }) {
  const b = params.base;
  const weak = analytics.counts.at_risk + analytics.counts.low;
  const noListing = analytics.all.filter((v) => (v.row.active_listings_count ?? 0) === 0).length;
  const chip = (niveau: string | null) => stockHref(flat, { niveau, status: null });
  const secondary = activeSecondaryFilters(b);
  const archived = Boolean(b.archived);
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Recherche et filtres" className="flex flex-wrap items-center gap-2.5">
        <StockSearch flat={flat} initial={b.q ?? ""} />
        {archived ? null : (
          <div role="group" aria-label="Niveau de stock" className="flex flex-wrap gap-1.5">
            <FilterChip href={stockHref(flat, { niveau: null, status: null })} selected={params.niveau === null && !b.status} count={formatNumber(analytics.totals.skus)}>
              Tous
            </FilterChip>
            <FilterChip href={chip("rupture")} selected={params.niveau === "rupture"} dot="var(--red)" count={analytics.counts.out_of_stock}>
              Rupture
            </FilterChip>
            <FilterChip href={chip("faible")} selected={params.niveau === "faible"} dot="var(--amber)" count={weak}>
              Faible
            </FilterChip>
            <FilterChip href={chip("sans_annonce")} selected={params.niveau === "sans_annonce"} count={noListing}>
              Sans annonce
            </FilterChip>
            {params.niveau === "sans_cout" || analytics.totals.skusUnknownCost > 0 ? (
              <FilterChip href={chip("sans_cout")} selected={params.niveau === "sans_cout"} count={analytics.totals.skusUnknownCost}>
                Sans coût
              </FilterChip>
            ) : null}
          </div>
        )}
        <span aria-hidden="true" className="hidden h-[22px] w-px bg-border-strong sm:block" />
        <CategorySelect flat={flat} categories={facets.categories} current={b.category ?? null} />
        <details className="group relative">
          <summary className={cn("inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-semibold transition-colors duration-150 ease-standard pointer-coarse:h-10 [&::-webkit-details-marker]:hidden", secondary > 0 ? "border-inverse bg-inverse text-on-inverse hover:bg-inverse-hover" : "border-border-strong bg-surface text-foreground hover:bg-surface-2 group-open:bg-surface-2")}>
            <SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
            Filtres{secondary > 0 ? <span className="tnum opacity-70">· {secondary}</span> : null}
          </summary>
          <form method="get" action="/stock" className="ms-fade absolute left-0 top-11 z-30 grid w-[min(calc(100vw-32px),560px)] grid-cols-1 gap-2 rounded-[14px] border border-border bg-surface p-3 shadow-floating max-sm:fixed max-sm:inset-x-4 max-sm:bottom-4 max-sm:top-auto max-sm:max-h-[80vh] max-sm:w-auto max-sm:overflow-y-auto max-sm:shadow-modal sm:grid-cols-2">
            {(["q", "category", "niveau", "densite", "archived"] as const).map((k) => (flat[k] ? <input key={k} type="hidden" name={k} value={flat[k]} /> : null))}
            <Select name="brand" defaultValue={b.brand ?? ""} aria-label="Marque">
              <option value="">Toutes marques</option>
              {facets.brands.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </Select>
            <Select name="status" defaultValue={b.status ?? ""} aria-label="Statut">
              <option value="">Tous statuts</option>
              <option value="out_of_stock">Rupture</option>
              <option value="at_risk">Risque de rupture</option>
              <option value="low">Stock faible</option>
              <option value="normal">Stock normal</option>
            </Select>
            <Select name="supplier" defaultValue={b.supplier ?? ""} aria-label="Fournisseur">
              <option value="">Tous fournisseurs</option>
              {facets.suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Select name="channel" defaultValue={b.channel ?? ""} aria-label="Canal">
              <option value="">Tous canaux</option>
              <option value="ebay">eBay</option>
              <option value="amazon">Amazon</option>
              <option value="shopify">Shopify</option>
              <option value="woocommerce">WooCommerce</option>
              <option value="manual">Manuel</option>
            </Select>
            <Input name="min_margin" type="number" step="1" defaultValue={b.min_margin ?? ""} aria-label="Marge brute minimale (€)" placeholder="Marge brute min. (€)" />
            <Select name="stock" defaultValue={b.stock ?? ""} aria-label="Stock">
              <option value="">Tout le stock</option>
              <option value="in_stock">En stock</option>
              <option value="empty">Épuisé</option>
              <option value="negative">Négatif</option>
            </Select>
            <Select name="sort" defaultValue={params.sort} aria-label="Tri" className="sm:col-span-2">
              {WEB_SORTS.map((s) => (
                <option key={s} value={s}>
                  Tri : {SORT_LABEL[s]}
                </option>
              ))}
            </Select>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <a href={stockHref(flat, { brand: null, status: null, supplier: null, channel: null, min_margin: null, stock: null, sort: null })} className={buttonClasses("ghost", "md")}>
                Effacer ces filtres
              </a>
              <Button type="submit" variant="dark">
                Appliquer
              </Button>
            </div>
          </form>
        </details>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
        <div className="min-w-0 flex-1 basis-64">{summary}</div>
        <div className="flex items-center gap-2 max-sm:hidden">
          <Segmented
            label="Densité"
            options={[
              { href: stockHref(flat, { densite: null }, { keepPage: true }), selected: params.density === "confort", label: <><Rows3 aria-hidden="true" className="h-3.5 w-3.5" />Confort</> },
              { href: stockHref(flat, { densite: "compacte" }, { keepPage: true }), selected: params.density === "compacte", label: <><Rows4 aria-hidden="true" className="h-3.5 w-3.5" />Compacte</> },
            ]}
          />
          <ColumnsMenu />
        </div>
      </div>
    </div>
  );
}
