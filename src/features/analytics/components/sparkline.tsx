import { sparklinePoints } from "@/features/analytics/series.pure";

/**
 * Mini-courbe de tendance (stat tile) : trait 2 px en gris de retrait, point final en accent
 * avec anneau de surface. Pas de survol : la valeur est portée par le chiffre à côté.
 */
export function Sparkline({ values, width = 96, height = 28, label }: { values: number[]; width?: number; height?: number; label: string }) {
  const pts = sparklinePoints(values, width, height, 4);
  if (pts.length < 2) return null;
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="shrink-0 overflow-visible">
      <path d={d} fill="none" stroke="var(--border-strong)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {last ? <circle cx={last[0]} cy={last[1]} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} /> : null}
    </svg>
  );
}
