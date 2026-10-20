import { initialsOf } from "@/domain/sourcing/pro-accounts";
import { supplierLogoUrl } from "@/features/directory/logos";
import { cn } from "@/lib/utils";

const SIZES = { sm: "h-7 w-7 text-[10px]", md: "h-10 w-10 text-xs", lg: "h-14 w-14 text-base" } as const;

/**
 * Pastille d'identification d'un fournisseur : son icône officielle (récupérée sur SON site, servie
 * par MON STOCK depuis public/supplier-logos — aucun appel à un service tiers à l'affichage), sinon ses
 * initiales. Les logos restent la propriété de leurs titulaires et n'indiquent aucun partenariat.
 */
export function SupplierBadge({ name, domain, size = "md", className }: { name: string; domain?: string | null; size?: keyof typeof SIZES; className?: string }) {
  const logo = supplierLogoUrl(domain, name);
  return (
    <span aria-hidden="true" className={cn("inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-lg border border-border font-semibold text-muted-strong", logo ? "bg-white" : "bg-surface-muted", SIZES[size], className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- petite icône statique déjà optimisée, servie depuis public/ */}
      {logo ? <img src={logo} alt="" loading="lazy" decoding="async" className="h-[72%] w-[72%] object-contain" /> : initialsOf(name)}
    </span>
  );
}
