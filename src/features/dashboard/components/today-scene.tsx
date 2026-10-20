import Link from "next/link";
import { TrendingDown } from "lucide-react";
import type { ReactNode } from "react";
import { Scene, MonoLabel, LegendKey, DayBars } from "@/components/instrument";
import { cn } from "@/lib/utils";
import { TodayFigure } from "@/features/dashboard/components/today-figure";
import { formatMoney, formatNumber } from "@/lib/format";
import type { TodayDashboard } from "@/features/dashboard/queries";
import { sceneDateLabel, shortDayLabel, stockLevelHref } from "@/features/dashboard/today.pure";
import { LevelBarcode } from "@/features/dashboard/components/level-barcode";

type Stat = { label: string; value: ReactNode | null; note?: string; href?: string };

/** Relevés de la scène (filet haut, séparateurs) : 4 colonnes, 2 × 2 sur téléphone ; « — » si inconnu. */
function SceneStats({ stats }: { stats: Stat[] }) {
  return (
    <dl className="mt-[18px] grid max-w-[620px] grid-cols-2 border-t border-night-line sm:grid-cols-4">
      {stats.map((st, i) => {
        const body = (
          <>
            <dt className="ms-mono truncate text-[10px] leading-[13px] text-on-night-subtle">{st.label}</dt>
            <dd className="mt-1 flex min-w-0 items-baseline gap-1.5 text-[20px] font-bold leading-[26px] text-on-night tnum">
              <span className="truncate">{st.value ?? "—"}</span>
              {st.note ? <span className="truncate text-[12.5px] font-semibold leading-[17px] text-amber">{st.note}</span> : null}
            </dd>
          </>
        );
        return (
          <div key={st.label} className={cn("min-w-0 pr-1.5 pt-3", i % 2 === 1 && "border-l border-night-line pl-4", i >= 2 && "sm:border-l sm:border-night-line sm:pl-4", i === 2 && "max-sm:pl-0")}>
            {st.href ? (
              <Link href={st.href as never} className="block rounded-lg hover:opacity-70">
                {body}
              </Link>
            ) : (
              body
            )}
          </div>
        );
      })}
    </dl>
  );
}

const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n > 1 ? many : one}`;

/** Scène de l'accueil : CA du jour (comptage), relevés, 14 jours, puis le stock en code-barres. */
export function TodayScene({ d }: { d: TodayDashboard }) {
  const cur = d.currency;
  const money0 = (v: number) => formatMoney(v, cur, { decimals: 0 });
  const approx = <span className="font-medium text-on-night-subtle">≈ </span>;
  const max14 = Math.max(0, ...d.last14Days.map((x) => x.amount));
  const foreign = d.otherCurrencies.map((f) => formatMoney(f.revenue, f.currency, { decimals: 0 })).join(" + ");
  const s = d.stock;
  const partial = s.unknownCostWithStock > 0 || s.otherCurrency > 0;
  const lowCount = s.counts.low;
  const riskCount = s.counts.at_risk;
  const barcodeLabel = `Stock : ${plural(s.skus, "référence", "références")}, ${s.counts.out_of_stock} en rupture${d.stock.outShare ? ` représentant ${d.stock.outShare} % des ventes sur 30 jours` : ""}, ${riskCount} à risque, ${lowCount} en stock faible. Largeur des barres : ventes sur 30 jours.`;

  return (
    <Scene>
      <div className="flex flex-wrap items-end gap-x-16 gap-y-6">
        <div className="min-w-0 flex-[1_1_520px]">
          <h1 className="sr-only">Aujourd&apos;hui</h1>
          <p className="ms-mono text-[11px] leading-[14px] tracking-[0.08em] text-on-night-muted">{sceneDateLabel(d.now)} · Chiffre d&apos;affaires du jour</p>
          <div className="mt-1.5">
            <TodayFigure amount={Math.round(d.revenueToday)} currency={cur} />
          </div>
          <SceneStats
            stats={[
              {
                label: "Ventes",
                value: formatNumber(d.ordersToday),
                note: d.toShip && d.toShip > 0 ? `${formatNumber(d.toShip)} à expédier` : undefined,
                href: d.toShip && d.toShip > 0 ? "/sales?status=paid" : "/sales",
              },
              { label: "Marge estimée", value: d.marginToday === null ? null : <>{approx}{formatNumber(Math.round(d.marginToday))} %</> },
              { label: "Hier, journée", value: money0(d.revenueYesterday) },
              { label: "14 jours", value: money0(d.revenue14) },
            ]}
          />
          {d.marginToday === null && d.ordersToday > 0 ? <p className="mt-2 text-xs font-semibold text-on-night-subtle">Marge non calculée : coût d&apos;achat ou frais inconnus sur une vente du jour.</p> : null}
          {foreign ? <p className="mt-2 text-xs font-semibold text-on-night-subtle">Hors ventes en autre devise sur 30 jours ({foreign}), jamais converties.</p> : null}
        </div>
        <Link
          href="/analysis"
          aria-label={`Chiffre d'affaires des 14 derniers jours : ${money0(d.revenue14)} au total, maximum ${money0(max14)} sur un jour, aujourd'hui en cours. Ouvrir l'analyse`}
          className="flex min-w-0 max-w-[480px] flex-[1_1_300px] flex-col gap-2 rounded-lg pb-1 hover:opacity-80"
        >
          <DayBars days={d.last14Days} height={96} label="" />
          <span className="flex justify-between gap-2">
            <MonoLabel onNight>{d.last14Days[0] ? `${shortDayLabel(d.last14Days[0].day)} · 14 j` : "14 j"}</MonoLabel>
            <span className="ms-mono text-[10px] leading-[13px] text-mint">Auj. en cours</span>
          </span>
        </Link>
      </div>

      {s.skus > 0 ? (
        <div className="mt-7 border-t border-night-line pt-[18px]">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="ms-mono whitespace-nowrap text-[11px] leading-[14px] tracking-[0.08em] text-on-night-muted">
              Stock · {formatNumber(s.skus)} réf. · {formatNumber(s.units)} u.
            </span>
            <Link href="/stock" className="flex flex-wrap items-baseline gap-x-1.5 rounded hover:opacity-70" aria-label={`Valeur du stock au coût : ${s.skusValued === 0 ? "inconnue" : `${partial ? "environ " : ""}${money0(s.valueKnown)}`}${s.unknownCostWithStock > 0 ? `, ${s.unknownCostWithStock} sans coût` : ""}. Ouvrir le stock`}>
              <span className="whitespace-nowrap text-[15px] font-bold leading-5 text-on-night tnum">
                {s.skusValued === 0 ? "—" : partial ? <>{approx}{money0(s.valueKnown)}</> : money0(s.valueKnown)}
              </span>
              <MonoLabel onNight className="whitespace-nowrap">
                au coût{s.unknownCostWithStock > 0 ? ` · ${formatNumber(s.unknownCostWithStock)} sans coût` : ""}
                {s.otherCurrency > 0 ? ` · ${formatNumber(s.otherCurrency)} en autre devise` : ""}
                {s.truncated ? " · liste tronquée" : ""}
              </MonoLabel>
            </Link>
          </div>
          <div className="mt-3">
            <LevelBarcode items={s.barcode} height={56} label={barcodeLabel} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-[18px] gap-y-2">
            <LegendKey color="var(--danger-on-night)" label={plural(s.counts.out_of_stock, "rupture", "ruptures")} href={stockLevelHref("out_of_stock")} />
            {riskCount > 0 ? <LegendKey color="var(--amber)" label={`${formatNumber(riskCount)} à risque`} href={stockLevelHref("at_risk")} /> : null}
            <LegendKey color="var(--amber)" label={plural(lowCount, "faible", "faibles")} href={stockLevelHref("low")} />
            {d.stock.outShare ? (
              <span className="flex min-w-[260px] flex-1 items-start gap-2">
                <TrendingDown aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-danger-on-night" />
                <span className="text-[13.5px] font-semibold leading-[19px] text-on-night">{d.stock.outShare} % de vos ventes sur 30 jours portent sur des produits en rupture.</span>
              </span>
            ) : (
              <span className="flex-1" />
            )}
            <MonoLabel onNight className="hidden md:inline">Largeur = ventes 30 j · cliquer pour filtrer</MonoLabel>
          </div>
        </div>
      ) : null}
    </Scene>
  );
}
