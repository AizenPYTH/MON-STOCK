"use client";
import { useState } from "react";
import { Input } from "@/components/ui/form";
import { formatMoney } from "@/lib/format";

export function SavingsCalculator({ costPrice, bestPrice, currency, defaultQuantity }: { costPrice: number; bestPrice: number; currency: string; defaultQuantity: number }) {
  const [qty, setQty] = useState(Math.max(1, defaultQuantity));
  const perUnit = Math.round((costPrice - bestPrice) * 100) / 100;
  const total = Math.round(perUnit * qty * 100) / 100;
  return (
    <div className="flex flex-wrap items-end gap-4 text-sm">
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-muted">Votre fournisseur actuel</div>
        <div className="text-lg font-semibold tnum">{formatMoney(costPrice, currency)}</div>
      </div>
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-muted">Meilleure offre trouvée</div>
        <div className="text-lg font-semibold tnum">{formatMoney(bestPrice, currency)}</div>
      </div>
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-muted">Économie / unité</div>
        <div className={`text-lg font-semibold tnum ${perUnit > 0 ? "text-success" : perUnit < 0 ? "text-danger" : ""}`}>{perUnit > 0 ? "−" : perUnit < 0 ? "+" : ""}{formatMoney(Math.abs(perUnit), currency)}</div>
      </div>
      <label className="flex items-center gap-2">
        <span className="text-xs text-muted">Pour</span>
        <Input type="number" min={1} step={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} className="w-24" aria-label="Quantité" />
        <span className="text-xs text-muted">unités :</span>
        <span className={`font-semibold tnum ${total > 0 ? "text-success" : total < 0 ? "text-danger" : ""}`}>{total > 0 ? "−" : total < 0 ? "+" : ""}{formatMoney(Math.abs(total), currency)}</span>
      </label>
      {perUnit <= 0 ? <p className="w-full text-xs text-muted">Aucune offre trouvée n'est moins chère que votre coût actuel.</p> : null}
    </div>
  );
}
