import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Accent typographique (handoff v2 §A, §B) : Instrument Serif italique 400, 1,1 em du texte voisin,
 * pour 1 à 3 mots par titre. Contraste éditorial avec Manrope 800 ; la couleur suit le parent
 * (passer `className="text-mint"` sur la scène nuit uniquement).
 */
export function Accent({ children, className }: { children: ReactNode; className?: string }) {
  return <em className={cn("font-serif text-[1.1em] font-normal italic tracking-[-0.01em]", className)}>{children}</em>;
}
