import { initials } from "@/components/instrument/pure";
import { supplierLogoUrl } from "@/features/directory/logos";
import { cn } from "@/lib/utils";

/**
 * Pastille d'identification d'un fournisseur (logo embarqué depuis public/supplier-logos, sinon
 * initiales) — identification uniquement, aucun partenariat.
 */
export function SupplierMark({ name, size = 38, className }: { name: string; size?: 34 | 38; className?: string }) {
  const logo = supplierLogoUrl(null, name);
  return (
    <span aria-hidden="true" className={cn("flex shrink-0 items-center justify-center overflow-hidden border border-border bg-surface text-[11px] font-extrabold text-muted", size === 38 ? "h-[38px] w-[38px] rounded-[11px]" : "h-[34px] w-[34px] rounded-[10px]", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- petite icône statique servie depuis public/ */}
      {logo ? <img src={logo} alt="" loading="lazy" decoding="async" className={size === 38 ? "h-[27px] w-[27px] object-contain" : "h-6 w-6 object-contain"} /> : initials(name)}
    </span>
  );
}
