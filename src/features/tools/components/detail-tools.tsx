"use client";
import { useState, type ReactNode } from "react";
import { ArrowUpDown } from "lucide-react";
import { formatDec, formatMoneyDec, formatPercent } from "@/domain/tools/decimal";
import { DISCOUNT_MODE_LABEL, evaluateDiscount, type DiscountInput, type DiscountMode } from "@/domain/tools/discount";
import { ebayFeesFromChannel, EMPTY_EBAY_FEES, evaluateEbayFees, type EbayFeesInput } from "@/domain/tools/ebay-fees";
import { convertCurrency, feeImpactPercent, rateAgeDays, type ConversionInput, type FxRate } from "@/domain/tools/currency";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { Callout } from "@/components/ui/page";
import type { EbayChannelFees } from "@/features/tools/types";
import { frDate, fxSourceText } from "@/features/tools/format";
import { ToolColumns } from "@/features/tools/components/profit-tools";
import { AmountField, ChoiceChips, EstimateNote, FormBlock, MissingList, ResultCard, Waiting, type ResultLine } from "@/features/tools/components/ui";

const MODES: DiscountMode[] = ["final_price", "discount_rate", "initial_price"];
const MODE_HELP: Record<DiscountMode, string> = {
  final_price: "Prix initial et remise → prix après réduction.",
  discount_rate: "Prix initial et prix remisé → pourcentage de remise réel.",
  initial_price: "Prix remisé et remise annoncée → prix initial à retrouver.",
};

/** Calculateur de remise détaillé : calcul exact, local et instantané. */
export function DiscountDetail() {
  const [input, setInput] = useState<DiscountInput>({ mode: "final_price", initialPrice: "", finalPrice: "", percent: "" });
  const set = (k: keyof DiscountInput, v: string) => setInput((i) => ({ ...i, [k]: v }));
  const computation = evaluateDiscount(input);
  const errors = computation.state === "invalid" ? computation.errors : {};
  const m = input.mode;

  let result: ReactNode;
  if (computation.state === "ok") {
    const r = computation.result;
    const lines: ResultLine[] = [
      { label: "Prix initial", value: formatMoneyDec(r.initialPrice), kind: r.computed === "initialPrice" ? "total" : "input" },
      { label: "Remise", value: formatPercent(r.percent), kind: r.computed === "percent" ? "total" : "input" },
      { label: "Prix après remise", value: formatMoneyDec(r.finalPrice), kind: r.computed === "finalPrice" ? "total" : "input" },
      { label: "Économie", value: formatMoneyDec(r.saving) },
    ];
    result = <ResultCard title="Résultat" lines={lines} copyText={lines.map((l) => `${l.label} : ${l.value}`).join("\n")} />;
  } else {
    result = <Waiting>{computation.state === "empty" ? "Remplissez les deux champs : le résultat s'affiche immédiatement." : "Corrigez les champs signalés."}</Waiting>;
  }

  return (
    <ToolColumns
      form={
        <FormBlock>
          <ChoiceChips label="Calculer" options={MODES.map((x) => ({ value: x, label: DISCOUNT_MODE_LABEL[x] }))} value={m} onChange={(mode) => setInput((i) => ({ ...i, mode }))} />
          <p className="text-xs text-muted">{MODE_HELP[m]}</p>
          {m !== "initial_price" ? <AmountField label="Prix initial" value={input.initialPrice} onChange={(v) => set("initialPrice", v)} suffix="€" large error={errors.initialPrice} /> : null}
          {m !== "final_price" ? <AmountField label="Prix après remise" value={input.finalPrice} onChange={(v) => set("finalPrice", v)} suffix="€" large error={errors.finalPrice} /> : null}
          {m !== "discount_rate" ? <AmountField label="Remise" value={input.percent} onChange={(v) => set("percent", v)} suffix="%" error={errors.percent} /> : null}
        </FormBlock>
      }
      result={
        <>
          {result}
          <EstimateNote>Affichage arrondi au centime ; calcul exact.</EstimateNote>
        </>
      }
    />
  );
}

/**
 * Calculateur de frais eBay détaillé : AUCUN taux par défaut. L'utilisateur saisit les taux de sa
 * grille (catégorie, statut professionnel, options) ou reprend ceux de son canal eBay.
 */
export function EbayFeesDetail({ channel }: { channel: EbayChannelFees | null }) {
  const [input, setInput] = useState<EbayFeesInput>(EMPTY_EBAY_FEES);
  const [prefilled, setPrefilled] = useState<string[]>([]);
  const set = <K extends keyof EbayFeesInput>(k: K, v: EbayFeesInput[K]) => setInput((i) => ({ ...i, [k]: v }));
  const computation = evaluateEbayFees(input);
  const errors = computation.state === "invalid" ? computation.errors : {};

  let result: ReactNode;
  if (computation.state === "ok") {
    const r = computation.result;
    const lines: ResultLine[] = [
      { label: "Encaissé (objet + port)", value: formatMoneyDec(r.grossReceived), kind: "input" },
      ...r.fees.map((f) => ({ label: f.label, value: `− ${formatMoneyDec(f.amount)}` })),
      { label: "Total des frais eBay", value: formatMoneyDec(r.totalFees), note: r.feesPercentOfGross ? `${formatPercent(r.feesPercentOfGross)} de l'encaissement` : undefined },
      { label: "Reste après frais eBay", value: formatMoneyDec(r.netAfterFees), kind: "total" },
    ];
    if (r.netAfterShipping) lines.push({ label: "Reste après frais et envoi", value: formatMoneyDec(r.netAfterShipping), kind: "total" });
    if (r.profit) lines.push({ label: "Bénéfice après achat", value: formatMoneyDec(r.profit), kind: "total" });
    const copyText = lines.map((l) => `${l.label} : ${l.value}`).join("\n") + (r.notEntered.length ? `\nNon renseigné : ${r.notEntered.join(", ")}` : "");
    result = (
      <>
        <ResultCard title="Résultat" lines={lines} copyText={copyText} />
        <MissingList items={r.notEntered} />
      </>
    );
  } else {
    result = <Waiting>{computation.state === "empty" ? "Saisissez le prix de l'objet et vos taux : le résultat s'affiche immédiatement." : "Corrigez les champs signalés."}</Waiting>;
  }

  const canPrefill = channel !== null && (channel.fee_percent !== null || channel.payment_fee_fixed !== null);
  return (
    <ToolColumns
      form={
        <>
          <FormBlock title="Vente">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <AmountField label="Prix de l'objet" value={input.itemPrice} onChange={(v) => set("itemPrice", v)} suffix="€" large error={errors.itemPrice} />
              <AmountField label="Frais de port facturés à l'acheteur" value={input.shippingCharged} onChange={(v) => set("shippingCharged", v)} suffix="€" placeholder="0,00" error={errors.shippingCharged} />
            </div>
          </FormBlock>
          <FormBlock
            title="Frais eBay (votre grille)"
            action={
              canPrefill ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const r = ebayFeesFromChannel(channel, input);
                    setInput(r.input);
                    setPrefilled(r.prefilled);
                  }}
                >
                  Reprendre mon canal eBay
                </Button>
              ) : undefined
            }
          >
            <p className="text-xs text-muted">Les taux eBay dépendent de la catégorie, de votre statut et de vos options : saisissez ceux de votre grille en vigueur. MON STOCK n'en suppose aucun.</p>
            {prefilled.length ? <p className="text-xs text-muted">Repris de vos réglages du canal eBay : {prefilled.join(", ")}.</p> : null}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <AmountField label="Commission sur la valeur finale" value={input.finalValueFeePercent} onChange={(v) => set("finalValueFeePercent", v)} suffix="%" placeholder="Non renseigné" error={errors.finalValueFeePercent} />
              <ChoiceChips
                label="Commission calculée sur"
                options={[
                  { value: true, label: "Objet + port" },
                  { value: false, label: "Objet seul" },
                ]}
                value={input.feeOnShipping}
                onChange={(v) => set("feeOnShipping", v)}
              />
              <AmountField label="Frais fixes par commande" value={input.fixedFeePerOrder} onChange={(v) => set("fixedFeePerOrder", v)} suffix="€" placeholder="Non renseigné" error={errors.fixedFeePerOrder} />
              <AmountField label="Annonce sponsorisée" value={input.promotedPercent} onChange={(v) => set("promotedPercent", v)} suffix="%" placeholder="Aucune" error={errors.promotedPercent} />
              <AmountField label="Autres frais (options, international…)" value={input.otherFees} onChange={(v) => set("otherFees", v)} suffix="€" placeholder="Aucun" error={errors.otherFees} />
            </div>
          </FormBlock>
          <FormBlock title="Vos coûts (facultatif)">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <AmountField label="Coût réel de l'envoi" value={input.actualShippingCost} onChange={(v) => set("actualShippingCost", v)} suffix="€" placeholder="Non renseigné" error={errors.actualShippingCost} />
              <AmountField label="Coût d'achat de l'objet" value={input.purchaseCost} onChange={(v) => set("purchaseCost", v)} suffix="€" placeholder="Non renseigné" error={errors.purchaseCost} />
            </div>
          </FormBlock>
        </>
      }
      result={
        <>
          {result}
          <EstimateNote>Estimation à partir des taux saisis ; le montant exact figure sur votre relevé eBay.</EstimateNote>
        </>
      }
    />
  );
}

const COMMON = ["EUR", "USD", "GBP", "CNY", "HKD", "PLN", "CHF", "CZK", "SEK", "JPY"];

/**
 * Convertisseur de devises détaillé : taux de référence BCE importés par le serveur (datés),
 * frais bancaires saisis à part. Le taux affiché n'est pas celui de votre banque.
 */
export function CurrencyDetail({ rates }: { rates: FxRate[] }) {
  const [input, setInput] = useState<ConversionInput>({ amount: "", from: "USD", to: "EUR", bankFeePercent: "", bankFeeFixed: "" });
  const [otherCode, setOtherCode] = useState("");
  const set = (k: keyof ConversionInput, v: string) => setInput((i) => ({ ...i, [k]: v }));
  const available = new Set(["EUR", ...rates.map((r) => r.currency)]);
  const options = COMMON.filter((c) => available.has(c));
  if (!options.includes(input.from) && available.has(input.from)) options.push(input.from);
  if (!options.includes(input.to) && available.has(input.to)) options.push(input.to);
  const computation = convertCurrency(input, rates);
  const errors = computation.state === "invalid" ? computation.errors : {};
  const otherKnown = otherCode.length === 3 && available.has(otherCode);

  let result: ReactNode;
  if (computation.state === "ok") {
    const r = computation.result;
    const age = rateAgeDays(r.rateDate, new Date());
    const rateInfo = r.rateDate ? `Taux de référence ${fxSourceText(r.source)} du ${frDate(r.rateDate)}${age !== null && age > 4 ? ` (il y a ${age} jours : vérifiez la mise à jour des taux)` : ""}.` : null;
    const impact = feeImpactPercent(r);
    const lines: ResultLine[] = [
      { label: "Montant saisi", value: formatMoneyDec(r.amount, r.from), kind: "input" },
      { label: "Taux de change (référence)", value: `1 ${r.from} = ${formatDec(r.rate, 6)} ${r.to}`, note: rateInfo ?? undefined },
      { label: "Montant converti (sans frais)", value: formatMoneyDec(r.converted, r.to), kind: "total" },
      { label: "Frais bancaires", value: r.feesEntered ? formatMoneyDec(r.bankFees, r.to) : "Non renseignés", kind: r.feesEntered ? "estimate" : "muted" },
    ];
    if (r.feesEntered) {
      lines.push({ label: "Coût total frais compris", value: formatMoneyDec(r.totalWithFees, r.to), kind: "total" });
      if (r.effectiveRate) lines.push({ label: "Taux effectif frais compris", value: `1 ${r.from} = ${formatDec(r.effectiveRate, 6)} ${r.to}`, note: impact ? `Les frais représentent ${formatPercent(impact)} du montant.` : undefined });
    }
    const copyText = lines.map((l) => `${l.label} : ${l.value}`).join("\n") + (rateInfo ? `\n${rateInfo}` : "");
    result = <ResultCard title="Résultat" lines={lines} copyText={copyText} />;
  } else {
    result = <Waiting>{computation.state === "empty" ? "Saisissez un montant : la conversion s'affiche immédiatement." : "Corrigez la saisie."}</Waiting>;
  }

  return (
    <ToolColumns
      form={
        <>
          {rates.length === 0 ? <Callout tone="warning">Aucun taux importé pour le moment : la conversion n'est possible qu'entre montants en euros.</Callout> : null}
          <FormBlock>
            <AmountField label={`Montant en ${input.from}`} value={input.amount} onChange={(v) => set("amount", v)} suffix={input.from} large error={errors.amount} />
            <ChoiceChips label="De" options={options.map((c) => ({ value: c, label: c }))} value={input.from} onChange={(v) => set("from", v)} />
            <div>
              <Button variant="secondary" size="sm" onClick={() => setInput((i) => ({ ...i, from: i.to, to: i.from }))}>
                <ArrowUpDown aria-hidden="true" className="h-3.5 w-3.5" /> Inverser les devises
              </Button>
            </div>
            <ChoiceChips label="Vers" options={options.map((c) => ({ value: c, label: c }))} value={input.to} onChange={(v) => set("to", v)} />
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (otherKnown) set("from", otherCode);
              }}
            >
              <div className="w-40">
                <Label htmlFor="fx-other">Autre devise (code ISO)</Label>
                <Input id="fx-other" value={otherCode} onChange={(e) => setOtherCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))} placeholder="Ex. TRY" autoCapitalize="characters" aria-describedby="fx-other-hint" />
              </div>
              <Button type="submit" variant="secondary" disabled={!otherKnown}>
                Convertir depuis cette devise
              </Button>
              <p id="fx-other-hint" className="w-full text-xs text-muted">
                {otherCode.length === 3 && !available.has(otherCode) ? "Aucun taux BCE pour cette devise." : `${available.size} devises disponibles.`}
              </p>
            </form>
            {errors.currency ? (
              <p role="alert" className="text-sm text-danger">
                {errors.currency}
              </p>
            ) : null}
          </FormBlock>
          <FormBlock title="Frais bancaires (facultatif)">
            <p className="text-xs text-muted">Commission de change de votre banque ou plateforme de paiement, distincte du taux de référence.</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <AmountField label="Commission" value={input.bankFeePercent} onChange={(v) => set("bankFeePercent", v)} suffix="%" placeholder="—" error={errors.bankFeePercent} />
              <AmountField label={`Frais fixes (${input.to})`} value={input.bankFeeFixed} onChange={(v) => set("bankFeeFixed", v)} placeholder="—" error={errors.bankFeeFixed} />
            </div>
          </FormBlock>
        </>
      }
      result={
        <>
          {result}
          <EstimateNote>Taux de référence publiés par la Banque centrale européenne (indicatifs, jours ouvrés). Le taux réellement appliqué par votre banque ou votre fournisseur peut différer.</EstimateNote>
        </>
      }
    />
  );
}
