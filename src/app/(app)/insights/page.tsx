import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Lightbulb, OctagonAlert, RefreshCw, TriangleAlert } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { Section, Callout, EmptyState } from "@/components/ui/page";
import { Paper, Scene, SceneHeader, ToneIcon } from "@/components/instrument";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getStockAnalytics } from "@/features/analytics/stock-analytics";
import { getOperationalCounts } from "@/features/analytics/dashboard";
import { getRecommendationHistory, listOpenRecommendations } from "@/features/analytics/replenishment";
import { buildInsights, type InsightSku } from "@/features/analytics/priorities.pure";
import { channelMarginContext, missingChannelFees } from "@/features/analytics/margins.pure";
import { ActionForm } from "@/features/analytics/components/action-form";
import { RecommendationsTable } from "@/features/analytics/components/recommendations-table";
import { refreshRecommendationsAction } from "@/features/analytics/actions";
import { skuLabel, type StockRowView } from "@/features/stock/model";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { internalRoute } from "@/lib/routes";

export const metadata: Metadata = { title: "Insights" };

const SEVERITY_TONE = { critical: "danger", warning: "warning", info: "info" } as const;
const SEVERITY_LABEL = { critical: "Urgent", warning: "À surveiller", info: "Conseil" } as const;

function toInsightSku(v: StockRowView): InsightSku {
  return { code: v.row.code ?? "", name: skuLabel(v.row), dailyVelocity: v.velocity.dailyVelocity, daysOfCover: v.daysOfCover };
}

export default async function InsightsPage() {
  const ctx = await requireOrgContext();
  const writable = canWrite(ctx.role);
  const [analytics, counts, recommendations, history, channelsRes] = await Promise.all([
    getStockAnalytics(ctx),
    getOperationalCounts(ctx),
    listOpenRecommendations(ctx),
    getRecommendationHistory(ctx),
    ctx.supabase.from("sales_channels").select("provider, name, fee_percent, payment_fee_percent, payment_fee_fixed, default_shipping_cost").eq("organization_id", ctx.organization.id).eq("is_active", true),
  ]);

  const insights = buildInsights({
    outOfStock: analytics.byLevel.out_of_stock.map(toInsightSku),
    atRisk: analytics.byLevel.at_risk.map(toInsightSku),
    lowCount: analytics.counts.low,
    syncFailed24h: counts.syncFailed24h,
    openAlerts: counts.openAlerts,
    unmappedListings: counts.unmappedListings,
    pendingSales: counts.pendingSales,
    negativeStock: analytics.negativeStock.length,
    unknownCostWithSales: analytics.all.filter((v) => v.row.cost_price === null && (v.row.units_30d ?? 0) > 0).length,
    deadStock: analytics.deadStock.length,
    channelsMissingFees: (channelsRes.data ?? []).filter((c) => c.provider !== "manual" && missingChannelFees(channelMarginContext(c, ctx.organization.settings)).length > 0).map((c) => c.name),
  });

  const needed = recommendations.filter((r) => (r.recommendedQuantity ?? 0) > 0).length;

  return (
    <>
      <Scene>
        <SceneHeader eyebrow="Pilotage · priorités" title="Que dois-je faire maintenant ?" description="Priorités calculées à partir de vos ventes, de votre stock et de vos synchronisations. Chaque ligne mène à une action concrète." />
      </Scene>
      <Paper>

      <Section title="Priorités" description={insights.length === 0 ? undefined : `${insights.length} point(s), du plus urgent au moins urgent.`}>
        {insights.length === 0 ? (
          <EmptyState
            title={analytics.totals.skus === 0 ? "Pas encore de données à analyser." : "Rien d'urgent."}
            description={analytics.totals.skus === 0 ? "Créez des produits, connectez eBay ou ajoutez un fournisseur : les priorités apparaîtront avec vos vraies données." : "Aucune rupture, aucune anomalie de synchronisation et aucune annonce non associée."}
          />
        ) : (
          <Card>
            <ul className="divide-y divide-line-soft">
              {insights.map((it) => (
                <li key={it.key}>
                  <Link href={internalRoute(it.href)} className="group flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors duration-150 ease-standard hover:bg-surface-2 sm:px-5">
                    <ToneIcon tone={SEVERITY_TONE[it.severity]}>{it.severity === "critical" ? <OctagonAlert /> : it.severity === "warning" ? <TriangleAlert /> : <Lightbulb />}</ToneIcon>
                    <span className="min-w-0 flex-1 basis-64">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[14.5px] font-semibold text-foreground">{it.title}</span>
                        <StatusBadge tone={SEVERITY_TONE[it.severity]} icon={false}>
                          {SEVERITY_LABEL[it.severity]}
                        </StatusBadge>
                      </span>
                      {it.detail ? <span className="mt-0.5 block text-[12.5px] font-medium text-ink-3">{it.detail}</span> : null}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-bold text-foreground max-sm:pl-11">
                      {it.action} <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 transition-transform duration-150 ease-standard group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Section>

      <div id="recommandations" className="mt-8 scroll-mt-20">
        <Section
          title="Recommandations de réapprovisionnement"
          description={
            history.lastComputedAt
              ? `Dernier calcul ${formatRelative(history.lastComputedAt)} (${formatDateTime(history.lastComputedAt)}) · ${history.snapshotsIsMinimum ? "au moins " : ""}${history.snapshots} instantané(s) conservé(s), ${formatNumber(history.totalRows)} recommandation(s) au total.`
              : "Aucun calcul enregistré pour le moment."
          }
          actions={
            writable ? (
              <ActionForm action={refreshRecommendationsAction} variant="primary" size="md" pendingText="Calcul en cours…">
                <RefreshCw className="h-4 w-4" /> Actualiser les recommandations
              </ActionForm>
            ) : null
          }
        >
          {recommendations.length === 0 ? (
            <Card>
              <CardContent className="text-sm text-muted">
                {history.lastComputedAt
                  ? "Aucune recommandation ouverte : rien à commander au dernier calcul, ou toutes ont été ignorées. Actualisez pour recalculer."
                  : writable
                    ? "Cliquez sur « Actualiser les recommandations » pour calculer, pour chaque SKU en rupture, à risque ou sous son seuil, la quantité à commander (vitesse de vente × délai fournisseur + sécurité, arrondie au MOQ)."
                    : "Aucune recommandation calculée. Un membre avec droits d'écriture peut lancer le calcul."}
              </CardContent>
            </Card>
          ) : (
            <>
              <Callout tone={needed > 0 ? "warning" : "neutral"}>
                {needed > 0 ? `${needed} commande(s) recommandée(s)` : "Aucune quantité à commander"} sur {recommendations.length} produit(s) analysé(s). Les calculs sont expliqués ligne par ligne ; un délai inconnu est remplacé par 7 jours et signalé.
              </Callout>
              <RecommendationsTable recommendations={recommendations} writable={writable} />
            </>
          )}
        </Section>
      </div>

      {analytics.deadStock.length > 0 ? (
        <Section className="mt-8" title="Stock dormant" description={`${analytics.deadStock.length} SKU en stock sans vente depuis 60 jours (ou jamais vendus).`}>
          <Card>
            <CardHeader title="Les plus immobilisés" description="Classés par valeur de stock (coût connu) puis par quantité." />
            <ul className="divide-y divide-line-soft text-sm">
              {analytics.deadStock.slice(0, 10).map((v) => (
                <li key={v.row.sku_id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <Link href={`/stock/${encodeURIComponent(v.row.code ?? "")}`} className="min-w-0 truncate hover:underline">
                    {skuLabel(v.row)} <span className="ms-code text-xs text-muted">{v.row.code}</span>
                  </Link>
                  <span className="shrink-0 text-xs text-muted tnum">
                    {v.row.quantity_available} u. · {v.row.last_sale_at ? `dernière vente ${formatRelative(v.row.last_sale_at)}` : "jamais vendu"}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      ) : null}
      </Paper>
    </>
  );
}
