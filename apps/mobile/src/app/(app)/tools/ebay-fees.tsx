import { quickEbayFees } from "@/domain/tools/quick-calc";
import { CalcScreen, HeaderAction } from "~/components/calc-screen";
import { useCostDefaults } from "~/data/hooks";

/**
 * Frais eBay (version simple) : Prix et Taux → Net. AUCUN taux par défaut : le taux est celui de
 * votre canal eBay s'il est renseigné, sinon à saisir (Net affiche « — » tant qu'il est vide).
 */
export default function EbayFeesToolScreen() {
  const defaults = useCostDefaults();
  const channelRate = defaults.data?.ebayChannel?.fee_percent ?? null;
  const initial = channelRate !== null ? { taux: String(channelRate).replace(".", ",") } : undefined;
  return (
    <CalcScreen
      key={channelRate === null ? "sans-taux" : `taux-${channelRate}`}
      testID="ebay"
      title="Frais eBay"
      right={<HeaderAction label="Détaillé" href="/tools/ebay-fees-detail" testID="ebay-detail" />}
      initialEntries={initial}
      fields={[
        { key: "prix", label: "Prix", unit: "€" },
        { key: "taux", label: "Taux", unit: "%" },
        { key: "res", label: "Net", unit: "€", result: true },
      ]}
      compute={(v) => quickEbayFees(v.prix ?? null, v.taux ?? null)}
      hint={initial ? "Taux repris de votre canal eBay · modifiable" : "Votre taux eBay, aucun par défaut"}
    />
  );
}
