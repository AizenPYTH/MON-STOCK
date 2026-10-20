import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ImportTone } from "@/features/catalog-imports/labels";

const TONE: Record<ImportTone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  neutral: "bg-line-soft text-muted",
};

/** Pastille de statut v5 (rayon 6, 11 px, graisse 700). */
export function StatusPill({ tone, children, className }: { tone: ImportTone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-2 py-[3px] text-[11px] font-bold leading-[14px]", TONE[tone], className)}>{children}</span>;
}
