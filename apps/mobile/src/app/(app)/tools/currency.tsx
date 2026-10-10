import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { ArrowUpDown } from "lucide-react-native";
import { formatDec, formatMoneyDec, formatPercent } from "@/domain/tools/decimal";
import { convertCurrency, feeImpactPercent, rateAgeDays, type ConversionInput } from "@/domain/tools/currency";
import { AmountField, ChoiceChips, EstimateNote, ResultCard, ToolHeader, type ResultLine } from "~/components/tools";
import { AlertBanner, Card, ErrorState, Screen, SectionHeader, SkeletonList, TextField, Txt } from "~/components/ui";
import { useFxRates } from "~/data/hooks";
import { userMessage } from "~/lib/errors";
import { color, radius, space } from "~/theme/tokens";

const COMMON = ["EUR", "USD", "GBP", "CNY", "HKD", "PLN", "CHF", "CZK", "SEK", "JPY"];

const frDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

/**
 * Convertisseur de devises : taux de référence BCE importés par le serveur (datés), frais
 * bancaires saisis à part. Le taux affiché n'est pas celui de votre banque.
 */
export default function CurrencyToolScreen() {
  const fx = useFxRates();
  const [input, setInput] = useState<ConversionInput>({ amount: "", from: "USD", to: "EUR", bankFeePercent: "", bankFeeFixed: "" });
  const [otherCode, setOtherCode] = useState("");
  const set = (k: keyof ConversionInput, v: string) => setInput((i) => ({ ...i, [k]: v }));

  if (fx.isPending)
    return (
      <Screen scroll={false}>
        <ToolHeader title="Convertisseur de devises" />
        <SkeletonList rows={5} thumb={false} />
      </Screen>
    );
  if (fx.isError)
    return (
      <Screen scroll={false}>
        <ToolHeader title="Convertisseur de devises" />
        <ErrorState description={`Taux de change indisponibles : ${userMessage(fx.error)}`} onRetry={() => void fx.refetch()} />
      </Screen>
    );
  const rates = fx.data;
  const available = new Set(["EUR", ...rates.map((r) => r.currency)]);
  const options = COMMON.filter((c) => available.has(c));
  if (!options.includes(input.from) && available.has(input.from)) options.push(input.from);
  if (!options.includes(input.to) && available.has(input.to)) options.push(input.to);
  const computation = convertCurrency(input, rates);
  const errors = computation.state === "invalid" ? computation.errors : {};

  let lines: ResultLine[] = [];
  let copyText: string | undefined;
  let rateInfo: string | null = null;
  if (computation.state === "ok") {
    const r = computation.result;
    const age = rateAgeDays(r.rateDate, new Date());
    rateInfo = r.rateDate ? `Taux de référence ${r.source.toUpperCase() === "ECB" ? "BCE" : r.source} du ${frDate(r.rateDate)}${age !== null && age > 4 ? ` (il y a ${age} jours : vérifiez la mise à jour des taux)` : ""}.` : null;
    const impact = feeImpactPercent(r);
    lines = [
      { label: "Montant saisi", value: formatMoneyDec(r.amount, r.from), kind: "input" },
      { label: "Taux de change (référence)", value: `1 ${r.from} = ${formatDec(r.rate, 6)} ${r.to}`, note: rateInfo ?? undefined },
      { label: "Montant converti (sans frais)", value: formatMoneyDec(r.converted, r.to), kind: "total" },
      { label: "Frais bancaires", value: r.feesEntered ? formatMoneyDec(r.bankFees, r.to) : "Non renseignés", kind: r.feesEntered ? "estimate" : "muted" },
    ];
    if (r.feesEntered) {
      lines.push({ label: "Coût total frais compris", value: formatMoneyDec(r.totalWithFees, r.to), kind: "total" });
      if (r.effectiveRate) lines.push({ label: "Taux effectif frais compris", value: `1 ${r.from} = ${formatDec(r.effectiveRate, 6)} ${r.to}`, note: impact ? `Les frais représentent ${formatPercent(impact)} du montant.` : undefined });
    }
    copyText = lines.map((l) => `${l.label} : ${l.value}`).join("\n") + (rateInfo ? `\n${rateInfo}` : "");
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <ToolHeader title="Convertisseur de devises" description="Convertissez vos prix d'achat en euros avec le taux de référence daté et vos frais bancaires." />
        {rates.length === 0 ? <AlertBanner text="Aucun taux importé pour le moment : la conversion n'est possible qu'entre montants en euros." tone="dark" /> : null}
        <Card padded style={{ gap: space[3] }}>
          <AmountField testID="fx-amount" label={`Montant en ${input.from}`} value={input.amount} onChangeText={(v) => set("amount", v)} suffix={input.from} large error={errors.amount} />
          <ChoiceChips label="De" options={options.map((c) => ({ value: c, label: c }))} value={input.from} onChange={(v) => set("from", v)} />
          <View style={{ flexDirection: "row", justifyContent: "center" }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Inverser les devises"
              onPress={() => setInput((i) => ({ ...i, from: i.to, to: i.from }))}
              style={({ pressed }) => ({ width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? color.ink2 : color.ink })}
            >
              <ArrowUpDown size={18} color={color.inkOnDark} />
            </Pressable>
          </View>
          <ChoiceChips label="Vers" options={options.map((c) => ({ value: c, label: c }))} value={input.to} onChange={(v) => set("to", v)} />
          <View style={{ flexDirection: "row", gap: space[2], alignItems: "flex-end" }}>
            <View style={{ flex: 1 }}>
              <TextField
                label="Autre devise (code ISO)"
                value={otherCode}
                onChangeText={(t) => setOtherCode(t.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))}
                placeholder="Ex. TRY"
                autoCapitalize="characters"
                hint={otherCode.length === 3 && !available.has(otherCode) ? "Aucun taux BCE pour cette devise." : `${available.size} devises disponibles.`}
                onSubmitEditing={() => otherCode.length === 3 && available.has(otherCode) && set("from", otherCode)}
              />
            </View>
          </View>
          {errors.currency ? (
            <Txt variant="label" color={color.danger}>
              {errors.currency}
            </Txt>
          ) : null}
        </Card>
        <SectionHeader title="Frais bancaires (facultatif)" />
        <Card padded style={{ gap: space[3] }}>
          <Txt variant="label">Commission de change de votre banque ou plateforme de paiement, distincte du taux de référence.</Txt>
          <View style={{ flexDirection: "row", gap: space[2] }}>
            <View style={{ flex: 1 }}>
              <AmountField label="Commission" value={input.bankFeePercent} onChangeText={(v) => set("bankFeePercent", v)} suffix="%" placeholder="—" error={errors.bankFeePercent} />
            </View>
            <View style={{ flex: 1 }}>
              <AmountField label={`Frais fixes (${input.to})`} value={input.bankFeeFixed} onChangeText={(v) => set("bankFeeFixed", v)} placeholder="—" error={errors.bankFeeFixed} />
            </View>
          </View>
        </Card>
        {computation.state === "ok" ? (
          <ResultCard title="Résultat" lines={lines} copyText={copyText} />
        ) : (
          <Card padded>
            <Txt variant="bodyRegular">{computation.state === "empty" ? "Saisissez un montant : la conversion s'affiche immédiatement." : "Corrigez la saisie."}</Txt>
          </Card>
        )}
        <EstimateNote text="Taux de référence publiés par la Banque centrale européenne (indicatifs, jours ouvrés). Le taux réellement appliqué par votre banque ou votre fournisseur peut différer." />
      </Screen>
    </KeyboardAvoidingView>
  );
}
