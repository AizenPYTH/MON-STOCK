"use client";
import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/form";
import { formatMoney } from "@/lib/format";

export interface BestOfferSummary {
  /** prix unitaire comparable (devise de l'organisation, HT si possible) */
  price: number;
  supplierName: string;
  supplierId: string;
  offerId: string;
  /** « il y a 12 minutes » */
  verifiedLabel: string;
  /** « Page publique HTML (jsonld-public) » */
  methodLabel: string;
}

/**
 * Comparaison « Trouver moins cher » : uniquement des données récupérées. Aucune économie
 * n'est affichée sans offre réelle ; si aucune offre n'est moins chère, c'est dit tel quel.
 */
export function SavingsCalculator({ costPrice, best, currency, defaultQuantity }: { costPrice: number; best: BestOfferSummary; currency: string; defaultQuantity: number }) {
  const [qty, setQty] = useState(Math.max(1, defaultQuantity));
  const perUnit = Math.round((costPrice - best.price) * 100) / 100;
  const total = Math.round(perUnit * qty * 100) / 100;
  const cheaper = perUnit > 0;
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted">Prix actuel (votre coût)</div>
          <div className="text-lg font-semibold tnum">{formatMoney(costPrice, currency)}</div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted">Meilleure offre trouvée</div>
          <div className="text-lg font-semibold tnum">
            {formatMoney(best.price, currency)} <span className="text-sm font-normal">chez </span>
            <Link href={`/suppliers/${best.supplierId}` as never} className="text-sm font-medium underline-offset-2 hover:underline">
              {best.supplierName}
            </Link>
          </div>
          <div className="text-xs text-muted">
            vérifié {best.verifiedLabel} · méthode {best.methodLabel} ·{" "}
            <Link href={`/sourcing/offers/${best.offerId}` as never} className="underline-offset-2 hover:underline">
              voir l&apos;offre
            </Link>
          </div>
        </div>
        {cheaper ? (
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted">Économie potentielle</div>
            <div className="text-lg font-semibold tnum text-success">
              −{formatMoney(perUnit, currency)} / unité <span className="text-xs font-normal text-muted">({formatMoney(costPrice, currency)} − {formatMoney(best.price, currency)})</span>
            </div>
          </div>
        ) : null}
      </div>
      {cheaper ? (
        <label className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Pour</span>
          <Input type="number" min={1} step={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} className="w-24" aria-label="Quantité" />
          <span className="text-xs text-muted">unités :</span>
          <span className="font-semibold tnum text-success">−{formatMoney(total, currency)}</span>
          <span className="text-xs text-muted">(prix unitaires comparables, hors frais de port et d&apos;import non communiqués)</span>
        </label>
      ) : (
        <p className="text-xs text-muted">
          Aucune offre trouvée n&apos;est moins chère que votre coût actuel : la meilleure offre est {perUnit === 0 ? "au même prix" : `${formatMoney(Math.abs(perUnit), currency)} / unité plus chère`}. Aucune économie potentielle.
        </p>
      )}
    </div>
  );
}
