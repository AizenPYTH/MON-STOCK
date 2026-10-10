import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform } from "react-native";
import { EMPTY_PROFIT_FORM, evaluateProfit, type FieldErrors, type ProfitFormInput } from "@/domain/tools/profit";
import { BreakdownCard, ProfitCostsForm } from "~/components/profit-form";
import { AmountField, EstimateNote, MissingList, ResultCard, ToolHeader, type ResultLine } from "~/components/tools";
import { Card, Screen, SectionHeader, Txt } from "~/components/ui";
import { formatMoney } from "~/lib/format";
import { space } from "~/theme/tokens";

/**
 * Calculateur de marge : même calcul que le radar d'opportunités (fonction partagée). Résultat
 * instantané, local ; les données saisies et les estimations sont distinguées.
 */
export default function MarginToolScreen() {
  const [form, setForm] = useState<ProfitFormInput>(EMPTY_PROFIT_FORM);
  const [salePrice, setSalePrice] = useState("");
  const currency = "EUR";
  const computation = useMemo(() => evaluateProfit(form, salePrice), [form, salePrice]);
  const errors: FieldErrors = computation.state === "invalid" ? computation.errors : {};

  let summary: ResultLine[] = [];
  let copyText: string | undefined;
  if (computation.state === "ok") {
    const { economics: e, marginOnCostPercent, marginOnRevenuePercent, partial } = computation.result;
    const pct = (v: number | null) => (v === null ? "—" : `${String(v).replace(".", ",")} %`);
    summary = [
      { label: partial ? "Bénéfice estimé (coûts connus)" : "Bénéfice estimé", value: formatMoney(e.estimatedProfit, currency), kind: "total" },
      { label: "Taux de marge", value: pct(marginOnCostPercent), note: "Bénéfice ÷ coût d'achat rendu" },
      { label: "Taux de marque", value: pct(marginOnRevenuePercent), note: "Bénéfice ÷ chiffre d'affaires hors TVA" },
      { label: "Coût d'achat rendu", value: formatMoney(e.landedCost, currency) },
      { label: "Frais de vente connus", value: formatMoney(e.sellingFees, currency) },
    ];
    copyText = `Prix de vente : ${salePrice} €\nPrix d'achat : ${form.purchasePrice} € ${form.purchaseBasis.toUpperCase()}\nBénéfice estimé : ${formatMoney(e.estimatedProfit, currency)}\nTaux de marge : ${pct(marginOnCostPercent)}\nTaux de marque : ${pct(marginOnRevenuePercent)}${partial ? `\nNon renseigné : ${e.missing.join(", ")}` : ""}`;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <ToolHeader title="Calculateur de marge" description="Prix d'achat, prix de vente et frais → bénéfice estimé et taux de marge." />
        <SectionHeader title="Vente" />
        <Card padded style={{ gap: space[3] }}>
          <AmountField testID="margin-sale" label="Prix de vente (payé par l'acheteur)" value={salePrice} onChangeText={setSalePrice} suffix="€" large error={errors.salePrice} hint="TTC si vous facturez la TVA ; prix encaissé en TVA sur marge ou en franchise." />
        </Card>
        <ProfitCostsForm form={form} onChange={setForm} errors={errors} />
        <SectionHeader title="Résultat" />
        {computation.state === "ok" ? (
          <>
            <ResultCard lines={summary} copyText={copyText} />
            <MissingList items={computation.result.economics.missing} />
            {computation.result.economics.cautions.map((c) => (
              <Txt key={c} variant="label">
                {c}
              </Txt>
            ))}
            <BreakdownCard breakdown={computation.result.breakdown} currency={currency} />
            <ResultCard title="Données saisies" lines={computation.entered.map((e) => ({ label: e.label, value: e.value, kind: "input" as const }))} />
          </>
        ) : (
          <Card padded>
            <Txt variant="bodyRegular">{computation.state === "empty" ? "Saisissez le prix d'achat et le prix de vente : le résultat s'affiche immédiatement." : "Corrigez les champs signalés."}</Txt>
          </Card>
        )}
        <EstimateNote text="Estimation calculée avec les mêmes règles que le radar d'opportunités. Un frais non renseigné n'est pas déduit : il est listé. Ce n'est pas un avis fiscal." />
      </Screen>
    </KeyboardAvoidingView>
  );
}
