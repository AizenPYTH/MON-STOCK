/** Mini-courbe SVG (sans dépendance) : points ordonnés du plus ancien au plus récent. */
export function Sparkline({ points, width = 200, height = 44, label }: { points: number[]; width?: number; height?: number; label?: string }) {
  if (points.length === 0) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const pad = 3;
  const span = max - min || 1;
  const step = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => [pad + i * step, height - pad - ((p - min) / span) * (height - pad * 2)] as const);
  const path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1]!;
  const falling = points.length > 1 && points[points.length - 1]! < points[0]!;
  const stroke = falling ? "#16a34a" : points.length > 1 && points[points.length - 1]! > points[0]! ? "#dc2626" : "#71717a";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label ?? "Évolution du prix"} className="overflow-visible">
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={stroke} />
    </svg>
  );
}
