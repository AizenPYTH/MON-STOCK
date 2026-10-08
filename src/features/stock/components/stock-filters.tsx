import { Input, Select } from "@/components/ui/form";
import { Button, ButtonLink } from "@/components/ui/button";
import type { StockListParams } from "@/features/stock/schemas";

export function StockFilters({ params, facets }: { params: StockListParams; facets: { brands: string[]; categories: string[]; suppliers: Array<{ id: string; name: string }> } }) {
  return (
    <form method="get" action="/stock" className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-border bg-surface p-3 md:grid-cols-4 xl:grid-cols-8">
      <Input name="q" defaultValue={params.q ?? ""} placeholder="Rechercher (nom, SKU, EAN)…" className="col-span-2" />
      <Select name="brand" defaultValue={params.brand ?? ""}>
        <option value="">Marque</option>
        {facets.brands.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </Select>
      <Select name="category" defaultValue={params.category ?? ""}>
        <option value="">Catégorie</option>
        {facets.categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>
      <Select name="status" defaultValue={params.status ?? ""}>
        <option value="">Statut</option>
        <option value="out_of_stock">Rupture</option>
        <option value="at_risk">Risque de rupture</option>
        <option value="low">Stock faible</option>
        <option value="normal">Stock normal</option>
      </Select>
      <Select name="supplier" defaultValue={params.supplier ?? ""}>
        <option value="">Fournisseur</option>
        {facets.suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      <Select name="channel" defaultValue={params.channel ?? ""}>
        <option value="">Canal</option>
        <option value="ebay">eBay</option>
        <option value="amazon">Amazon</option>
        <option value="shopify">Shopify</option>
        <option value="manual">Manuel</option>
      </Select>
      <Select name="sort" defaultValue={params.sort}>
        <option value="best_sellers">Plus vendus</option>
        <option value="low_stock">Stock faible</option>
        <option value="margin">Marge brute (€)</option>
        <option value="stock_value">Valeur de stock</option>
        <option value="last_sale">Vendu récemment</option>
        <option value="oldest_sale">Sans vente depuis longtemps</option>
        <option value="name">Nom</option>
      </Select>
      <Input name="min_margin" type="number" step="1" defaultValue={params.min_margin ?? ""} placeholder="Marge brute min." />
      <Select name="stock" defaultValue={params.stock ?? ""}>
        <option value="">Stock</option>
        <option value="in_stock">En stock</option>
        <option value="empty">Épuisé</option>
        <option value="negative">Négatif</option>
      </Select>
      <div className="col-span-2 flex items-center gap-2 md:col-span-2 xl:col-span-6 xl:justify-end">
        {params.archived ? <input type="hidden" name="archived" value="1" /> : null}
        <Button type="submit" variant="secondary">
          Filtrer
        </Button>
        <ButtonLink href={params.archived ? "/stock?archived=1" : "/stock"} variant="ghost">
          Réinitialiser
        </ButtonLink>
      </div>
    </form>
  );
}
