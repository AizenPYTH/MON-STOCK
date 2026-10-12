import { useState } from "react";
import { dec } from "@/domain/tools/decimal";
import { quickSellingPrice } from "@/domain/tools/quick-calc";
import { CalcScreen, HeaderAction } from "~/components/calc-screen";

const MARGINS = ["10", "20", "30", "40"];

/** Prix de vente (version simple) : marge voulue en onglet, Achat et Frais → Prix (centime supérieur). */
export default function SellingPriceToolScreen() {
  const [margin, setMargin] = useState("20");
  return (
    <CalcScreen
      testID="price"
      title="Prix"
      tabs={{ value: margin, onChange: setMargin, options: MARGINS.map((m) => ({ value: m, label: m, unit: "%", a11y: `marge voulue ${m} %` })) }}
      right={<HeaderAction label="Détaillé" href="/tools/selling-price-detail" testID="price-detail" />}
      fields={[
        { key: "achat", label: "Achat", unit: "€" },
        { key: "frais", label: "Frais", unit: "€" },
        { key: "res", label: "Prix", unit: "€", result: true },
      ]}
      compute={(v) => quickSellingPrice(v.achat ?? null, v.frais ?? null, dec(BigInt(margin)))}
      hint="Onglets : marge voulue sur le prix de vente"
    />
  );
}
