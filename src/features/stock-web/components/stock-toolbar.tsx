import { Rows3, Rows4, SlidersHorizontal } from "lucide-react";
import { FilterChip, Segmented } from "@/components/instrument";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import type { StockAnalytics } from "@/features/analytics/stock.pure";
import { activeSecondaryFilters, SORT_LABEL, WEB_SORTS, stockHref, type StockWebParams } from "@/features/stock-web/params";
import type { StockWebList } from "@/features/stock-web/queries";
import { CategorySelect, ColumnsMenu, StockSearch } from "@/features/stock-web/components/toolbar-client";
import { formatNumber } from "@/lib/format";

/** Barre d'outils du papier : recherche (« / »), puces de niveau, catégorie, filtres, densité, colonnes. */
export function StockToolbar({ flat, params, analytics, facets }: { flat: Record<string, string>; params: StockWebParams; analytics: StockAnalytics; facets: StockWebList["facets"] }) {
  const b = params.base;
  const weak = analytics.counts.at_risk + analytics.counts.low;
  const noListing = analytics.all.filter((v) => (v.row.active_listings_count ?? 0) === 0).length;
  const chip = (niveau: string | null) => stockHref(flat, { niveau, status: null });
  const secondary = activeSecondaryFilters(b);
  const archived = Boolean(b.archived);
  return (
    <div className="flex flex-wrap items-center gap-2.5">
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
        <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 text-[13px] font-bold hover:bg-line-soft [&::-webkit-details-marker]:hidden">
          <SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
          Filtres{secondary > 0 ? <span className="ms-code text-[11px] text-ink-3">· {secondary}</span> : null}
        </summary>
        <form method="get" action="/stock" className="absolute left-0 top-11 z-30 grid w-[min(92vw,560px)] grid-cols-1 gap-2 rounded-[14px] border border-border bg-surface p-3 shadow-[0_6px_14px_rgba(16,28,44,.10),0_18px_40px_rgba(10,20,32,.18)] sm:grid-cols-2">
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
            <a href={stockHref(flat, { brand: null, status: null, supplier: null, channel: null, min_margin: null, stock: null, sort: null })} className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-bold text-muted hover:bg-line-soft">
              Effacer ces filtres
            </a>
            <Button type="submit" variant="dark">
              Appliquer
            </Button>
          </div>
        </form>
      </details>
      <span className="hidden flex-1 lg:block" />
      <Segmented
        label="Densité"
        options={[
          { href: stockHref(flat, { densite: null }, { keepPage: true }), selected: params.density === "confort", label: <><Rows3 aria-hidden="true" className="h-3.5 w-3.5" />Confort</> },
          { href: stockHref(flat, { densite: "compacte" }, { keepPage: true }), selected: params.density === "compacte", label: <><Rows4 aria-hidden="true" className="h-3.5 w-3.5" />Compacte</> },
        ]}
      />
      <ColumnsMenu />
    </div>
  );
}
