import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Ligne de port (handoff v2 §A, §C.5, §E `PortRow`) : « le stock est un bus, chaque canal est un port ».
 * - `lit` : câble plein menthe, point voyageur (boucle 2,6 s, masqué sous « réduire les animations »),
 *   prise pleine contre le bus.
 * - `open` : câble pointillé qui s'arrête à 56 % de la longueur, prise ouverte, socle vide.
 * Tailles : `lg` 128 px · `md` 84 px · `sm` 64 px de haut (≥ 760 px ; empilée en dessous).
 * Le nom est du texte (Manrope) ; `logoSrc` accueillera l'asset officiel quand il sera fourni.
 * Composant serveur, conçu pour la scène nuit.
 */
export type PortRowProps = {
  name: string;
  state: "lit" | "open";
  size?: "lg" | "md" | "sm";
  /** Badge d'état (ex. <ChannelStatus state="available" />). */
  status?: ReactNode;
  /** Ligne secondaire sous le nom (rôle, précision). */
  detail?: ReactNode;
  /** Étiquette posée dans l'interruption du câble ouvert (défaut : « NON CONNECTÉ »). */
  cableLabel?: ReactNode;
  logoSrc?: string;
  as?: "li" | "div";
  className?: string;
};

const SIZE = {
  lg: { row: "md:h-[128px]", name: "text-[26px] md:text-[32px] tracking-[-0.03em]", cable: "h-[3px]", plug: "h-[30px] w-[14px]", logo: 32 },
  md: { row: "md:h-[84px]", name: "text-[19px] md:text-[22px] tracking-[-0.02em]", cable: "h-[2px]", plug: "h-[22px] w-[11px]", logo: 22 },
  sm: { row: "md:h-[64px]", name: "text-[15px] md:text-[16px] tracking-[-0.01em]", cable: "h-[2px]", plug: "h-[18px] w-[9px]", logo: 18 },
} as const;

export function PortRow({ name, state, size = "md", status, detail, cableLabel, logoSrc, as = "li", className }: PortRowProps) {
  const s = SIZE[size];
  const Tag = as;
  const lit = state === "lit";
  return (
    <Tag data-port={state} className={cn("relative grid grid-cols-1 items-center gap-x-6 gap-y-3 py-4 md:grid-cols-[minmax(200px,30%)_minmax(0,1fr)] md:py-0", s.row, className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        {logoSrc ? <Image src={logoSrc} alt={name} width={s.logo * 3} height={s.logo} unoptimized className="h-auto w-auto" style={{ maxHeight: s.logo }} /> : <span className={cn("font-extrabold leading-none", s.name, lit ? "text-on-night" : "text-on-night/80")}>{name}</span>}
        {status}
        {detail ? <span className="basis-full text-[13px] font-medium leading-[18px] text-on-night-muted">{detail}</span> : null}
      </div>

      {/* Câble + prise (décoratif ; l'état est dit par le badge et par l'étiquette). */}
      <div aria-hidden={lit ? "true" : undefined} className="relative flex h-8 items-center">
        {lit ? (
          <>
            <span className="relative flex h-[12px] flex-1 items-center overflow-x-clip">
              <span className={cn("block w-full rounded-full bg-mint", s.cable)} />
              <span className="mk-loop mk-loop-hide absolute inset-0" style={{ animation: "mk-cable-dot 2.6s cubic-bezier(.4,0,.2,1) infinite" }}>
                <span className="absolute left-0 top-1/2 block h-[7px] w-[7px] -translate-y-1/2 rounded-full bg-on-night shadow-[0_0_10px_2px_rgba(139,232,190,.7)]" />
              </span>
            </span>
            <span className={cn("block shrink-0 rounded-[3px] bg-mint", s.plug)} />
          </>
        ) : (
          <>
            <span className="relative flex w-[56%] items-center">
              <span className="block flex-1 border-t-2 border-dashed border-on-night/28" />
              <span className={cn("ml-[3px] block shrink-0 rounded-[3px] border-2 border-on-night/35", s.plug)} />
            </span>
            <span className="flex flex-1 items-center justify-center px-3">
              <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-on-night-subtle">{cableLabel ?? "NON CONNECTÉ"}</span>
            </span>
            <span className={cn("block shrink-0 rounded-[3px] border border-dashed border-on-night/22", s.plug)} />
          </>
        )}
      </div>
    </Tag>
  );
}
