"use client";
import { useId, useState } from "react";
import { niceTicks, type DailyPoint } from "@/features/analytics/series.pure";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";

const W = 720;
const H = 220;
const PAD = { left: 52, right: 12, top: 18, bottom: 28 };

function compactMoney(v: number, currency: string): string {
  if (Math.abs(v) >= 10_000) return `${formatNumber(v / 1000, 1)} k${currency === "EUR" ? "€" : ` ${currency}`}`;
  return formatMoney(v, currency, { decimals: 0 });
}

/**
 * Chiffre d'affaires quotidien sur 30 jours : colonnes fines (≤ 24 px, sommet arrondi 4 px),
 * grille en filet, une seule série (accent), étiquette directe sur le maximum uniquement,
 * survol par colonne (la colonne est la cible) et vue tableau pour l'accessibilité.
 */
export function RevenueChart({ points, currency }: { points: DailyPoint[]; currency: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max = points.reduce((m, p) => Math.max(m, p.revenue), 0);
  const ticks = niceTicks(max, 4);
  const top = Math.max(ticks[ticks.length - 1] ?? 0, 1);
  const n = Math.max(1, points.length);
  const slot = innerW / n;
  const barW = Math.max(2, Math.min(24, slot - 2));
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const baseline = y(0);
  const maxIndex = max > 0 ? points.findIndex((p) => p.revenue === max) : -1;
  const labelEvery = n > 14 ? 5 : n > 7 ? 2 : 1;
  const total = points.reduce((s, p) => s + p.revenue, 0);
  const hovered = hover !== null ? points[hover] : undefined;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Chiffre d'affaires quotidien sur ${n} jours, total ${formatMoney(total, currency)}`} aria-describedby={showTable ? tableId : undefined}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} dy="0.35em" textAnchor="end" fontSize={11} fill="var(--muted)" style={{ fontVariantNumeric: "tabular-nums" }}>
              {compactMoney(t, currency)}
            </text>
          </g>
        ))}
        <line x1={PAD.left} x2={W - PAD.right} y1={baseline} y2={baseline} stroke="var(--border-strong)" strokeWidth={1} />
        {points.map((p, i) => {
          const x = PAD.left + i * slot + (slot - barW) / 2;
          const h = p.revenue > 0 ? Math.max(1, (p.revenue / top) * innerH) : 0;
          const yTop = baseline - h;
          const r = Math.min(4, h / 2, barW / 2);
          const path = h > 0 ? `M${x},${baseline} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${baseline} Z` : null;
          const isHover = hover === i;
          return (
            <g key={p.day}>
              {path ? <path d={path} fill="var(--accent)" opacity={hover === null || isHover ? 1 : 0.55} /> : null}
              {i % labelEvery === 0 || i === n - 1 ? (
                <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">
                  {formatDate(p.day, { day: "numeric", month: "short" })}
                </text>
              ) : null}
              {i === maxIndex ? (
                <text x={x + barW / 2} y={yTop - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--foreground)" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatMoney(p.revenue, currency, { decimals: 0 })}
                </text>
              ) : null}
              <rect
                x={PAD.left + i * slot}
                y={PAD.top}
                width={slot}
                height={innerH}
                fill="transparent"
                tabIndex={0}
                aria-label={`${formatDate(p.day)} : ${formatMoney(p.revenue, currency)}, ${p.orders} commande(s), ${p.units} unité(s)`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                style={{ outline: "none" }}
              />
            </g>
          );
        })}
        {max <= 0 ? (
          <text x={PAD.left + innerW / 2} y={PAD.top + innerH / 2} textAnchor="middle" fontSize={13} fill="var(--muted)">
            Aucune vente enregistrée sur cette période.
          </text>
        ) : null}
      </svg>

      {hovered && hover !== null ? (
        <div
          role="status"
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-md"
          style={{ left: `${((PAD.left + hover * slot + slot / 2) / W) * 100}%` }}
        >
          <div className="text-muted">{formatDate(hovered.day, { weekday: "short", day: "numeric", month: "short" })}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-foreground tnum">
            <span aria-hidden className="inline-block h-0.5 w-3 rounded bg-accent" />
            {formatMoney(hovered.revenue, currency)}
          </div>
          <div className="text-muted tnum">
            {hovered.orders} commande{hovered.orders > 1 ? "s" : ""} · {hovered.units} unité{hovered.units > 1 ? "s" : ""}
          </div>
        </div>
      ) : null}

      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span>
          Total sur la période : <strong className="text-foreground tnum">{formatMoney(total, currency)}</strong>
        </span>
        <button type="button" onClick={() => setShowTable((s) => !s)} className="underline hover:text-foreground" aria-expanded={showTable} aria-controls={tableId}>
          {showTable ? "Masquer les données" : "Voir les données"}
        </button>
      </div>
      {showTable ? (
        <div id={tableId} className="mt-2 max-h-64 overflow-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="bg-surface-muted/60 text-left uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-1.5 font-medium">Jour</th>
                <th className="px-3 py-1.5 text-right font-medium">CA</th>
                <th className="px-3 py-1.5 text-right font-medium">Commandes</th>
                <th className="px-3 py-1.5 text-right font-medium">Unités</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {points.map((p) => (
                <tr key={p.day}>
                  <td className="px-3 py-1">{formatDate(p.day)}</td>
                  <td className="px-3 py-1 text-right tnum">{formatMoney(p.revenue, currency)}</td>
                  <td className="px-3 py-1 text-right tnum">{p.orders}</td>
                  <td className="px-3 py-1 text-right tnum">{p.units}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
