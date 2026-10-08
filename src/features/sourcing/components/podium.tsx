import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { Award } from "@/domain/sourcing/ranking";
import type { BestSavings } from "@/domain/sourcing/search-pipeline";
import type { AwardOfferRef } from "@/services/sourcing/search";
import { formatMoney } from "@/lib/format";

function AwardRow({ award, offer, currency, big }: { award: Award; offer: AwardOfferRef | null; currency: string; big?: boolean }) {
  return (
    <li className={big ? "rounded-lg border border-border bg-surface px-3 py-2" : "px-1 py-1"}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={big ? "text-sm font-semibold" : "text-xs font-medium"}>
          <span aria-hidden>{award.emoji}</span> {award.label}
        </span>
        {award.offerId && offer ? (
          <Link href={`/sourcing/offers/${award.offerId}` as never} className="text-xs font-medium underline-offset-2 hover:underline">
            {offer.supplierName}
            {offer.comparableUnitPrice !== null ? ` · ${formatMoney(offer.comparableUnitPrice, currency)}` : ""}
          </Link>
        ) : (
          <span className="text-xs text-muted">Non attribué</span>
        )}
      </div>
      {award.offerId && offer && big ? <div className="truncate text-xs text-muted">{offer.title}</div> : null}
      <div className={`text-xs ${award.offerId ? "text-muted-strong" : "text-muted"}`}>{award.reason}</div>
    </li>
  );
}

/**
 * Podium 🥇 🥈 🥉 et distinctions, calculés par rankOpportunities sur les offres CONSERVÉES
 * (toutes pages). Aucune distinction sur une donnée inconnue : « non attribué ».
 */
export function PodiumPanel({ podium, highlights, awardOffers, currency, priceBasisNote, bestSavings, requestedQuantity }: { podium: Award[]; highlights: Award[]; awardOffers: Record<string, AwardOfferRef>; currency: string; priceBasisNote: string; bestSavings: BestSavings | null; requestedQuantity: number }) {
  return (
    <Card>
      <CardHeader title="Meilleures opportunités" description={`${priceBasisNote} · quantité demandée : ${requestedQuantity}`} />
      <CardContent className="space-y-3">
        {bestSavings ? (
          <p className="rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-green-800">
            Pour {bestSavings.quantity} unité{bestSavings.quantity > 1 ? "s" : ""} : jusqu&apos;à {formatMoney(bestSavings.amount, currency)} d&apos;économie potentielle
            <span className="block text-xs font-normal">
              {formatMoney(bestSavings.perUnit, currency)} / unité vs votre coût actuel{bestSavings.basis === "unit" ? " — sur le prix unitaire, frais de port non communiqués" : " — sur le coût rendu (frais connus inclus)"} ·{" "}
              <Link href={`/sourcing/offers/${bestSavings.offerId}` as never} className="underline">
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
        <ul className="grid gap-1 border-t border-border pt-2 sm:grid-cols-3">
          {highlights.map((a) => (
            <AwardRow key={a.key} award={a} offer={a.offerId ? awardOffers[a.offerId] ?? null : null} currency={currency} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
