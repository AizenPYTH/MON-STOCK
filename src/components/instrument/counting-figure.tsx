"use client";
import { useEffect, useState } from "react";
import { StageFigure, type FigureSize } from "@/components/instrument/figure";

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * Chiffre de scène qui compte de 0 à sa valeur (600 ms, sortie cubique) ; immédiat si
 * l'utilisateur demande de réduire les animations. Le lecteur d'écran lit la valeur finale.
 * `amount` inconnu → « — ».
 */
export function CountingFigure({ amount, format, size = "xl", onNight = true }: { amount: number | null; format: (n: number) => string; size?: FigureSize; onNight?: boolean }) {
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (amount === null || !Number.isFinite(amount) || reducedMotion()) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 600);
      setShown(k >= 1 ? null : amount * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [amount]);
  if (amount === null || !Number.isFinite(amount)) return <StageFigure value="—" size={size} onNight={onNight} />;
  const final = format(amount);
  return (
    <span aria-label={final} role="img">
      <span aria-hidden="true">
        <StageFigure value={shown === null ? final : format(shown)} size={size} onNight={onNight} />
      </span>
    </span>
  );
}
