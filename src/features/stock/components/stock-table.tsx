import Link from "next/link";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatDays, formatMoney, formatNumber, formatRelative } from "@/lib/format";
import { StockLevelBadge, TrendIcon } from "@/features/stock/components/stock-level-badge";
import type { StockRowView } from "@/features/stock/model";

export function StockTable({ rows }: { rows: StockRowView[] }) {
  return (
    <Table className="min-w-[1100px]">
      <THead>
        <tr>
          <TH>Produit</TH>
          <TH>SKU</TH>
          <TH align="right">Stock</TH>
          <TH align="right">Réservé</TH>
          <TH align="right">Disponible</TH>
          <TH align="right">Ventes 7j</TH>
          <TH align="right">Ventes 30j</TH>
          <TH align="right">Jours de stock</TH>
          <TH align="right">Coût</TH>
          <TH align="right">Prix</TH>
          <TH align="right">Marge</TH>
          <TH>Statut</TH>
        </tr>
      </THead>
      <TBody>
        {rows.map((v) => {
          const r = v.row;
          const href = `/stock/${encodeURIComponent(r.code ?? "")}`;
          return (
            <TR key={r.sku_id}>
              <TD>
                <Link href={href as never} className="block max-w-[320px]">
                  <div className="truncate font-medium text-foreground">{r.product_name}</div>
                  <div className="truncate text-xs text-muted">
                    {[r.brand, r.variant_name !== "Standard" ? r.variant_name : null].filter(Boolean).join(" · ")}
                  </div>
                </Link>
              </TD>
              <TD>
                <code className="font-mono text-xs">{r.code}</code>
              </TD>
              <TD align="right">{formatNumber(r.quantity_on_hand)}</TD>
              <TD align="right" className="text-muted">
                {formatNumber(r.quantity_reserved)}
              </TD>
              <TD align="right" className="font-medium">
                {formatNumber(r.quantity_available)}
              </TD>
              <TD align="right">{formatNumber(r.units_7d)}</TD>
              <TD align="right">
                {formatNumber(r.units_30d)} <TrendIcon trend={v.velocity.trend} percent={v.velocity.trendPercent} />
              </TD>
              <TD align="right" title={v.velocity.explanation}>
                {v.daysOfCover === null ? <span className="text-xs text-muted">Pas assez de données</span> : formatDays(v.daysOfCover)}
              </TD>
              <TD align="right">{r.cost_price === null ? <span className="text-xs text-muted">Inconnu</span> : formatMoney(r.cost_price, r.currency ?? "EUR")}</TD>
              <TD align="right">{formatMoney(r.sale_price, r.currency ?? "EUR")}</TD>
              <TD align="right" title={v.margin.caveat ?? undefined}>
                {v.margin.grossMargin === null ? (
                  <span className="text-xs text-muted">Coût inconnu</span>
                ) : (
                  <span className={v.margin.grossMargin < 0 ? "text-danger" : ""}>
                    {formatMoney(v.margin.grossMargin, r.currency ?? "EUR")}
                    {v.margin.grossMarginPercent !== null ? <span className="ml-1 text-xs text-muted">({v.margin.grossMarginPercent.toFixed(0)} %)</span> : null}
                  </span>
                )}
              </TD>
              <TD>
                <StockLevelBadge level={v.classification.level} title={v.classification.reason} />
                {r.last_sale_at ? <div className="mt-0.5 text-[11px] text-muted">Vendu {formatRelative(r.last_sale_at)}</div> : null}
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
