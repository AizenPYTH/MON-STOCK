import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { PageHeader, EmptyState, Section, Callout } from "@/components/ui/page";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { LinkTabs } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { getStockAnalytics } from "@/features/analytics/stock-analytics";
import { computeRecommendations } from "@/features/analytics/replenishment";
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
  const [analytics, drafts, eventAlerts] = await Promise.all([getStockAnalytics(ctx), computeRecommendations(ctx), listEventAlerts(ctx)]);
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
      <PageHeader
        title="Alertes"
        description="Niveaux de stock calculés à la volée à partir de vos ventes réelles (jamais périmés), et alertes d'exploitation (synchronisation, connexions, incohérences)."
      />

      {analytics.truncated ? <Callout tone="warning" className="mb-4">Plus de 5 000 SKU actifs : seuls les 5 000 premiers sont analysés ici. Les compteurs sont des minima.</Callout> : null}

      <LinkTabs
        current={current}
        items={[
          { href: "/stock/alerts", label: "À traiter", count: todo.length },
          { href: "/stock/alerts?level=out_of_stock", label: "🔴 Rupture", count: analytics.counts.out_of_stock },
          { href: "/stock/alerts?level=at_risk", label: "🟠 Risque de rupture", count: analytics.counts.at_risk },
          { href: "/stock/alerts?level=low", label: "🟡 Stock faible", count: analytics.counts.low },
          { href: "/stock/alerts?level=normal", label: "🟢 Stock normal", count: analytics.counts.normal },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState
          title={analytics.totals.skus === 0 ? "Aucun SKU actif." : params.level === "todo" ? "Aucun produit à traiter : tous vos SKU sont à un niveau normal." : "Aucun SKU dans cette catégorie."}
          description={analytics.totals.skus === 0 ? "Créez des produits ou importez vos annonces pour suivre les niveaux de stock." : undefined}
          action={analytics.totals.skus === 0 && writable ? <ButtonLink href="/stock/new">Créer un produit</ButtonLink> : undefined}
        />
      ) : (
        <div className="space-y-3">
          <Table className="min-w-[1180px]">
            <THead>
              <tr>
                <TH>Produit</TH>
                <TH align="right">Stock actuel</TH>
                <TH align="right">Ventes 7 j</TH>
                <TH align="right">Vitesse moyenne</TH>
                <TH align="right">Jours de stock</TH>
                <TH align="right">Seuil</TH>
                <TH>Statut</TH>
                <TH align="right">Qté recommandée</TH>
                <TH>Actions</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((v) => {
                const r = v.row;
                const code = r.code ?? "";
                const rec = r.sku_id ? recBySku.get(r.sku_id) : undefined;
                const qty = rec?.result.recommendedQuantity ?? null;
                return (
                  <TR key={r.sku_id} className="align-top">
                    <TD>
                      <Link href={`/stock/${encodeURIComponent(code)}` as never} className="block max-w-[300px]">
                        <div className="truncate font-medium text-foreground">{r.product_name}</div>
                        <div className="truncate text-xs text-muted">
                          <code className="font-mono">{code}</code>
                          {r.variant_name && r.variant_name !== "Standard" ? ` · ${r.variant_name}` : ""}
                        </div>
                      </Link>
                    </TD>
                    <TD align="right" className={(r.quantity_available ?? 0) < 0 ? "font-medium text-danger" : "font-medium"}>
                      {formatNumber(r.quantity_available)}
                      {(r.quantity_reserved ?? 0) > 0 ? <div className="text-xs text-muted">{r.quantity_reserved} réservé(s)</div> : null}
                    </TD>
                    <TD align="right">
                      {formatNumber(r.units_7d)} <TrendIcon trend={v.velocity.trend} percent={v.velocity.trendPercent} />
                    </TD>
                    <TD align="right" title={v.velocity.explanation}>
                      {v.velocity.dailyVelocity === null ? <span className="text-xs text-muted">Pas assez de données</span> : `${formatNumber(v.velocity.dailyVelocity, 1)} / j`}
                    </TD>
                    <TD align="right">{v.daysOfCover === null ? <span className="text-xs text-muted">—</span> : formatDays(v.daysOfCover)}</TD>
                    <TD align="right">
                      {formatNumber(r.reorder_point)}
                      {(r.safety_stock ?? 0) > 0 ? <div className="text-xs text-muted">sécurité {r.safety_stock}</div> : null}
                    </TD>
                    <TD>
                      <StockLevelBadge level={v.classification.level} />
                      <div className="mt-1 max-w-[260px] text-xs text-muted">{v.classification.reason}</div>
                    </TD>
                    <TD align="right">
                      {qty === null ? <span className="text-xs text-muted">{rec ? "Pas assez de données" : "—"}</span> : qty === 0 ? <span className="text-xs text-muted">Rien à commander</span> : <span className="font-semibold">{formatNumber(qty)}</span>}
                      {rec?.result.usedDefaultLeadTime && qty ? <div className="text-xs text-amber-700">délai par défaut</div> : null}
                    </TD>
                    <TD>
                      <div className="flex flex-col items-start gap-1">
                        <ButtonLink href={`/stock/${encodeURIComponent(code)}`} variant="secondary" size="sm">
                          Fiche SKU
                        </ButtonLink>
                        <ButtonLink href={`/sourcing?sku=${encodeURIComponent(code)}`} variant="ghost" size="sm">
                          <Search className="h-3.5 w-3.5" /> Trouver du stock
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
          <Card>
            <CardContent className="text-sm text-muted">Aucune alerte d'exploitation ouverte.</CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader title={`${eventAlerts.length} alerte(s)`} />
            <ul className="divide-y divide-border">
              {eventAlerts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={ALERT_SEVERITY_VARIANT[a.severity] ?? "neutral"}>{ALERT_SEVERITY_LABEL[a.severity] ?? a.severity}</Badge>
                      <span className="font-medium">{a.title}</span>
                      <span className="text-xs text-muted">{ALERT_TYPE_LABEL[a.type] ?? a.type}</span>
                      {a.status === "acknowledged" ? <Badge variant="outline">Prise en compte</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-muted">{a.message}</p>
                    <p className="mt-0.5 text-xs text-muted">{formatRelative(a.created_at)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
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
    </>
  );
}
