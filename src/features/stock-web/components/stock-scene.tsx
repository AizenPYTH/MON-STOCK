import { Archive, Download } from "lucide-react";
import { Scene, SceneHeader, StageStats, MonoLabel, StockBarcode, LegendKey, type BarcodeItem } from "@/components/instrument";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { StockValueFigure } from "@/features/stock-web/components/scene-value";
import type { StockAnalytics } from "@/features/analytics/stock.pure";
import { levelDisplay } from "@/features/stock-web/list.pure";
import { formatNumber } from "@/lib/format";

/**
 * Scène nuit de l'écran Stock : valeur au coût (≈ si des coûts manquent), relevés cliquables
 * (filtres), code-barres du stock (une barre par référence, largeur = ventes 30 j).
 */
export function StockScene({ analytics, currency, archived, exportHref, filterHref }: { analytics: StockAnalytics; currency: string; archived: boolean; exportHref: string; filterHref: (niveau: string | null) => string }) {
  const t = analytics.totals;
  const weak = analytics.counts.at_risk + analytics.counts.low;
  const partial = t.skusUnknownCostWithStock > 0 || t.skusOtherCurrency > 0;
  const value = t.skusValued > 0 ? t.stockValueKnown : null;
  const bars: BarcodeItem[] = analytics.all.map((v) => ({ id: v.row.sku_id ?? v.row.code ?? "", weight: v.row.units_30d ?? 0, level: levelDisplay(v.classification.level).barcode }));

  return (
    <Scene className="pb-11">
      <SceneHeader
        title={archived ? "Stock archivé" : "Stock"}
        description={archived ? "Références archivées : masquées des listes et des analyses, historique conservé." : "Toutes vos références, tous canaux confondus."}
        actions={
          <>
            <ButtonLink href={archived ? "/stock" : "/stock?archived=1"} variant="night" size="sm" className="h-[38px]">
              <Archive aria-hidden="true" className="h-4 w-4" />
              {archived ? "Stock actif" : "Archivés"}
            </ButtonLink>
            <a href={exportHref} download className={buttonClasses("night", "sm", "h-[38px]")}>
              <Download aria-hidden="true" className="h-4 w-4" />
              Exporter CSV
            </a>
          </>
        }
      />
      <div className="mt-4 flex flex-wrap items-end gap-x-14 gap-y-4">
        <div className="flex min-w-0 flex-col gap-1">
          <MonoLabel onNight className="whitespace-nowrap text-on-night-muted">
            Valeur au coût · {formatNumber(t.skus)} référence{t.skus > 1 ? "s" : ""}
            {analytics.truncated ? " (minimum)" : ""}
          </MonoLabel>
          <StockValueFigure amount={value} currency={currency} approx={partial} />
        </div>
        <div className="min-w-0 flex-[1_1_440px] sm:max-w-[640px]">
          <StageStats
            className="grid-cols-2! gap-y-3 pt-3 sm:grid-cols-4!"
            stats={[
              { label: "Unités", value: formatNumber(t.unitsOnHand), href: filterHref(null) },
              { label: "Ruptures", value: formatNumber(analytics.counts.out_of_stock), tone: analytics.counts.out_of_stock > 0 ? "danger" : undefined, href: filterHref("rupture") },
              { label: "Faibles", value: formatNumber(weak), tone: weak > 0 ? "warning" : undefined, href: filterHref("faible") },
              { label: "Sans coût", value: formatNumber(t.skusUnknownCost), href: filterHref("sans_cout") },
            ]}
          />
        </div>
      </div>
      {bars.length > 0 ? (
        <div className="mt-5">
          <StockBarcode items={bars} height={40} label={`Code-barres du stock : ${t.skus} références, ${analytics.counts.out_of_stock} en rupture, ${weak} faibles.`} />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
            <MonoLabel onNight>Chaque barre = une référence · largeur = ventes 30 j</MonoLabel>
            <span className="flex flex-wrap items-center gap-3">
              <LegendKey color="color-mix(in srgb, var(--on-night) 86%, transparent)" label="En stock" />
              <LegendKey color="var(--amber)" label={`Faible · ${weak}`} href={filterHref("faible")} />
              <LegendKey color="var(--danger-on-night)" label={`Rupture · ${analytics.counts.out_of_stock}`} href={filterHref("rupture")} />
            </span>
          </div>
        </div>
      ) : null}
    </Scene>
  );
}
