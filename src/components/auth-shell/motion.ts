import type { CSSProperties } from "react";

/**
 * Animations du parcours (handoff v2 §F) : uniquement transform et opacity, à partir des keyframes
 * globales (`globals.css` : `ms-*` du système, `mk-*` du site public). Sous « réduire les
 * animations », la règle globale ramène chaque animation à son état final, sans boucle.
 */
export const parcoursMotion = {
  /** Arrivée d'écran : y +16 → 0, opacité 0 → 1, 500 ms. */
  arrive: "mk-screen-in",
  /** Erreur : translateX ±4 px, 400 ms. */
  shake: "mk-shake",
  /** Succès : pastille scale .6 → 1, 500 ms. */
  pop: "mk-pop",
  /** Attente (étape en cours) : opacité seule. */
  breathe: "ms-pulse",
} as const;

/** Coche « tracée » : un cache se retire de gauche à droite (scaleX 1 → 0), 600 ms à 250 ms. */
export const traceStyle: CSSProperties = { animation: "mk-timebar 600ms var(--ease-instrument) 250ms both", transformOrigin: "right" };

/** Barre ou câble qui pousse depuis le bas (`psGrow` : 700 ms, délai donné). */
export function growStyle(delayMs: number): CSSProperties {
  return { animation: `ms-grow-y 700ms var(--ease-instrument) ${delayMs}ms both`, transformOrigin: "bottom" };
}
