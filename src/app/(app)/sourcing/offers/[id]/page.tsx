import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, AlertTriangle } from "lucide-react";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { PageHeader, DescriptionList, Stat, Callout } from "@/components/ui/page";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { getOfferDetail } from "@/features/sourcing/queries";
import { LinkOfferDialog } from "@/features/sourcing/components/link-offer-dialog";
import { Sparkline } from "@/features/sourcing/components/sparkline";
import { deliveryLabel } from "@/features/sourcing/components/offer-card";
import { setOfferStatusAction, unlinkOfferAction } from "@/features/sourcing/actions";
import { formatDateTime, formatMoney, formatNumber, NOT_PROVIDED } from "@/lib/format";
import { ANOMALY_LABEL, type AnomalyCode } from "@/domain/sourcing/validation";
import { MATCH_METHOD_LABEL } from "@/domain/sourcing/matching";
import { OPPORTUNITY_LABEL } from "@/domain/sourcing/opportunities";
import { CONDITION_LABEL, OFFER_STATUS_LABEL, SOURCE_TYPE_LABEL, STOCK_STATUS_LABEL, TAX_LABEL } from "@/features/sourcing/labels";

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

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/sourcing" className="hover:text-foreground">
            Sourcing
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            {o.title_original}
            <Badge variant={statusTone}>{OFFER_STATUS_LABEL[o.status]}</Badge>
          </span>
        }
        description={
          <span>
            <Link href={`/suppliers/${o.supplier_id}` as never} className="font-medium text-foreground hover:underline">
              {o.supplier?.name ?? "Fournisseur"}
            </Link>
            {" · "}
            {SOURCE_TYPE_LABEL[o.source_type] ?? o.source_type}
            {o.source?.name ? ` · ${o.source.name}` : ""}
            {" · "}
            <span className={d.freshness.stale ? "text-amber-700" : ""}>
              {d.freshness.label}
              {d.freshness.warning ? ` · ${d.freshness.warning}` : ""}
            </span>
          </span>
        }
        actions={
          <>
            {o.source_url ? (
              <ButtonLink href={o.source_url} variant="secondary">
                <ExternalLink className="h-4 w-4" /> Voir la source
              </ButtonLink>
            ) : null}
            {writable ? <LinkOfferDialog offerId={o.id} currentSkuCode={o.sku?.code ?? null} label={o.sku ? "Changer le SKU associé" : "Associer à un SKU"} size="md" /> : null}
            {o.sku_id ? (
              <ButtonLink href={`/suppliers/${o.supplier_id}/orders?order_sku=${o.sku_id}&qty=${orderQty}&offer=${o.id}`}>Préparer une commande</ButtonLink>
            ) : null}
          </>
        }
      />

      {o.status === "expired" ? <Callout tone="warning" className="mb-5" title="Offre expirée">Cette offre n'a plus été vue par sa source lors de la dernière synchronisation{o.expired_at ? ` (${formatDateTime(o.expired_at)})` : ""}. Elle est conservée pour l'historique.</Callout> : null}
      {o.anomalies.length > 0 ? (
        <Callout tone="danger" className="mb-5" title="Anomalies détectées">
          <ul className="list-disc pl-4">
            {o.anomalies.map((a) => (
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Prix unitaire" value={formatMoney(Number(o.original_price), o.original_currency)} hint={`${TAX_LABEL[o.tax_type]}${d.normalizedUnitPrice !== null && o.original_currency !== currency ? ` · ≈ ${formatMoney(d.normalizedUnitPrice, currency)} (taux BCE ${o.fx_rate ?? "—"}${o.fx_rate_date ? `, ${o.fx_rate_date}` : ""})` : o.original_currency !== currency ? " · Conversion indisponible" : ""}`} />
        <Stat label="Prix comparable (HT si possible)" value={d.comparableUnitPrice === null ? "—" : formatMoney(d.comparableUnitPrice, currency)} hint={d.taxNote ?? undefined} />
        <Stat label="Historique 30 j" value={d.priceStats.avg30d === null ? "—" : formatMoney(d.priceStats.avg30d, o.original_currency)} hint={d.priceStats.vsAveragePercent === null ? `${d.priceStats.count30d} relevé(s) sur 30 jours` : `prix actuel ${d.priceStats.vsAveragePercent > 0 ? "+" : ""}${d.priceStats.vsAveragePercent} % vs moyenne`} tone={d.priceStats.vsAveragePercent !== null && d.priceStats.vsAveragePercent < -10 ? "success" : undefined} />
        <Stat
          label="Marge potentielle / unité"
          value={d.margin && d.margin.netProfit !== null ? formatMoney(d.margin.netProfit, currency) : "Non calculable"}
          hint={d.margin ? `prix de vente ${d.salePrice === null ? "—" : formatMoney(d.salePrice, currency)}${d.salePriceSource === "average_30d" ? " (moyenne 30 j)" : ""}${d.margin.caveat ? ` · ${d.margin.caveat}` : ""}` : o.sku_id ? "Aucun prix de vente connu pour ce SKU" : "Associez l'offre à un SKU avec prix de vente"}
          tone={d.margin && d.margin.netProfit !== null && d.margin.netProfit < 0 ? "danger" : undefined}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
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
                  { label: "Délai de livraison", value: deliveryLabel(o.delivery_min_days, o.delivery_max_days) },
                  { label: "Frais de port", value: o.shipping_cost === null ? NOT_PROVIDED : formatMoney(o.shipping_cost, o.shipping_currency ?? o.original_currency) },
                  { label: "Coût rendu estimé", value: d.landed && d.landed.unitLandedCost !== null ? `${formatMoney(d.landed.unitLandedCost, currency)} / unité (${Math.max(1, o.moq ?? 1)} unité(s))${d.landed.determinable ? "" : " · frais d'import inconnus"}` : "Coût final non déterminable (frais de port non communiqués)" },
                  { label: "Pays", value: o.country ?? o.supplier?.country ?? NOT_PROVIDED },
                  { label: "Première / dernière vérification", value: `${formatDateTime(o.first_seen_at)} / ${formatDateTime(o.last_seen_at)}` },
                  { label: "Dernier changement de prix", value: formatDateTime(o.last_price_at) },
                  { label: "Dernier changement de stock", value: o.last_stock_at ? formatDateTime(o.last_stock_at) : NOT_PROVIDED },
                  { label: "SKU associé", value: o.sku ? <Link href={`/stock/${encodeURIComponent(o.sku.code)}` as never} className="font-mono hover:underline">{o.sku.code}</Link> : "Aucun" },
                  { label: "Source", value: <span>{SOURCE_TYPE_LABEL[o.source_type]}{o.source_url ? <> · <a href={o.source_url} target="_blank" rel="noopener noreferrer" className="underline">{o.source_url}</a></> : " · URL non communiquée"}</span> },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Historique des prix" description={`${d.priceHistory.length} relevé(s)`} actions={pricePoints.length > 1 ? <Sparkline points={pricePoints} label="Évolution du prix" /> : null} />
            <CardContent className="p-0">
              {d.priceHistory.length === 0 ? (
                <p className="px-5 py-5 text-sm text-muted">Aucun relevé.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {d.priceHistory.map((p) => (
                    <li key={p.id} className="flex items-center justify-between px-5 py-2">
                      <span className="text-muted">{formatDateTime(p.recorded_at)}</span>
                      <span className="tnum">
                        {formatMoney(Number(p.original_price), p.original_currency)} <span className="text-xs text-muted">{TAX_LABEL[p.tax_type]}</span>
                        {p.normalized_price !== null && p.normalized_currency && p.normalized_currency !== p.original_currency ? <span className="ml-2 text-xs text-muted">≈ {formatMoney(p.normalized_price, p.normalized_currency)}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Historique du stock" description={`${d.stockHistory.length} relevé(s)`} />
            <CardContent className="p-0">
              {d.stockHistory.length === 0 ? (
                <p className="px-5 py-5 text-sm text-muted">Stock jamais communiqué par la source.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {d.stockHistory.map((s) => (
                    <li key={s.id} className="flex items-center justify-between px-5 py-2">
                      <span className="text-muted">{formatDateTime(s.recorded_at)}</span>
                      <span>{s.available_quantity !== null ? `${formatNumber(s.available_quantity)} unité(s)` : STOCK_STATUS_LABEL[s.stock_status]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
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
                      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-muted">
                        <span className="block h-full bg-foreground" style={{ width: `${Math.round(Math.max(0, Math.min(1, Number(v))) * 100)}%` }} />
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
            <CardContent className="p-0">
              {d.matches.length === 0 ? (
                <p className="px-5 py-4 text-sm text-muted">Aucune suggestion enregistrée. Utilisez « Associer à un SKU ».</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {d.matches.map((m) => (
                    <li key={m.id} className="px-5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs">{m.sku?.code ?? "—"}</span>
                        <Badge variant={m.status === "confirmed" ? "success" : m.status === "rejected" ? "danger" : "warning"}>{m.status === "confirmed" ? "Confirmée" : m.status === "rejected" ? "Rejetée" : "À valider"}</Badge>
                      </div>
                      <div className="text-xs text-muted">
                        {m.sku?.product?.name} · {Math.round(Number(m.confidence) * 100)} % · {MATCH_METHOD_LABEL[m.method as keyof typeof MATCH_METHOD_LABEL] ?? m.method}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {writable && o.sku_id ? (
                <form action={unlinkOfferAction} className="border-t border-border px-5 py-2">
                  <input type="hidden" name="offer_id" value={o.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    Dissocier du SKU
                  </Button>
                </form>
              ) : null}
            </CardContent>
          </Card>

          {writable ? (
            <Card>
              <CardHeader title="Statut" />
              <CardContent>
                <form action={setOfferStatusAction} className="flex items-center justify-between gap-3 text-sm">
                  <input type="hidden" name="offer_id" value={o.id} />
                  <input type="hidden" name="status" value={o.status === "rejected" ? "active" : "rejected"} />
                  <span className="text-muted">{o.status === "rejected" ? "Offre rejetée : exclue des recherches." : "Exclure cette offre des recherches (données erronées, fournisseur non pertinent…)."}</span>
                  <Button type="submit" variant={o.status === "rejected" ? "secondary" : "danger"} size="sm">
                    {o.status === "rejected" ? "Réactiver" : "Rejeter"}
                  </Button>
                </form>
                {d.freshness.stale ? (
                  <p className="mt-3 flex items-start gap-1 text-xs text-amber-700">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {d.freshness.warning} : synchronisez la source pour actualiser cette offre.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
