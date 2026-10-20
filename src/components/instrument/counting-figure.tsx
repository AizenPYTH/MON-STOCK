"use client";
import { useEffect, useState } from "react";
import { StageFigure, type FigureSize } from "@/components/instrument/figure";
import { formatMoney } from "@/lib/format";

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * Chiffre de scène qui compte de 0 à sa valeur (600 ms, sortie cubique) ; immédiat si
 * l'utilisateur demande de réduire les animations. Le lecteur d'écran lit la valeur finale.
 * `amount` inconnu → « — ». Depuis une page serveur, passer `currency` (+ `decimals`) plutôt
 * qu'une fonction `format` (non transmissible à un composant client).
 */
export function CountingFigure({ amount, format, currency, decimals = 0, size = "xl", onNight = true }: { amount: number | null; format?: (n: number) => string; currency?: string; decimals?: number; size?: FigureSize; onNight?: boolean }) {
  const fmt = format ?? ((n: number) => (currency ? formatMoney(n, currency, { decimals }) : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: decimals }).format(n)));
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
  const final = fmt(amount);
  return (
    <span aria-label={final} role="img">
      <span aria-hidden="true">
        <StageFigure value={shown === null ? final : fmt(shown)} size={size} onNight={onNight} />
      </span>
    </span>
  );
}
