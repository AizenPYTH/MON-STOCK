import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Bouton-lien du site public (handoff v2 §E `Button`) : 56 px de haut (`lg`), rayon 14.
 * Variantes : `primary` (menthe, sur nuit) · `glass` (voile clair, sur nuit, sans backdrop-filter) ·
 * `ink` (encre, sur menthe) · `outline` (contour encre, sur menthe ou papier).
 * Survol (souris) : y −2 et fond « pressed », 300 ms ; sous « réduire les animations » : couleur seule.
 * Les liens vers /signup et /login n'ont jamais de préchargement (redirections selon la session).
 */
export type CtaVariant = "primary" | "glass" | "ink" | "outline";

const VARIANT: Record<CtaVariant, string> = {
  primary: "bg-mint text-night hover:bg-mint-pressed focus-visible:outline-mint",
  glass: "border border-on-night/16 bg-on-night/8 text-on-night hover:bg-on-night/14 focus-visible:outline-mint",
  ink: "bg-night text-on-night hover:bg-[#22324A] focus-visible:outline-night",
  outline: "border-[1.5px] border-night/80 text-night hover:bg-night/6 focus-visible:outline-night",
};

export function ctaClasses(variant: CtaVariant = "primary", size: "lg" | "md" = "lg") {
  return cn(
    "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[14px] font-extrabold tracking-[-0.01em] transition-[transform,background-color] duration-300 ease-[cubic-bezier(.22,1,.36,1)] focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:[@media(hover:hover)]:hover:-translate-y-0.5",
    size === "lg" ? "h-14 px-6 text-[16px]" : "h-11 px-4 text-[14.5px]",
    VARIANT[variant],
  );
}

export function CtaLink({ href, variant = "primary", size = "lg", className, children }: { href: string; variant?: CtaVariant; size?: "lg" | "md"; className?: string; children: ReactNode }) {
  const internal = href.startsWith("/") && !href.startsWith("//");
  if (!internal || href.startsWith("/#") || href.startsWith("#")) {
    return (
      <a href={href} className={cn(ctaClasses(variant, size), className)}>
        {children}
      </a>
    );
  }
  return (
    // prefetch={false} : /login, /signup (et l'app) redirigent selon l'état du compte.
    <Link href={href as Route} prefetch={false} className={cn(ctaClasses(variant, size), className)}>
      {children}
    </Link>
  );
}
