"use client";
import { useState } from "react";
import { dec, fromNumber } from "@/domain/tools/decimal";
import { quickCurrency, quickDiscount, quickEbayFees, quickMargin, quickSellingPrice } from "@/domain/tools/quick-calc";
import { rateAgeDays, type FxRate } from "@/domain/tools/currency";
import { FX_SYMBOL, frDay, toFrInput } from "@/features/tools/format";
import { QuickCalc } from "@/features/tools/components/quick-calc";

/** Versions simples des calculateurs (mêmes cases, onglets et aides que l'application). */

export function MarginQuick() {
  return (
    <QuickCalc
      title="Marge"
      fields={[
        { key: "achat", label: "Achat", unit: "€" },
        { key: "vente", label: "Vente", unit: "€" },
        { key: "frais", label: "Frais", unit: "€" },
        { key: "res", label: "Bénéfice", unit: "€", result: true },
      ]}
      compute={(v) => quickMargin(v.achat ?? null, v.vente ?? null, v.frais ?? null)}
      hint="Marge sur le prix de vente · TVA et commissions : « Détaillé »"
    />
  );
}

const MARGINS = ["10", "20", "30", "40"];

export function SellingPriceQuick() {
  const [margin, setMargin] = useState("20");
  return (
    <QuickCalc
      title="Prix"
      tabs={{ label: "Marge voulue", value: margin, onChange: setMargin, options: MARGINS.map((m) => ({ value: m, label: `${m} %`, a11y: `marge voulue ${m} %` })) }}
      fields={[
        { key: "achat", label: "Achat", unit: "€" },
        { key: "frais", label: "Frais", unit: "€" },
        { key: "res", label: "Prix", unit: "€", result: true },
      ]}
      compute={(v) => quickSellingPrice(v.achat ?? null, v.frais ?? null, dec(BigInt(margin)))}
      hint="Onglets : marge voulue sur le prix de vente"
    />
  );
}

const DISCOUNTS = ["5", "10", "20", "30"];

export function DiscountQuick() {
  const [rate, setRate] = useState("10");
  return (
    <QuickCalc
      title="Remise"
      tabs={{ label: "Remise", value: rate, onChange: setRate, options: DISCOUNTS.map((r) => ({ value: r, label: `${r} %`, a11y: `remise ${r} %` })) }}
      fields={[
        { key: "prix", label: "Prix", unit: "€" },
        { key: "res", label: "Remisé", unit: "€", result: true },
      ]}
      compute={(v) => quickDiscount(v.prix ?? null, dec(BigInt(rate)))}
    />
  );
}

/**
 * Frais eBay (version simple) : AUCUN taux par défaut. Le taux est celui de votre canal eBay s'il
 * est renseigné, sinon à saisir (Net affiche « — » tant qu'il est vide).
 */
export function EbayFeesQuick({ channelRate }: { channelRate: number | null }) {
  const initial = channelRate !== null ? { taux: toFrInput(channelRate) } : undefined;
  return (
    <QuickCalc
      key={channelRate === null ? "sans-taux" : `taux-${channelRate}`}
      title="Frais eBay"
      initialEntries={initial}
      fields={[
        { key: "prix", label: "Prix", unit: "€" },
        { key: "taux", label: "Taux", unit: "%" },
        { key: "res", label: "Net", unit: "€", result: true },
      ]}
      compute={(v) => quickEbayFees(v.prix ?? null, v.taux ?? null)}
      hint={initial ? "Taux repris de votre canal eBay · modifiable" : "Votre taux eBay, aucun par défaut"}
    />
  );
}

const PREFERRED = ["USD", "GBP", "CHF", "CNY", "HKD", "JPY", "PLN"];

/** Devises (version simple) : devise en onglet, saisie dans la devise ou en euros ; taux BCE daté. */
export function CurrencyQuick({ rates }: { rates: FxRate[] }) {
  const [code, setCode] = useState("USD");
  const available = PREFERRED.filter((c) => rates.some((r) => r.currency === c)).slice(0, 4);
  const current = available.includes(code) ? code : (available[0] ?? null);
  const rate = rates.find((r) => r.currency === current) ?? null;
  const age = rate ? rateAgeDays(rate.rateDate, new Date()) : null;
  const hint = rate ? `Taux BCE du ${frDay(rate.rateDate)} · 1 € = ${toFrInput(rate.rate)} ${rate.currency}${age !== null && age > 4 ? ` · il y a ${age} j` : ""}` : "Aucun taux importé pour le moment.";
  return (
    <QuickCalc
        title="Devises"
        bidir
        initialActive="dev"
        tabs={available.length ? { label: "Devise", value: current!, onChange: setCode, options: available.map((c) => ({ value: c, label: c })) } : undefined}
        fields={[
          { key: "dev", label: current ?? "Devise", unit: current ? (FX_SYMBOL[current] ?? current) : "" },
          { key: "eur", label: "EUR", unit: "€" },
        ]}
        compute={(v, active) => quickCurrency(active as "dev" | "eur", v[active] ?? null, rate ? fromNumber(rate.rate) : null)}
        hint={hint}
      />
  );
}
