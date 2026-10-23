import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Equal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AwardGlyph, PODIUM_AWARDS } from "@/features/sourcing/components/award-icon";
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
        <div className="rounded-xl bg-surface-2 px-3.5 py-2.5">
          <div className="ms-mono text-[10.5px] leading-[14px] text-ink-3">Ton fournisseur actuel</div>
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
                <li key={o.id} className="rounded-xl border border-border px-3.5 py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-base font-semibold tnum">
                      {formatMoney(o.comparableUnitPrice, currency)}
                      {o.deltaPerUnit !== null ? (
                        <span className={`ml-2 inline-flex items-center gap-0.5 text-sm font-bold ${cheaper ? "text-success" : o.deltaPerUnit > 0 ? "text-danger" : "text-muted"}`}>
                          {cheaper ? <ArrowDownRight aria-hidden="true" className="h-3.5 w-3.5" /> : o.deltaPerUnit > 0 ? <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /> : <Equal aria-hidden="true" className="h-3.5 w-3.5" />}
                          <span className="sr-only">{cheaper ? "moins cher de" : o.deltaPerUnit > 0 ? "plus cher de" : "écart"}</span>
                          {formatMoney(Math.abs(o.deltaPerUnit), currency)}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {o.awards.filter((a) => PODIUM_AWARDS.has(a)).map((a) => (
                        <Badge key={a} variant="accent">
                          <AwardGlyph award={a} /> {AWARD_META[a].label}
                        </Badge>
                      ))}
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
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs font-medium text-muted-strong marker:text-ink-4">
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
          <p className="rounded-xl border border-success-line bg-success-soft px-3.5 py-2.5 font-semibold text-success-ink">
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
