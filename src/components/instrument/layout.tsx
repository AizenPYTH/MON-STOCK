import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Scène nuit en tête de page (porte le titre ou LE chiffre de la page et au plus un graphique) ;
 * le papier remonte ensuite de 24 px sur la scène. Une page v5 = <Scene> puis <Paper>.
 */
export function Scene({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("ms-scene bg-night px-4 pb-12 pt-3 text-on-night sm:px-8 lg:pl-8 lg:pr-10", className)}>{children}</section>;
}

export function Paper({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("relative -mt-6 flex-1 rounded-t-3xl bg-background px-4 pb-16 pt-5 sm:px-8 lg:pl-8 lg:pr-10 lg:pt-7", className)}>{children}</div>;
}

/** En-tête de scène : sur-titre mono, titre 28/34, description, actions à droite. */
export function SceneHeader({ eyebrow, title, description, actions, back }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back ? (
          <Link href={back.href as never} className="mb-2 inline-flex items-center gap-1 rounded-lg text-[13px] font-semibold text-on-night-muted hover:text-on-night">
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            {back.label}
          </Link>
        ) : null}
        {eyebrow ? <div className="ms-mono mb-1.5 text-[11px] leading-[14px] tracking-[0.1em] text-on-night-muted">{eyebrow}</div> : null}
        <h1 className="text-[28px] font-extrabold leading-[34px] tracking-[-0.6px] text-on-night">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm font-semibold text-on-night-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Relevés de scène : 2 à 4 valeurs séparées par des filets ; « — » si inconnu. */
export type StageStat = { label: string; value: ReactNode | null; note?: ReactNode; tone?: "mint" | "warning" | "danger"; href?: string };

export function StageStats({ stats, className, size = "md" }: { stats: StageStat[]; className?: string; size?: "md" | "sm" }) {
  return (
    <dl className={cn("grid border-t border-night-line pt-4", className)} style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
      {stats.map((s, i) => {
        const tone = s.tone === "mint" ? "text-mint" : s.tone === "warning" ? "text-amber" : s.tone === "danger" ? "text-danger-on-night" : "text-on-night";
        const body = (
          <>
            <dt className="ms-mono truncate text-[10px] leading-[13px] text-on-night-subtle">{s.label}</dt>
            <dd className={cn("mt-1.5 flex min-w-0 items-baseline gap-1.5 font-bold tnum", size === "md" ? "text-[20px] leading-[26px]" : "text-[17px] leading-[22px]", tone)}>
              <span className="truncate">{s.value ?? "—"}</span>
              {s.note ? <span className="truncate text-[13px] font-semibold text-amber">{s.note}</span> : null}
            </dd>
          </>
        );
        return (
          <div key={s.label} className={cn("min-w-0 pr-4", i > 0 && "border-l border-night-line pl-4")}>
            {s.href ? (
              <Link href={s.href as never} className="block rounded-lg hover:opacity-80">
                {body}
              </Link>
            ) : (
              body
            )}
          </div>
        );
      })}
    </dl>
  );
}

/** Carte blanche à filet, rayon 16, sans ombre (charte v5). */
export function Panel({ children, className, as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "article" | "li" }) {
  return <Tag className={cn("rounded-2xl border border-border bg-surface", className)}>{children}</Tag>;
}
