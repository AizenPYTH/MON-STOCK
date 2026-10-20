import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/**
 * En-tête d'une section des Réglages, posé sur le papier (le titre de page « Réglages » est
 * porté par la scène) : retour optionnel, titre 20/26, description, actions à droite.
 */
export function SettingsSectionHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back ? (
          <Link href={back.href as never} className="mb-1.5 inline-flex min-h-8 items-center gap-1 rounded-lg text-[13px] font-semibold text-muted hover:text-foreground">
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            {back.label}
          </Link>
        ) : null}
        <h2 className="text-[20px] font-extrabold leading-[26px] tracking-[-0.3px] text-foreground">{title}</h2>
        {description ? <p className="mt-1 max-w-[680px] text-[13.5px] font-semibold leading-[19px] text-ink-3">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
