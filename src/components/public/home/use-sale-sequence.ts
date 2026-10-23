"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { prefersReducedMotion, watchMedia, REDUCED_MOTION_QUERY, easeOutCubic } from "@/components/marketing/motion";
import { AUTOSTART_AFTER, RESET_AT, RESTART_AFTER, STEP_AT } from "@/components/public/home/sale-data";

/**
 * Minuteur de la vente d'exemple (handoff v2 §C0 « Séquence ») : étapes 0 → 5 à 500, 1 600, 2 400,
 * 3 100 et 4 000 ms. Les changements d'étape passent par l'état React (quelques fois par vente,
 * jamais au défilement).
 *
 * `auto` (hero) : boucle tant que la cible est visible à 12 % au moins (IntersectionObserver),
 * démarrage 1 800 ms après l'entrée, remise à zéro à 9 400 ms et reprise 1 500 ms plus tard.
 * Hors écran ou onglet caché : arrêt et retour à l'état 0. Jamais de boucle sous « réduire les
 * animations » : lecture au clic uniquement. `play()` rejoue depuis 0 (anti-double-clic 400 ms).
 */
export function useSaleSequence({ auto, targetRef }: { auto: boolean; targetRef?: RefObject<HTMLElement | null> }) {
  const [step, setStep] = useState(0);
  const [run, setRun] = useState(0);
  const timers = useRef<number[]>([]);
  const lastPlay = useRef(Number.NEGATIVE_INFINITY);
  const visible = useRef(false);
  const reduced = useRef(false);

  const clear = useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  const loopable = useCallback(() => auto && visible.current && !reduced.current && !document.hidden, [auto]);

  const startRef = useRef<() => void>(() => {});
  const start = useCallback(() => {
    clear();
    setStep(0);
    setRun((r) => r + 1);
    STEP_AT.forEach((ms, i) => schedule(() => setStep(i + 1), ms));
    schedule(() => {
      if (!loopable()) return;
      setStep(0);
      schedule(() => {
        if (loopable()) startRef.current();
      }, RESTART_AFTER);
    }, RESET_AT);
  }, [clear, schedule, loopable]);
  useEffect(() => {
    startRef.current = start;
  }, [start]);

  const stop = useCallback(() => {
    clear();
    setStep(0);
  }, [clear]);

  const play = useCallback(() => {
    const now = performance.now();
    if (now - lastPlay.current < 400) return;
    lastPlay.current = now;
    start();
  }, [start]);

  useEffect(() => {
    reduced.current = prefersReducedMotion();
    const unwatch = watchMedia(REDUCED_MOTION_QUERY, (r) => {
      reduced.current = r;
      if (r && auto) stop();
    });
    return unwatch;
  }, [auto, stop]);

  useEffect(() => {
    if (!auto) return;
    const el = targetRef?.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const v = !!entry?.isIntersecting;
        if (v === visible.current) return;
        visible.current = v;
        clear();
        if (!v) setStep(0);
        else if (loopable()) schedule(() => loopable() && start(), AUTOSTART_AFTER);
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    const onVisibility = () => {
      if (document.hidden) stop();
      else if (loopable()) schedule(() => loopable() && start(), AUTOSTART_AFTER);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      clear();
    };
  }, [auto, targetRef, clear, schedule, start, stop, loopable]);

  useEffect(() => clear, [clear]);

  return { step, run, play, playing: step > 0 && step < 5, done: step === 5 };
}

/**
 * Compteur (rAF, easeOutCubic) écrit directement dans le texte d'un élément : pas de setState par frame.
 * Sous « réduire les animations » : valeur finale immédiate.
 */
export function useCountUp(ref: RefObject<HTMLElement | null>, { from, to, active, duration = 1000, format }: { from: number; to: number; active: boolean; duration?: number; format: (n: number) => string }) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!active) {
      el.textContent = format(from);
      return;
    }
    if (prefersReducedMotion()) {
      el.textContent = format(to);
      return;
    }
    let id = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / duration);
      el.textContent = format(Math.round(from + (to - from) * easeOutCubic(k)));
      if (k < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [ref, from, to, active, duration, format]);
}
