import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { ParallaxLayer } from "@/components/marketing/parallax-layer";

/**
 * Champ de barres (handoff v2 §A, §C, §F) : le code-barres du mot-symbole devenu motif.
 * Une barre = une référence. Barres « allumées » (`litRange`, menthe = eBay), barres ambre à 55 %
 * (`amber`), le reste en voile clair (`tone="night"`) ou à l'encre (`tone="ink"`, sur menthe).
 *
 * Croissance `scaleY` 0 → 1 depuis le bas (CSS `.mk-field-bar`), retard = délai + pas × distance à
 * `growFrom` (le champ « rayonne » depuis cette barre). Parallaxe optionnelle (translateY =
 * scrollY × 0,14) confiée à un petit composant client ; le reste est rendu côté serveur.
 * Décoratif : `aria-hidden`. Sous « réduire les animations » : état final, pas de parallaxe.
 */
export type BarcodeFieldProps = {
  n: number;
  seed: number;
  /** Indices (inclus) des barres allumées en menthe. */
  litRange?: [number, number];
  /** Indices des barres ambre (55 %). */
  amber?: number[];
  /** Hauteur du champ en px (≥ 760 px de large). */
  height: number;
  /** Hauteur sous 760 px (par défaut : `height`). */
  mobileHeight?: number;
  parallax?: boolean;
  /** Indice d'origine de la croissance (par défaut : centre de `litRange`, sinon 0). */
  growFrom?: number;
  className?: string;
  tone?: "night" | "ink";
  /**
   * Enveloppe facultative des hauteurs : points de contrôle 0–1 répartis sur la largeur, interpolés
   * linéairement. Sert à garder un champ bas sous un texte (ex. lead du hero).
   */
  envelope?: number[];
  /** Durée de croissance, délai initial et pas par barre (ms). Défauts : 1100 / 300 / 14. */
  growMs?: number;
  growDelayMs?: number;
  growStepMs?: number;
  /** Coefficient de parallaxe (défaut 0,14). */
  parallaxFactor?: number;
};

export type FieldBar = { i: number; left: number; width: number; height: number; kind: "base" | "lit" | "amber" };

/** Générateur pseudo-aléatoire déterministe (mulberry32) : même `seed` → même champ, serveur et client. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Largeurs du mot-symbole (3 / 1,5 / 4 / 1,5 / 2,5) : le champ en reprend le rythme. */
const WIDTHS = [3, 1.5, 4, 1.5, 2.5, 1, 2];
const GAP = 2.2;

function sampleEnvelope(env: number[], t: number): number {
  if (env.length === 0) return 1;
  if (env.length === 1) return env[0]!;
  const x = t * (env.length - 1);
  const k = Math.min(env.length - 2, Math.floor(x));
  const f = x - k;
  return env[k]! + (env[k + 1]! - env[k]!) * f;
}

/** Géométrie du champ en % (gauche, largeur, hauteur) : exportée pour aligner un élément sur une barre. */
export function barcodeFieldLayout({ n, seed, litRange, amber, envelope }: Pick<BarcodeFieldProps, "n" | "seed" | "litRange" | "amber" | "envelope">): FieldBar[] {
  const rand = rng(seed);
  const raw = Array.from({ length: n }, (_, i) => {
    const lit = !!litRange && i >= litRange[0] && i <= litRange[1];
    const w = lit ? 3.4 : WIDTHS[Math.floor(rand() * WIDTHS.length)]!;
    const r = rand();
    return { i, w, r, lit, amber: !lit && !!amber?.includes(i) };
  });
  const total = raw.reduce((s, b) => s + b.w, 0) + GAP * (n - 1);
  let x = 0;
  return raw.map((b) => {
    const left = (x / total) * 100;
    const width = (b.w / total) * 100;
    x += b.w + GAP;
    const t = n > 1 ? b.i / (n - 1) : 0;
    const env = envelope ? sampleEnvelope(envelope, t) : 1;
    const h = envelope ? env * (0.58 + 0.42 * b.r) : 0.26 + 0.74 * b.r ** 0.85;
    return { i: b.i, left, width, height: Math.max(2, Math.min(100, h * 100)), kind: b.lit ? "lit" : b.amber ? "amber" : "base" };
  });
}

/** Centre horizontal (en %) d'une plage de barres : pour poser une puce au-dessus des barres allumées. */
export function barcodeFieldCenter(props: Pick<BarcodeFieldProps, "n" | "seed" | "litRange" | "amber" | "envelope">, from: number, to: number): number {
  const bars = barcodeFieldLayout(props);
  const a = bars[Math.max(0, from)]!;
  const b = bars[Math.min(bars.length - 1, to)]!;
  return (a.left + b.left + b.width) / 2;
}

const TONES = {
  night: { base: "bg-on-night/7", lit: "bg-mint", amber: "bg-amber/55" },
  ink: { base: "bg-night/85", lit: "bg-night", amber: "bg-night/60" },
} as const;

export function BarcodeField({ n, seed, litRange, amber, height, mobileHeight, parallax = false, growFrom, className, tone = "night", envelope, growMs, growDelayMs, growStepMs, parallaxFactor = 0.14 }: BarcodeFieldProps) {
  const bars = barcodeFieldLayout({ n, seed, litRange, amber, envelope });
  const origin = growFrom ?? (litRange ? Math.round((litRange[0] + litRange[1]) / 2) : 0);
  const palette = TONES[tone];
  const style = {
    "--mk-fh": `${height}px`,
    "--mk-fh-m": `${mobileHeight ?? height}px`,
    ...(growMs != null ? { "--mk-grow-ms": `${growMs}ms` } : {}),
    ...(growDelayMs != null ? { "--mk-grow-delay": `${growDelayMs}ms` } : {}),
    ...(growStepMs != null ? { "--mk-grow-step": `${growStepMs}ms` } : {}),
  } as CSSProperties;

  const field = (
    <div className="absolute inset-0">
      {bars.map((b) => (
        <span
          key={b.i}
          className={cn("mk-field-bar absolute bottom-0 block rounded-t-[1px]", palette[b.kind])}
          style={{ left: `${b.left}%`, width: `${b.width}%`, height: `${b.height}%`, "--mk-dist": Math.abs(b.i - origin) } as CSSProperties}
        />
      ))}
    </div>
  );

  return (
    <div aria-hidden="true" data-barcode-field="" className={cn("mk-field pointer-events-none relative w-full select-none", className)} style={style}>
      {parallax ? (
        <ParallaxLayer factor={parallaxFactor} className="absolute inset-0">
          {field}
        </ParallaxLayer>
      ) : (
        field
      )}
    </div>
  );
}
