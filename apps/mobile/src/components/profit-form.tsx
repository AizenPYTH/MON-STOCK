import { View } from "react-native";
import type { RadarLine, SupplierOrigin, VatRegime } from "@/domain/sourcing/radar";
import { profitFormFromSettings, type FieldErrors, type ProfitFormInput } from "@/domain/tools/profit";
import { AmountField, ChoiceChips, ResultCard, type ResultLine } from "~/components/tools";
import { Card, SectionHeader, Txt } from "~/components/ui";
import { useCostDefaults } from "~/data/hooks";
import { formatMoney } from "~/lib/format";
import { space } from "~/theme/tokens";

/**
 * Coûts communs au calculateur de marge et au calculateur de prix de vente. Les valeurs peuvent
 * être reprises des paramètres de coûts de l'organisation (ceux du radar) puis modifiées ; un
 * champ vide n'est jamais compté pour 0.
 */
export function ProfitCostsForm({ form, onChange, errors, children }: { form: ProfitFormInput; onChange: (f: ProfitFormInput) => void; errors: FieldErrors; children?: React.ReactNode }) {
  const defaults = useCostDefaults();
  const set = <K extends keyof ProfitFormInput>(key: K, value: ProfitFormInput[K]) => onChange({ ...form, [key]: value });
  const prefill = () => {
    if (!defaults.data) return;
    onChange(profitFormFromSettings(defaults.data.settings, form));
  };
  return (
    <>
      <SectionHeader title="Achat" />
      <Card padded style={{ gap: space[3] }}>
        <AmountField testID="profit-purchase" label="Prix d'achat unitaire" value={form.purchasePrice} onChangeText={(v) => set("purchasePrice", v)} suffix="€" error={errors.purchasePrice} />
        <ChoiceChips
          label="Le prix d'achat est"
          options={[
            { value: "ht" as const, label: "HT" },
            { value: "ttc" as const, label: "TTC" },
          ]}
          value={form.purchaseBasis}
          onChange={(v) => set("purchaseBasis", v)}
        />
        <AmountField label="Transport fournisseur (par unité)" value={form.supplierShipping} onChangeText={(v) => set("supplierShipping", v)} suffix="€" placeholder="Non renseigné" error={errors.supplierShipping} />
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
        {form.origin === "non_eu" ? <AmountField label="Droits de douane et frais d'import" value={form.importDutyPercent} onChangeText={(v) => set("importDutyPercent", v)} suffix="%" placeholder="Non renseigné" error={errors.importDutyPercent} /> : null}
      </Card>
      {children}
      <SectionHeader title="TVA et frais de vente" action={defaults.data ? { label: "Reprendre mes paramètres", onPress: prefill } : undefined} />
      {defaults.data?.fromChannel.length ? <Txt variant="label">Vos paramètres reprennent votre canal eBay pour : {defaults.data.fromChannel.join(", ")}.</Txt> : null}
      <Card padded style={{ gap: space[3] }}>
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
        {form.vatRegime === "normal" || form.vatRegime === "margin" ? <AmountField label="Taux de TVA" value={form.vatRate} onChangeText={(v) => set("vatRate", v)} suffix="%" placeholder="Ex. 20" error={errors.vatRate} hint="Taux applicable à votre produit, à vérifier." /> : null}
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
        <AmountField label="Commission marketplace" value={form.marketplaceFeePercent} onChangeText={(v) => set("marketplaceFeePercent", v)} suffix="%" placeholder="Non renseigné" error={errors.marketplaceFeePercent} />
        <View style={{ flexDirection: "row", gap: space[2] }}>
          <View style={{ flex: 1 }}>
            <AmountField label="Frais de paiement" value={form.paymentFeePercent} onChangeText={(v) => set("paymentFeePercent", v)} suffix="%" placeholder="—" error={errors.paymentFeePercent} />
          </View>
          <View style={{ flex: 1 }}>
            <AmountField label="+ fixe" value={form.paymentFeeFixed} onChangeText={(v) => set("paymentFeeFixed", v)} suffix="€" placeholder="—" error={errors.paymentFeeFixed} />
          </View>
        </View>
        <AmountField label="Expédition au client" value={form.shippingToCustomer} onChangeText={(v) => set("shippingToCustomer", v)} suffix="€" placeholder="Non renseigné" error={errors.shippingToCustomer} />
        <AmountField label="Emballage" value={form.packagingCost} onChangeText={(v) => set("packagingCost", v)} suffix="€" placeholder="Non renseigné" error={errors.packagingCost} />
        <AmountField label="Provision retours / garantie" value={form.returnProvisionPercent} onChangeText={(v) => set("returnProvisionPercent", v)} suffix="%" placeholder="Non renseigné" error={errors.returnProvisionPercent} />
        {defaults.data ? null : defaults.isError ? <Txt variant="label">Paramètres de l'organisation indisponibles (hors ligne ?) : saisissez vos frais.</Txt> : null}
      </Card>
    </>
  );
}

/** Détail du calcul (mêmes lignes que le radar). */
export function BreakdownCard({ breakdown, currency }: { breakdown: RadarLine[]; currency: string }) {
  const lines: ResultLine[] = breakdown.map((b) => ({
    label: b.label,
    value: b.amount === null ? "—" : formatMoney(b.amount, currency),
    kind: /^Bénéfice|^Marge brute/.test(b.label) ? "total" : "estimate",
  }));
  return <ResultCard title="Détail du calcul" lines={lines} />;
}
