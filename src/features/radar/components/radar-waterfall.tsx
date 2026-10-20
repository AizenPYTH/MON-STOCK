import type { RadarItemDTO } from "@/features/mobile-api/contract";
import { cn } from "@/lib/utils";
import { classifyBreakdown, signedProfit } from "@/features/radar/labels";

/**
 * Cascade du radar (calcul du serveur, ligne à ligne) : prix de vente → composantes du coût rendu
 * (« + », en retrait) → coût d'achat rendu (déduit) → marge brute → frais de vente (« − ») →
 * bénéfice. Barre ∝ montant / prix de vente ; inconnu → « — », jamais 0.
 */
export function RadarWaterfall({ evaluation: e, format }: { evaluation: RadarItemDTO["evaluation"]; format: (n: number) => string }) {
  const lines = classifyBreakdown(e.breakdown);
  const base = Math.abs(lines.find((l) => l.kind === "revenue")?.amount ?? 0);
  return (
    <ul className="divide-y divide-line-soft rounded-2xl border border-border bg-surface px-3.5">
      {lines.map((l, i) => {
        const v = l.amount;
        const landed = /^Coût d'achat rendu/.test(l.label);
        const text = v === null ? "—" : l.kind === "result" ? signedProfit(v, e.status, format) : l.kind === "cost" ? `+ ${format(v)}` : l.kind === "deduction" || landed ? `− ${format(Math.abs(v))}` : format(v);
        const fill = l.kind === "revenue" && i === 0 ? "var(--foreground)" : l.kind === "subtotal" || l.kind === "revenue" ? "var(--ink-3)" : l.kind === "result" ? (v !== null && v < 0 ? "var(--red)" : "var(--success)") : "var(--border-strong)";
        const ratio = base > 0 && v !== null ? Math.min(1, Math.abs(v) / base) : 0;
        const strong = l.kind === "revenue" || l.kind === "subtotal" || l.kind === "result";
        return (
          <li key={`${l.label}-${i}`} className={cn("py-2.5", l.kind === "cost" && "pl-3")}>
            <div className="flex items-baseline gap-2">
              <span className={cn("min-w-0 flex-1 text-sm leading-5", strong ? "font-bold" : "font-semibold text-muted", l.kind === "cost" && "text-[13px]", l.kind === "result" && (v !== null && v < 0 ? "text-danger" : "text-success"))}>{l.label}</span>
              <span className={cn("shrink-0 whitespace-nowrap text-sm leading-5 tnum", strong ? "font-extrabold" : "font-semibold text-muted", l.kind === "result" && (v !== null && v < 0 ? "text-danger" : "text-success"))}>{text}</span>
            </div>
            <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-background">
              <span className="ms-grow-x block h-full rounded-full" style={{ width: `${ratio * 100}%`, background: fill, animationDelay: `${120 + Math.min(i, 8) * 40}ms` }} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
