import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Bloc fantôme (forme du contenu à venir). Décoratif : la zone parente annonce le chargement (LoadingRegion). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("ms-skeleton rounded-md bg-skeleton", className)} />;
}

/** Paragraphe fantôme : `lines` lignes, la dernière plus courte. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("space-y-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3.5", i === lines - 1 && lines > 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

/** Conteneur de chargement annoncé aux lecteurs d'écran (utilisé par les `loading.tsx`). */
export function LoadingRegion({ label = "Chargement…", children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={cn("space-y-4", className)}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Squelette d'en-tête de page (titre + description + actions). */
export function PageHeaderSkeleton({ actions = 0 }: { actions?: number }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {actions > 0 ? (
        <div className="flex gap-2">
          {Array.from({ length: actions }, (_, i) => (
            <Skeleton key={i} className="h-10 w-28 rounded-xl" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Squelette de tableau dense (lignes fantômes). */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="border-b border-border bg-surface-2 px-4 py-3">
        <Skeleton className="h-3 w-1/3" />
      </div>
      <div className="divide-y divide-line-soft">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="hidden h-4 w-24 sm:block" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Squelette de tuile chiffrée (StatTile). */
export function StatTileSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("rounded-2xl border border-border bg-surface px-5 py-4", className)}>
      <Skeleton className="h-2.5 w-20" />
      <Skeleton className="mt-3 h-7 w-28" />
      <Skeleton className="mt-2 h-3 w-24" />
    </div>
  );
}
