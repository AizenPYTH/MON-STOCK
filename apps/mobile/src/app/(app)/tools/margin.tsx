import { quickMargin } from "@/domain/tools/quick-calc";
import { CalcScreen, HeaderAction } from "~/components/calc-screen";

/** Marge (version simple) : Achat, Vente, Frais → Bénéfice ; frais vides comptés 0. Calcul détaillé à part. */
export default function MarginToolScreen() {
  return (
    <CalcScreen
      testID="margin"
      title="Marge"
      right={<HeaderAction label="Détaillé" href="/tools/margin-detail" testID="margin-detail" />}
      fields={[
        { key: "achat", label: "Achat", unit: "€" },
        { key: "vente", label: "Vente", unit: "€" },
        { key: "frais", label: "Frais", unit: "€" },
        { key: "res", label: "Bénéfice", unit: "€", result: true },
      ]}
      compute={(v) => quickMargin(v.achat ?? null, v.vente ?? null, v.frais ?? null)}
      hint="Marge sur le prix de vente · TVA et commissions : « Détaillé »"
    />
  );
}
