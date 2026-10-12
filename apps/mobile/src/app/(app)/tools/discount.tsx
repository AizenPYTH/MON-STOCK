import { useState } from "react";
import { dec } from "@/domain/tools/decimal";
import { quickDiscount } from "@/domain/tools/quick-calc";
import { CalcScreen, HeaderAction } from "~/components/calc-screen";

const RATES = ["5", "10", "20", "30"];

/** Remise (version simple) : remise en onglet, Prix → Remisé. Autres modes dans « Détaillé ». */
export default function DiscountToolScreen() {
  const [rate, setRate] = useState("10");
  return (
    <CalcScreen
      testID="discount"
      title="Remise"
      tabs={{ value: rate, onChange: setRate, options: RATES.map((r) => ({ value: r, label: r, unit: "%", a11y: `remise ${r} %` })) }}
      right={<HeaderAction label="Détaillé" href="/tools/discount-detail" testID="discount-detail" />}
      fields={[
        { key: "prix", label: "Prix", unit: "€" },
        { key: "res", label: "Remisé", unit: "€", result: true },
      ]}
      compute={(v) => quickDiscount(v.prix ?? null, dec(BigInt(rate)))}
    />
  );
}
