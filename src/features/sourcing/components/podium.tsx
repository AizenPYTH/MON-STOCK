import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { Award } from "@/domain/sourcing/ranking";
import type { BestSavings } from "@/domain/sourcing/search-pipeline";
import type { AwardOfferRef } from "@/services/sourcing/search";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AwardGlyph } from "@/features/sourcing/components/award-icon";

function AwardRow({ award, offer, currency, big }: { award: Award; offer: AwardOfferRef | null; currency: string; big?: boolean }) {
  return (
    <li className={big ? cn("rounded-xl border px-3.5 py-3", award.offerId ? "border-border bg-surface-2" : "border-dashed border-border-strong bg-surface") : "px-1 py-1.5"}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={cn("inline-flex items-center gap-1.5", big ? "text-sm font-bold" : "text-xs font-bold")}>
          <span className={cn("inline-flex items-center justify-center", big ? "h-6 w-6 rounded-md " + (award.offerId ? "bg-inverse text-on-inverse" : "bg-line-soft text-ink-3") : "text-muted-strong")}>
            <AwardGlyph award={award.key} />
          </span>
          {award.label}
        </span>
        {award.offerId && offer ? (
          <Link href={`/sourcing/offers/${award.offerId}`} className="text-xs font-bold text-interactive underline-offset-2 hover:underline tnum">
            {offer.supplierName}
            {offer.comparableUnitPrice !== null ? ` · ${formatMoney(offer.comparableUnitPrice, currency)}` : ""}
          </Link>
        ) : (
          <span className="text-xs text-muted">Non attribué</span>
        )}
      </div>
      {award.offerId && offer && big ? <div className="mt-1 truncate text-[13px] font-semibold text-foreground">{offer.title}</div> : null}
      <div className={cn("mt-0.5 text-xs leading-[17px]", award.offerId ? "font-medium text-muted-strong" : "text-muted")}>{award.reason}</div>
    </li>
  );
}

/**
 * Podium (trois distinctions) et distinctions secondaires, calculés par rankOpportunities sur les offres CONSERVÉES
 * (toutes pages). Aucune distinction sur une donnée inconnue : « non attribué ».
 */
export function PodiumPanel({ podium, highlights, awardOffers, currency, priceBasisNote, bestSavings, requestedQuantity }: { podium: Award[]; highlights: Award[]; awardOffers: Record<string, AwardOfferRef>; currency: string; priceBasisNote: string; bestSavings: BestSavings | null; requestedQuantity: number }) {
  return (
    <Card>
      <CardHeader title="Meilleures opportunités" description={`${priceBasisNote} · quantité demandée : ${requestedQuantity}`} />
      <CardContent className="space-y-3">
        {bestSavings ? (
          <p className="rounded-xl border border-success-line bg-success-soft px-3.5 py-2.5 text-sm font-semibold text-success-ink tnum">
            Pour {bestSavings.quantity} unité{bestSavings.quantity > 1 ? "s" : ""} : jusqu&apos;à {formatMoney(bestSavings.amount, currency)} d&apos;économie potentielle
            <span className="block text-xs font-normal">
              {formatMoney(bestSavings.perUnit, currency)} / unité vs votre coût actuel{bestSavings.basis === "unit" ? " — sur le prix unitaire, frais de port non communiqués" : " — sur le coût rendu (frais connus inclus)"} ·{" "}
              <Link href={`/sourcing/offers/${bestSavings.offerId}`} className="underline">
                voir l&apos;offre
              </Link>
            </span>
          </p>
        ) : null}
        <ol className="grid gap-2 lg:grid-cols-3">
          {podium.map((a) => (
            <AwardRow key={a.key} award={a} offer={a.offerId ? awardOffers[a.offerId] ?? null : null} currency={currency} big />
          ))}
        </ol>
        <ul className="grid gap-x-4 gap-y-1 border-t border-line-soft pt-2 sm:grid-cols-3">
          {highlights.map((a) => (
            <AwardRow key={a.key} award={a} offer={a.offerId ? awardOffers[a.offerId] ?? null : null} currency={currency} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
