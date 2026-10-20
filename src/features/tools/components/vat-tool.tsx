"use client";
import { useState } from "react";
import { customRateOption, DEFAULT_VAT_RATES, rateDec, VAT_DISCLAIMER, type VatRateOption } from "@/domain/tools/vat";
import { quickVat } from "@/domain/tools/quick-calc";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { QuickCalc } from "@/features/tools/components/quick-calc";
import { AmountField, EstimateNote } from "@/features/tools/components/ui";

const MAX_RATE_TABS = 4;

/**
 * TVA : taux en onglets, cases HT / TVA / TTC saisissables dans les trois sens. Calcul local,
 * exact et instantané. Autre taux : bouton « Autre taux ».
 */
export function VatTool() {
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
    <div className="space-y-3">
      <QuickCalc
        title="TVA"
        bidir
        initialActive="ht"
        tabs={{ label: "Taux de TVA", value: rate.id, onChange: setRateId, options: rates.slice(0, MAX_RATE_TABS).map((x) => ({ value: x.id, label: x.label, a11y: `taux ${x.label}` })) }}
        aside={
          <Button variant="secondary" size="sm" onClick={() => setCustomOpen(true)}>
            Autre taux
          </Button>
        }
        fields={[
          { key: "ht", label: "HT", unit: "€" },
          { key: "tva", label: `TVA ${rate.label}`, unit: "€" },
          { key: "ttc", label: "TTC", unit: "€" },
        ]}
        compute={(v, active) => quickVat(active as "ht" | "tva" | "ttc", v[active] ?? null, rateDec(rate))}
        hint={`Estimation, pas un avis fiscal · ${rate.hint}`}
      />
      <EstimateNote>Saisissez un montant dans n'importe quelle case : les deux autres suivent. {VAT_DISCLAIMER}</EstimateNote>
      <Dialog open={customOpen} onClose={() => setCustomOpen(false)} title="Autre taux de TVA">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            addCustom();
          }}
        >
          <p className="text-sm text-muted">Taux en pourcentage, entre 0 et 100 (ex. 8,5). {VAT_DISCLAIMER}</p>
          <AmountField label="Taux (%)" value={customText} onChange={setCustomText} suffix="%" placeholder="Ex. 8,5" error={customError} autoFocus />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCustomOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={customText.trim() === ""}>
              Utiliser ce taux
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
