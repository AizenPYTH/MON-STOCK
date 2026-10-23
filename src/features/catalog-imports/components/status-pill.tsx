import type { ReactNode } from "react";
import { CircleCheck, CircleDashed, CircleX, Clock, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ImportTone } from "@/features/catalog-imports/labels";

const TONE: Record<ImportTone, { cls: string; icon: LucideIcon }> = {
  success: { cls: "bg-success-soft text-success-ink ring-success-line", icon: CircleCheck },
  warning: { cls: "bg-warning-soft text-warning-ink ring-warning-line", icon: TriangleAlert },
  danger: { cls: "bg-danger-soft text-danger-ink ring-danger-line", icon: CircleX },
  info: { cls: "bg-info-soft text-info-ink ring-info-line", icon: Clock },
  neutral: { cls: "bg-line-soft text-muted-strong ring-border", icon: CircleDashed },
};

/** Pastille de statut d'un import : icône + texte (jamais la couleur seule), rayon 6, 11 px. */
export function StatusPill({ tone, children, className }: { tone: ImportTone; children: ReactNode; className?: string }) {
  const t = TONE[tone];
  const Icon = t.icon;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-[3px] text-[11px] font-bold leading-[14px] ring-1 ring-inset", t.cls, className)}>
      <Icon aria-hidden="true" className="h-3 w-3 shrink-0" strokeWidth={2.4} />
      {children}
    </span>
  );
}
