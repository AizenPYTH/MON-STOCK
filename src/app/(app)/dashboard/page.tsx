import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Sparkles } from "lucide-react";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { PageHeader, EmptyState, Stat, Callout } from "@/components/ui/page";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge, StatusDot } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { getDashboardData } from "@/features/analytics/dashboard";
import { RevenueChart } from "@/features/analytics/components/revenue-chart";
import { Sparkline } from "@/features/analytics/components/sparkline";
import { StockLevelBadge } from "@/features/stock/components/stock-level-badge";
import { ORDER_STATUS_LABEL, ORDER_STATUS_VARIANT, PROVIDER_LABEL } from "@/features/analytics/labels";
import type { ChannelState } from "@/features/analytics/channels.pure";
import { formatDate, formatDateTime, formatMoney, formatNumber, formatPercent, formatRelative } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

const CHANNEL_TONE: Record<ChannelState, "success" | "warning" | "danger" | "neutral" | "info"> = {
  connected: "success",
  expired: "warning",
  error: "danger",
  not_connected: "neutral",
  coming_soon: "neutral",
  manual: "info",
};

export default async function DashboardPage() {
  const ctx = await requireOrgContext();
  const data = await getDashboardData(ctx);
  const currency = ctx.organization.default_currency;
  const writable = canWrite(ctx.role);
  const greeting = data.firstName ? `Bonjour ${data.firstName}, voici ce qui se passe aujourd'hui.` : "Bonjour, voici ce qui se passe aujourd'hui.";
  const noOrders = data.counts.ordersTotal === 0;
  const foreign = data.windows.otherCurrencies.map((f) => formatMoney(f.revenue, f.currency)).join(" + ");
  const profitHint = data.profit.profit30d === null ? "Aucun SKU avec coût et prix connus : bénéfice non calculable." : data.profit.caveat ? `Sur ${data.profit.included} SKU · ${data.profit.caveat}` : `Sur ${data.profit.included} SKU, tous frais connus.`;

  return (
    <>
      <PageHeader title={greeting} description={`${ctx.organization.name} · ${formatDate(data.now, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`} />

      {data.isEmpty ? (
        <EmptyState
          className="mb-6"
          title="Votre organisation n'a encore aucune donnée."
          description="Créez un premier produit, connectez eBay pour importer annonces et ventes, ou ajoutez un fournisseur pour commencer le sourcing. Rien n'est simulé : ce tableau de bord se remplira avec vos vraies données."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {writable ? <ButtonLink href="/stock/new">Créer un produit</ButtonLink> : null}
              <ButtonLink href="/settings/integrations" variant="secondary">
                Connecter eBay
              </ButtonLink>
              <ButtonLink href="/suppliers" variant="secondary">
                Ajouter un fournisseur
              </ButtonLink>
            </div>
          }
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Chiffre d'affaires (30 j)"
          value={
            noOrders ? (
              <span className="text-base font-medium text-muted">Pas encore de vente</span>
            ) : (
              <span className="flex items-center justify-between gap-3">
                {formatMoney(data.windows.last30d.revenue, currency)}
                <span className="text-muted">
                  <Sparkline values={data.daily.map((p) => p.revenue)} label="Tendance du chiffre d'affaires sur 30 jours" />
                </span>
              </span>
            )
          }
          hint={
            noOrders
              ? "Aucune commande importée ou saisie."
              : `Aujourd'hui ${formatMoney(data.windows.today.revenue, currency)} · 7 j ${formatMoney(data.windows.last7d.revenue, currency)}${foreign ? ` · hors ventes en autre devise (${foreign}, non converties)` : ""}`
          }
        />
        <Stat
          label="Commandes (30 j)"
          value={noOrders ? <span className="text-base font-medium text-muted">Pas encore de vente</span> : formatNumber(data.windows.last30d.orders)}
          hint={noOrders ? undefined : `${formatNumber(data.windows.last30d.units)} produit(s) vendu(s) · hors commandes annulées / remboursées`}
        />
        <Stat
          label="Bénéfice estimé (30 j)"
          value={data.profit.profit30d === null ? <span className="text-base font-medium text-muted">Pas assez de données</span> : formatMoney(data.profit.profit30d, currency)}
          hint={profitHint}
          tone={data.profit.profit30d !== null && data.profit.profit30d < 0 ? "danger" : undefined}
        />
        <Stat
          label="Valeur de stock"
          value={data.stock.totals.skusValued === 0 ? <span className="text-base font-medium text-muted">{data.stock.totals.skus === 0 ? "Aucun SKU" : "Coût inconnu"}</span> : formatMoney(data.stock.totals.stockValueKnown, currency)}
          hint={`${formatNumber(data.stock.totals.skus)} SKU · ${formatNumber(data.stock.totals.unitsOnHand)} unités${data.stock.totals.skusUnknownCostWithStock > 0 ? ` · ${data.stock.totals.skusUnknownCostWithStock} SKU non valorisé(s) (coût inconnu)` : ""}${data.stock.totals.skusOtherCurrency > 0 ? ` · ${data.stock.totals.skusOtherCurrency} SKU dans une autre devise, non additionné(s)` : ""}${data.stock.truncated ? " · liste tronquée" : ""}`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" /> À traiter aujourd'hui
                </span>
              }
              description={data.todo.length === 0 ? "Rien d'urgent : aucune anomalie détectée dans vos données." : `${data.todo.length} point(s) demandent votre attention.`}
            />
            {data.todo.length > 0 ? (
              <ul className="divide-y divide-border">
                {data.todo.map((t) => (
                  <li key={t.key}>
                    <Link href={t.href as never} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-surface-muted/50">
                      <span className="flex items-center gap-2.5">
                        <StatusDot tone={t.tone === "danger" ? "danger" : t.tone === "warning" ? "warning" : "info"} />
                        {t.label}
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          <Card>
            <CardHeader
              title="Chiffre d'affaires quotidien"
              description={`30 derniers jours (jours civils, heure de Paris), commandes annulées et remboursées exclues${foreign ? ` · ventes en autre devise non incluses (${foreign})` : ""}.`}
            />
            <CardContent>
              <RevenueChart points={data.daily} currency={currency} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Dernières ventes" actions={<ButtonLink href="/sales" variant="ghost" size="sm">Toutes les ventes</ButtonLink>} />
            <CardContent className="p-0">
              {data.recentOrders.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted">
                  Aucune commande importée.{" "}
                  <Link href="/settings/integrations" className="underline">
                    Connectez eBay
                  </Link>{" "}
                  pour importer vos ventes.
                </p>
              ) : (
                <Table className="min-w-[640px]">
                  <THead>
                    <tr>
                      <TH>Date</TH>
                      <TH>Canal</TH>
                      <TH>Commande</TH>
                      <TH align="right">Articles</TH>
                      <TH align="right">Total</TH>
                      <TH>Statut</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {data.recentOrders.map(({ order, channel, itemsCount, pendingInventoryItems, unmappedItems }) => (
                      <TR key={order.id}>
                        <TD className="text-muted">{formatDateTime(order.placed_at)}</TD>
                        <TD>{channel?.name ?? PROVIDER_LABEL[order.provider] ?? order.provider}</TD>
                        <TD>
                          <Link href={`/sales/${order.id}` as never} className="font-mono text-xs hover:underline">
                            {order.order_number ?? order.external_order_id}
                          </Link>
                          {pendingInventoryItems > 0 ? <Badge variant="warning" className="ml-2">Stock non déduit</Badge> : null}
                          {unmappedItems > 0 ? <Badge variant="outline" className="ml-2">Non associée</Badge> : null}
                        </TD>
                        <TD align="right">{itemsCount}</TD>
                        <TD align="right">{formatMoney(order.total, order.currency)}</TD>
                        <TD>
                          <Badge variant={ORDER_STATUS_VARIANT[order.status] ?? "neutral"}>{ORDER_STATUS_LABEL[order.status] ?? order.status}</Badge>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Intelligence : produits à commander" description={data.toReplenish > 0 ? `${data.toReplenish} produit(s) à réapprovisionner.` : "Aucune commande nécessaire d'après vos ventes."} actions={<ButtonLink href="/insights" variant="ghost" size="sm">Insights</ButtonLink>} />
            <CardContent className="p-0">
              {data.recommendations.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted">{data.stock.totals.skus === 0 ? "Ajoutez des produits pour obtenir des recommandations." : "Rien à commander : votre stock couvre vos ventes, ou les données de vente sont encore insuffisantes."}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.recommendations.map((r) => (
                    <li key={r.skuId} className="px-5 py-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <Link href={`/stock/${encodeURIComponent(r.code)}` as never} className="min-w-0 font-medium hover:underline">
                          <span className="block truncate">{r.label}</span>
                        </Link>
                        <span className="shrink-0 text-base font-semibold tnum">{r.result.recommendedQuantity} u.</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                        <StockLevelBadge level={r.level} title={r.levelReason} />
                        <span>stock {r.currentStock}</span>
                        {r.supplier ? <span>· {r.supplier.name}</span> : null}
                      </div>
                      <p className="mt-1 text-xs text-muted">{r.result.explanation}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent" /> Opportunités
                </span>
              }
              actions={<ButtonLink href="/opportunities" variant="ghost" size="sm">Toutes</ButtonLink>}
            />
            <CardContent className="p-0">
              {data.opportunities.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted">Aucune offre fournisseur associée à vos SKU. Associez des offres dans le sourcing pour détecter des opportunités.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.opportunities.map((o) => (
                    <li key={o.skuId} className="px-5 py-3 text-sm">
                      <Link href={`/stock/${encodeURIComponent(o.code)}` as never} className="block truncate font-medium hover:underline">
                        {o.name}
                      </Link>
                      <div className="mt-1 text-xs text-muted">
                        {o.offer.supplierName} · {formatMoney(o.offer.normalizedPrice, o.offer.normalizedCurrency ?? o.currency)} {o.offer.taxType === "ht" ? "HT" : o.offer.taxType === "ttc" ? "TTC" : ""}
                      </div>
                      {o.evaluation.status === "potential" && o.evaluation.margin ? (
                        <div className="mt-1 text-xs">
                          <Badge variant="success">🟢 Opportunité potentielle</Badge>{" "}
                          <span className="text-muted">
                            marge estimée {formatMoney(o.evaluation.margin.netProfit, o.currency)} ({formatPercent(o.evaluation.margin.netMarginPercent, 0)})
                          </span>
                        </div>
                      ) : o.evaluation.status === "unprofitable" && o.evaluation.margin ? (
                        <div className="mt-1 text-xs text-muted">Non rentable estimée : {formatMoney(o.evaluation.margin.netProfit, o.currency)} / unité</div>
                      ) : (
                        <div className="mt-1 text-xs text-muted">Données insuffisantes : {o.evaluation.missing.join(" ; ")}</div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Canaux" actions={<ButtonLink href="/settings/integrations" variant="ghost" size="sm">Gérer</ButtonLink>} />
            <ul className="divide-y divide-border">
              {data.channels.map((c) => (
                <li key={c.key} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{c.name}</div>
                    <div className="truncate text-xs text-muted">
                      {c.detail ?? (c.lastSuccessfulSyncAt ? `Dernière synchronisation ${formatRelative(c.lastSuccessfulSyncAt)}` : c.state === "manual" ? "Commandes saisies à la main" : "")}
                    </div>
                  </div>
                  <Link href={c.href as never} className="shrink-0">
                    <Badge variant={c.state === "coming_soon" ? "outline" : CHANNEL_TONE[c.state]}>
                      <StatusDot tone={CHANNEL_TONE[c.state]} />
                      {c.label}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          {!data.hasConnectedChannel && !data.isEmpty ? (
            <Callout tone="info" title="Aucun canal connecté">
              Vos ventes sont saisies manuellement. Connectez eBay pour importer automatiquement vos commandes.
            </Callout>
          ) : null}
        </div>
      </div>
    </>
  );
}
