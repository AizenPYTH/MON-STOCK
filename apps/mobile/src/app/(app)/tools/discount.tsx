import { useState } from "react";
import { KeyboardAvoidingView, Platform } from "react-native";
import { formatMoneyDec, formatPercent } from "@/domain/tools/decimal";
import { DISCOUNT_MODE_LABEL, evaluateDiscount, type DiscountInput, type DiscountMode } from "@/domain/tools/discount";
import { AmountField, EstimateNote, ResultCard, ToolHeader, type ResultLine } from "~/components/tools";
import { Card, Screen, Segmented, Txt } from "~/components/ui";
import { space } from "~/theme/tokens";

const MODES: DiscountMode[] = ["final_price", "discount_rate", "initial_price"];
const MODE_HELP: Record<DiscountMode, string> = {
  final_price: "Prix initial et remise → prix après réduction.",
  discount_rate: "Prix initial et prix remisé → pourcentage de remise réel.",
  initial_price: "Prix remisé et remise annoncée → prix initial à retrouver.",
};

/** Calculateur de remise : calcul exact, local et instantané. */
export default function DiscountToolScreen() {
  const [input, setInput] = useState<DiscountInput>({ mode: "final_price", initialPrice: "", finalPrice: "", percent: "" });
  const set = (k: keyof DiscountInput, v: string) => setInput((i) => ({ ...i, [k]: v }));
  const computation = evaluateDiscount(input);
  const errors = computation.state === "invalid" ? computation.errors : {};
  const currency = "EUR";
  const m = input.mode;

  let lines: ResultLine[] = [];
  if (computation.state === "ok") {
    const r = computation.result;
    lines = [
      { label: "Prix initial", value: formatMoneyDec(r.initialPrice, currency), kind: r.computed === "initialPrice" ? "total" : "input" },
      { label: "Remise", value: formatPercent(r.percent), kind: r.computed === "percent" ? "total" : "input" },
      { label: "Prix après remise", value: formatMoneyDec(r.finalPrice, currency), kind: r.computed === "finalPrice" ? "total" : "input" },
      { label: "Économie", value: formatMoneyDec(r.saving, currency) },
    ];
  }
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <ToolHeader title="Calculateur de remise" description="Pour négocier avec vos fournisseurs et analyser les promotions." />
        <Segmented options={MODES.map((x) => ({ value: x, label: DISCOUNT_MODE_LABEL[x] }))} value={m} onChange={(mode) => setInput((i) => ({ ...i, mode }))} />
        <Txt variant="label">{MODE_HELP[m]}</Txt>
        <Card padded style={{ gap: space[3] }}>
          {m !== "initial_price" ? <AmountField testID="discount-initial" label="Prix initial" value={input.initialPrice} onChangeText={(v) => set("initialPrice", v)} suffix="€" large error={errors.initialPrice} /> : null}
          {m !== "final_price" ? <AmountField testID="discount-final" label="Prix après remise" value={input.finalPrice} onChangeText={(v) => set("finalPrice", v)} suffix="€" large error={errors.finalPrice} /> : null}
          {m !== "discount_rate" ? <AmountField testID="discount-percent" label="Remise" value={input.percent} onChangeText={(v) => set("percent", v)} suffix="%" error={errors.percent} /> : null}
        </Card>
        {computation.state === "ok" ? (
          <ResultCard title="Résultat" lines={lines} copyText={lines.map((l) => `${l.label} : ${l.value}`).join("\n")} />
        ) : (
          <Card padded>
            <Txt variant="bodyRegular">{computation.state === "empty" ? "Remplissez les deux champs : le résultat s'affiche immédiatement." : "Corrigez les champs signalés."}</Txt>
          </Card>
        )}
        <EstimateNote text="Affichage arrondi au centime ; calcul exact." />
      </Screen>
    </KeyboardAvoidingView>
  );
}
