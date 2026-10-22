import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";

/*
 * Motifs de page partagés. Les composants autrefois définis ici vivent maintenant dans leurs
 * propres fichiers ; ils restent réexportés pour ne casser aucun import existant.
 */
export { EmptyState } from "@/components/ui/empty-state";
export { Callout, Alert } from "@/components/ui/callout";
export { Stat, StatTile } from "@/components/ui/stat-tile";
export { Skeleton, SkeletonText, LoadingRegion, PageHeaderSkeleton, TableSkeleton, StatTileSkeleton } from "@/components/ui/skeleton";
export { SectionHeader } from "@/components/ui/section-header";
export { ErrorState } from "@/components/ui/error-state";

/** En-tête d'une page posée sur le papier (sans scène nuit) : sur-titre mono, titre h1, description, actions. */
export function PageHeader({ title, description, actions, eyebrow, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="ms-mono mb-1.5 text-[11px] leading-[14px] text-ink-3">{eyebrow}</div> : null}
        <h1 className="text-[24px] font-extrabold leading-[30px] tracking-[-0.5px] text-foreground sm:text-[28px] sm:leading-[34px] sm:tracking-[-0.6px]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Section({ title, description, actions, children, className }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3", className)}>
      {title ? <SectionHeader title={title} description={description} actions={actions} /> : null}
      {children}
    </section>
  );
}

export function DescriptionList({ items, className }: { items: Array<{ label: ReactNode; value: ReactNode }>; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2", className)}>
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <dt className="ms-mono text-[10.5px] leading-[14px] text-ink-3">{it.label}</dt>
          <dd className="mt-1 break-words text-sm font-semibold text-foreground">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ComingSoon({ feature, children }: { feature: string; children?: ReactNode }) {
  return (
    <EmptyState
      title={`${feature} — Disponible prochainement`}
      description={children ?? "Cette fonctionnalité n'est pas encore disponible. Elle est prévue dans l'architecture mais n'est pas simulée."}
    />
  );
}
