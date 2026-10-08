import Link from "next/link";
import { Search } from "lucide-react";
import { Input, Select } from "@/components/ui/form";
import { Button, ButtonLink } from "@/components/ui/button";
import type { SourcingSearchParams } from "@/features/sourcing/schemas";
import { SOURCE_TYPE_LABEL } from "@/features/sourcing/labels";

export function SourcingSearchForm({ params, suppliers, skuCode, liveEnabled = true, toggleLiveHref }: { params: SourcingSearchParams; suppliers: Array<{ id: string; name: string }>; skuCode?: string | null; liveEnabled?: boolean; toggleLiveHref?: string }) {
  return (
    <form method="get" action="/sourcing" className="rounded-xl border border-border bg-surface p-4">
      {skuCode ? <input type="hidden" name="sku" value={skuCode} /> : null}
      {!liveEnabled ? <input type="hidden" name="live" value="0" /> : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input name="q" defaultValue={params.q ?? ""} placeholder="Que recherchez-vous ? (ex. iPhone 13 128 Go noir grade A, EAN, référence…)" className="h-11 flex-1 text-base" autoFocus={!skuCode} />
        <Button type="submit" size="lg" className="h-11">
          <Search className="h-4 w-4" /> {liveEnabled ? "Rechercher en direct" : "Rechercher"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted">
        {liveEnabled ? "Chaque recherche interroge vos sources connectées en direct (robots.txt respecté, aucun contournement)." : "Mode « offres enregistrées » : les sources ne sont pas interrogées."}
        {toggleLiveHref ? (
          <>
            {" "}
            <Link href={toggleLiveHref as never} className="font-medium text-muted-strong underline-offset-2 hover:underline">
              {liveEnabled ? "Rechercher sans interroger les sources" : "Interroger les sources en direct"}
            </Link>
          </>
        ) : null}
      </p>
      <details className="mt-3" open={hasAdvanced(params)}>
        <summary className="cursor-pointer text-xs font-medium text-muted hover:text-foreground">Filtres avancés</summary>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
          <Input name="category" defaultValue={params.category ?? ""} placeholder="Catégorie" />
          <Input name="brand" defaultValue={params.brand ?? ""} placeholder="Marque" />
          <Input name="model" defaultValue={params.model ?? ""} placeholder="Modèle" />
          <Input name="storage" defaultValue={params.storage ?? ""} placeholder="Stockage (128GB)" />
          <Input name="color" defaultValue={params.color ?? ""} placeholder="Couleur" />
          <Select name="condition" defaultValue={params.condition ?? ""}>
            <option value="">État</option>
            <option value="new">Neuf</option>
            <option value="refurbished">Reconditionné</option>
            <option value="used">Occasion</option>
          </Select>
          <Input name="grade" defaultValue={params.grade ?? ""} placeholder="Grade (A, B…)" />
          <Input name="qty" type="number" min={1} step={1} defaultValue={params.qty ?? ""} placeholder="Quantité souhaitée" />
          <Input name="max_price" type="number" min={0} step="0.01" defaultValue={params.max_price ?? ""} placeholder="Prix max (unitaire)" />
          <Input name="country" defaultValue={params.country ?? ""} placeholder="Pays (FR, DE…)" />
          <Input name="max_delivery" type="number" min={0} step={1} defaultValue={params.max_delivery ?? ""} placeholder="Délai max (jours)" />
          <Input name="max_moq" type="number" min={1} step={1} defaultValue={params.max_moq ?? ""} placeholder="MOQ max" />
          <Select name="tax" defaultValue={params.tax ?? ""}>
            <option value="">TVA : HT ou TTC</option>
            <option value="ht">Prix HT</option>
            <option value="ttc">Prix TTC</option>
          </Select>
          <Select name="supplier" defaultValue={params.supplier ?? ""}>
            <option value="">Fournisseur</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select name="source" defaultValue={params.source ?? ""}>
            <option value="">Type de source</option>
            {Object.entries(SOURCE_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Select name="availability" defaultValue={params.availability ?? ""}>
            <option value="">Disponibilité</option>
            <option value="in_stock">En stock uniquement</option>
            <option value="any">Toutes</option>
          </Select>
          <input type="hidden" name="sort" value={params.sort} />
          <div className="col-span-2 flex items-center gap-2 md:col-span-4 xl:col-span-8 xl:justify-end">
            <Button type="submit" variant="secondary">
              Appliquer les filtres
            </Button>
            <ButtonLink href={skuCode ? `/sourcing?sku=${encodeURIComponent(skuCode)}` : "/sourcing"} variant="ghost">
              Réinitialiser
            </ButtonLink>
          </div>
        </div>
      </details>
    </form>
  );
}

function hasAdvanced(p: SourcingSearchParams): boolean {
  return Boolean(p.category || p.brand || p.model || p.storage || p.color || p.condition || p.grade || p.qty || p.max_price || p.country || p.max_delivery || p.max_moq || p.tax || p.supplier || p.source || p.availability);
}
