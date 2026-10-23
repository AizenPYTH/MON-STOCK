import { niceTicks } from "@/features/analytics/series.pure";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const PLOT_H = 200;

function compactMoney(v: number, currency: string): string {
  if (Math.abs(v) >= 10_000) return `${formatNumber(v / 1000, 1)} k${currency === "EUR" ? "€" : ` ${currency}`}`;
  return formatMoney(v, currency, { decimals: 0 });
}

/**
 * CA par semaine ISO (5 dernières semaines, la semaine en cours incomplète) : une seule série en
 * HTML/CSS (texte à taille fixe quel que soit l'écran), valeur au-dessus de chaque colonne, semaine
 * en cours hachurée (incomplète), info-bulle par colonne et tableau des valeurs pour l'accessibilité.
 */
export function WeeklyRevenueChart({ weeks, currency }: { weeks: { label: string; from: string; value: number }[]; currency: string }) {
  const max = weeks.reduce((m, w) => Math.max(m, w.value), 0);
  const ticks = niceTicks(max, 4);
  const top = Math.max(ticks[ticks.length - 1] ?? 0, 1);
  const n = Math.max(1, weeks.length);
  const total = weeks.reduce((s, w) => s + w.value, 0);
  const maxIndex = max > 0 ? weeks.findIndex((w) => w.value === max) : -1;

  return (
    <div>
      <div role="img" aria-label={`Chiffre d'affaires par semaine sur ${n} semaines, total ${formatMoney(total, currency)}`} className="flex gap-3">
        {/* Axe des valeurs */}
        <div aria-hidden="true" className="relative w-12 shrink-0 sm:w-14" style={{ height: PLOT_H }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2 whitespace-nowrap text-[11px] font-medium text-ink-3 tnum" style={{ top: `${(1 - t / top) * 100}%` }}>
              {compactMoney(t, currency)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div aria-hidden="true" className="relative" style={{ height: PLOT_H }}>
            {ticks.map((t) => (
              <span key={t} className={cn("absolute inset-x-0 border-t", t === 0 ? "border-border-strong" : "border-dashed border-border")} style={{ top: `${(1 - t / top) * 100}%` }} />
            ))}
            <div className="absolute inset-0 flex items-end">
              {weeks.map((w, i) => {
                const current = i === weeks.length - 1;
                const h = w.value > 0 ? Math.max(1.5, (w.value / top) * 100) : 0;
                return (
                  <div key={w.from} className="group relative flex h-full flex-1 items-end justify-center px-2 sm:px-4" title={`${w.label} (semaine du ${formatDate(w.from, { day: "numeric", month: "long" })}${current ? ", en cours" : ""}) : ${formatMoney(w.value, currency)}`}>
                    <div className="relative flex w-full max-w-[64px] flex-col items-center justify-end" style={{ height: `${h}%` }}>
                      <span className={cn("absolute -top-5 whitespace-nowrap text-[11.5px] tnum", i === maxIndex ? "font-bold text-foreground" : "font-semibold text-muted")}>{compactMoney(w.value, currency)}</span>
                      {h > 0 ? (
                        <span
                          className={cn("ms-grow-y block h-full w-full rounded-t-[6px] transition-opacity duration-150 group-hover:opacity-85", current ? "border border-b-0 border-dashed border-ink-3 bg-surface-3" : i === maxIndex ? "bg-inverse" : "bg-ink-3")}
                          style={{ animationDelay: `${80 + i * 50}ms`, backgroundImage: current ? "repeating-linear-gradient(135deg, color-mix(in srgb, var(--ink-3) 45%, transparent) 0 1.5px, transparent 1.5px 6px)" : undefined }}
                        />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div aria-hidden="true" className="mt-2 flex">
            {weeks.map((w, i) => (
              <span key={w.from} className="flex-1 truncate px-0.5 text-center text-[12px] font-semibold text-muted">
                {w.label}
                {i === weeks.length - 1 ? <span className="block text-[10.5px] font-medium text-ink-3">en cours</span> : null}
              </span>
            ))}
          </div>
        </div>
      </div>
      <details className="group mt-4 border-t border-line-soft pt-3 text-xs text-muted">
        <summary className="inline-flex min-h-8 cursor-pointer items-center rounded font-semibold text-muted-strong hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Voir les valeurs</summary>
        <table className="mt-2 w-full text-left">
          <thead className="ms-mono text-[10.5px] text-ink-3">
            <tr>
              <th scope="col" className="py-1.5 font-medium">Semaine</th>
              <th scope="col" className="py-1.5 font-medium">Du</th>
              <th scope="col" className="py-1.5 text-right font-medium">Chiffre d&apos;affaires</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w, i) => (
              <tr key={w.from} className="border-t border-line-soft">
                <td className="py-1.5 text-foreground">
                  {w.label}
                  {i === weeks.length - 1 ? " (en cours)" : ""}
                </td>
                <td className="py-1.5 tnum">{formatDate(w.from, { day: "numeric", month: "short" })}</td>
                <td className="py-1.5 text-right font-semibold text-foreground tnum">{formatMoney(w.value, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
