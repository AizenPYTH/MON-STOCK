import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AWARD_META } from "@/domain/sourcing/ranking";
import type { BestSavings } from "@/domain/sourcing/search-pipeline";
import type { SearchSku, SkuTopOffer } from "@/services/sourcing/search";
import { ConfidenceBadge } from "@/features/sourcing/components/confidence-badge";
import { formatMoney } from "@/lib/format";

/**
 * « Trouver moins cher » (mode SKU) : coût actuel du SKU vs meilleures offres RÉELLES du classement.
 * Aucune économie sans offre ; aucune offre → message simple.
 */
export function CurrentSupplierComparison({ sku, offers, bestSavings, requestedQuantity, currency, totalOffers }: { sku: SearchSku; offers: SkuTopOffer[]; bestSavings: BestSavings | null; requestedQuantity: number; currency: string; totalOffers: number }) {
  const cost = sku.costPrice;
  return (
    <Card>
      <CardHeader title="Trouver moins cher" description="Comparaison avec des offres réellement récupérées uniquement (prix comparables, base HT si connue). Rien n'est estimé." />
      <CardContent className="space-y-3 text-sm">
        <div className="rounded-lg bg-surface-muted/60 px-3 py-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Ton fournisseur actuel</div>
          {cost !== null ? (
            <div className="text-lg font-semibold tnum">
              {formatMoney(cost, sku.currency)} <span className="text-xs font-normal text-muted">coût d&apos;achat renseigné sur le SKU {sku.code}</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-muted">
              Coût d&apos;achat non renseigné : aucune économie calculable.
              <ButtonLink href={`/stock/${encodeURIComponent(sku.code)}/edit`} variant="secondary" size="sm">
                Renseigner le coût d&apos;achat
              </ButtonLink>
            </div>
          )}
        </div>

        {offers.length === 0 ? (
          <p className="text-muted">{totalOffers === 0 ? "Aucune offre trouvée pour ce produit : aucune comparaison possible." : "Aucune offre trouvée n'a de prix comparable (devise non convertible) : aucune comparaison possible."}</p>
        ) : (
          <ol className="space-y-2">
            {offers.map((o) => {
              const cheaper = o.deltaPerUnit !== null && o.deltaPerUnit < 0;
              return (
                <li key={o.id} className="rounded-lg border border-border px-3 py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-base font-semibold tnum">
                      {formatMoney(o.comparableUnitPrice, currency)}
                      {o.deltaPerUnit !== null ? (
                        <span className={`ml-2 text-sm ${cheaper ? "text-success" : o.deltaPerUnit > 0 ? "text-danger" : "text-muted"}`}>
                          {cheaper ? "↓" : o.deltaPerUnit > 0 ? "↑" : "="} {formatMoney(Math.abs(o.deltaPerUnit), currency)}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-xs">
                      {o.awards.filter((a) => a === "best_opportunity" || a === "best_value" || a === "most_reliable").map((a) => `${AWARD_META[a].emoji} ${AWARD_META[a].label}`).join(" · ")}
                    </span>
                  </div>
                  <div className="text-xs text-muted">
                    #{o.rank} · score {o.score}/100 ·{" "}
                    <Link href={`/sourcing/offers/${o.id}` as never} className="font-medium text-foreground underline-offset-2 hover:underline">
                      {o.supplierName}
                    </Link>{" "}
                    — {o.title}
                  </div>
                  <ConfidenceBadge confidence={o.confidence} className="mt-1" />
                  <ul className="mt-1 list-disc pl-4 text-xs text-muted-strong">
                    {o.why.slice(0, 3).map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        )}

        {bestSavings ? (
          <p className="rounded-lg bg-success-soft px-3 py-2 font-medium text-green-800">
            Pour {bestSavings.quantity} unité{bestSavings.quantity > 1 ? "s" : ""} : jusqu&apos;à {formatMoney(bestSavings.amount, currency)} d&apos;économie potentielle
            <span className="block text-xs font-normal">{bestSavings.basis === "unit" ? "Sur le prix unitaire : frais de port non communiqués, non inclus." : "Sur le coût rendu (frais de port connus inclus)."}</span>
          </p>
        ) : cost !== null && offers.length > 0 ? (
          <p className="text-xs text-muted">Aucune offre trouvée n&apos;est moins chère que ton coût actuel pour {requestedQuantity} unité(s) : aucune économie potentielle.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
