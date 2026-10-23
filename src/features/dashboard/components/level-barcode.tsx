import Link from "next/link";
import { barcodeBars, type BarcodeItem, type BarcodeLevel } from "@/components/instrument/pure";
import type { StockLevel } from "@/domain/inventory/alerts";
import { stockLevelHref } from "@/features/dashboard/today.pure";

const FILL: Record<BarcodeLevel, string> = { ok: "color-mix(in srgb, var(--on-night) 86%, transparent)", low: "var(--amber)", out: "var(--danger-on-night)" };

/**
 * Code-barres du stock de l'accueil : une barre par référence (largeur = ventes 30 j, couleur =
 * niveau), même règle que `StockBarcode` ; chaque barre mène au stock filtré sur son niveau. Les
 * barres sont hors tabulation (la légende cliquable juste dessous porte les mêmes liens au clavier).
 */
export function LevelBarcode({ items, height = 56, label }: { items: (BarcodeItem & { stockLevel: StockLevel })[]; height?: number; label: string }) {
  const levelOf = new Map(items.map((i) => [i.id, i.stockLevel] as const));
  const bars = barcodeBars(items);
  const tail = Math.max(0, items.length - (bars.length - 1));
  return (
    <div role="img" aria-label={label} className="flex w-full" style={{ height, gap: bars.length > 40 ? 2 : 3 }}>
      {bars.map((b, i) => {
        const level: StockLevel | "all" = b.id === "others" ? (b.level === "out" ? "out_of_stock" : b.level === "ok" ? "all" : "low") : (levelOf.get(b.id) ?? "all");
        const href = level === "normal" ? stockLevelHref("normal") : stockLevelHref(level);
        return (
          <Link
            key={b.id}
            href={href as never}
            tabIndex={-1}
            aria-hidden="true"
            title={b.id === "others" ? `Autres références (${tail})` : undefined}
            className="ms-grow-y ms-hatch block h-full min-w-px hover:opacity-80"
            style={{ flexGrow: b.weight, flexBasis: 0, background: FILL[b.level], animationDelay: `${160 + Math.min(i, 30) * 18}ms` }}
          />
        );
      })}
    </div>
  );
}
