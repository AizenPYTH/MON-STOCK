"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { prefersReducedMotion, subscribeScroll, watchMedia, REDUCED_MOTION_QUERY } from "@/components/marketing/motion";

/**
 * Couche de parallaxe (handoff v2 §F « Parallaxe du champ ») : translateY = défilement × `factor`,
 * compté à partir du moment où le champ entre dans l'écran (pour le hero : dès le haut de page).
 * Abonnée à l'écouteur de défilement unique ; écrit `style.transform` via une ref. Désactivée sous
 * « réduire les animations ».
 */
export function ParallaxLayer({ factor = 0.14, className, children }: { factor?: number; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    let unsubscribe: (() => void) | null = null;
    let start = 0;
    let lastVw = -1;

    const stop = () => {
      unsubscribe?.();
      unsubscribe = null;
      el.style.transform = "";
    };
    const startLoop = () => {
      if (unsubscribe) return;
      unsubscribe = subscribeScroll(({ y, vh, vw }) => {
        if (vw !== lastVw) {
          lastVw = vw;
          const top = host.getBoundingClientRect().top + window.scrollY;
          start = Math.max(0, top - vh);
        }
        const t = Math.max(0, y - start);
        el.style.transform = `translate3d(0, ${(t * factor).toFixed(1)}px, 0)`;
      });
    };

    const unwatch = watchMedia(REDUCED_MOTION_QUERY, (reduce) => (reduce ? stop() : startLoop()));
    if (!prefersReducedMotion()) startLoop();
    return () => {
      unwatch();
      stop();
    };
  }, [factor]);

  return (
    <div ref={ref} className={className} style={{ willChange: "transform" }}>
      {children}
    </div>
  );
}
