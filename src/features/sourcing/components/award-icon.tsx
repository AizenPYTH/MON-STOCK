import { Award as AwardIcon, BadgeEuro, Medal, PackageMinus, ShieldCheck, Trophy, Truck, type LucideIcon } from "lucide-react";
import type { AwardKey } from "@/domain/sourcing/ranking";
import { cn } from "@/lib/utils";

/**
 * Pictogrammes des distinctions du classement (à la place des émojis du domaine) : la distinction
 * reste portée par son libellé, l'icône n'est qu'un repère visuel.
 */
const ICON: Record<AwardKey, LucideIcon> = {
  best_opportunity: Trophy,
  best_value: Medal,
  most_reliable: ShieldCheck,
  lowest_price: BadgeEuro,
  fastest_delivery: Truck,
  lowest_moq: PackageMinus,
};

export function AwardGlyph({ award, className }: { award: AwardKey; className?: string }) {
  const Icon = ICON[award] ?? AwardIcon;
  return <Icon aria-hidden="true" className={cn("h-3.5 w-3.5 shrink-0", className)} strokeWidth={2.25} />;
}

/** Distinctions du podium (mises en avant en aplat contrasté). */
export const PODIUM_AWARDS: ReadonlySet<AwardKey> = new Set<AwardKey>(["best_opportunity", "best_value", "most_reliable"]);
