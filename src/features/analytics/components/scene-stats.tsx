import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SceneStat = { label: string; value: string | null; hint?: ReactNode; tone?: "mint" | "warning" | "danger" };

/**
 * Relevés de scène (v5) avec une ligne d'explication sous chaque valeur : filet haut, séparateurs
 * verticaux, étiquette mono 10, valeur 700 20/26. « ≈ » en tête de valeur est atténué ;
 * valeur inconnue → « — » (jamais 0). Deux colonnes sur téléphone, toutes sur grand écran.
 */
export function SceneStatGrid({ stats, className }: { stats: SceneStat[]; className?: string }) {
  return (
    <dl className={cn("mt-6 grid grid-cols-2 gap-y-4 border-t border-night-line pt-4", stats.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4", className)}>
      {stats.map((s, i) => {
        const tone = s.tone === "mint" ? "text-mint" : s.tone === "warning" ? "text-amber" : s.tone === "danger" ? "text-danger-on-night" : "text-on-night";
        const approx = s.value?.startsWith("≈ ") ?? false;
        return (
          <div key={s.label} className={cn("min-w-0 pr-4", i % 2 === 1 && "border-l border-night-line pl-4", i > 0 && "lg:border-l lg:border-night-line lg:pl-4", i % 2 === 0 && i > 0 && "max-lg:pl-0")}>
            <dt className="ms-mono truncate text-[10px] leading-[13px] text-on-night-subtle">{s.label}</dt>
            <dd className={cn("mt-1.5 truncate text-[20px] font-bold leading-[26px] tnum", tone)}>
              {s.value === null ? (
                <span aria-label="inconnu">—</span>
              ) : approx ? (
                <>
                  <span className="font-medium text-on-night-subtle">≈ </span>
                  {s.value.slice(2)}
                </>
              ) : (
                s.value
              )}
            </dd>
            {s.hint ? <dd className="mt-1 text-[12.5px] font-semibold leading-[17px] text-on-night-muted">{s.hint}</dd> : null}
          </div>
        );
      })}
    </dl>
  );
}
