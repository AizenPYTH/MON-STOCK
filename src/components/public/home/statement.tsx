import { cn } from "@/lib/utils";

/** Mots de l'énoncé ; `glue` : pas d'espace après (élision « qu'une »). */
const WORDS: { w: string; accent?: boolean; glue?: boolean }[] = [
  ..."Vous vendez sur plusieurs canaux. Votre stock, lui, ne devrait exister".split(" ").map((w) => ({ w })),
  { w: "qu’", glue: true },
  { w: "une", accent: true },
  { w: "seule", accent: true },
  { w: "fois.", accent: true },
];

/**
 * Énoncé (handoff v2 §C.3, `ScrubStatement`) : papier chaud, 84 px (34 en mobile), chaque mot passe
 * de .14 à 1 d'opacité au défilement (fenêtre glissante de 4 mots, piloté par <ScrollScenes>).
 * Sans JS ou sous « réduire les animations » : tout est visible.
 */
export function Statement() {
  return (
    <section aria-label="Le principe" className="bg-paper-marketing">
      <div className="mx-auto w-full max-w-[1352px] px-[18px] pb-10 pt-20 min-[760px]:px-8 min-[760px]:pb-16 min-[760px]:pt-36 min-[1100px]:px-14">
        <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-[#5B6676]">Le principe</p>
        <h2 data-scene="scrub" className="mt-5 max-w-[1180px] text-balance text-[34px] font-extrabold leading-[1.04] tracking-[-0.045em] text-night min-[760px]:text-[60px] min-[1100px]:text-[84px]">
          {WORDS.map((x, i) => (
            <span key={i}>
              <span data-w="" className={cn("inline-block", x.accent && "font-serif text-[1.1em] font-normal italic tracking-[-0.01em]")}>
                {x.w}
              </span>
              {x.glue || i === WORDS.length - 1 ? null : " "}
            </span>
          ))}
        </h2>
      </div>
    </section>
  );
}
