import { useState } from "react";
import { KeyboardAvoidingView, Platform } from "react-native";
import { EMPTY_PROFIT_FORM, solveSellingPrice, type FieldErrors, type PriceTarget, type ProfitFormInput } from "@/domain/tools/profit";
import { BreakdownCard, ProfitCostsForm } from "~/components/profit-form";
import { AmountField, EstimateNote, MissingList, ResultCard, ToolHeader, type ResultLine } from "~/components/tools";
import { AlertBanner, Card, Screen, SectionHeader, Segmented, Txt } from "~/components/ui";
import { formatMoney } from "~/lib/format";
import { space } from "~/theme/tokens";

type TargetKind = PriceTarget["kind"];

const TARGETS: { value: TargetKind; label: string }[] = [
  { value: "profit", label: "Bénéfice €" },
  { value: "margin_on_cost", label: "Taux de marge" },
  { value: "margin_on_revenue", label: "Taux de marque" },
];

/** Calculateur de prix de vente : prix minimal pour atteindre la cible, vérifié par le calcul du radar. */
export default function SellingPriceToolScreen() {
  const [form, setForm] = useState<ProfitFormInput>(EMPTY_PROFIT_FORM);
  const [kind, setKind] = useState<TargetKind>("profit");
  const [targetText, setTargetText] = useState("");
  const currency = "EUR";
  const target: PriceTarget = kind === "profit" ? { kind, amount: targetText } : { kind, percent: targetText };
  const computation = solveSellingPrice(form, target);
  const errors: FieldErrors = computation.state === "invalid" ? computation.errors : {};

  let lines: ResultLine[] = [];
  let copyText: string | undefined;
  if (computation.state === "ok") {
    const { economics: e, marginOnCostPercent, marginOnRevenuePercent, partial } = computation.result;
    const pct = (v: number | null) => (v === null ? "—" : `${String(v).replace(".", ",")} %`);
    lines = [
      { label: "Prix de vente nécessaire", value: formatMoney(computation.salePrice, currency), kind: "total", note: "Arrondi au centime supérieur." },
      { label: partial ? "Bénéfice obtenu (coûts connus)" : "Bénéfice obtenu", value: formatMoney(e.estimatedProfit, currency) },
      { label: "Taux de marge", value: pct(marginOnCostPercent), note: "Bénéfice ÷ coût d'achat rendu" },
      { label: "Taux de marque", value: pct(marginOnRevenuePercent), note: "Bénéfice ÷ chiffre d'affaires hors TVA" },
      { label: "Coût d'achat rendu", value: formatMoney(e.landedCost, currency) },
    ];
    copyText = `Prix de vente nécessaire : ${formatMoney(computation.salePrice, currency)}\nCible : ${targetText}${kind === "profit" ? " €" : " %"} (${TARGETS.find((t) => t.value === kind)?.label})\nBénéfice obtenu : ${formatMoney(e.estimatedProfit, currency)}${partial ? `\nNon renseigné : ${e.missing.join(", ")}` : ""}`;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <ToolHeader title="Calculateur de prix de vente" description="Coût d'achat, frais et marge souhaitée → prix de vente nécessaire." />
        <SectionHeader title="Objectif" />
        <Card padded style={{ gap: space[3] }}>
          <Segmented options={TARGETS} value={kind} onChange={setKind} />
          <AmountField
            testID="selling-target"
            label={kind === "profit" ? "Bénéfice visé par unité" : kind === "margin_on_cost" ? "Taux de marge visé (sur coût)" : "Taux de marque visé (sur CA HT)"}
            value={targetText}
            onChangeText={setTargetText}
            suffix={kind === "profit" ? "€" : "%"}
            large
            error={errors.target}
          />
        </Card>
        <ProfitCostsForm form={form} onChange={setForm} errors={errors} />
        <SectionHeader title="Résultat" />
        {computation.state === "ok" ? (
          <>
            <ResultCard lines={lines} copyText={copyText} />
            <MissingList items={computation.result.economics.missing} title="Non renseigné : le prix ne couvre pas ces coûts" />
            <BreakdownCard breakdown={computation.result.breakdown} currency={currency} />
            <ResultCard title="Données saisies" lines={computation.entered.map((e) => ({ label: e.label, value: e.value, kind: "input" as const }))} />
          </>
        ) : computation.state === "impossible" ? (
          <AlertBanner text={computation.reason} tone="dark" />
        ) : (
          <Card padded>
            <Txt variant="bodyRegular">{computation.state === "empty" ? "Saisissez le prix d'achat et votre objectif : le prix nécessaire s'affiche immédiatement." : "Corrigez les champs signalés."}</Txt>
          </Card>
        )}
        <EstimateNote text="Le prix est calculé puis vérifié avec les mêmes règles que le radar d'opportunités. Estimation, pas un avis fiscal ni une garantie de vente." />
      </Screen>
    </KeyboardAvoidingView>
  );
}
