import type { ReactNode } from "react";
import type { RadarItemDTO } from "@/features/mobile-api/contract";
import { cn } from "@/lib/utils";

type Status = RadarItemDTO["evaluation"]["status"];
type Verdict = RadarItemDTO["assessment"]["verdict"];
type Freshness = RadarItemDTO["evaluation"]["freshness"];

export const STATUS_CHIP: Record<Status, string> = {
  profitable: "bg-success-soft text-success",
  estimated: "bg-warning-soft text-warning",
  unprofitable: "bg-danger-soft text-danger",
  insufficient_data: "bg-background text-muted",
};

export const VERDICT_CHIP: Record<Verdict, string> = {
  opportunity: "bg-success-soft text-success",
  to_verify: "bg-warning-soft text-warning",
  risky: "bg-danger-soft text-danger",
  insufficient_data: "bg-background text-muted",
};

export const VERDICT_TEXT: Record<Verdict, string> = { opportunity: "text-success", to_verify: "text-warning", risky: "text-danger", insufficient_data: "text-muted" };

export const FRESH_CHIP: Record<Freshness, string> = {
  fresh: "bg-background text-muted",
  recent: "bg-background text-muted",
  stale: "bg-danger-soft text-danger",
  unknown: "bg-warning-soft text-warning",
};

/** Puce d'information 11/14 (statut, bénéfice, fraîcheur, coûts inconnus). */
export function Chip({ className, children }: { className: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-md px-2 py-[3px] text-[11px] font-bold leading-[14px] tnum", className)}>{children}</span>;
}
