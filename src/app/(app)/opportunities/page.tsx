import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { requireOrgContext } from "@/features/auth/dal";
import { PageHeader, EmptyState, Section, Callout, Stat } from "@/components/ui/page";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { findOpportunities, type OpportunityView } from "@/features/analytics/opportunities";
import { SOURCE_TYPE_LABEL, SOURCING_EVENT_LABEL, TAX_LABEL } from "@/features/analytics/labels";
import { UNKNOWN_COST_LABEL } from "@/domain/pricing/margin";
import { formatDays, formatMoney, formatNumber, formatPercent, formatRelative, NOT_PROVIDED } from "@/lib/format";
import { safeExternalUrl } from "@/lib/utils";

export const metadata: Metadata = { title: "Opportunités" };

function Row({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-right text-sm text-foreground">
        <div className="tnum">{value}</div>
        {hint ? <div className="text-xs text-muted">{hint}</div> : null}
      </dd>
    </div>
  );
}

function OpportunityCard({ o }: { o: OpportunityView }) {
  const ev = o.evaluation;
  const m = ev.margin;
  const offerCurrency = o.offer.normalizedCurrency ?? o.offer.originalCurrency;
  const feesKnown = m ? [m.marketplaceFee, m.paymentFee, m.shippingCost].filter((f): f is number => f !== null) : [];
  const feesTotal = feesKnown.length > 0 ? feesKnown.reduce((s, f) => s + f, 0) : null;
  const feesMissing = m ? m.unknownCosts.filter((u) => u !== "cost_price" && u !== "sale_price") : [];
  return (
    <Card className={ev.status === "potential" ? "border-green-200" : undefined}>
      <CardHeader
        title={
          <Link href={`/stock/${encodeURIComponent(o.code)}` as never} className="hover:underline">
            {o.name}
          </Link>
        }
        description={
          <span>
            <code className="font-mono text-xs">{o.code}</code> · stock {formatNumber(o.stockAvailable)} · {o.offersCount} offre{o.offersCount > 1 ? "s" : ""}
          </span>
        }
        actions={
          ev.status === "potential" ? (
            <Badge variant="success">🟢 Opportunité potentielle</Badge>
          ) : ev.status === "unprofitable" ? (
            <Badge variant="neutral">Non rentable (estimation)</Badge>
          ) : (
            <Badge variant="warning">Données insuffisantes</Badge>
          )
        }
      />
      <CardContent>
        <dl className="divide-y divide-border">
          <Row
            label="Prix fournisseur"
            value={
              <span>
                {formatMoney(o.offer.normalizedPrice, offerCurrency)} <span className="text-xs text-muted">{TAX_LABEL[o.offer.taxType]}</span>
              </span>
            }
            hint={
              <span>
                {o.offer.supplierName}
                {o.offer.supplierCountry ? ` (${o.offer.supplierCountry})` : ""} · {SOURCE_TYPE_LABEL[o.offer.sourceType] ?? o.offer.sourceType} · prix vu {formatRelative(o.offer.lastPriceAt)}
                {o.offer.stale ? <span className="ml-1 text-amber-700">(non revu depuis plus de 7 j)</span> : null}
                {o.offer.normalizedCurrency && o.offer.normalizedCurrency !== o.offer.originalCurrency ? ` · ${formatMoney(o.offer.originalPrice, o.offer.originalCurrency)} d'origine` : ""}
              </span>
            }
          />
          <Row label="Coût rendu / unité" value={o.landedUnitCost === null ? <span className="text-xs text-muted">Transport non communiqué</span> : formatMoney(o.landedUnitCost, offerCurrency)} hint={o.offer.moq ? `transport réparti sur le MOQ de ${o.offer.moq}` : undefined} />
          <Row label="Prix de vente moyen" value={o.salePrice === null ? <span className="text-xs text-muted">Pas assez de données</span> : formatMoney(o.salePrice, o.currency)} hint={o.salePriceBasis === "avg_30d" ? "moyenne des ventes sur 30 j" : o.salePriceBasis === "sku_price" ? "prix de la fiche SKU (aucune vente 30 j)" : "aucune vente et aucun prix renseigné"} />
          <Row
            label="Frais estimés / unité"
            value={m === null ? <span className="text-xs text-muted">—</span> : feesTotal === null ? <span className="text-xs text-muted">Inconnus</span> : formatMoney(feesTotal, o.currency)}
            hint={feesMissing.length > 0 ? `non déduits : ${feesMissing.map((u) => UNKNOWN_COST_LABEL[u]).join(", ")}` : m ? "commission, paiement, transport" : undefined}
          />
          <Row
            label="Marge estimée / unité"
            value={
              m === null || m.netProfit === null ? (
                <span className="text-xs text-muted">Non calculable</span>
              ) : (
                <span className={m.netProfit < 0 ? "font-semibold text-danger" : "font-semibold text-success"}>
                  {formatMoney(m.netProfit, o.currency)} <span className="text-xs font-normal text-muted">({formatPercent(m.netMarginPercent, 0)})</span>
                </span>
              )
            }
            hint={m && m.grossMargin !== null ? `marge brute ${formatMoney(m.grossMargin, o.currency)}` : undefined}
          />
          <Row label="Vitesse de vente" value={o.velocity.dailyVelocity === null ? <span className="text-xs text-muted">Pas assez de données</span> : `${formatNumber(o.velocity.dailyVelocity, 1)} / jour`} hint={o.velocity.dailyVelocity !== null ? o.velocity.explanation : undefined} />
          <Row
            label="Stock fournisseur"
            value={o.offer.availableQuantity === null ? <span className="text-xs text-muted">Stock non communiqué</span> : `${formatNumber(o.offer.availableQuantity)} u.`}
            hint={`${o.offer.moq ? `MOQ ${o.offer.moq} · ` : ""}délai ${o.offer.deliveryMaxDays !== null ? formatDays(o.offer.deliveryMaxDays) : o.offer.deliveryMinDays !== null ? formatDays(o.offer.deliveryMinDays) : NOT_PROVIDED}${o.offer.lastStockAt ? ` · stock vu ${formatRelative(o.offer.lastStockAt)}` : ""}`}
          />
        </dl>
        {ev.missing.length > 0 ? (
          <p className="mt-3 text-xs text-amber-700">
            Données insuffisantes : {ev.missing.join(" ; ")}.
          </p>
        ) : null}
        {ev.notes.map((n) => (
          <p key={n} className="mt-1 text-xs text-muted">
            {n}
          </p>
        ))}
        <div className="mt-4 flex flex-wrap gap-2">
          <ButtonLink href={`/sourcing/offers/${o.offer.id}`} variant="secondary" size="sm">
            Voir l'offre
          </ButtonLink>
          <ButtonLink href={`/stock/${encodeURIComponent(o.code)}`} variant="ghost" size="sm">
            Fiche SKU
          </ButtonLink>
          {safeExternalUrl(o.offer.sourceUrl) ? (
            <a href={safeExternalUrl(o.offer.sourceUrl) ?? undefined} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 self-center text-xs text-muted hover:text-foreground">
              Source <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function OpportunitiesPage() {
  const ctx = await requireOrgContext();
  const data = await findOpportunities(ctx);
  const currency = ctx.organization.default_currency;

  return (
    <>
      <PageHeader
        title="Opportunités"
        description="Produits pour lesquels une offre fournisseur associée permet, d'après vos prix de vente réels, une marge estimée positive. Rien n'est annoncé quand une donnée essentielle manque."
        actions={<ButtonLink href="/sourcing" variant="secondary">Sourcing</ButtonLink>}
      />

      {data.missingFees.length > 0 && data.items.length > 0 ? (
        <Callout tone="info" className="mb-4" action={<ButtonLink href="/settings/organization" variant="secondary" size="sm">Renseigner les frais</ButtonLink>}>
          Estimation partielle : {data.missingFees.map((u) => UNKNOWN_COST_LABEL[u]).join(", ")} non déduit(s). Renseignez les frais de votre canal principal pour affiner les marges.
        </Callout>
      ) : null}

      {data.items.length === 0 ? (
        <EmptyState
          title="Aucune opportunité détectée pour le moment."
          description="Les opportunités apparaissent quand (1) une offre fournisseur est associée à l'un de vos SKU dans le sourcing, (2) le SKU a un prix de vente connu (ventes des 30 derniers jours ou prix renseigné) et (3) le prix fournisseur est normalisé dans votre devise."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink href="/sourcing">Associer des offres à mes SKU</ButtonLink>
              <ButtonLink href="/stock" variant="secondary">
                Renseigner les prix de vente
              </ButtonLink>
              <ButtonLink href="/settings/integrations" variant="secondary">
                Importer mes ventes
              </ButtonLink>
            </div>
          }
        />
      ) : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <Stat label="Opportunités potentielles" value={formatNumber(data.potentialCount)} tone={data.potentialCount > 0 ? "success" : undefined} hint="prix de vente et prix fournisseur connus, marge estimée positive" />
            <Stat label="Non rentables (estimation)" value={formatNumber(data.unprofitableCount)} hint="marge estimée nulle ou négative" />
            <Stat label="Données insuffisantes" value={formatNumber(data.insufficientCount)} tone={data.insufficientCount > 0 ? "warning" : undefined} hint="prix de vente ou prix fournisseur manquant" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.items.map((o) => (
              <OpportunityCard key={o.skuId} o={o} />
            ))}
          </div>
        </>
      )}

      <Section className="mt-8" title="Alertes de sourcing (7 derniers jours)" description="Événements déclenchés par vos alertes de sourcing : baisse de prix, prix sous le seuil, nouveau stock…">
        {data.events.length === 0 ? (
          <Card>
            <CardContent className="text-sm text-muted">
              Aucun événement sur les 7 derniers jours.{" "}
              <Link href="/sourcing" className="underline">
                Créez une alerte de sourcing
              </Link>{" "}
              pour être prévenu d'une baisse de prix ou d'un retour en stock.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-border text-sm">
              {data.events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="info">{SOURCING_EVENT_LABEL[e.kind] ?? e.kind}</Badge>
                      <span className="font-medium">{e.offerTitle ?? "Offre"}</span>
                      {e.supplierName ? <span className="text-xs text-muted">{e.supplierName}</span> : null}
                    </div>
                    <p className="text-xs text-muted">
                      {e.message} · {formatRelative(e.triggeredAt)}
                      {e.alertName ? ` · alerte « ${e.alertName} »` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {e.price !== null ? <span className="font-semibold tnum">{formatMoney(e.price, e.currency ?? currency)}</span> : null}
                    {e.offerId ? (
                      <ButtonLink href={`/sourcing/offers/${e.offerId}`} variant="secondary" size="sm">
                        Voir l'offre
                      </ButtonLink>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Section>
    </>
  );
}
