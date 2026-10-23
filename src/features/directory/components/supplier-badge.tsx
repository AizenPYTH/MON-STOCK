import { initialsOf } from "@/domain/sourcing/pro-accounts";
import { supplierLogoUrl } from "@/features/directory/logos";
import { cn } from "@/lib/utils";

/** Plaques blanches v5 : 30 (listes), 38 (rapport), 48 (cartes), 68 (fiche) ; rayon proportionnel. */
const SIZES = {
  sm: "h-[30px] w-[30px] rounded-[9px] text-[10px]",
  wall: "h-[34px] w-[34px] rounded-[10px] text-[10px]",
  md: "h-[38px] w-[38px] rounded-[11px] text-[11px]",
  lg: "h-12 w-12 rounded-[13px] text-[13px]",
  xl: "h-[68px] w-[68px] rounded-[19px] text-lg",
} as const;

/**
 * Pastille d'identification d'un fournisseur : son icône officielle (récupérée sur SON site, servie
 * par MON STOCK depuis public/supplier-logos — aucun appel à un service tiers à l'affichage), sinon ses
 * initiales. Les logos restent la propriété de leurs titulaires et n'indiquent aucun partenariat.
 */
export function SupplierBadge({ name, domain, size = "md", className }: { name: string; domain?: string | null; size?: keyof typeof SIZES; className?: string }) {
  const logo = supplierLogoUrl(domain, name);
  return (
    <span aria-hidden="true" className={cn("inline-flex shrink-0 select-none items-center justify-center overflow-hidden border border-border font-bold text-muted", /* plaque claire dans les deux thèmes : les logos officiels sont dessinés pour un fond clair */ logo ? "bg-on-night" : "bg-line-soft", SIZES[size], className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- petite icône statique déjà optimisée, servie depuis public/ */}
      {logo ? <img src={logo} alt="" loading="lazy" decoding="async" className="h-[72%] w-[72%] object-contain" /> : initialsOf(name)}
    </span>
  );
}
