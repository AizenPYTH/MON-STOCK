/**
 * Moteur de mouvement du site public (handoff v2 §F) : UN SEUL écouteur `scroll` passif, cadencé par
 * requestAnimationFrame, partagé par tous les effets (parallaxe, énoncé, avant/après, fenêtres).
 * Les abonnés écrivent directement `style.transform` / `style.opacity` via leurs refs : jamais de
 * setState au défilement. Côté client uniquement (appelé depuis des effets).
 */

export type ScrollFrame = { y: number; vh: number; vw: number };
type Subscriber = (frame: ScrollFrame) => void;

const subscribers = new Set<Subscriber>();
let frameId = 0;
let attached = false;

function flush() {
  frameId = 0;
  const frame = { y: window.scrollY, vh: window.innerHeight, vw: window.innerWidth };
  for (const fn of subscribers) fn(frame);
}

function schedule() {
  if (!frameId) frameId = requestAnimationFrame(flush);
}

/** Abonne `fn` au défilement (et au redimensionnement). Appelé une première fois au prochain frame. */
export function subscribeScroll(fn: Subscriber): () => void {
  subscribers.add(fn);
  if (!attached) {
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    attached = true;
  }
  schedule();
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0 && attached) {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      attached = false;
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
    }
  };
}

/** Force un recalcul au prochain frame (ex. après un changement de mode). */
export function requestScrollFrame() {
  if (typeof window !== "undefined" && subscribers.size > 0) schedule();
}

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** Suit une media query ; renvoie la fonction de désabonnement. */
export function watchMedia(query: string, fn: (matches: boolean) => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia(query);
  const handler = () => fn(mql.matches);
  handler();
  mql.addEventListener("change", handler);
  return () => mql.removeEventListener("change", handler);
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
/** Progression locale de `p` entre `a` et `b` (0 avant, 1 après). */
export const range = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
