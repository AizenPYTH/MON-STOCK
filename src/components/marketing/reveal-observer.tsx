"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { prefersReducedMotion } from "@/components/marketing/motion";

const SELECTOR = "[data-r]:not(.in), [data-g]:not(.in), [data-gx]:not(.in)";

/**
 * Observateur de révélation UNIQUE (handoff v2 §F) : ajoute `.in` aux éléments `data-r` (fondu +
 * montée), `data-g` (barre verticale) et `data-gx` (barre horizontale) quand ils entrent dans l'écran
 * (seuil 10 %, marge basse −5 %). Délai par élément : variable CSS `--d`.
 * Sans JS, tout est visible (le masquage n'existe que sous `:root[data-mk-reveal]`). Ce qui est déjà
 * à l'écran au montage est révélé immédiatement ; sous « réduire les animations », tout est révélé.
 * À monter une fois par page (ou dans un layout : il se relance à chaque navigation).
 */
export function RevealObserver() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR));
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
      for (const el of nodes) el.classList.add("in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -5% 0px" },
    );
    const vh = window.innerHeight;
    for (const el of nodes) {
      const r = el.getBoundingClientRect();
      // Déjà visible au montage : pas de masquage (évite un clignotement au-dessus de la ligne de flottaison).
      if (r.top < vh * 0.95 && r.bottom > 0) el.classList.add("in");
      else io.observe(el);
    }
    root.setAttribute("data-mk-reveal", "");
    return () => {
      io.disconnect();
      root.removeAttribute("data-mk-reveal");
    };
  }, [pathname]);

  return null;
}
