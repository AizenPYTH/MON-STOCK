import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Badge, StatusDot } from "@/components/ui/badge";
import { STOCK_LEVEL_LABEL, type StockLevel } from "@/domain/inventory/alerts";
import type { Trend } from "@/domain/inventory/velocity";

const TONE: Record<StockLevel, "danger" | "warning" | "neutral" | "success"> = {
  out_of_stock: "danger",
  at_risk: "warning",
  low: "neutral",
  normal: "success",
};

export function StockLevelBadge({ level, title }: { level: StockLevel; title?: string }) {
  const tone = TONE[level];
  const dotTone = level === "low" ? "warning" : tone;
  return (
    <Badge variant={level === "low" ? "warning" : tone} title={title}>
      <StatusDot tone={dotTone} />
      {STOCK_LEVEL_LABEL[level]}
    </Badge>
  );
}

export function TrendIcon({ trend, percent }: { trend: Trend; percent: number | null }) {
  if (trend === "unknown") return null;
  const label = percent !== null ? `${percent > 0 ? "+" : ""}${percent.toFixed(0)} % vs semaine précédente` : trend;
  if (trend === "up") return <TrendingUp className="inline h-3.5 w-3.5 text-success" aria-label={label} />;
  if (trend === "down") return <TrendingDown className="inline h-3.5 w-3.5 text-danger" aria-label={label} />;
  return <Minus className="inline h-3.5 w-3.5 text-muted" aria-label={label} />;
}
