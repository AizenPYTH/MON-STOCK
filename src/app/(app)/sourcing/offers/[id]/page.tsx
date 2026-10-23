import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownRight, ExternalLink, AlertTriangle } from "lucide-react";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { DescriptionList, StatTile, Callout } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/status-badge";
import { Paper, Scene, SceneHeader } from "@/components/instrument";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { getOfferDetail } from "@/features/sourcing/queries";
import { LinkOfferDialog } from "@/features/sourcing/components/link-offer-dialog";
import { Sparkline } from "@/features/sourcing/components/sparkline";
import { deliveryLabel } from "@/features/sourcing/delivery";
import { OfferTraceability } from "@/features/sourcing/components/offer-traceability";
import { retrievalMethodLabel } from "@/features/sourcing/provenance";
import { setOfferStatusAction, unlinkOfferAction } from "@/features/sourcing/actions";
import { ActionButtonForm } from "@/features/sourcing/components/action-button-form";
import { formatDateTime, formatMoney, formatNumber, NOT_PROVIDED } from "@/lib/format";
import { ANOMALY_LABEL, type AnomalyCode } from "@/domain/sourcing/validation";
import { MATCH_METHOD_LABEL } from "@/domain/sourcing/matching";
import { OPPORTUNITY_LABEL } from "@/domain/sourcing/opportunities";
import { CONDITION_LABEL, OFFER_STATUS_LABEL, SOURCE_TYPE_LABEL, STOCK_STATUS_LABEL, TAX_LABEL } from "@/features/sourcing/labels";
import { safeExternalUrl } from "@/lib/utils";
import { ConfidenceBadge } from "@/features/sourcing/components/confidence-badge";
import type { PriceInsights } from "@/domain/sourcing/price-insights";

function InsightsBlock({ insights, currency, title }: { insights: PriceInsights; currency: string; title: string }) {
  return (
    <div className="space-y-1 text-sm">
      <div className="ms-mono text-[10.5px] leading-[14px] text-ink-3">{title}</div>
      {!insights.reliable ? (
        <p className="text-muted">{insights.reason ?? "Historique insuffisant"}</p>
      ) : (
        <>
          {insights.usualRange ? (
            <p>
              Prix habituel observé : <span className="font-semibold tnum">{insights.usualRange.label}</span> <span className="text-xs text-muted">(médiane {formatMoney(insights.usualRange.median, currency)}, {insights.pointCount} relevés sur {Math.floor(insights.spanDays)} jours)</span>
            </p>
          ) : null}
          {insights.trend ? <p className="text-xs text-muted-strong">{insights.trend.label}</p> : null}
          {insights.opportunity ? (
            <p className="flex items-start gap-1.5 font-semibold text-success">
              <ArrowDownRight aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              {insights.opportunity.message}
            </p>
          ) : null}
          {insights.abnormalLow ? (
            <p className="flex items-start gap-1.5 font-semibold text-warning">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              {insights.abnormalLow.message}
            </p>
          ) : null}
        </>
      )}
      {insights.bestObserved ? <p className="text-xs text-muted">{insights.bestObserved.label}</p> : null}
    </div>
  );
}

export const metadata: Metadata = { title: "Offre fournisseur" };

const CONFIDENCE_LABEL: Record<string, string> = { product: "Identification produit", price: "Prix", stock: "Stock", grade: "Grade", condition: "État", delivery: "Délai", tax: "HT/TTC" };

export default async function OfferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgContext();
  const { id } = await params;
  const d = await getOfferDetail(ctx, id);
  if (!d) notFound();
  const { offer: o } = d;
  const writable = canWrite(ctx.role);
  const currency = d.orgCurrency;
  const pricePoints = [...d.priceHistory].reverse().map((p) => Number(p.original_price));
  const statusTone = o.status === "active" ? "success" : o.status === "expired" ? "neutral" : o.status === "rejected" ? "danger" : "warning";
  const orderQty = Math.max(1, o.moq ?? 1);
  // garde d'affichage : une offre sans liste d'anomalies n'en a aucune
  const anomalies: string[] = o.anomalies ?? [];
  const marginKnown = Boolean(d.margin && d.margin.netProfit !== null);
  const marginHint = d.margin
    ? `${marginKnown ? "" : "Non calculable · "}prix de vente ${d.salePrice === null ? "—" : formatMoney(d.salePrice, currency)}${d.salePriceSource === "average_30d" ? " (moyenne 30 j)" : ""}${d.margin.caveat ? ` · ${d.margin.caveat}` : ""}`
    : o.sku_id
      ? "Non calculable : aucun prix de vente connu pour ce SKU"
      : "Non calculable : associez l'offre à un SKU avec prix de vente";

  return (
    <>
      <Scene>
        <SceneHeader
        eyebrow={
          <Link href="/sourcing/catalog" className="hover:text-on-night">
            Offres collectées
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            {o.title_original}
            <StatusBadge tone={statusTone} size="md">{OFFER_STATUS_LABEL[o.status]}</StatusBadge>
          </span>
        }
        description={
          <span>
            <Link href={`/suppliers/${o.supplier_id}`} className="font-bold text-on-night hover:underline">
              {o.supplier?.name ?? "Fournisseur"}
            </Link>
            {" · "}
            {SOURCE_TYPE_LABEL[o.source_type] ?? o.source_type}
            {o.source?.name ? ` · ${o.source.name}` : ""}
            {" · "}
            {retrievalMethodLabel(d.provenance)}
          </span>
        }
        actions={
          <>
            {o.source_url ? (
              <ButtonLink href={o.source_url} variant="night">
                <ExternalLink className="h-4 w-4" aria-hidden="true" /> Voir la source
              </ButtonLink>
            ) : null}
            {writable ? <LinkOfferDialog offerId={o.id} currentSkuCode={o.sku?.code ?? null} label={o.sku ? "Changer le SKU associé" : "Associer à un SKU"} size="md" /> : null}
            {o.sku_id ? (
              <ButtonLink href={`/suppliers/${o.supplier_id}/orders?order_sku=${o.sku_id}&qty=${orderQty}&offer=${o.id}`}>Préparer une commande</ButtonLink>
            ) : null}
          </>
        }
      />
      </Scene>
      <Paper>
      <section aria-label="Fiabilité de la donnée" className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3 rounded-2xl border border-border bg-surface px-5 py-3.5">
        <div className="min-w-0 flex-[1_1_420px]">
          <div className="ms-mono mb-1.5 text-[10.5px] leading-[14px] text-ink-3">Confiance de la donnée</div>
          <ConfidenceBadge confidence={d.confidenceBadge} showReasons />
        </div>
        <div className="min-w-0">
          <div className="ms-mono mb-1.5 text-[10.5px] leading-[14px] text-ink-3">Fraîcheur</div>
          <p className={d.freshness.stale ? "flex items-center gap-1.5 text-sm font-semibold text-warning" : "text-sm font-semibold text-muted-strong"}>
            {d.freshness.stale ? <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" /> : null}
            {d.freshness.label}
            {d.freshness.warning ? ` · ${d.freshness.warning}` : ""}
          </p>
        </div>
      </section>

      {o.status === "expired" ? <Callout tone="warning" className="mb-5" title="Offre expirée">Cette offre n'a plus été vue par sa source lors de la dernière synchronisation{o.expired_at ? ` (${formatDateTime(o.expired_at)})` : ""}. Elle est conservée pour l'historique.</Callout> : null}
      {anomalies.length > 0 ? (
        <Callout tone="danger" className="mb-5" title="Anomalies détectées">
          <ul className="list-disc pl-4">
            {anomalies.map((a) => (
              <li key={a}>{ANOMALY_LABEL[a as AnomalyCode] ?? a}</li>
            ))}
          </ul>
        </Callout>
      ) : null}
      {d.opportunities.length > 0 ? (
        <Callout tone="success" className="mb-5" title="Opportunités détectées (données réelles)">
          <ul className="list-disc pl-4">
            {d.opportunities.map((op) => (
              <li key={op.kind}>
                <span className="font-medium">{OPPORTUNITY_LABEL[op.kind]}</span> — {op.message}
              </li>
            ))}
          </ul>
        </Callout>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Prix unitaire" value={formatMoney(Number(o.original_price), o.original_currency)} hint={`${TAX_LABEL[o.tax_type]}${d.normalizedUnitPrice !== null && o.original_currency !== currency ? ` · ≈ ${formatMoney(d.normalizedUnitPrice, currency)} (taux BCE ${o.fx_rate ?? "—"}${o.fx_rate_date ? `, ${o.fx_rate_date}` : ""})` : o.original_currency !== currency ? " · Conversion indisponible" : ""}`} />
        <StatTile label="Prix comparable (HT si possible)" value={d.comparableUnitPrice === null ? null : formatMoney(d.comparableUnitPrice, currency)} hint={d.taxNote ?? undefined} />
        <StatTile label="Historique 30 j" value={d.priceStats.avg30d === null ? null : formatMoney(d.priceStats.avg30d, o.original_currency)} hint={d.priceStats.vsAveragePercent === null ? `${d.priceStats.count30d} relevé(s) sur 30 jours` : `prix actuel ${d.priceStats.vsAveragePercent > 0 ? "+" : ""}${d.priceStats.vsAveragePercent} % vs moyenne`} tone={d.priceStats.vsAveragePercent !== null && d.priceStats.vsAveragePercent < -10 ? "success" : undefined} />
        <StatTile
          label="Marge potentielle / unité"
          value={d.margin && d.margin.netProfit !== null ? formatMoney(d.margin.netProfit, currency) : null}
          approx={marginKnown}
          hint={marginHint}
          tone={d.margin && d.margin.netProfit !== null && d.margin.netProfit < 0 ? "danger" : "neutral"}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Traçabilité" description="Données telles que récupérées auprès de la source : rien n'est complété ni estimé." />
            <CardContent>
              <OfferTraceability offer={o} supplierName={o.supplier?.name ?? "Fournisseur"} supplierCountry={o.supplier?.country ?? null} provenance={d.provenance} duplicatesCollapsed={0} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Détail de l'offre" />
            <CardContent>
              <DescriptionList
                items={[
                  { label: "Produit normalisé", value: [o.brand, o.model, o.storage, o.color].filter(Boolean).join(" · ") || NOT_PROVIDED },
                  { label: "État / grade", value: `${CONDITION_LABEL[o.condition]}${o.grade ? ` · Grade ${o.grade}` : ""}` },
                  { label: "EAN / MPN", value: `${o.ean ?? "—"} / ${o.mpn ?? "—"}` },
                  { label: "Référence fournisseur", value: o.external_product_id ?? NOT_PROVIDED },
                  { label: "MOQ", value: o.moq === null ? NOT_PROVIDED : `${formatNumber(o.moq)} unité(s)` },
                  { label: "Minimum de commande", value: o.minimum_order_value === null ? NOT_PROVIDED : formatMoney(o.minimum_order_value, o.original_currency) },
                  { label: "Stock", value: o.available_quantity !== null ? `${formatNumber(o.available_quantity)} unité(s)` : STOCK_STATUS_LABEL[o.stock_status] },
                  { label: "Délai de livraison", value: deliveryLabel(o.delivery_min_days ?? null, o.delivery_max_days ?? null) },
                  { label: "Frais de port", value: o.shipping_cost === null ? NOT_PROVIDED : formatMoney(o.shipping_cost, o.shipping_currency ?? o.original_currency) },
                  { label: "Coût rendu estimé", value: d.landed && d.landed.unitLandedCost !== null ? `${formatMoney(d.landed.unitLandedCost, currency)} / unité (${Math.max(1, o.moq ?? 1)} unité(s))${d.landed.determinable ? "" : " · frais d'import inconnus"}` : "Coût final non déterminable (frais de port non communiqués)" },
                  { label: "Pays", value: o.country ?? o.supplier?.country ?? NOT_PROVIDED },
                  { label: "Première / dernière vérification", value: `${formatDateTime(o.first_seen_at)} / ${formatDateTime(o.last_seen_at)}` },
                  { label: "Dernier changement de prix", value: formatDateTime(o.last_price_at) },
                  { label: "Dernier changement de stock", value: o.last_stock_at ? formatDateTime(o.last_stock_at) : NOT_PROVIDED },
                  { label: "SKU associé", value: o.sku ? <Link href={`/stock/${encodeURIComponent(o.sku.code)}`} className="font-mono hover:underline">{o.sku.code}</Link> : "Aucun" },
                  { label: "Source", value: <span>{SOURCE_TYPE_LABEL[o.source_type]}{safeExternalUrl(o.source_url) ? <> · <a href={safeExternalUrl(o.source_url) ?? undefined} target="_blank" rel="noopener noreferrer" className="break-all underline">{o.source_url}</a></> : " · URL non communiquée"}</span> },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Historique des prix" description={`${d.priceHistory.length} relevé(s)`} actions={pricePoints.length > 1 ? <Sparkline points={pricePoints} label="Évolution du prix" /> : null} />
            <div>
              {d.priceHistory.length === 0 ? (
                <p className="px-5 py-5 text-sm text-muted">Aucun relevé.</p>
              ) : (
                <ul className="divide-y divide-line-soft text-sm">
                  {d.priceHistory.map((p) => (
                    <li key={p.id} className="flex items-center justify-between px-5 py-2">
                      <span className="text-muted tnum">{formatDateTime(p.recorded_at)}</span>
                      <span className="tnum">
                        {formatMoney(Number(p.original_price), p.original_currency)} <span className="text-xs text-muted">{TAX_LABEL[p.tax_type]}</span>
                        {p.normalized_price !== null && p.normalized_currency && p.normalized_currency !== p.original_currency ? <span className="ml-2 text-xs text-muted">≈ {formatMoney(p.normalized_price, p.normalized_currency)}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Prix habituel observé" description={`Relevés réels des ${90} derniers jours (supplier_price_history), dans la devise de l'organisation. Aucune conclusion sans au moins 5 relevés sur 14 jours.`} />
            <CardContent className="space-y-4">
              <InsightsBlock insights={d.priceInsights.offerInsights} currency={currency} title="Cette offre" />
              {d.priceInsights.productInsights ? <InsightsBlock insights={d.priceInsights.productInsights} currency={currency} title={`Ce produit, tous fournisseurs (${d.priceInsights.siblingCount} offres)`} /> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Historique des prix par fournisseur" description="Même produit normalisé, toutes sources confondues (90 jours)." />
            <div>
              {d.priceInsights.supplierHistories.every((h) => h.pointCount === 0) ? (
                <p className="px-5 py-5 text-sm text-muted">Historique insuffisant : aucun relevé exploitable sur la période.</p>
              ) : (
                <ul className="divide-y divide-line-soft text-sm">
                  {d.priceInsights.supplierHistories.map((h) => (
                    <li key={h.supplierId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2">
                      <div className="min-w-0">
                        <Link href={`/suppliers/${h.supplierId}`} className="font-medium hover:underline">
                          {h.supplierName}
                        </Link>
                        <div className="text-xs text-muted">
                          {h.pointCount === 0 ? "Aucun relevé" : `${h.pointCount} relevé(s) · min ${formatMoney(h.minPrice, currency)} · max ${formatMoney(h.maxPrice, currency)} · dernier ${formatDateTime(h.lastRecordedAt)}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {h.points.length > 1 ? <Sparkline points={h.points} label={`Prix ${h.supplierName}`} /> : null}
                        <span className="tnum font-medium">{h.lastPrice === null ? "—" : formatMoney(h.lastPrice, currency)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Historique du stock" description={`${d.stockHistory.length} relevé(s)`} />
            <div>
              {d.stockHistory.length === 0 ? (
                <p className="px-5 py-5 text-sm text-muted">Stock jamais communiqué par la source.</p>
              ) : (
                <ul className="divide-y divide-line-soft text-sm">
                  {d.stockHistory.map((s) => (
                    <li key={s.id} className="flex items-center justify-between px-5 py-2">
                      <span className="text-muted">{formatDateTime(s.recorded_at)}</span>
                      <span>{s.available_quantity !== null ? `${formatNumber(s.available_quantity)} unité(s)` : STOCK_STATUS_LABEL[s.stock_status]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Confiance par donnée" description="0 = non communiqué, 1 = fourni explicitement." />
            <CardContent>
              <ul className="space-y-1.5 text-sm">
                {Object.entries(d.confidence).map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between gap-3">
                    <span>{CONFIDENCE_LABEL[k] ?? k}</span>
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-track">
                        <span className="block h-full rounded-full bg-inverse" style={{ width: `${Math.round(Math.max(0, Math.min(1, Number(v))) * 100)}%` }} />
                      </span>
                      <span className="w-8 text-right text-xs tnum text-muted">{Math.round(Number(v) * 100)} %</span>
                    </span>
                  </li>
                ))}
                {Object.keys(d.confidence).length === 0 ? <li className="text-muted">Non renseignée.</li> : null}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Correspondances SKU" />
            <div>
              {d.matches.length === 0 ? (
                <p className="px-5 py-4 text-sm text-muted">Aucune suggestion enregistrée. Utilisez « Associer à un SKU ».</p>
              ) : (
                <ul className="divide-y divide-line-soft text-sm">
                  {d.matches.map((m) => (
                    <li key={m.id} className="px-5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs">{m.sku?.code ?? "—"}</span>
                        <StatusBadge tone={m.status === "confirmed" ? "success" : m.status === "rejected" ? "danger" : "warning"}>{m.status === "confirmed" ? "Confirmée" : m.status === "rejected" ? "Rejetée" : "À valider"}</StatusBadge>
                      </div>
                      <div className="text-xs text-muted">
                        {m.sku?.product?.name} · {Math.round(Number(m.confidence) * 100)} % · {MATCH_METHOD_LABEL[m.method as keyof typeof MATCH_METHOD_LABEL] ?? m.method}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {writable && o.sku_id ? (
                <ActionButtonForm action={unlinkOfferAction} fields={{ offer_id: o.id }} variant="ghost" className="border-t border-border px-5 py-2">
                  Dissocier du SKU
                </ActionButtonForm>
              ) : null}
            </div>
          </Card>

          {writable ? (
            <Card>
              <CardHeader title="Statut" />
              <CardContent>
                <ActionButtonForm
                  action={setOfferStatusAction}
                  fields={{ offer_id: o.id, status: o.status === "rejected" ? "active" : "rejected" }}
                  variant={o.status === "rejected" ? "secondary" : "danger"}
                  before={<span className="text-muted">{o.status === "rejected" ? "Offre rejetée : exclue des recherches." : "Exclure cette offre des recherches (données erronées, fournisseur non pertinent…)."}</span>}
                >
                  {o.status === "rejected" ? "Réactiver" : "Rejeter"}
                </ActionButtonForm>
                {d.freshness.stale ? (
                  <p className="mt-3 flex items-start gap-1 text-xs font-semibold text-warning">
                    <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {d.freshness.warning} : synchronisez la source pour actualiser cette offre.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
      </Paper>
    </>
  );
}
