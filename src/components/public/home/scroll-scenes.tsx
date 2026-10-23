"use client";

import { useEffect } from "react";
import { clamp01, easeInOut, lerp, range, subscribeScroll, watchMedia, REDUCED_MOTION_QUERY } from "@/components/marketing/motion";

/** Scène collante active seulement ≥ 1000 px ET mouvement autorisé (handoff v2 §C.4). */
export const CHAOS_QUERY = "(min-width: 1000px) and (prefers-reduced-motion: no-preference)";

type Scrub = { root: HTMLElement; words: HTMLElement[] };
type Chaos = { root: HTMLElement; stage: HTMLElement | null; cards: { el: HTMLElement; x: number; y: number; r: number }[]; fiche: HTMLElement | null; a: HTMLElement | null; b: HTMLElement | null; bar: HTMLElement | null };
type Tilt = { root: HTMLElement; target: HTMLElement };
type Line = { root: HTMLElement; fill: HTMLElement };

/**
 * Scènes pilotées au défilement de l'accueil (handoff v2 §F, §I « ScrollScenes ») : énoncé mot à mot,
 * avant/après collant, fenêtre démo qui se redresse, ligne de progression « Démarrer ».
 * Le balisage est rendu côté serveur (attributs data-*) ; ce contrôleur s'abonne à l'écouteur de
 * défilement unique et écrit `style.transform` / `style.opacity` via les éléments. Aucun setState.
 * Sous « réduire les animations » : états finaux, aucun abonnement.
 */
export function ScrollScenes() {
  useEffect(() => {
    const q = <T extends HTMLElement>(root: ParentNode, sel: string) => Array.from(root.querySelectorAll<T>(sel));
    const scrubs: Scrub[] = q(document, '[data-scene="scrub"]').map((root) => ({ root, words: q(root, "[data-w]") }));
    const chaos: Chaos[] = q(document, '[data-scene="chaos"]').map((root) => ({
      root,
      stage: root.querySelector<HTMLElement>("[data-chaos-stage]"),
      cards: q(root, "[data-chaos-card]").map((el) => ({ el, x: Number(el.dataset.x ?? 0), y: Number(el.dataset.y ?? 0), r: Number(el.dataset.rot ?? 0) })),
      fiche: root.querySelector<HTMLElement>("[data-chaos-fiche]"),
      a: root.querySelector<HTMLElement>("[data-chaos-a]"),
      b: root.querySelector<HTMLElement>("[data-chaos-b]"),
      bar: root.querySelector<HTMLElement>("[data-chaos-bar]"),
    }));
    const tilts: Tilt[] = q(document, '[data-scene="tilt"]').flatMap((root) => {
      const target = root.querySelector<HTMLElement>("[data-tilt-target]");
      return target ? [{ root, target }] : [];
    });
    const lines: Line[] = q(document, '[data-scene="line"]').flatMap((root) => {
      const fill = root.querySelector<HTMLElement>("[data-line-fill]");
      return fill ? [{ root, fill }] : [];
    });

    let chaosActive = false;
    let reduced = false;
    let off: (() => void) | null = null;

    const resetChaos = () => {
      for (const c of chaos) {
        for (const card of c.cards) {
          card.el.style.transform = "";
          card.el.style.opacity = "";
        }
        for (const el of [c.fiche, c.a, c.b, c.bar]) {
          if (!el) continue;
          el.style.transform = "";
          el.style.opacity = "";
        }
      }
    };

    const finalState = () => {
      for (const s of scrubs) for (const w of s.words) w.style.opacity = "";
      for (const t of tilts) t.target.style.transform = "";
      for (const l of lines) l.fill.style.transform = "";
      resetChaos();
    };

    const frame = ({ vh }: { y: number; vh: number }) => {
      // Lectures d'abord (rectangles), écritures ensuite.
      const scrubRects = scrubs.map((s) => s.root.getBoundingClientRect());
      const chaosRects = chaosActive ? chaos.map((c) => c.root.getBoundingClientRect()) : [];
      // Décalages (±190, ±150) réduits si la colonne est étroite (aucun débordement à 1 000–1 280 px).
      const chaosK = chaosActive ? chaos.map((c) => Math.min(1, (c.stage?.clientWidth ?? 640) / 640)) : [];
      const tiltRects = tilts.map((t) => t.root.getBoundingClientRect());
      const lineRects = lines.map((l) => l.root.getBoundingClientRect());

      // Énoncé : progression = (0,88 vh − top) / (0,55 vh) ; fenêtre glissante de 4 mots ; .14 → 1.
      scrubs.forEach((s, k) => {
        const p = clamp01((0.88 * vh - scrubRects[k]!.top) / (0.55 * vh));
        const n = s.words.length;
        const head = p * (n + 4);
        s.words.forEach((w, i) => {
          const o = 0.14 + 0.86 * clamp01((head - i) / 4);
          w.style.opacity = o.toFixed(3);
        });
      });

      // Avant/après : progression 0 → 1 sur la hauteur de la piste (300 vh − 100 vh).
      chaos.forEach((c, k) => {
        if (!chaosActive) return;
        const r = chaosRects[k]!;
        const p = clamp01(-r.top / Math.max(1, r.height - vh));
        const e = easeInOut(clamp01(p / 0.6));
        const fade = 1 - range(p, 0.5, 0.72);
        const kx = chaosK[k]!;
        for (const card of c.cards) {
          card.el.style.transform = `translate3d(${lerp(card.x * kx, 0, e).toFixed(1)}px, ${lerp(card.y, 0, e).toFixed(1)}px, 0) rotate(${lerp(card.r, 0, e).toFixed(2)}deg) scale(${lerp(1, 0.94, e).toFixed(3)})`;
          card.el.style.opacity = fade.toFixed(3);
        }
        if (c.fiche) {
          const f = range(p, 0.55, 0.8);
          c.fiche.style.opacity = f.toFixed(3);
          c.fiche.style.transform = `scale(${lerp(0.94, 1, f).toFixed(3)})`;
        }
        // Texte A → B entre .38 et .66 : A sort d'abord, B entre ensuite (jamais superposés lisiblement).
        const t = range(p, 0.38, 0.66);
        const ta = range(t, 0, 0.5);
        const tb = range(t, 0.5, 1);
        if (c.a) {
          c.a.style.opacity = (1 - ta).toFixed(3);
          c.a.style.transform = `translateY(${(-24 * ta).toFixed(1)}px)`;
        }
        if (c.b) {
          c.b.style.opacity = tb.toFixed(3);
          c.b.style.transform = `translateY(${(24 * (1 - tb)).toFixed(1)}px)`;
        }
        if (c.bar) c.bar.style.transform = `scaleX(${p.toFixed(4)})`;
      });

      // Fenêtre démo : perspective(2000px) rotateX(12°) scale(.95) → none ; progression (vh − top) / (0,85 vh).
      tilts.forEach((t, k) => {
        const p = clamp01((vh - tiltRects[k]!.top) / (0.85 * vh));
        t.target.style.transform = p >= 1 ? "none" : `perspective(2000px) rotateX(${(12 * (1 - p)).toFixed(3)}deg) scale(${lerp(0.95, 1, p).toFixed(4)})`;
      });

      // Ligne « Démarrer » : progression (0,85 vh − top) / (0,45 vh).
      lines.forEach((l, k) => {
        const p = clamp01((0.85 * vh - lineRects[k]!.top) / (0.45 * vh));
        l.fill.style.transform = `scaleX(${p.toFixed(4)})`;
      });
    };

    const apply = () => {
      off?.();
      off = null;
      if (reduced) {
        finalState();
        return;
      }
      if (!chaosActive) resetChaos();
      off = subscribeScroll(frame);
    };

    const unReduced = watchMedia(REDUCED_MOTION_QUERY, (r) => {
      reduced = r;
      apply();
    });
    const unChaos = watchMedia(CHAOS_QUERY, (m) => {
      chaosActive = m;
      apply();
    });
    return () => {
      unReduced();
      unChaos();
      off?.();
    };
  }, []);

  return null;
}
