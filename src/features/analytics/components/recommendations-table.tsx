import Link from "next/link";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { StockLevelBadge } from "@/features/stock/components/stock-level-badge";
import { ActionForm } from "@/features/analytics/components/action-form";
import { dismissRecommendationAction } from "@/features/analytics/actions";
import type { RecommendationView } from "@/features/analytics/replenishment";
import { formatDays, formatMoney, formatNumber } from "@/lib/format";

const LEAD_SOURCE_LABEL: Record<string, string> = { sku: "fiche SKU", offer: "offre fournisseur", supplier: "délai moyen fournisseur" };

export function RecommendationsTable({ recommendations, writable }: { recommendations: RecommendationView[]; writable: boolean }) {
  return (
    <Table className="min-w-[1100px]">
      <THead>
        <tr>
          <TH>Produit</TH>
          <TH align="right">Stock</TH>
          <TH align="right">Vitesse</TH>
          <TH align="right">Délai</TH>
          <TH align="right">MOQ</TH>
          <TH align="right">Sécurité</TH>
          <TH align="right">Qté recommandée</TH>
          <TH>Fournisseur</TH>
          <TH>Actions</TH>
        </tr>
      </THead>
      <TBody>
        {recommendations.map((r) => {
          const stockHref = `/stock/${encodeURIComponent(r.code)}`;
          const orderHref = r.supplier && r.recommendedQuantity ? `/suppliers/${r.supplier.id}?order_sku=${r.skuId}&qty=${r.recommendedQuantity}` : null;
          return (
            <TR key={r.id} className="align-top">
              <TD>
                <Link href={stockHref as never} className="font-medium text-foreground hover:underline">
                  {r.label}
                </Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <code className="font-mono">{r.code}</code>
                  {r.level ? <StockLevelBadge level={r.level} title={r.levelReason ?? undefined} /> : null}
                </div>
                <p className="mt-1.5 max-w-xl text-xs text-muted-strong">{r.explanation}</p>
                {r.warnings.map((w) => (
                  <p key={w} className="mt-0.5 max-w-xl text-xs text-amber-700">
                    {w}
                  </p>
                ))}
              </TD>
              <TD align="right">
                {formatNumber(r.currentStock)}
                {r.onOrder > 0 ? <div className="text-xs text-muted">+ {r.onOrder} en commande</div> : null}
              </TD>
              <TD align="right" title={r.velocityExplanation ?? undefined}>
                {r.dailyVelocity === null ? <span className="text-xs text-muted">Pas assez de données</span> : `${formatNumber(r.dailyVelocity, 1)} / j`}
                {r.daysOfCover !== null ? <div className="text-xs text-muted">{formatDays(r.daysOfCover)} de stock</div> : null}
              </TD>
              <TD align="right">
                {r.leadTimeDays === null ? <span className="text-xs text-muted">Inconnu{r.usedDefaultLeadTime ? " (7 j par défaut)" : ""}</span> : `${r.leadTimeDays} j`}
                {r.leadTimeSource ? <div className="text-xs text-muted">{LEAD_SOURCE_LABEL[r.leadTimeSource] ?? r.leadTimeSource}</div> : null}
              </TD>
              <TD align="right">{r.moq === null ? <span className="text-xs text-muted">—</span> : formatNumber(r.moq)}</TD>
              <TD align="right">{formatNumber(r.safetyStock)}</TD>
              <TD align="right">
                {r.recommendedQuantity === null ? (
                  <span className="text-xs text-muted">Pas assez de données</span>
                ) : (
                  <span className="text-base font-semibold">{formatNumber(r.recommendedQuantity)}</span>
                )}
                {r.unitPrice !== null && r.recommendedQuantity ? <div className="text-xs text-muted">≈ {formatMoney(r.unitPrice * r.recommendedQuantity, r.currency)}</div> : null}
              </TD>
              <TD>
                {r.supplier ? (
                  <Link href={`/suppliers/${r.supplier.id}` as never} className="hover:underline">
                    {r.supplier.name}
                  </Link>
                ) : (
                  <span className="text-xs text-muted">Aucun fournisseur connu</span>
                )}
                {r.offer ? (
                  <div className="text-xs text-muted">
                    {formatMoney(r.offer.price, r.offer.currency ?? r.currency)} {r.offer.taxType === "ht" ? "HT" : r.offer.taxType === "ttc" ? "TTC" : ""}
                  </div>
                ) : null}
                {r.supplierAvailable !== null ? <div className="text-xs text-muted">{r.supplierAvailable} dispo. fournisseur</div> : null}
              </TD>
              <TD>
                <div className="flex flex-col items-start gap-1.5">
                  {orderHref ? (
                    <ButtonLink href={orderHref} size="sm" variant="primary">
                      Préparer la commande
                    </ButtonLink>
                  ) : r.recommendedQuantity ? (
                    <ButtonLink href={`/sourcing?sku=${encodeURIComponent(r.code)}`} size="sm" variant="secondary">
                      Trouver un fournisseur
                    </ButtonLink>
                  ) : null}
                  {writable ? (
                    <ActionForm action={dismissRecommendationAction} fields={{ id: r.id }} variant="ghost" size="sm" showSuccess={false}>
                      Ignorer
                    </ActionForm>
                  ) : null}
                  {!r.recommendedQuantity && !orderHref ? <Badge variant="outline">Rien à commander</Badge> : null}
                </div>
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
