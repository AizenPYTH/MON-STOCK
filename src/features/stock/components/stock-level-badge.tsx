import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { STOCK_LEVEL_LABEL, type StockLevel } from "@/domain/inventory/alerts";
import type { Trend } from "@/domain/inventory/velocity";

const TONE: Record<StockLevel, StatusTone> = {
  out_of_stock: "danger",
  at_risk: "warning",
  low: "warning",
  normal: "success",
};

/** Niveau de stock : icône + texte (jamais la couleur seule). */
export function StockLevelBadge({ level, title }: { level: StockLevel; title?: string }) {
  return (
    <StatusBadge tone={TONE[level]} variant={level === "normal" ? "plain" : "soft"} title={title}>
      {STOCK_LEVEL_LABEL[level]}
    </StatusBadge>
  );
}

export function TrendIcon({ trend, percent }: { trend: Trend; percent: number | null }) {
  if (trend === "unknown") return null;
  const label = percent !== null ? `${percent > 0 ? "+" : ""}${percent.toFixed(0)} % vs semaine précédente` : trend;
  if (trend === "up") return <TrendingUp className="inline h-3.5 w-3.5 text-success" aria-label={label} />;
  if (trend === "down") return <TrendingDown className="inline h-3.5 w-3.5 text-danger" aria-label={label} />;
  return <Minus className="inline h-3.5 w-3.5 text-muted" aria-label={label} />;
}
