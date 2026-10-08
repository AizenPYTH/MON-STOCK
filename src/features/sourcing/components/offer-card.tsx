import Link from "next/link";
import { ExternalLink, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { formatMoney, formatNumber, formatRelative, NOT_PROVIDED } from "@/lib/format";
import type { SearchOfferView, SearchSku } from "@/services/sourcing/search";
import { ScoreBreakdown } from "@/features/sourcing/components/score-breakdown";
import { OfferTraceability } from "@/features/sourcing/components/offer-traceability";
import { deliveryLabel } from "@/features/sourcing/delivery";
import { fromSearchProvenance, retrievalMethodLabel } from "@/features/sourcing/provenance";
import { CONDITION_LABEL, SOURCE_TYPE_LABEL, STOCK_STATUS_LABEL, TAX_LABEL } from "@/features/sourcing/labels";

export { deliveryLabel };

export function OfferCard({ view, currency, sku, requestedQuantity }: { view: SearchOfferView; currency: string; sku: SearchSku | null; requestedQuantity: number }) {
  const o = view.offer;
  const supplierId = o.supplier?.id ?? o.supplier_id;
  const skuForOrder = sku?.id ?? o.sku_id;
  const orderQty = Math.max(requestedQuantity, o.moq ?? 1);
  const sameCurrency = o.original_currency.toUpperCase() === currency.toUpperCase();
  const provenance = fromSearchProvenance(view.provenance, { sourceType: o.source_type, sourceUrl: o.source_url, lastSeenAt: o.last_seen_at });
  const duplicatesCollapsed = view.duplicatesCollapsed ?? 0;
  return (
    <article className="rounded-xl border border-border bg-surface p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">
            <Link href={`/sourcing/offers/${o.id}` as never} className="hover:underline">
              {o.title_original}
            </Link>
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            <Link href={`/suppliers/${supplierId}` as never} className="font-medium text-foreground hover:underline">
              {view.supplierName}
            </Link>
            {" · "}
            {view.supplierCountry ?? "Pays non communiqué"}
            {" · "}
            <Badge variant="outline">{SOURCE_TYPE_LABEL[o.source_type] ?? o.source_type}</Badge>
            {o.sku_id ? (
              <>
                {" · "}
                <Badge variant="accent">SKU associé</Badge>
              </>
            ) : null}
            {o.status === "suspicious" ? (
              <>
                {" · "}
                <Badge variant="warning">Données suspectes</Badge>
              </>
            ) : null}
            {duplicatesCollapsed > 0 ? (
              <>
                {" · "}
                <Badge variant="accent">{duplicatesCollapsed} identique{duplicatesCollapsed > 1 ? "s" : ""} fusionnée{duplicatesCollapsed > 1 ? "s" : ""}</Badge>
              </>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {retrievalMethodLabel(provenance)} · vérifié {formatRelative(provenance.retrievedAt ?? o.last_seen_at)}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xl font-semibold tnum">
            {view.normalizedUnitPrice === null ? (
              <span>
                {formatMoney(Number(o.original_price), o.original_currency)} <span className="text-xs font-normal text-amber-700">Conversion indisponible</span>
              </span>
            ) : (
              <>
                {formatMoney(view.normalizedUnitPrice, currency)} <span className="text-xs font-normal text-muted">{TAX_LABEL[o.tax_type]}</span>
              </>
            )}
          </div>
          {!sameCurrency && view.normalizedUnitPrice !== null ? (
            <div className="text-xs text-muted">
              Prix original {formatMoney(Number(o.original_price), o.original_currency)}
              {o.fx_rate ? ` · taux BCE ${o.fx_rate}${o.fx_rate_date ? ` (${o.fx_rate_date})` : ""}` : ""}
            </div>
          ) : null}
          {view.comparableNote ? <div className="text-xs text-muted">{view.comparableNote}</div> : null}
          {view.savingsPerUnit !== null ? (
            <div className={`text-xs font-medium ${view.savingsPerUnit > 0 ? "text-success" : "text-danger"}`}>
              {view.savingsPerUnit > 0 ? `−${formatMoney(view.savingsPerUnit, currency)} / unité vs votre coût` : `+${formatMoney(-view.savingsPerUnit, currency)} / unité vs votre coût`}
            </div>
          ) : null}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <dt className="text-muted">MOQ</dt>
          <dd className="font-medium">{o.moq === null ? NOT_PROVIDED : `${formatNumber(o.moq)} unité(s)`}{view.comparable && view.comparable.constrainedByOrderValue ? ` · min. ${formatMoney(view.comparable.minimumOrderValue, currency)}` : ""}</dd>
        </div>
        <div>
          <dt className="text-muted">Stock</dt>
          <dd className="font-medium">{o.available_quantity !== null ? `${formatNumber(o.available_quantity)} unité(s)` : STOCK_STATUS_LABEL[o.stock_status] ?? "Stock non communiqué"}</dd>
        </div>
        <div>
          <dt className="text-muted">Grade / état</dt>
          <dd className="font-medium">
            {o.grade ? `Grade ${o.grade}` : "Grade non communiqué"} · {CONDITION_LABEL[o.condition]}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Pays</dt>
          <dd className="font-medium">{o.country ?? view.supplierCountry ?? NOT_PROVIDED}</dd>
        </div>
        <div>
          <dt className="text-muted">Délai</dt>
          <dd className="font-medium">{deliveryLabel(o.delivery_min_days, o.delivery_max_days)}</dd>
        </div>
        <div>
          <dt className="text-muted">Frais de port</dt>
          <dd className="font-medium">{o.shipping_cost === null ? NOT_PROVIDED : formatMoney(o.shipping_cost, o.shipping_currency ?? o.original_currency)}</dd>
        </div>
      </dl>

      <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
        <div className="rounded-lg bg-surface-muted/60 px-3 py-2">
          <div className="text-muted">Coût rendu estimé ({view.landedQuantity} unité(s))</div>
          {view.landedCost && view.landedCost.unitLandedCost !== null ? (
            <div className="font-medium">
              {formatMoney(view.landedCost.unitLandedCost, currency)} / unité · total {formatMoney(view.landedCost.totalLandedCost, currency)}
              {!view.landedCost.determinable ? <span className="text-muted"> (frais d'import inconnus non inclus)</span> : null}
            </div>
          ) : (
            <div className="font-medium text-muted">Coût final non déterminable{view.comparableUnitPrice !== null ? " (frais de port non communiqués)" : ""}</div>
          )}
        </div>
        <div className="rounded-lg bg-surface-muted/60 px-3 py-2">
          <div className="text-muted">Marge potentielle</div>
          {view.margin ? (
            <div>
              <span className={`font-medium ${view.margin.result.netProfit !== null && view.margin.result.netProfit < 0 ? "text-danger" : "text-success"}`}>
                {view.margin.result.netProfit === null ? "—" : formatMoney(view.margin.result.netProfit, currency)}
                {view.margin.result.netMarginPercent !== null ? ` (${view.margin.result.netMarginPercent.toFixed(1)} %)` : ""}
              </span>
              <div className="text-muted">
                {view.margin.formula}
                {view.margin.salePriceSource === "average_30d" ? " · prix de vente = moyenne 30 j" : ""}
              </div>
              {view.margin.result.caveat ? <div className="text-amber-700">{view.margin.result.caveat}</div> : null}
            </div>
          ) : (
            <div className="font-medium text-muted">{view.marginUnavailableReason ?? "Non calculable"}</div>
          )}
        </div>
      </div>

      <details className="mt-3 rounded-lg border border-border bg-surface-muted/40 px-3 py-2 text-xs">
        <summary className="cursor-pointer font-medium text-muted-strong hover:text-foreground">Traçabilité : données telles que récupérées</summary>
        <OfferTraceability className="mt-2" offer={o} supplierName={view.supplierName} supplierCountry={view.supplierCountry} provenance={provenance} duplicatesCollapsed={duplicatesCollapsed} />
      </details>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className={view.freshness.stale ? "text-amber-700" : "text-muted"}>
            {view.freshness.stale ? <AlertTriangle className="mr-1 inline h-3.5 w-3.5" /> : null}
            {view.freshness.label}
            {view.freshness.warning ? ` · ${view.freshness.warning}` : ""}
          </span>
          <ScoreBreakdown score={view.score} compact />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {o.source_url ? (
            <ButtonLink href={o.source_url} variant="ghost" size="sm">
              <ExternalLink className="h-3.5 w-3.5" /> Voir la source
            </ButtonLink>
          ) : (
            <span className="text-xs text-muted">URL source non communiquée</span>
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
