"use client";
import { useMemo, useState, type ReactNode } from "react";
import type { RadarLine, SupplierOrigin, VatRegime } from "@/domain/sourcing/radar";
import { EMPTY_PROFIT_FORM, evaluateProfit, profitFormFromSettings, solveSellingPrice, type FieldErrors, type PriceTarget, type ProfitFormInput } from "@/domain/tools/profit";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/page";
import { formatMoney } from "@/lib/format";
import type { CostDefaults } from "@/features/tools/types";
import { pctText } from "@/features/tools/format";
import { AmountField, ChoiceChips, EstimateNote, FormBlock, MissingList, ResultCard, Waiting, type ResultLine } from "@/features/tools/components/ui";

const CURRENCY = "EUR";

/** Colonnes : saisie à gauche, résultat à droite (collant) sur grand écran. */
export function ToolColumns({ form, result }: { form: ReactNode; result: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div className="space-y-5">{form}</div>
      <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">{result}</div>
    </div>
  );
}

/**
 * Coûts communs au calculateur de marge et au calculateur de prix de vente. Les valeurs peuvent
 * être reprises des paramètres de coûts de l'organisation (ceux du radar) puis modifiées ; un
 * champ vide n'est jamais compté pour 0.
 */
function ProfitCostsForm({ form, onChange, errors, defaults }: { form: ProfitFormInput; onChange: (f: ProfitFormInput) => void; errors: FieldErrors; defaults: CostDefaults | null }) {
  const set = <K extends keyof ProfitFormInput>(key: K, value: ProfitFormInput[K]) => onChange({ ...form, [key]: value });
  return (
    <>
      <FormBlock title="Achat">
        <div className="grid gap-4 sm:grid-cols-2">
          <AmountField label="Prix d'achat unitaire" value={form.purchasePrice} onChange={(v) => set("purchasePrice", v)} suffix="€" error={errors.purchasePrice} />
          <ChoiceChips
            label="Le prix d'achat est"
            options={[
              { value: "ht" as const, label: "HT" },
              { value: "ttc" as const, label: "TTC" },
            ]}
            value={form.purchaseBasis}
            onChange={(v) => set("purchaseBasis", v)}
          />
          <AmountField label="Transport fournisseur (par unité)" value={form.supplierShipping} onChange={(v) => set("supplierShipping", v)} suffix="€" placeholder="Non renseigné" error={errors.supplierShipping} />
          <ChoiceChips<SupplierOrigin>
            label="Fournisseur situé"
            options={[
              { value: "eu", label: "Dans l'UE" },
              { value: "non_eu", label: "Hors UE" },
              { value: "unknown", label: "Je ne sais pas" },
            ]}
            value={form.origin}
            onChange={(v) => set("origin", v)}
          />
          {form.origin === "non_eu" ? <AmountField label="Droits de douane et frais d'import" value={form.importDutyPercent} onChange={(v) => set("importDutyPercent", v)} suffix="%" placeholder="Non renseigné" error={errors.importDutyPercent} /> : null}
        </div>
      </FormBlock>
      <FormBlock
        title="TVA et frais de vente"
        action={
          defaults ? (
            <Button variant="secondary" size="sm" onClick={() => onChange(profitFormFromSettings(defaults.settings, form))}>
              Reprendre mes paramètres
            </Button>
          ) : undefined
        }
      >
        {defaults?.fromChannel.length ? <p className="text-xs text-muted">Vos paramètres reprennent votre canal eBay pour : {defaults.fromChannel.join(", ")}.</p> : null}
        <ChoiceChips<VatRegime | null>
          label="Régime de TVA à la revente"
          options={[
            { value: "normal", label: "Normal" },
            { value: "margin", label: "Sur marge (occasion)" },
            { value: "franchise", label: "Franchise" },
            { value: null, label: "Non précisé" },
          ]}
          value={form.vatRegime}
          onChange={(v) => set("vatRegime", v)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {form.vatRegime === "normal" || form.vatRegime === "margin" ? <AmountField label="Taux de TVA" value={form.vatRate} onChange={(v) => set("vatRate", v)} suffix="%" placeholder="Ex. 20" error={errors.vatRate} hint="Taux applicable à votre produit, à vérifier." /> : null}
          {form.vatRegime !== "franchise" ? (
            <ChoiceChips<boolean | null>
              label="TVA payée au fournisseur récupérable ?"
              options={[
                { value: true, label: "Oui" },
                { value: false, label: "Non" },
                { value: null, label: "Je ne sais pas" },
              ]}
              value={form.vatRecoverable}
              onChange={(v) => set("vatRecoverable", v)}
            />
          ) : null}
          <AmountField label="Commission marketplace" value={form.marketplaceFeePercent} onChange={(v) => set("marketplaceFeePercent", v)} suffix="%" placeholder="Non renseigné" error={errors.marketplaceFeePercent} />
          <div className="grid grid-cols-2 gap-3">
            <AmountField label="Frais de paiement" value={form.paymentFeePercent} onChange={(v) => set("paymentFeePercent", v)} suffix="%" placeholder="—" error={errors.paymentFeePercent} />
            <AmountField label="+ fixe" value={form.paymentFeeFixed} onChange={(v) => set("paymentFeeFixed", v)} suffix="€" placeholder="—" error={errors.paymentFeeFixed} />
          </div>
          <AmountField label="Expédition au client" value={form.shippingToCustomer} onChange={(v) => set("shippingToCustomer", v)} suffix="€" placeholder="Non renseigné" error={errors.shippingToCustomer} />
          <AmountField label="Emballage" value={form.packagingCost} onChange={(v) => set("packagingCost", v)} suffix="€" placeholder="Non renseigné" error={errors.packagingCost} />
          <AmountField label="Provision retours / garantie" value={form.returnProvisionPercent} onChange={(v) => set("returnProvisionPercent", v)} suffix="%" placeholder="Non renseigné" error={errors.returnProvisionPercent} />
        </div>
        {defaults ? null : <p className="text-xs text-muted">Paramètres de l'organisation indisponibles : saisissez vos frais.</p>}
      </FormBlock>
    </>
  );
}

/** Détail du calcul (mêmes lignes que le radar). */
function BreakdownCard({ breakdown }: { breakdown: RadarLine[] }) {
  const lines: ResultLine[] = breakdown.map((b) => ({ label: b.label, value: b.amount === null ? "—" : formatMoney(b.amount, CURRENCY), kind: /^Bénéfice|^Marge brute/.test(b.label) ? "total" : "estimate" }));
  return <ResultCard title="Détail du calcul" lines={lines} />;
}

/** Calculateur de marge détaillé : même calcul que le radar d'opportunités (fonction partagée). */
export function MarginDetail({ defaults }: { defaults: CostDefaults | null }) {
  const [form, setForm] = useState<ProfitFormInput>(EMPTY_PROFIT_FORM);
  const [salePrice, setSalePrice] = useState("");
  const computation = useMemo(() => evaluateProfit(form, salePrice), [form, salePrice]);
  const errors: FieldErrors = computation.state === "invalid" ? computation.errors : {};

  let result: ReactNode;
  if (computation.state === "ok") {
    const { economics: e, marginOnCostPercent, marginOnRevenuePercent, partial } = computation.result;
    const summary: ResultLine[] = [
      { label: partial ? "Bénéfice estimé (coûts connus)" : "Bénéfice estimé", value: formatMoney(e.estimatedProfit, CURRENCY), kind: "total" },
      { label: "Taux de marge", value: pctText(marginOnCostPercent), note: "Bénéfice ÷ coût d'achat rendu" },
      { label: "Taux de marque", value: pctText(marginOnRevenuePercent), note: "Bénéfice ÷ chiffre d'affaires hors TVA" },
      { label: "Coût d'achat rendu", value: formatMoney(e.landedCost, CURRENCY) },
      { label: "Frais de vente connus", value: formatMoney(e.sellingFees, CURRENCY) },
    ];
    const copyText = `Prix de vente : ${salePrice} €\nPrix d'achat : ${form.purchasePrice} € ${form.purchaseBasis.toUpperCase()}\nBénéfice estimé : ${formatMoney(e.estimatedProfit, CURRENCY)}\nTaux de marge : ${pctText(marginOnCostPercent)}\nTaux de marque : ${pctText(marginOnRevenuePercent)}${partial ? `\nNon renseigné : ${e.missing.join(", ")}` : ""}`;
    result = (
      <>
        <ResultCard title="Résultat" lines={summary} copyText={copyText} />
        <MissingList items={e.missing} />
        {e.cautions.map((c) => (
          <p key={c} className="text-xs text-muted">
            {c}
          </p>
        ))}
        <BreakdownCard breakdown={computation.result.breakdown} />
        <ResultCard title="Données saisies" lines={computation.entered.map((x) => ({ label: x.label, value: x.value, kind: "input" as const }))} />
      </>
    );
  } else {
    result = <Waiting>{computation.state === "empty" ? "Saisissez le prix d'achat et le prix de vente : le résultat s'affiche immédiatement." : "Corrigez les champs signalés."}</Waiting>;
  }

  return (
    <ToolColumns
      form={
        <>
          <FormBlock title="Vente">
            <AmountField label="Prix de vente (payé par l'acheteur)" value={salePrice} onChange={setSalePrice} suffix="€" large error={errors.salePrice} hint="TTC si vous facturez la TVA ; prix encaissé en TVA sur marge ou en franchise." />
          </FormBlock>
          <ProfitCostsForm form={form} onChange={setForm} errors={errors} defaults={defaults} />
        </>
      }
      result={
        <>
          {result}
          <EstimateNote>Estimation calculée avec les mêmes règles que le radar d'opportunités. Un frais non renseigné n'est pas déduit : il est listé. Ce n'est pas un avis fiscal.</EstimateNote>
        </>
      }
    />
  );
}

type TargetKind = PriceTarget["kind"];

const TARGETS: { value: TargetKind; label: string }[] = [
  { value: "profit", label: "Bénéfice €" },
  { value: "margin_on_cost", label: "Taux de marge" },
  { value: "margin_on_revenue", label: "Taux de marque" },
];

/** Calculateur de prix de vente détaillé : prix minimal pour atteindre la cible, vérifié par le calcul du radar. */
export function SellingPriceDetail({ defaults }: { defaults: CostDefaults | null }) {
  const [form, setForm] = useState<ProfitFormInput>(EMPTY_PROFIT_FORM);
  const [kind, setKind] = useState<TargetKind>("profit");
  const [targetText, setTargetText] = useState("");
  const target: PriceTarget = kind === "profit" ? { kind, amount: targetText } : { kind, percent: targetText };
  const computation = solveSellingPrice(form, target);
  const errors: FieldErrors = computation.state === "invalid" ? computation.errors : {};

  let result: ReactNode;
  if (computation.state === "ok") {
    const { economics: e, marginOnCostPercent, marginOnRevenuePercent, partial } = computation.result;
    const lines: ResultLine[] = [
      { label: "Prix de vente nécessaire", value: formatMoney(computation.salePrice, CURRENCY), kind: "total", note: "Arrondi au centime supérieur." },
      { label: partial ? "Bénéfice obtenu (coûts connus)" : "Bénéfice obtenu", value: formatMoney(e.estimatedProfit, CURRENCY) },
      { label: "Taux de marge", value: pctText(marginOnCostPercent), note: "Bénéfice ÷ coût d'achat rendu" },
      { label: "Taux de marque", value: pctText(marginOnRevenuePercent), note: "Bénéfice ÷ chiffre d'affaires hors TVA" },
      { label: "Coût d'achat rendu", value: formatMoney(e.landedCost, CURRENCY) },
    ];
    const copyText = `Prix de vente nécessaire : ${formatMoney(computation.salePrice, CURRENCY)}\nCible : ${targetText}${kind === "profit" ? " €" : " %"} (${TARGETS.find((t) => t.value === kind)?.label})\nBénéfice obtenu : ${formatMoney(e.estimatedProfit, CURRENCY)}${partial ? `\nNon renseigné : ${e.missing.join(", ")}` : ""}`;
    result = (
      <>
        <ResultCard title="Résultat" lines={lines} copyText={copyText} />
        <MissingList items={e.missing} title="Non renseigné : le prix ne couvre pas ces coûts" />
        <BreakdownCard breakdown={computation.result.breakdown} />
        <ResultCard title="Données saisies" lines={computation.entered.map((x) => ({ label: x.label, value: x.value, kind: "input" as const }))} />
      </>
    );
  } else if (computation.state === "impossible") {
    result = <Callout tone="warning">{computation.reason}</Callout>;
  } else {
    result = <Waiting>{computation.state === "empty" ? "Saisissez le prix d'achat et votre objectif : le prix nécessaire s'affiche immédiatement." : "Corrigez les champs signalés."}</Waiting>;
  }

  return (
    <ToolColumns
      form={
        <>
          <FormBlock title="Objectif">
            <ChoiceChips label="Cible" options={TARGETS} value={kind} onChange={setKind} />
            <AmountField
              label={kind === "profit" ? "Bénéfice visé par unité" : kind === "margin_on_cost" ? "Taux de marge visé (sur coût)" : "Taux de marque visé (sur CA HT)"}
              value={targetText}
              onChange={setTargetText}
              suffix={kind === "profit" ? "€" : "%"}
              large
              error={errors.target}
            />
          </FormBlock>
          <ProfitCostsForm form={form} onChange={setForm} errors={errors} defaults={defaults} />
        </>
      }
      result={
        <>
          {result}
          <EstimateNote>Le prix est calculé puis vérifié avec les mêmes règles que le radar d'opportunités. Estimation, pas un avis fiscal ni une garantie de vente.</EstimateNote>
        </>
      }
    />
  );
}
