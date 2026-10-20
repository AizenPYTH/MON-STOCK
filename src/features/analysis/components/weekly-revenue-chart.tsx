import { niceTicks } from "@/features/analytics/series.pure";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";

const W = 560;
const H = 200;
const PAD = { left: 56, right: 12, top: 20, bottom: 28 };

function compactMoney(v: number, currency: string): string {
  if (Math.abs(v) >= 10_000) return `${formatNumber(v / 1000, 1)} k${currency === "EUR" ? "€" : ` ${currency}`}`;
  return formatMoney(v, currency, { decimals: 0 });
}

/**
 * CA par semaine ISO (5 dernières semaines, la semaine en cours incomplète) : une seule série,
 * colonnes fines au sommet arrondi, étiquette directe sur le maximum, info-bulle par colonne
 * et tableau des valeurs pour l'accessibilité.
 */
export function WeeklyRevenueChart({ weeks, currency }: { weeks: { label: string; from: string; value: number }[]; currency: string }) {
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max = weeks.reduce((m, w) => Math.max(m, w.value), 0);
  const ticks = niceTicks(max, 4);
  const top = Math.max(ticks[ticks.length - 1] ?? 0, 1);
  const n = Math.max(1, weeks.length);
  const slot = innerW / n;
  const barW = Math.min(40, slot * 0.5);
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const baseline = y(0);
  const maxIndex = max > 0 ? weeks.findIndex((w) => w.value === max) : -1;
  const total = weeks.reduce((s, w) => s + w.value, 0);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Chiffre d'affaires par semaine sur ${n} semaines, total ${formatMoney(total, currency)}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} dy="0.35em" textAnchor="end" fontSize={11} fill="var(--muted)" style={{ fontVariantNumeric: "tabular-nums" }}>
              {compactMoney(t, currency)}
            </text>
          </g>
        ))}
        <line x1={PAD.left} x2={W - PAD.right} y1={baseline} y2={baseline} stroke="var(--border-strong)" strokeWidth={1} />
        {weeks.map((w, i) => {
          const x = PAD.left + i * slot + (slot - barW) / 2;
          const h = w.value > 0 ? Math.max(1, (w.value / top) * innerH) : 0;
          const yTop = baseline - h;
          const r = Math.min(4, h / 2, barW / 2);
          const path = h > 0 ? `M${x},${baseline} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${baseline} Z` : null;
          const current = i === weeks.length - 1;
          return (
            <g key={w.from}>
              <title>{`${w.label} (semaine du ${formatDate(w.from, { day: "numeric", month: "long" })}${current ? ", en cours" : ""}) : ${formatMoney(w.value, currency)}`}</title>
              <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={innerH} fill="transparent" />
              {path ? <path d={path} fill="var(--accent)" opacity={current ? 0.6 : 1} /> : null}
              <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">
                {w.label}
                {current ? " (en cours)" : ""}
              </text>
              {i === maxIndex ? (
                <text x={x + barW / 2} y={yTop - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--foreground)" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatMoney(w.value, currency, { decimals: 0 })}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Voir les valeurs</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr>
              <th scope="col" className="py-1 font-medium">Semaine</th>
              <th scope="col" className="py-1 font-medium">Du</th>
              <th scope="col" className="py-1 text-right font-medium">Chiffre d&apos;affaires</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w, i) => (
              <tr key={w.from} className="border-t border-border">
                <td className="py-1">
                  {w.label}
                  {i === weeks.length - 1 ? " (en cours)" : ""}
                </td>
                <td className="py-1">{formatDate(w.from, { day: "numeric", month: "short" })}</td>
                <td className="py-1 text-right tnum text-foreground">{formatMoney(w.value, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
