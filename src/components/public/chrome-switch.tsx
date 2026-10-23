"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Habillage du groupe (public) : l'accueil a son en-tête flottant et son pied nuit (handoff v2 §C) ;
 * les pages légales et le support gardent l'en-tête et le pied existants. Les deux variantes sont
 * rendues côté serveur ; ce commutateur ne fait que choisir selon le chemin.
 */
export function ChromeSwitch({ home, other }: { home: ReactNode; other: ReactNode }) {
  return usePathname() === "/" ? home : other;
}
