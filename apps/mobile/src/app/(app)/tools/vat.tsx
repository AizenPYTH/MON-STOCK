import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { ArrowUpDown } from "lucide-react-native";
import { formatMoneyDec, formatPercent, formatDec, PARSE_ERROR_LABEL, toCents } from "@/domain/tools/decimal";
import { customRateOption, DEFAULT_VAT_RATES, evaluateVatForm, invertMode, RATE_ERROR_LABEL, VAT_DISCLAIMER, VAT_MODE_LABEL, type AmountBasis, type VatMode, type VatRateOption } from "@/domain/tools/vat";
import { AmountField, ChoiceChips, EstimateNote, ResultCard, ToolHeader, type ResultLine } from "~/components/tools";
import { Button, Card, FilterChip, Screen, Segmented, TextField, Txt } from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";
import { fontFamily } from "~/theme/typography";

const MODES: VatMode[] = ["ht_to_ttc", "ttc_to_ht", "vat_only"];

/** Calculateur de TVA : calcul local, exact, instantané (aucun appel serveur). */
export default function VatToolScreen() {
  const [mode, setMode] = useState<VatMode>("ht_to_ttc");
  const [amount, setAmount] = useState("");
  const [vatOnlyBasis, setVatOnlyBasis] = useState<AmountBasis>("ht");
  const [rates, setRates] = useState<VatRateOption[]>(DEFAULT_VAT_RATES);
  const [rateId, setRateId] = useState(DEFAULT_VAT_RATES[0]!.id);
  const [customText, setCustomText] = useState("");
  const [customError, setCustomError] = useState<string | undefined>();
  const currency = "EUR";

  const rate = rates.find((r) => r.id === rateId) ?? rates[0]!;
  const computation = useMemo(() => evaluateVatForm({ mode, amount, rate: rate.rate, vatOnlyBasis }), [mode, amount, rate.rate, vatOnlyBasis]);
  const basis = mode === "ht_to_ttc" ? "ht" : mode === "ttc_to_ht" ? "ttc" : vatOnlyBasis;
  const inputLabel = basis === "ht" ? "Montant HT" : "Montant TTC";

  function invert() {
    if (computation.state === "ok") {
      // Le résultat devient la saisie (arrondi au centime affiché).
      const next = basis === "ht" ? computation.result.ttc : computation.result.ht;
      setAmount(formatDec({ n: toCents(next), d: 100n }).replace(/ /g, ""));
    }
    if (mode === "vat_only") setVatOnlyBasis(basis === "ht" ? "ttc" : "ht");
    else setMode(invertMode(mode));
  }

  function addCustom() {
    const opt = customRateOption(customText);
    if (!opt) {
      setCustomError("Taux invalide : entre 0 et 100 (ex. 8,5).");
      return;
    }
    setCustomError(undefined);
    setRates((rs) => (rs.some((r) => r.id === opt.id) ? rs : [...rs, opt]));
    setRateId(opt.id);
    setCustomText("");
  }

  let lines: ResultLine[] = [];
  let copyText: string | undefined;
  if (computation.state === "ok") {
    const r = computation.result;
    const rateLabel = formatPercent(r.rate);
    lines = [
      { label: "Montant HT", value: formatMoneyDec(r.ht, currency), kind: basis === "ht" ? "input" : "estimate" },
      { label: `TVA (${rateLabel})`, value: formatMoneyDec(r.vat, currency), kind: mode === "vat_only" ? "total" : "estimate" },
      { label: "Montant TTC", value: formatMoneyDec(r.ttc, currency), kind: basis === "ttc" ? "input" : "total" },
    ];
    if (mode === "ht_to_ttc") lines[2]!.kind = "total";
    if (mode === "ttc_to_ht") lines[0]!.kind = "total";
    copyText = `HT : ${formatMoneyDec(r.ht, currency)}\nTVA ${rateLabel} : ${formatMoneyDec(r.vat, currency)}\nTTC : ${formatMoneyDec(r.ttc, currency)}\n(base saisie : ${basis.toUpperCase()}, estimation)`;
  }
  const amountError = computation.state === "error" && computation.field === "amount" ? PARSE_ERROR_LABEL[computation.error as keyof typeof PARSE_ERROR_LABEL] : undefined;
  const rateError = computation.state === "error" && computation.field === "rate" ? RATE_ERROR_LABEL[computation.error] : undefined;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <ToolHeader title="Calculateur de TVA" />
        <Segmented options={MODES.map((m) => ({ value: m, label: VAT_MODE_LABEL[m] }))} value={mode} onChange={setMode} />
        {mode === "vat_only" ? (
          <ChoiceChips
            label="Le montant saisi est"
            options={[
              { value: "ht" as AmountBasis, label: "Hors taxes (HT)" },
              { value: "ttc" as AmountBasis, label: "Toutes taxes comprises (TTC)" },
            ]}
            value={vatOnlyBasis}
            onChange={setVatOnlyBasis}
          />
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space[2] }}>
          <View style={{ flex: 1 }}>
            <AmountField testID="vat-amount" label={inputLabel} value={amount} onChangeText={setAmount} suffix="€" large error={amountError} />
          </View>
          <Pressable
            testID="vat-invert"
            accessibilityRole="button"
            accessibilityLabel="Inverser le sens du calcul"
            onPress={invert}
            style={({ pressed }) => ({ width: 60, height: 60, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? color.ink2 : color.ink, marginBottom: amountError ? 24 : 0 })}
          >
            <ArrowUpDown size={22} color={color.inkOnDark} />
          </Pressable>
        </View>
        <View style={{ gap: 6 }}>
          <Txt variant="label" color={color.ink} style={{ fontFamily: fontFamily[700] }}>
            Taux de TVA sélectionné : {rate.label}
          </Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
            {rates.map((r) => (
              <FilterChip key={r.id} label={r.label} selected={r.id === rate.id} onPress={() => setRateId(r.id)} />
            ))}
          </View>
          <Txt variant="label">{rate.hint}</Txt>
          {rateError ? (
            <Txt variant="label" color={color.danger}>
              {rateError}
            </Txt>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space[2] }}>
          <View style={{ flex: 1 }}>
            <TextField label="Autre taux (%)" value={customText} onChangeText={setCustomText} keyboardType="decimal-pad" placeholder="Ex. 8,5" error={customError} returnKeyType="done" onSubmitEditing={addCustom} />
          </View>
          <Button label="Ajouter" variant="secondary" compact onPress={addCustom} disabled={customText.trim() === ""} style={{ marginBottom: customError ? 24 : 2 }} />
        </View>
        {computation.state === "ok" ? (
          <ResultCard title={`Résultat · base ${basis.toUpperCase()}`} lines={lines} copyText={copyText} />
        ) : (
          <Card padded>
            <Txt variant="bodyRegular">{computation.state === "empty" ? `Saisissez un ${inputLabel.toLowerCase()} : HT, TVA et TTC s'affichent pendant la saisie.` : "Corrigez la saisie pour voir le résultat."}</Txt>
          </Card>
        )}
        <EstimateNote text={`Affichage arrondi au centime ; calcul exact sans arrondi intermédiaire. ${VAT_DISCLAIMER}`} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
