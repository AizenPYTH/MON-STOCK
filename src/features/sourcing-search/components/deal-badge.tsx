import { ArrowDownRight, ArrowUpRight, CircleHelp, Minus, TrendingUp } from "lucide-react";
import type { SimpleDealDTO } from "@/features/mobile-api/contract";
import { cn } from "@/lib/utils";

const STYLE: Record<SimpleDealDTO["level"], { cls: string; Icon: typeof TrendingUp }> = {
  very_good: { cls: "border-success-strong bg-success-strong text-on-success-strong", Icon: TrendingUp },
  good: { cls: "border-success-line bg-success-soft text-success-ink", Icon: ArrowUpRight },
  average: { cls: "border-border bg-line-soft text-muted-strong", Icon: Minus },
  not_competitive: { cls: "border-danger-line bg-danger-soft text-danger-ink", Icon: ArrowDownRight },
  insufficient_data: { cls: "border-dashed border-border-strong bg-transparent text-ink-3", Icon: CircleHelp },
};

/** Niveau d'une offre (libellé du serveur) : plein vert, vert doux, neutre, rouge, pointillé. */
export function DealBadge({ level, label, size = "sm" }: { level: SimpleDealDTO["level"]; label: string; size?: "sm" | "md" }) {
  const { cls, Icon } = STYLE[level];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md border font-bold", size === "md" ? "px-2 py-1 text-[11px] leading-[14px]" : "px-1.5 py-0.5 text-[10.5px] leading-[14px]", cls)}>
      <Icon aria-hidden="true" className={size === "md" ? "h-[13px] w-[13px]" : "h-[11px] w-[11px]"} strokeWidth={2.6} />
      {label}
    </span>
  );
}

/** Étiquette d'accès : « Votre compte » (aplat contrasté) / « Source publique » (bleu) / « Place de marché ». */
export function AccessTag({ access }: { access: "account" | "public" | "marketplace" | undefined }) {
  if (!access) return null;
  const label = access === "account" ? "Votre compte" : access === "public" ? "Source publique" : "Place de marché";
  return <span className={cn("inline-block whitespace-nowrap rounded-[5px] px-[5px] py-px text-[9.5px] font-bold leading-[13px]", access === "account" ? "bg-inverse text-on-inverse" : access === "public" ? "bg-info-soft text-info-ink" : "bg-line-soft text-muted-strong")}>{label}</span>;
}
