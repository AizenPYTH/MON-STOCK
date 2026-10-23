import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ExternalLink, Minus, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { MonoLabel } from "@/components/instrument";
import { formatMoney, formatNumber, formatRelative, NOT_PROVIDED } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SearchOfferView, SearchSku } from "@/services/sourcing/search";
import { RankingBreakdown } from "@/features/sourcing/components/ranking-breakdown";
import { ConfidenceBadge } from "@/features/sourcing/components/confidence-badge";
import { AWARD_META } from "@/domain/sourcing/ranking";
import { OfferTraceability } from "@/features/sourcing/components/offer-traceability";
import { AwardGlyph, PODIUM_AWARDS } from "@/features/sourcing/components/award-icon";
import { deliveryLabel } from "@/features/sourcing/delivery";
import { fromSearchProvenance, retrievalMethodLabel } from "@/features/sourcing/provenance";
import { CONDITION_LABEL, SOURCE_TYPE_LABEL, STOCK_STATUS_LABEL, TAX_LABEL } from "@/features/sourcing/labels";

export { deliveryLabel };

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt>
        <MonoLabel>{label}</MonoLabel>
      </dt>
      <dd className="mt-1 text-[13px] font-semibold leading-[18px] text-foreground tnum">{children}</dd>
    </div>
  );
}

/**
 * Carte d'offre du moteur complet : distinctions, prix comparable (et prix d'origine), coût rendu,
 * marge, confiance, raisons du classement, traçabilité et actions. Uniquement les valeurs calculées
 * par le serveur : une donnée absente reste « Non communiqué » / « — ».
 */
export function OfferCard({ view, currency, sku, requestedQuantity }: { view: SearchOfferView; currency: string; sku: SearchSku | null; requestedQuantity: number }) {
  const o = view.offer;
  const supplierId = o.supplier?.id ?? o.supplier_id;
  const skuForOrder = sku?.id ?? o.sku_id;
  const orderQty = Math.max(requestedQuantity, o.moq ?? 1);
  const sameCurrency = o.original_currency.toUpperCase() === currency.toUpperCase();
  const provenance = fromSearchProvenance(view.provenance, { sourceType: o.source_type, sourceUrl: o.source_url, lastSeenAt: o.last_seen_at });
  const duplicatesCollapsed = view.duplicatesCollapsed ?? 0;
  const netProfit = view.margin?.result.netProfit ?? null;
  const savings = view.savings;
  return (
    <article className="rounded-2xl border border-border bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-4 pt-4 sm:px-5">
        <div className="min-w-0 flex-[1_1_320px]">
          {view.ranking.awards.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {view.ranking.awards.map((a) => (
                <Badge key={a} variant={PODIUM_AWARDS.has(a) ? "accent" : "outline"}>
                  <AwardGlyph award={a} /> {AWARD_META[a].label}
                </Badge>
              ))}
            </div>
          ) : null}
          <h3 className="flex min-w-0 items-baseline gap-2 text-[15px] font-bold leading-5 text-foreground">
            <span className="ms-code shrink-0 text-[11px] font-medium text-ink-3 tnum">#{view.ranking.rank}</span>
            <Link href={`/sourcing/offers/${o.id}` as never} className="min-w-0 break-words rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {o.title_original}
            </Link>
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted">
            <Link href={`/suppliers/${supplierId}` as never} className="font-bold text-foreground hover:underline">
              {view.supplierName}
            </Link>
            <span aria-hidden="true">·</span>
            <span>{view.supplierCountry ?? "Pays non communiqué"}</span>
            <Badge variant="outline">{SOURCE_TYPE_LABEL[o.source_type] ?? o.source_type}</Badge>
            {o.sku_id ? <Badge variant="info">SKU associé</Badge> : null}
            {o.status === "suspicious" ? (
              <Badge variant="warning">
                <TriangleAlert aria-hidden="true" /> Données suspectes
              </Badge>
            ) : null}
            {duplicatesCollapsed > 0 ? (
              <Badge variant="neutral">
                {duplicatesCollapsed} identique{duplicatesCollapsed > 1 ? "s" : ""} fusionnée{duplicatesCollapsed > 1 ? "s" : ""}
              </Badge>
            ) : null}
          </div>
          <p className="ms-code mt-1 text-[11px] leading-4 text-ink-3">
            {retrievalMethodLabel(provenance)} · récupérée {formatRelative(provenance.retrievedAt ?? o.last_seen_at)}
          </p>
          <ConfidenceBadge confidence={view.confidenceBadge} className="mt-2" />
          {view.priceInsights?.reliable && view.priceInsights.opportunity && view.confidenceBadge.level !== "expired" ? (
            <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-success">
              <ArrowDownRight aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
              {view.priceInsights.opportunity.message}
            </p>
          ) : null}
          {view.priceInsights?.reliable && view.priceInsights.abnormalLow ? (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-warning">
              <TriangleAlert aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
              {view.priceInsights.abnormalLow.message}
            </p>
          ) : null}
        </div>
        <div className="min-w-0 text-left sm:text-right">
          <MonoLabel>Prix unitaire</MonoLabel>
          <div className="mt-1 text-[22px] font-extrabold leading-7 tracking-[-0.4px] text-foreground tnum">
            {view.normalizedUnitPrice === null ? (
              <span>{formatMoney(Number(o.original_price), o.original_currency)}</span>
            ) : (
              <>
                {formatMoney(view.normalizedUnitPrice, currency)} <span className="text-xs font-semibold tracking-normal text-ink-3">{TAX_LABEL[o.tax_type]}</span>
              </>
            )}
          </div>
          {view.normalizedUnitPrice === null ? (
            <div className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-warning sm:justify-end">
              <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5" /> Conversion indisponible
            </div>
          ) : null}
          {!sameCurrency && view.normalizedUnitPrice !== null ? (
            <div className="mt-0.5 text-xs font-medium text-muted tnum">
              Prix original {formatMoney(Number(o.original_price), o.original_currency)}
              {o.fx_rate ? ` · taux BCE ${o.fx_rate}${o.fx_rate_date ? ` (${o.fx_rate_date})` : ""}` : ""}
            </div>
          ) : null}
          {view.comparableNote ? <div className="mt-0.5 text-xs font-medium text-muted">{view.comparableNote}</div> : null}
          {savings ? (
            <div className={cn("mt-1.5 text-xs font-semibold tnum", savings.amount > 0 ? "text-success" : savings.amount < 0 ? "text-danger" : "text-muted")}>
              <span className="inline-flex items-center gap-1">
                {savings.amount > 0 ? <ArrowDownRight aria-hidden="true" className="h-3.5 w-3.5" /> : savings.amount < 0 ? <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /> : <Minus aria-hidden="true" className="h-3.5 w-3.5" />}
                {savings.amount > 0 ? `${formatMoney(savings.perUnit, currency)} / unité vs votre coût` : savings.amount < 0 ? `+${formatMoney(-savings.perUnit, currency)} / unité vs votre coût` : "Même prix que votre coût"}
              </span>
              {savings.amount > 0 ? (
                <div className="font-medium">
                  Pour {savings.quantity} unité(s) : {formatMoney(savings.amount, currency)} d&apos;économie potentielle{savings.basis === "unit" ? " (hors frais de port non communiqués)" : ""}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <dl className="mx-4 mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line-soft pt-3 sm:mx-5 sm:grid-cols-3 lg:grid-cols-6">
        <Fact label="MOQ">
          {o.moq === null ? NOT_PROVIDED : `${formatNumber(o.moq)} unité(s)`}
          {view.comparable && view.comparable.constrainedByOrderValue ? ` · min. ${formatMoney(view.comparable.minimumOrderValue, currency)}` : ""}
        </Fact>
        <Fact label="Stock">{o.available_quantity !== null ? `${formatNumber(o.available_quantity)} unité(s)` : (STOCK_STATUS_LABEL[o.stock_status] ?? "Stock non communiqué")}</Fact>
        <Fact label="Grade / état">
          {o.grade ? `Grade ${o.grade}` : "Grade non communiqué"} · {CONDITION_LABEL[o.condition]}
        </Fact>
        <Fact label="Pays">{o.country ?? view.supplierCountry ?? NOT_PROVIDED}</Fact>
        <Fact label="Délai">{deliveryLabel(o.delivery_min_days ?? null, o.delivery_max_days ?? null)}</Fact>
        <Fact label="Frais de port">{o.shipping_cost == null ? NOT_PROVIDED : formatMoney(o.shipping_cost, o.shipping_currency ?? o.original_currency)}</Fact>
      </dl>

      <div className="mx-4 mt-3 grid gap-2.5 sm:mx-5 sm:grid-cols-2">
        <div className="rounded-xl bg-surface-2 px-3.5 py-2.5">
          <MonoLabel>Coût rendu estimé · {view.landedQuantity} unité(s)</MonoLabel>
          {view.landedCost && view.landedCost.unitLandedCost !== null ? (
            <div className="mt-1 text-sm font-semibold text-foreground tnum">
              <span className="text-[15px] font-extrabold">
                <span className="font-medium text-ink-3">≈ </span>
                {formatMoney(view.landedCost.unitLandedCost, currency)}
              </span>{" "}
              / unité · total {formatMoney(view.landedCost.totalLandedCost, currency)}
              {!view.landedCost.determinable ? <span className="block text-xs font-medium text-muted">Frais d&apos;import inconnus non inclus.</span> : null}
            </div>
          ) : (
            <div className="mt-1 text-sm font-semibold text-muted">Coût final non déterminable{view.comparableUnitPrice !== null ? " (frais de port non communiqués)" : ""}</div>
          )}
        </div>
        <div className="rounded-xl bg-surface-2 px-3.5 py-2.5">
          <MonoLabel>Marge potentielle</MonoLabel>
          {view.margin ? (
            <div className="mt-1 text-sm">
              <span className={cn("text-[15px] font-extrabold tnum", netProfit === null ? "text-ink-3" : netProfit < 0 ? "text-danger" : "text-success")}>
                {netProfit === null ? "—" : `≈ ${formatMoney(netProfit, currency)}`}
                {view.margin.result.netMarginPercent !== null ? <span className="font-semibold"> ({view.margin.result.netMarginPercent.toFixed(1)} %)</span> : null}
              </span>
              <div className="text-xs font-medium text-muted">
                {view.margin.formula}
                {view.margin.salePriceSource === "average_30d" ? " · prix de vente = moyenne 30 j" : ""}
              </div>
              {view.margin.result.caveat ? <div className="mt-0.5 text-xs font-semibold text-warning">{view.margin.result.caveat}</div> : null}
            </div>
          ) : (
            <div className="mt-1 text-sm font-semibold text-muted">{view.marginUnavailableReason ?? "Non calculable"}</div>
          )}
        </div>
      </div>

      <div className="mx-4 mt-3 sm:mx-5">
        <MonoLabel>Pourquoi cette position</MonoLabel>
        <ul className="mt-1.5 grid gap-x-6 gap-y-1 text-[13px] font-medium text-muted-strong sm:grid-cols-2">
          {view.ranking.why.slice(0, 5).map((w) => (
            <li key={w} className="flex gap-2">
              <span aria-hidden="true" className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-4" />
              <span className="min-w-0">{w}</span>
            </li>
          ))}
        </ul>
        {view.filterWarnings.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {view.filterWarnings.map((w) => (
              <li key={`${w.code}-${w.message}`} className="flex items-start gap-1.5 text-xs font-semibold text-warning">
                <TriangleAlert aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
                {w.message}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <details className="group mx-4 mt-3 rounded-xl border border-border px-3.5 py-2 text-xs sm:mx-5">
        <summary className="flex min-h-8 cursor-pointer items-center font-bold text-muted-strong hover:text-foreground">Traçabilité : données telles que récupérées</summary>
        <OfferTraceability className="mt-2 pb-1" offer={o} supplierName={view.supplierName} supplierCountry={view.supplierCountry} provenance={provenance} duplicatesCollapsed={duplicatesCollapsed} />
      </details>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-4 py-3 sm:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-3 text-xs">
          <span className={cn("inline-flex items-center gap-1 font-semibold", view.freshness.stale ? "text-warning" : "text-muted")}>
            {view.freshness.stale ? <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5" /> : null}
            {view.freshness.label}
            {view.freshness.warning ? ` · ${view.freshness.warning}` : ""}
          </span>
          <RankingBreakdown ranking={view.ranking} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {o.source_url ? (
            <ButtonLink href={o.source_url} variant="ghost" size="sm">
              <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" /> Voir la source
            </ButtonLink>
          ) : (
            <span className="text-xs font-medium text-muted">URL source non communiquée</span>
          )}
          {skuForOrder ? (
            <ButtonLink href={`/suppliers/${supplierId}/orders?order_sku=${skuForOrder}&qty=${orderQty}&offer=${o.id}`} variant="secondary" size="sm">
              Préparer une commande
            </ButtonLink>
          ) : (
            <ButtonLink href={`/sourcing/offers/${o.id}`} variant="secondary" size="sm">
              Associer à un SKU
            </ButtonLink>
          )}
          <ButtonLink href={`/sourcing/offers/${o.id}`} size="sm">
            Détail
          </ButtonLink>
        </div>
      </div>
    </article>
  );
}
