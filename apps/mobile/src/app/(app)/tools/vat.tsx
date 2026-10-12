import { useState } from "react";
import { DEFAULT_VAT_RATES, customRateOption, rateDec, VAT_DISCLAIMER, type VatRateOption } from "@/domain/tools/vat";
import { quickVat } from "@/domain/tools/quick-calc";
import { CalcScreen, HeaderAction } from "~/components/calc-screen";
import { BottomSheet, Button, TextField } from "~/components/ui";

const MAX_RATE_TABS = 4;

/**
 * TVA (écran de référence « calculatrice ») : taux en onglets, cases HT / TVA / TTC saisissables
 * dans les trois sens, clavier intégré. Calcul local, exact et instantané. Autre taux : bouton du bandeau.
 */
export default function VatToolScreen() {
  const [rates, setRates] = useState<VatRateOption[]>(DEFAULT_VAT_RATES);
  const [rateId, setRateId] = useState(DEFAULT_VAT_RATES[0]!.id);
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState("");
  const [customError, setCustomError] = useState<string | undefined>();
  const rate = rates.find((r) => r.id === rateId) ?? rates[0]!;

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

  return (
    <>
      <CalcScreen
        testID="vat"
        title="TVA"
        bidir
        initialActive="ht"
        tabs={{ value: rate.id, onChange: setRateId, options: rates.slice(0, MAX_RATE_TABS).map((x) => ({ value: x.id, label: x.label.replace(" %", ""), unit: "%", a11y: `taux ${x.label}` })) }}
        right={<HeaderAction label="Autre taux" onPress={() => setCustomOpen(true)} testID="vat-custom-rate" />}
        fields={[
          { key: "ht", label: "HT", unit: "€" },
          { key: "tva", label: `TVA ${rate.label}`, unit: "€" },
          { key: "ttc", label: "TTC", unit: "€" },
        ]}
        compute={(v, active) => quickVat(active as "ht" | "tva" | "ttc", v[active] ?? null, rateDec(rate))}
        hint={`Estimation, pas un avis fiscal · ${rate.hint}`}
      />
      <BottomSheet visible={customOpen} title="Autre taux de TVA" description={`Taux en pourcentage, entre 0 et 100 (ex. 8,5). ${VAT_DISCLAIMER}`} onClose={() => setCustomOpen(false)}>
        <TextField label="Taux (%)" value={customText} onChangeText={setCustomText} keyboardType="decimal-pad" placeholder="Ex. 8,5" error={customError} returnKeyType="done" onSubmitEditing={addCustom} autoFocus />
        <Button label="Utiliser ce taux" onPress={addCustom} disabled={customText.trim() === ""} />
      </BottomSheet>
    </>
  );
}
