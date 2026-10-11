import { useMemo, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { formatDec, formatPercent, PARSE_ERROR_LABEL, toCents } from "@/domain/tools/decimal";
import { customRateOption, DEFAULT_VAT_RATES, evaluateVatForm, RATE_ERROR_LABEL, VAT_DISCLAIMER, type VatMode, type VatRateOption } from "@/domain/tools/vat";
import { EstimateNote } from "~/components/tools";
import { applyKey, BottomSheet, Button, Keypad, NightHeader, Screen, TextField, Txt, useToast, ValueField, type KeypadKey } from "~/components/ui";
import { color, space } from "~/theme/tokens";

type Field = "ht" | "ttc";
const MAX_RATE_TABS = 4;

/**
 * Calculateur de TVA (v3, écran de référence « calculatrice ») : taux en onglets dans le bandeau,
 * champs HT / TVA / TTC, saisie au clavier intégré (aucun clavier système). Calcul local, exact,
 * instantané (`evaluateVatForm`, aucun appel serveur) ; la chaîne saisie reste la source du calcul.
 */
export default function VatToolScreen() {
  const [field, setField] = useState<Field>("ht");
  const [amount, setAmount] = useState("");
  const [rates, setRates] = useState<VatRateOption[]>(DEFAULT_VAT_RATES);
  const [rateId, setRateId] = useState(DEFAULT_VAT_RATES[0]!.id);
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState("");
  const [customError, setCustomError] = useState<string | undefined>();
  const toast = useToast();

  const rate = rates.find((r) => r.id === rateId) ?? rates[0]!;
  const mode: VatMode = field === "ht" ? "ht_to_ttc" : "ttc_to_ht";
  const computation = useMemo(() => evaluateVatForm({ mode, amount, rate: rate.rate, vatOnlyBasis: field }), [mode, amount, rate.rate, field]);
  const r = computation.state === "ok" ? computation.result : null;

  /** Le champ touché devient la saisie ; le résultat affiché y est repris (arrondi au centime). */
  function focus(next: Field) {
    if (next === field) return;
    if (r) setAmount(formatDec({ n: toCents(next === "ht" ? r.ht : r.ttc), d: 100n }).replace(/\s/g, ""));
    setField(next);
  }

  function onKey(k: KeypadKey) {
    setAmount((a) => applyKey(a, k));
  }

  async function copy() {
    if (!r) return;
    const rateLabel = formatPercent(r.rate);
    const text = `HT : ${formatDec(r.ht)} €\nTVA ${rateLabel} : ${formatDec(r.vat)} €\nTTC : ${formatDec(r.ttc)} €\n(base saisie : ${field.toUpperCase()} ; estimation, pas un avis fiscal)`;
    await Clipboard.setStringAsync(text);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    toast({ text: "Résultats copiés", tone: "success" });
  }

  function addCustom() {
    const opt = customRateOption(customText);
    if (!opt) {
      setCustomError("Taux invalide : entre 0 et 100 (ex. 8,5).");
      return;
    }
    setCustomError(undefined);
    setRates((rs) => (rs.some((x) => x.id === opt.id) ? rs : [...rs.slice(0, MAX_RATE_TABS - 1), opt]));
    setRateId(opt.id);
    setCustomText("");
    setCustomOpen(false);
  }

  const amountError = computation.state === "error" && computation.field === "amount" ? PARSE_ERROR_LABEL[computation.error as keyof typeof PARSE_ERROR_LABEL] : undefined;
  const rateError = computation.state === "error" && computation.field === "rate" ? RATE_ERROR_LABEL[computation.error] : undefined;
  const shown = (side: Field) => (side === field ? amount : r ? formatDec(side === "ht" ? r.ht : r.ttc) : "");

  return (
    <Screen
      header={
        <NightHeader
          back={{ label: "Mes outils", onPress: () => (router.canGoBack() ? router.back() : router.replace("/tools")) }}
          title="Calculateur de TVA"
          sub={rate.hint}
          tabs={{ value: rate.id, onChange: setRateId, size: "lg", options: rates.slice(0, MAX_RATE_TABS).map((x) => ({ value: x.id, label: x.label.replace(" %", "") })) }}
        />
      }
    >
      <ValueField testID="vat-field-ht" label="HT" tag={field === "ht" ? "saisie" : undefined} value={shown("ht")} unit="€" active={field === "ht"} onPress={() => focus("ht")} error={field === "ht" ? amountError : undefined} />
      <ValueField testID="vat-field-vat" label={`TVA ${rate.label}`} value={r ? formatDec(r.vat) : ""} unit="€" />
      <ValueField testID="vat-field-ttc" label="TTC" tag={field === "ttc" ? "saisie" : undefined} value={shown("ttc")} unit="€" active={field === "ttc"} highlight={field === "ht" && Boolean(r)} onPress={() => focus("ttc")} error={field === "ttc" ? amountError : undefined} />
      {rateError ? (
        <Txt variant="label" color={color.dangerInk}>
          {rateError}
        </Txt>
      ) : null}
      {computation.state === "empty" ? <Txt variant="label">Tapez un montant {field.toUpperCase()} : TVA et {field === "ht" ? "TTC" : "HT"} s'affichent pendant la saisie. Touchez l'autre champ pour inverser.</Txt> : null}
      <Keypad onKey={onKey} action={{ label: "Copier", onPress: () => void copy(), disabled: !r }} />
      <View style={{ flexDirection: "row", gap: space[2] }}>
        <Button label="Autre taux…" variant="secondary" compact onPress={() => setCustomOpen(true)} style={{ flex: 1 }} testID="vat-custom-rate" />
      </View>
      <EstimateNote text={`Affichage arrondi au centime ; calcul exact sans arrondi intermédiaire. ${VAT_DISCLAIMER}`} />
      <BottomSheet visible={customOpen} title="Autre taux de TVA" description="Taux en pourcentage, entre 0 et 100 (ex. 8,5)." onClose={() => setCustomOpen(false)}>
        <TextField label="Taux (%)" value={customText} onChangeText={setCustomText} keyboardType="decimal-pad" placeholder="Ex. 8,5" error={customError} returnKeyType="done" onSubmitEditing={addCustom} autoFocus />
        <Button label="Utiliser ce taux" onPress={addCustom} disabled={customText.trim() === ""} />
      </BottomSheet>
    </Screen>
  );
}
