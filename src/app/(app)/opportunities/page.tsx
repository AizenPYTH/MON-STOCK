import type { Metadata } from "next";
import Link from "next/link";
import { BellRing, ExternalLink, Radar, TrendingDown, TrendingUp, TriangleAlert } from "lucide-react";
import { requireOrgContext } from "@/features/auth/dal";
import { EmptyState, Section, Callout } from "@/components/ui/page";
import { Paper, Scene, SceneHeader } from "@/components/instrument";
import { SceneStatGrid } from "@/features/analytics/components/scene-stats";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { ButtonLink } from "@/components/ui/button";
import { findOpportunities, OPPORTUNITY_OFFERS_MAX, type OpportunityView } from "@/features/analytics/opportunities";
import { SOURCE_TYPE_LABEL, SOURCING_EVENT_LABEL, TAX_LABEL } from "@/features/analytics/labels";
import { UNKNOWN_COST_LABEL } from "@/domain/pricing/margin";
import { formatDays, formatMoney, formatNumber, formatPercent, formatRelative, NOT_PROVIDED } from "@/lib/format";
import { cn, safeExternalUrl } from "@/lib/utils";

export const metadata: Metadata = { title: "Opportunités" };

function Row({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-start gap-3 py-2">
      <dt className="pt-px text-[13px] font-medium text-muted">{label}</dt>
      <dd className="min-w-0 text-right">
        <div className="text-sm font-semibold text-foreground tnum">{value}</div>
        {hint ? <div className="mt-0.5 text-xs leading-4 text-ink-3">{hint}</div> : null}
      </dd>
    </div>
  );
}

function OpportunityStatus({ status }: { status: OpportunityView["evaluation"]["status"] }) {
  if (status === "potential")
    return (
      <StatusBadge tone="success" size="md" icon={<TrendingUp strokeWidth={2.25} />}>
        Opportunité potentielle
      </StatusBadge>
    );
  if (status === "unprofitable")
    return (
      <StatusBadge tone="neutral" size="md" icon={<TrendingDown strokeWidth={2.25} />}>
        Non rentable (estimation)
      </StatusBadge>
    );
  return (
    <StatusBadge tone="warning" size="md">
      Données insuffisantes
    </StatusBadge>
  );
}

function OpportunityCard({ o, truncated }: { o: OpportunityView; truncated: boolean }) {
  const ev = o.evaluation;
  const m = ev.margin;
  const offerCurrency = o.offer.normalizedCurrency ?? o.offer.originalCurrency;
  const feesKnown = m ? [m.marketplaceFee, m.paymentFee, m.shippingCost].filter((f): f is number => f !== null) : [];
  const feesTotal = feesKnown.length > 0 ? feesKnown.reduce((s, f) => s + f, 0) : null;
  const feesMissing = m ? m.unknownCosts.filter((u) => u !== "cost_price" && u !== "sale_price") : [];
  const profit = m === null ? null : m.netProfit;
  const link = safeExternalUrl(o.offer.sourceUrl);
  return (
    <Card className={cn("flex flex-col", ev.status === "potential" && "border-success-line")}>
      <div className="flex flex-col gap-2 border-b border-line-soft px-5 pb-4 pt-4">
        <div>
          <OpportunityStatus status={ev.status} />
        </div>
        <h3 className="text-h3 text-foreground">
          <Link href={`/stock/${encodeURIComponent(o.code)}`} className="rounded hover:underline hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            {o.name}
          </Link>
        </h3>
        <p className="text-xs text-muted tnum">
          <code className="ms-code text-[11.5px] text-muted-strong">{o.code}</code> · stock {formatNumber(o.stockAvailable)} · {truncated ? "au moins " : ""}
          {o.offersCount} offre{o.offersCount > 1 ? "s" : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 bg-surface-2 px-5 py-4">
        <div className="min-w-0">
          <div className="ms-mono text-[10.5px] text-ink-3">Marge estimée / unité</div>
          {profit === null || m === null ? (
            <div className="mt-1 text-[15px] font-semibold text-muted">Non calculable</div>
          ) : (
            <div className={cn("mt-1 flex items-baseline gap-1.5 text-[26px] font-semibold leading-8 tracking-[-0.5px] tnum", profit < 0 ? "text-danger" : "text-success")}>
              <span className="text-[20px] font-medium opacity-55">≈</span>
              {formatMoney(profit, o.currency)}
              <span className="text-sm font-semibold text-muted">{formatPercent(m.netMarginPercent, 0)}</span>
            </div>
          )}
        </div>
        {m && m.grossMargin !== null ? <p className="text-xs text-muted tnum">marge brute {formatMoney(m.grossMargin, o.currency)}</p> : null}
      </div>

      <CardContent className="flex flex-1 flex-col">
        <dl className="divide-y divide-line-soft">
          <Row
            label="Prix fournisseur"
            value={
              <span>
                {formatMoney(o.offer.normalizedPrice, offerCurrency)} <span className="text-xs font-medium text-ink-3">{TAX_LABEL[o.offer.taxType]}</span>
              </span>
            }
            hint={
              <span>
                {o.offer.supplierName}
                {o.offer.supplierCountry ? ` (${o.offer.supplierCountry})` : ""} · {SOURCE_TYPE_LABEL[o.offer.sourceType] ?? o.offer.sourceType} · prix vu {formatRelative(o.offer.lastPriceAt)}
                {o.offer.stale ? <span className="ml-1 font-semibold text-warning">(non revu depuis plus de 7 j)</span> : null}
                {o.offer.normalizedCurrency && o.offer.normalizedCurrency !== o.offer.originalCurrency ? ` · ${formatMoney(o.offer.originalPrice, o.offer.originalCurrency)} d'origine` : ""}
              </span>
            }
          />
          <Row label="Coût rendu / unité" value={o.landedUnitCost === null ? <span className="text-xs font-medium text-muted">Transport non communiqué</span> : formatMoney(o.landedUnitCost, offerCurrency)} hint={o.offer.moq ? `transport réparti sur le MOQ de ${o.offer.moq}` : undefined} />
          <Row label="Prix de vente moyen" value={o.salePrice === null ? <span className="text-xs font-medium text-muted">Pas assez de données</span> : formatMoney(o.salePrice, o.currency)} hint={o.salePriceBasis === "avg_30d" ? "moyenne des ventes sur 30 j" : o.salePriceBasis === "sku_price" ? "prix de la fiche SKU (aucune vente 30 j)" : "aucune vente et aucun prix renseigné"} />
          <Row
            label="Frais estimés / unité"
            value={
              m === null ? (
                <span className="text-xs font-medium text-muted">—</span>
              ) : feesTotal === null ? (
                <span className="text-xs font-medium text-muted">Inconnus</span>
              ) : (
                <>
                  <span className="font-medium opacity-60">≈</span> {formatMoney(feesTotal, o.currency)}
                </>
              )
            }
            hint={feesMissing.length > 0 ? `non déduits : ${feesMissing.map((u) => UNKNOWN_COST_LABEL[u]).join(", ")}` : m ? "commission, paiement, transport" : undefined}
          />
          <Row label="Vitesse de vente" value={o.velocity.dailyVelocity === null ? <span className="text-xs font-medium text-muted">Pas assez de données</span> : `${formatNumber(o.velocity.dailyVelocity, 1)} / jour`} hint={o.velocity.dailyVelocity !== null ? o.velocity.explanation : undefined} />
          <Row
            label="Stock fournisseur"
            value={o.offer.availableQuantity === null ? <span className="text-xs font-medium text-muted">Stock non communiqué</span> : `${formatNumber(o.offer.availableQuantity)} u.`}
            hint={`${o.offer.moq ? `MOQ ${o.offer.moq} · ` : ""}délai ${o.offer.deliveryMaxDays !== null ? formatDays(o.offer.deliveryMaxDays) : o.offer.deliveryMinDays !== null ? formatDays(o.offer.deliveryMinDays) : NOT_PROVIDED}${o.offer.lastStockAt ? ` · stock vu ${formatRelative(o.offer.lastStockAt)}` : ""}`}
          />
        </dl>
        {ev.missing.length > 0 ? (
          <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-warning-soft px-3 py-2 text-xs font-semibold text-warning-ink">
            <TriangleAlert aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>Données insuffisantes : {ev.missing.join(" ; ")}.</span>
          </p>
        ) : null}
        {ev.notes.map((n) => (
          <p key={n} className="mt-2 text-xs text-muted">
            {n}
          </p>
        ))}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
          <ButtonLink href={`/sourcing/offers/${o.offer.id}`} variant="secondary" size="sm">
            Voir l&apos;offre
          </ButtonLink>
          <ButtonLink href={`/stock/${encodeURIComponent(o.code)}`} variant="ghost" size="sm">
            Fiche SKU
          </ButtonLink>
          {link ? (
            <a href={link} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex min-h-8 items-center gap-1 rounded px-1 text-xs font-semibold text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-10">
              Source <ExternalLink aria-hidden="true" className="h-3 w-3" />
              <span className="sr-only">(nouvel onglet)</span>
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
      <Scene>
        <SceneHeader
          eyebrow="Achats · opportunités"
          title="Opportunités"
          description="Produits pour lesquels une offre fournisseur associée permet, d'après vos prix de vente réels, une marge estimée positive. Rien n'est annoncé quand une donnée essentielle manque."
          actions={
            <ButtonLink href="/sourcing" variant="night">
              Sourcing
            </ButtonLink>
          }
        />
        {data.items.length > 0 ? (
          <SceneStatGrid
            stats={[
              { label: "Opportunités potentielles", value: formatNumber(data.potentialCount), tone: data.potentialCount > 0 ? "mint" : undefined, hint: "Prix de vente et prix fournisseur connus, marge estimée positive" },
              { label: "Non rentables (estimation)", value: formatNumber(data.unprofitableCount), hint: "Marge estimée nulle ou négative" },
              { label: "Données insuffisantes", value: formatNumber(data.insufficientCount), tone: data.insufficientCount > 0 ? "warning" : undefined, hint: "Prix de vente ou prix fournisseur manquant" },
            ]}
          />
        ) : null}
      </Scene>
      <Paper>

      {data.offersTruncated ? (
        <Callout tone="warning" className="mb-4" title="Analyse partielle">
          Analyse partielle : seules les {formatNumber(OPPORTUNITY_OFFERS_MAX)} offres associées les moins chères ont été lues. Les nombres d&apos;offres par produit sont des minimums et certains produits peuvent manquer.
        </Callout>
      ) : null}

      {data.missingFees.length > 0 && data.items.length > 0 ? (
        <Callout tone="info" className="mb-4" title="Estimation partielle" action={<ButtonLink href="/settings/organization" variant="secondary" size="sm">Renseigner les frais</ButtonLink>}>
          Estimation partielle : {data.missingFees.map((u) => UNKNOWN_COST_LABEL[u]).join(", ")} non déduit(s). Renseignez les frais de votre canal principal pour affiner les marges.
        </Callout>
      ) : null}

      {data.items.length === 0 ? (
        <EmptyState
          icon={<Radar aria-hidden="true" />}
          title="Aucune opportunité détectée pour le moment."
          description="Les opportunités apparaissent quand (1) une offre fournisseur est associée à l'un de vos SKU dans le sourcing, (2) le SKU a un prix de vente connu (ventes des 30 derniers jours ou prix renseigné) et (3) le prix fournisseur est normalisé dans votre devise."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink href="/sourcing/matches">Associer des offres à mes SKU</ButtonLink>
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
          <div className="grid items-stretch gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {data.items.map((o) => (
              <OpportunityCard key={o.skuId} o={o} truncated={data.offersTruncated} />
            ))}
          </div>
        </>
      )}

      <Section className="mt-8" title="Alertes de sourcing (7 derniers jours)" description="Événements déclenchés par vos alertes de sourcing : baisse de prix, prix sous le seuil, nouveau stock…">
        {data.events.length === 0 ? (
          <EmptyState
            size="sm"
            icon={<BellRing aria-hidden="true" />}
            title="Aucun événement sur les 7 derniers jours."
            description="Créez une alerte de sourcing pour être prévenu d'une baisse de prix ou d'un retour en stock."
            action={
              <ButtonLink href="/sourcing/alerts" variant="secondary" size="sm">
                Créez une alerte de sourcing
              </ButtonLink>
            }
          />
        ) : (
          <Card>
            <ul className="divide-y divide-line-soft text-sm">
              {data.events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="info">{SOURCING_EVENT_LABEL[e.kind] ?? e.kind}</Badge>
                      <span className="font-semibold text-foreground">{e.offerTitle ?? "Offre"}</span>
                      {e.supplierName ? <span className="text-xs text-muted">{e.supplierName}</span> : null}
                    </div>
                    <p className="mt-1 text-xs text-muted">
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
      </Paper>
    </>
  );
}
