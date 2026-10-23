import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, Info, Search, TriangleAlert } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { EmptyState, Section, Callout } from "@/components/ui/page";
import { FilterChip, Paper, Scene, SceneHeader, StageStats, ToneIcon } from "@/components/instrument";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { getStockAnalytics } from "@/features/analytics/stock-analytics";
import { computeRecommendationsWithCoverage } from "@/features/analytics/replenishment";
import { listEventAlerts } from "@/features/analytics/alerts";
import { alertsParamsSchema, flattenSearchParams, parseParams } from "@/features/analytics/schemas";
import { ActionForm } from "@/features/analytics/components/action-form";
import { acknowledgeAlertAction, resolveAlertAction } from "@/features/analytics/actions";
import { StockLevelBadge, TrendIcon } from "@/features/stock/components/stock-level-badge";
import { ALERT_SEVERITY_LABEL, ALERT_SEVERITY_VARIANT, ALERT_TYPE_LABEL, alertActionLabel } from "@/features/analytics/labels";
import { formatDays, formatNumber, formatRelative } from "@/lib/format";

export const metadata: Metadata = { title: "Alertes" };

const PAGE_SIZE = 50;

export default async function StockAlertsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const params = parseParams(alertsParamsSchema, flattenSearchParams(await searchParams));
  const [analytics, recommendations, eventAlerts] = await Promise.all([getStockAnalytics(ctx), computeRecommendationsWithCoverage(ctx), listEventAlerts(ctx)]);
  const drafts = recommendations.drafts;
  const writable = canWrite(ctx.role);
  const recBySku = new Map(drafts.map((d) => [d.skuId, d] as const));

  const todo = [...analytics.byLevel.out_of_stock, ...analytics.byLevel.at_risk, ...analytics.byLevel.low];
  const list = params.level === "todo" ? todo : analytics.byLevel[params.level];
  const from = (params.page - 1) * PAGE_SIZE;
  const rows = list.slice(from, from + PAGE_SIZE);
  const current = params.level === "todo" ? "/stock/alerts" : `/stock/alerts?level=${params.level}`;
  const makeHref = (page: number) => `${current}${current.includes("?") ? "&" : "?"}page=${page}`;

  return (
    <>
      <Scene>
        <SceneHeader
          back={{ href: "/stock", label: "Stock" }}
          title="Alertes"
          description="Niveaux de stock calculés à la volée à partir de vos ventes réelles (jamais périmés), et alertes d'exploitation (synchronisation, connexions, incohérences)."
        />
        <StageStats
          className="mt-5 max-w-[760px] max-sm:grid-cols-2! max-sm:gap-y-3"
          stats={[
            { label: "À traiter", value: formatNumber(todo.length), href: "/stock/alerts" },
            { label: "Ruptures", value: formatNumber(analytics.counts.out_of_stock), tone: analytics.counts.out_of_stock > 0 ? "danger" : undefined, href: "/stock/alerts?level=out_of_stock" },
            { label: "Risque de rupture", value: formatNumber(analytics.counts.at_risk), tone: analytics.counts.at_risk > 0 ? "warning" : undefined, href: "/stock/alerts?level=at_risk" },
            { label: "Stock faible", value: formatNumber(analytics.counts.low), tone: analytics.counts.low > 0 ? "warning" : undefined, href: "/stock/alerts?level=low" },
          ]}
        />
      </Scene>
      <Paper>
      {analytics.truncated ? <Callout tone="warning" className="mb-4">Plus de 5 000 SKU actifs : seuls les 5 000 premiers sont analysés ici. Les compteurs sont des minima.</Callout> : null}
      {recommendations.truncated && !analytics.truncated ? (
        <Callout tone="warning" className="mb-4">Recommandations partielles : le volume d&apos;offres ou de commandes fournisseur dépasse la borne de lecture. Les quantités en commande et les meilleures offres peuvent être incomplètes.</Callout>
      ) : null}

      <nav aria-label="Niveau de stock" className="mb-4 flex flex-wrap gap-1.5">
        <FilterChip href="/stock/alerts" selected={params.level === "todo"} count={todo.length}>
          À traiter
        </FilterChip>
        <FilterChip href="/stock/alerts?level=out_of_stock" selected={params.level === "out_of_stock"} dot="var(--red)" count={analytics.counts.out_of_stock}>
          Rupture
        </FilterChip>
        <FilterChip href="/stock/alerts?level=at_risk" selected={params.level === "at_risk"} dot="var(--amber)" count={analytics.counts.at_risk}>
          Risque de rupture
        </FilterChip>
        <FilterChip href="/stock/alerts?level=low" selected={params.level === "low"} dot="var(--amber)" count={analytics.counts.low}>
          Stock faible
        </FilterChip>
        <FilterChip href="/stock/alerts?level=normal" selected={params.level === "normal"} dot="var(--success)" count={analytics.counts.normal}>
          Stock normal
        </FilterChip>
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          title={analytics.totals.skus === 0 ? "Aucun SKU actif." : params.level === "todo" ? "Aucun produit à traiter : tous vos SKU sont à un niveau normal." : "Aucun SKU dans cette catégorie."}
          description={analytics.totals.skus === 0 ? "Créez des produits ou importez vos annonces pour suivre les niveaux de stock." : undefined}
          action={analytics.totals.skus === 0 && writable ? <ButtonLink href="/stock/new">Créer un produit</ButtonLink> : undefined}
        />
      ) : (
        <div className="space-y-3">
          <Table className="min-w-[920px]" stackOnMobile caption="Références à surveiller, du plus urgent au moins urgent">
            <THead>
              <tr>
                <TH>Produit</TH>
                <TH align="right">Stock</TH>
                <TH align="right">Ventes 7 j</TH>
                <TH align="right">Vitesse</TH>
                <TH align="right">Couverture</TH>
                <TH align="right">Seuil</TH>
                <TH>Statut</TH>
                <TH align="right">À commander</TH>
                <TH>
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((v) => {
                const r = v.row;
                const code = r.code ?? "";
                const rec = r.sku_id ? recBySku.get(r.sku_id) : undefined;
                const qty = rec?.result.recommendedQuantity ?? null;
                const available = r.quantity_available ?? 0;
                return (
                  <TR key={r.sku_id} className="align-top">
                    <TD primary>
                      <Link href={`/stock/${encodeURIComponent(code)}` as never} className="block max-w-[280px] rounded hover:underline">
                        <span className="block truncate font-semibold text-foreground">{r.product_name}</span>
                        <span className="block truncate text-xs font-medium text-ink-3">
                          <code className="ms-code">{code}</code>
                          {r.variant_name && r.variant_name !== "Standard" ? ` · ${r.variant_name}` : ""}
                        </span>
                      </Link>
                    </TD>
                    <TD label="Stock" align="right" className={available < 0 || available === 0 ? "text-[15px] font-extrabold text-danger" : "text-[15px] font-extrabold"}>
                      <span className="inline-flex flex-col items-end">
                        {formatNumber(r.quantity_available)}
                        {(r.quantity_reserved ?? 0) > 0 ? <span className="text-xs font-medium text-muted">{r.quantity_reserved} réservé(s)</span> : null}
                      </span>
                    </TD>
                    <TD label="Ventes 7 j" align="right">
                      <span className="inline-flex items-center gap-1">
                        {formatNumber(r.units_7d)} <TrendIcon trend={v.velocity.trend} percent={v.velocity.trendPercent} />
                      </span>
                    </TD>
                    <TD label="Vitesse" align="right" title={v.velocity.explanation}>
                      {v.velocity.dailyVelocity === null ? <span className="text-xs text-muted">Pas assez de données</span> : `${formatNumber(v.velocity.dailyVelocity, 1)} / j`}
                    </TD>
                    <TD label="Couverture" align="right">{v.daysOfCover === null ? <span className="text-xs text-muted">—</span> : formatDays(v.daysOfCover)}</TD>
                    <TD label="Seuil" align="right">
                      <span className="inline-flex flex-col items-end">
                        {formatNumber(r.reorder_point)}
                        {(r.safety_stock ?? 0) > 0 ? <span className="text-xs font-medium text-muted">sécurité {r.safety_stock}</span> : null}
                      </span>
                    </TD>
                    <TD label="Statut" className="max-sm:flex-wrap">
                      <span className="flex flex-col items-end gap-1 sm:items-start">
                        <StockLevelBadge level={v.classification.level} />
                        <span className="line-clamp-3 max-w-[240px] text-xs text-muted" title={v.classification.reason}>
                          {v.classification.reason}
                        </span>
                      </span>
                    </TD>
                    <TD label="À commander" align="right">
                      <span className="inline-flex flex-col items-end">
                        {qty === null ? <span className="text-xs text-muted">{rec ? "Pas assez de données" : "—"}</span> : qty === 0 ? <span className="text-xs text-muted">Rien à commander</span> : <span className="text-[15px] font-extrabold">{formatNumber(qty)}</span>}
                        {rec?.result.usedDefaultLeadTime && qty ? <span className="text-xs font-semibold text-warning">délai par défaut</span> : null}
                      </span>
                    </TD>
                    <TD className="max-sm:justify-start!">
                      <div className="flex items-center gap-1.5 sm:justify-end">
                        <ButtonLink href={`/stock/${encodeURIComponent(code)}`} variant="secondary" size="sm">
                          Fiche
                        </ButtonLink>
                        <ButtonLink href={`/sourcing/catalog?sku=${encodeURIComponent(code)}`} variant="ghost" size="sm" iconOnly aria-label={`Trouver du stock pour ${code}`} title="Trouver du stock">
                          <Search aria-hidden="true" className="h-4 w-4" />
                        </ButtonLink>
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <Pagination page={params.page} pageSize={PAGE_SIZE} total={list.length} makeHref={makeHref} />
        </div>
      )}

      <div id="evenements" className="scroll-mt-20">
      <Section title="Alertes d'exploitation" description="Synchronisations échouées, connexions expirées, stocks négatifs… Chaque alerte reste visible jusqu'à ce que vous la marquiez comme traitée." className="mt-8">
        {eventAlerts.length === 0 ? (
          <EmptyState size="sm" icon={<CircleCheck />} title="Aucune alerte d'exploitation ouverte" description="Synchronisations, connexions et stocks sont en ordre." />
        ) : (
          <Card>
            <CardHeader title={`${eventAlerts.length} alerte${eventAlerts.length > 1 ? "s" : ""} ouverte${eventAlerts.length > 1 ? "s" : ""}`} description="Les plus récentes en premier." />
            <ul className="divide-y divide-line-soft">
              {eventAlerts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start gap-x-3 gap-y-2.5 px-5 py-3.5 text-sm">
                  <ToneIcon tone={a.severity === "critical" ? "danger" : a.severity === "warning" ? "warning" : "info"}>{a.severity === "info" ? <Info /> : <TriangleAlert />}</ToneIcon>
                  <div className="min-w-0 flex-1 basis-72">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-bold text-foreground">{a.title}</span>
                      <Badge variant={ALERT_SEVERITY_VARIANT[a.severity] ?? "neutral"}>{ALERT_SEVERITY_LABEL[a.severity] ?? a.severity}</Badge>
                      {a.status === "acknowledged" ? <StatusBadge tone="pending">Prise en compte</StatusBadge> : null}
                    </div>
                    <p className="mt-0.5 font-medium text-muted">{a.message}</p>
                    <p className="mt-1 text-xs font-semibold text-ink-3">
                      <span className="ms-code">{ALERT_TYPE_LABEL[a.type] ?? a.type}</span> · {formatRelative(a.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 max-sm:w-full max-sm:pl-11">
                    {a.action_href ? (
                      <ButtonLink href={a.action_href} size="sm">
                        {alertActionLabel(a.type)}
                      </ButtonLink>
                    ) : null}
                    {writable && a.status === "open" ? (
                      <ActionForm action={acknowledgeAlertAction} fields={{ id: a.id }} variant="ghost" size="sm" showSuccess={false}>
                        Prendre en compte
                      </ActionForm>
                    ) : null}
                    {writable ? (
                      <ActionForm action={resolveAlertAction} fields={{ id: a.id }} variant="secondary" size="sm" showSuccess={false}>
                        Marquer comme traité
                      </ActionForm>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Section>
      </div>
      </Paper>
    </>
  );
}
