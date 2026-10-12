import { useState } from "react";
import { fromNumber } from "@/domain/tools/decimal";
import { quickCurrency } from "@/domain/tools/quick-calc";
import { rateAgeDays } from "@/domain/tools/currency";
import { CalcScreen, HeaderAction } from "~/components/calc-screen";
import { ToolHeader } from "~/components/tools";
import { ErrorState, Screen, SkeletonList } from "~/components/ui";
import { useFxRates } from "~/data/hooks";
import { userMessage } from "~/lib/errors";

const PREFERRED = ["USD", "GBP", "CHF", "CNY", "HKD", "JPY", "PLN"];
const SYMBOL: Record<string, string> = { USD: "$", GBP: "£", CHF: "CHF", CNY: "¥", HKD: "HK$", JPY: "¥", PLN: "zł" };

const frDay = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

/**
 * Devises (version simple) : devise en onglet, saisie dans la devise ou en euros. Taux de
 * référence BCE importés par le serveur, date sur une ligne. Frais bancaires : « Détaillé ».
 */
export default function CurrencyToolScreen() {
  const fx = useFxRates();
  const [code, setCode] = useState("USD");
  if (fx.isPending)
    return (
      <Screen scroll={false}>
        <ToolHeader title="Devises" />
        <SkeletonList rows={4} thumb={false} />
      </Screen>
    );
  if (fx.isError)
    return (
      <Screen scroll={false}>
        <ToolHeader title="Devises" />
        <ErrorState description={`Taux de change indisponibles : ${userMessage(fx.error)}`} onRetry={() => void fx.refetch()} />
      </Screen>
    );
  const available = PREFERRED.filter((c) => fx.data.some((r) => r.currency === c)).slice(0, 4);
  const current = available.includes(code) ? code : (available[0] ?? null);
  const rate = fx.data.find((r) => r.currency === current) ?? null;
  const age = rate ? rateAgeDays(rate.rateDate, new Date()) : null;
  const hint = rate
    ? `Taux BCE du ${frDay(rate.rateDate)} · 1 € = ${String(rate.rate).replace(".", ",")} ${rate.currency}${age !== null && age > 4 ? ` · il y a ${age} j` : ""}`
    : "Aucun taux importé pour le moment.";
  return (
    <CalcScreen
      testID="fx"
      title="Devises"
      bidir
      initialActive="dev"
      tabs={available.length ? { value: current!, onChange: setCode, options: available.map((c) => ({ value: c, label: c, a11y: c })) } : undefined}
      right={<HeaderAction label="Détaillé" href="/tools/currency-detail" testID="fx-detail" />}
      fields={[
        { key: "dev", label: current ?? "Devise", unit: current ? (SYMBOL[current] ?? current) : "" },
        { key: "eur", label: "EUR", unit: "€" },
      ]}
      compute={(v, active) => quickCurrency(active as "dev" | "eur", v[active] ?? null, rate ? fromNumber(rate.rate) : null)}
      hint={hint}
    />
  );
}
