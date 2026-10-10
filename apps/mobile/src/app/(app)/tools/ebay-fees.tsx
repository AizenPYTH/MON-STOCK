import { useState } from "react";
import { KeyboardAvoidingView, Platform } from "react-native";
import { formatMoneyDec, formatPercent } from "@/domain/tools/decimal";
import { ebayFeesFromChannel, EMPTY_EBAY_FEES, evaluateEbayFees, type EbayFeesInput } from "@/domain/tools/ebay-fees";
import { AmountField, ChoiceChips, EstimateNote, MissingList, ResultCard, ToolHeader, type ResultLine } from "~/components/tools";
import { Card, Screen, SectionHeader, Txt } from "~/components/ui";
import { useCostDefaults } from "~/data/hooks";
import { space } from "~/theme/tokens";

/**
 * Calculateur de frais eBay : AUCUN taux par défaut. L'utilisateur saisit les taux de sa grille
 * (catégorie, statut professionnel, options) ou reprend ceux de son canal eBay.
 */
export default function EbayFeesToolScreen() {
  const [input, setInput] = useState<EbayFeesInput>(EMPTY_EBAY_FEES);
  const [prefilled, setPrefilled] = useState<string[]>([]);
  const defaults = useCostDefaults();
  const set = <K extends keyof EbayFeesInput>(k: K, v: EbayFeesInput[K]) => setInput((i) => ({ ...i, [k]: v }));
  const computation = evaluateEbayFees(input);
  const errors = computation.state === "invalid" ? computation.errors : {};
  const currency = "EUR";
  const channel = defaults.data?.ebayChannel ?? null;

  let lines: ResultLine[] = [];
  let copyText: string | undefined;
  if (computation.state === "ok") {
    const r = computation.result;
    lines = [
      { label: "Encaissé (objet + port)", value: formatMoneyDec(r.grossReceived, currency), kind: "input" },
      ...r.fees.map((f) => ({ label: f.label, value: `− ${formatMoneyDec(f.amount, currency)}` })),
      { label: "Total des frais eBay", value: formatMoneyDec(r.totalFees, currency), note: r.feesPercentOfGross ? `${formatPercent(r.feesPercentOfGross)} de l'encaissement` : undefined },
      { label: "Reste après frais eBay", value: formatMoneyDec(r.netAfterFees, currency), kind: "total" },
    ];
    if (r.netAfterShipping) lines.push({ label: "Reste après frais et envoi", value: formatMoneyDec(r.netAfterShipping, currency), kind: "total" });
    if (r.profit) lines.push({ label: "Bénéfice après achat", value: formatMoneyDec(r.profit, currency), kind: "total" });
    copyText = lines.map((l) => `${l.label} : ${l.value}`).join("\n") + (r.notEntered.length ? `\nNon renseigné : ${r.notEntered.join(", ")}` : "");
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <ToolHeader title="Calculateur de frais eBay" description="Ce qu'il vous reste réellement après les commissions et frais de vente." />
        <SectionHeader title="Vente" />
        <Card padded style={{ gap: space[3] }}>
          <AmountField testID="ebay-item" label="Prix de l'objet" value={input.itemPrice} onChangeText={(v) => set("itemPrice", v)} suffix="€" large error={errors.itemPrice} />
          <AmountField label="Frais de port facturés à l'acheteur" value={input.shippingCharged} onChangeText={(v) => set("shippingCharged", v)} suffix="€" placeholder="0,00" error={errors.shippingCharged} />
        </Card>
        <SectionHeader
          title="Frais eBay (votre grille)"
          action={
            channel && (channel.fee_percent !== null || channel.payment_fee_fixed !== null)
              ? {
                  label: "Reprendre mon canal eBay",
                  onPress: () => {
                    const r = ebayFeesFromChannel(channel, input);
                    setInput(r.input);
                    setPrefilled(r.prefilled);
                  },
                }
              : undefined
          }
        />
        <Txt variant="label">Les taux eBay dépendent de la catégorie, de votre statut et de vos options : saisissez ceux de votre grille en vigueur. MON STOCK n'en suppose aucun.</Txt>
        {prefilled.length ? <Txt variant="label">Repris de vos réglages du canal eBay : {prefilled.join(", ")}.</Txt> : null}
        <Card padded style={{ gap: space[3] }}>
          <AmountField testID="ebay-fvf" label="Commission sur la valeur finale" value={input.finalValueFeePercent} onChangeText={(v) => set("finalValueFeePercent", v)} suffix="%" placeholder="Non renseigné" error={errors.finalValueFeePercent} />
          <ChoiceChips
            label="Commission calculée sur"
            options={[
              { value: true, label: "Objet + port" },
              { value: false, label: "Objet seul" },
            ]}
            value={input.feeOnShipping}
            onChange={(v) => set("feeOnShipping", v)}
          />
          <AmountField label="Frais fixes par commande" value={input.fixedFeePerOrder} onChangeText={(v) => set("fixedFeePerOrder", v)} suffix="€" placeholder="Non renseigné" error={errors.fixedFeePerOrder} />
          <AmountField label="Annonce sponsorisée" value={input.promotedPercent} onChangeText={(v) => set("promotedPercent", v)} suffix="%" placeholder="Aucune" error={errors.promotedPercent} />
          <AmountField label="Autres frais (options, international…)" value={input.otherFees} onChangeText={(v) => set("otherFees", v)} suffix="€" placeholder="Aucun" error={errors.otherFees} />
        </Card>
        <SectionHeader title="Vos coûts (facultatif)" />
        <Card padded style={{ gap: space[3] }}>
          <AmountField label="Coût réel de l'envoi" value={input.actualShippingCost} onChangeText={(v) => set("actualShippingCost", v)} suffix="€" placeholder="Non renseigné" error={errors.actualShippingCost} />
          <AmountField label="Coût d'achat de l'objet" value={input.purchaseCost} onChangeText={(v) => set("purchaseCost", v)} suffix="€" placeholder="Non renseigné" error={errors.purchaseCost} />
        </Card>
        <SectionHeader title="Résultat" />
        {computation.state === "ok" ? (
          <>
            <ResultCard lines={lines} copyText={copyText} />
            <MissingList items={computation.result.notEntered} />
          </>
        ) : (
          <Card padded>
            <Txt variant="bodyRegular">{computation.state === "empty" ? "Saisissez le prix de l'objet et vos taux : le résultat s'affiche immédiatement." : "Corrigez les champs signalés."}</Txt>
          </Card>
        )}
        <EstimateNote text="Estimation à partir des taux saisis ; le montant exact figure sur votre relevé eBay." />
      </Screen>
    </KeyboardAvoidingView>
  );
}
