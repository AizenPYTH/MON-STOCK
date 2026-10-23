import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { barcodeBars, relativeHeights, rulerPosition, shares, type BarcodeItem, type BarcodeLevel } from "@/components/instrument/pure";
import { internalRoute } from "@/lib/routes";

/**
 * Graphiques « Instrument » v5 en HTML/CSS (aucune bibliothèque) : code-barres du stock,
 * 14 jours de CA, règle de marché, cascade de marge, score, répartition. Uniquement des données
 * réelles passées en paramètre ; animation par transform (scaleX / scaleY) depuis la base.
 */

const LEVEL_FILL: Record<BarcodeLevel, string> = { ok: "color-mix(in srgb, var(--on-night) 86%, transparent)", low: "var(--amber)", out: "var(--danger-on-night)" };
export const LEVEL_LABEL: Record<BarcodeLevel, string> = { ok: "En stock", low: "Stock faible", out: "Rupture" };

/** Code-barres du stock : une barre par référence, largeur = ventes 30 j, couleur = niveau. */
export function StockBarcode({ items, height = 56, href, hrefFor, label }: { items: BarcodeItem[]; height?: number; href?: string; hrefFor?: Partial<Record<BarcodeLevel, string>>; label: string }) {
  const bars = barcodeBars(items);
  if (hrefFor && !href) {
    // Chaque barre mène au filtre de son niveau (lien non tabulable : la légende porte les liens clavier).
    return (
      <span role="img" aria-label={label} className="flex w-full" style={{ height, gap: bars.length > 40 ? 2 : 3 }}>
        {bars.map((b, i) => {
          const style = { flexGrow: b.weight, flexBasis: 0, background: LEVEL_FILL[b.level], animationDelay: `${160 + Math.min(i, 30) * 18}ms` };
          const to = hrefFor[b.level];
          return to ? (
            <Link key={b.id} href={internalRoute(to)} tabIndex={-1} aria-hidden="true" className="ms-grow-y ms-hatch block min-w-px hover:opacity-80" style={style} />
          ) : (
            <span key={b.id} aria-hidden="true" className="ms-grow-y ms-hatch block min-w-px" style={style} />
          );
        })}
      </span>
    );
  }
  const body = (
    <span className="flex w-full" style={{ height, gap: bars.length > 40 ? 2 : 3 }} aria-hidden="true">
      {bars.map((b, i) => (
        <span key={b.id} className="ms-grow-y ms-hatch block min-w-px" style={{ flexGrow: b.weight, flexBasis: 0, background: LEVEL_FILL[b.level], animationDelay: `${160 + Math.min(i, 30) * 18}ms` }} />
      ))}
    </span>
  );
  return href ? (
    <Link href={internalRoute(href)} aria-label={label} className="block rounded-sm">
      {body}
    </Link>
  ) : (
    <span role="img" aria-label={label} className="block">
      {body}
    </span>
  );
}

/** Pastille de légende (cliquable si `href`). */
export function LegendKey({ color, label, href, onNight = true }: { color: string; label: ReactNode; href?: string; onNight?: boolean }) {
  const inner = (
    <>
      <span aria-hidden="true" className="h-2 w-2 rounded-[2px]" style={{ background: color }} />
      <span>{label}</span>
    </>
  );
  const cls = cn("ms-mono inline-flex items-center gap-1.5 text-[10.5px] leading-[14px]", onNight ? "text-on-night-muted" : "text-muted");
  return href ? (
    <Link href={internalRoute(href)} className={cn(cls, "rounded hover:opacity-80")}>
      {inner}
    </Link>
  ) : (
    <span className={cls}>{inner}</span>
  );
}

/** Barres des 14 derniers jours de CA ; le jour en cours (dernier) en contour menthe. */
export function DayBars({ days, height = 96, label, href }: { days: { day: string; amount: number }[]; height?: number; label: string; href?: string }) {
  const h = relativeHeights(days.map((d) => d.amount));
  const last = days.length - 1;
  const body = (
    <span className="flex items-end gap-1" style={{ height }} aria-hidden="true">
      {days.map((d, i) => (
        <span
          key={d.day}
          title={`${d.day} : ${d.amount}`}
          className={cn("ms-grow-y block flex-1 rounded-[3px]", i === last ? "border-[1.5px] border-mint bg-mint/16" : "bg-on-night/26")}
          style={{ height: `${Math.max(i === last ? 0.18 : 0.04, h[i] ?? 0) * 100}%`, animationDelay: `${120 + Math.min(i, 30) * 18}ms` }}
        />
      ))}
    </span>
  );
  return href ? (
    <Link href={internalRoute(href)} aria-label={label} className="block">
      {body}
    </Link>
  ) : (
    <span role="img" aria-label={label} className="block">
      {body}
    </span>
  );
}

/**
 * Règle de marché : coût rendu face à la médiane du marché (−40 % … +20 %, médiane aux 2/3),
 * segment vert sous le marché / rouge au-dessus, losange menthe = revente. Sans comparaison :
 * pointillé + légende.
 */
export function MarketRuler({ cost, market, resale, caption, emptyCaption, large = false, onNight = false }: { cost: number | null; market: number | null; resale?: number | null; caption?: ReactNode; emptyCaption?: ReactNode; large?: boolean; onNight?: boolean }) {
  const capCls = cn("ms-code mt-1.5 truncate text-[10px] uppercase leading-[13px] tracking-[0.03em]", onNight ? "text-on-night-muted" : "text-ink-3");
  if (cost === null || market === null || !(market > 0))
    return (
      <div>
        <div className={cn("mt-2 border-t-[1.5px] border-dashed", onNight ? "border-night-stroke" : "border-border-strong")} />
        {emptyCaption ? <div className={capCls}>{emptyCaption}</div> : null}
      </div>
    );
  const pc = rulerPosition(cost, market) * 100;
  const pm = rulerPosition(market, market) * 100;
  const pr = resale ? rulerPosition(resale, market) * 100 : null;
  const below = cost <= market;
  const rail = large ? 6 : 4;
  const dot = large ? 16 : 10;
  const tick = large ? 18 : 12;
  const box = large ? 32 : 14;
  return (
    <div>
      <div className="relative" style={{ height: box }} role="img" aria-label={`Coût rendu ${below ? "sous" : "au-dessus de"} la médiane du marché`}>
        <span className={cn("absolute inset-x-0 rounded-full", onNight ? "bg-night-stroke" : "bg-track")} style={{ top: box / 2 - rail / 2, height: rail }} />
        <span className="absolute" style={{ top: box / 2 - rail / 2, height: rail, left: `${Math.min(pc, pm)}%`, width: `${Math.abs(pm - pc)}%`, background: below ? (onNight ? "var(--mint)" : "var(--success)") : "var(--red)" }} />
        <span className={cn("absolute w-0.5", onNight ? "bg-on-night" : "bg-foreground")} style={{ top: box / 2 - tick / 2, height: tick, left: `calc(${pm}% - 1px)` }} />
        {pr !== null ? <span className={cn("absolute h-3 w-3 rotate-45 border-2 bg-mint", onNight ? "border-night-deep" : "border-surface")} style={{ top: box / 2 - 6, left: `calc(${pr}% - 6px)` }} /> : null}
        <span className={cn("absolute rounded-full", onNight ? "border-night-deep bg-on-night" : "border-surface bg-foreground")} style={{ top: box / 2 - dot / 2, width: dot, height: dot, borderWidth: large ? 3 : 2.5, left: `calc(${pc}% - ${dot / 2}px)` }} />
      </div>
      {caption ? <div className={capCls}>{caption}</div> : null}
    </div>
  );
}

/** Barre de score /100. */
export function ScoreBar({ score, className }: { score: number; className?: string }) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  return (
    <div className={cn("flex items-center gap-2.5", className)} role="img" aria-label={`Score ${s} sur 100`}>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-track">
        <span className="ms-grow-x block h-full rounded-full bg-foreground" style={{ width: `${s}%` }} />
      </span>
      <span className="ms-code text-[10.5px] text-muted">SCORE {s}/100</span>
    </div>
  );
}

export type WaterfallLine = { label: string; note?: string; amount: number | null; kind: "base" | "minus" | "subtotal" | "result" };

/** Cascade de marge : chaque ligne avec une barre ∝ |montant| / revente ; inconnu → « — ». */
export function MarginWaterfall({ lines, format, className }: { lines: WaterfallLine[]; format: (n: number) => string; className?: string }) {
  const base = Math.abs(lines.find((l) => l.kind === "base")?.amount ?? 0);
  return (
    <ul className={cn("divide-y divide-line-soft rounded-2xl border border-border bg-surface px-4", className)}>
      {lines.map((l, i) => {
        const v = l.amount;
        const text = v === null ? "—" : l.kind === "minus" ? `− ${format(Math.abs(v))}` : l.kind === "result" ? `${v >= 0 ? "≈ +" : "≈ −"}${format(Math.abs(v))}` : format(v);
        const fill = l.kind === "base" ? "var(--foreground)" : l.kind === "subtotal" ? "var(--ink-3)" : l.kind === "result" ? (v !== null && v < 0 ? "var(--red)" : "var(--success)") : "var(--border-strong)";
        const ratio = base > 0 && v !== null ? Math.min(1, Math.abs(v) / base) : 0;
        return (
          <li key={`${l.label}-${i}`} className="py-2.5">
            <div className="flex items-baseline gap-2">
              <span className={cn("truncate text-sm", l.kind === "minus" ? "font-semibold text-muted" : "font-bold")}>{l.label}</span>
              {l.note ? <span className="ms-code truncate text-[10px] text-ink-3">{l.note}</span> : null}
              <span className={cn("ml-auto shrink-0 text-sm tnum", l.kind === "minus" ? "font-semibold text-muted" : "font-extrabold", l.kind === "result" && (v !== null && v < 0 ? "text-danger" : "text-success"))}>{text}</span>
            </div>
            <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-background">
              <span className="ms-grow-x block h-full rounded-full" style={{ width: `${ratio * 100}%`, background: fill, animationDelay: `${160 + Math.min(i, 8) * 40}ms` }} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Barre de répartition (imports, radar) + légende en grille ; total nul → barre vide. */
export function SplitBar({ segments, height = 12, legend = true, onNight = false, className }: { segments: { label: string; value: number; color: string }[]; height?: number; legend?: boolean; onNight?: boolean; className?: string }) {
  const parts = shares(segments.map((s) => s.value));
  return (
    <div className={className}>
      <span className={cn("flex w-full overflow-hidden rounded-full", onNight ? "bg-night-stroke" : "bg-track")} style={{ height, gap: 2 }} role="img" aria-label={segments.map((s) => `${s.label} : ${s.value}`).join(", ")}>
        {segments.map((s, i) => (parts[i] ?? 0) > 0 ? <span key={s.label} className="ms-grow-x block h-full" style={{ width: `${(parts[i] ?? 0) * 100}%`, background: s.color, animationDelay: `${i * 60}ms` }} /> : null)}
      </span>
      {legend ? (
        <ul className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
          {segments.map((s) => (
            <li key={s.label} className={cn("flex items-center gap-1.5 text-[13px] font-semibold", onNight ? "text-on-night-muted" : "text-muted")}>
              <span aria-hidden="true" className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} />
              <span className="truncate">{s.label}</span>
              <span className={cn("ml-auto tnum font-bold", onNight ? "text-on-night" : "text-foreground")}>{new Intl.NumberFormat("fr-FR").format(s.value)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
