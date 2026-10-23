import { cn } from "@/lib/utils";

/**
 * Statut d'un canal (handoff v2 §E `StatusBadge`) : texte mono capitales 9–10,5 px + pastille.
 * Le statut n'est jamais porté par la seule couleur (libellé toujours présent).
 * `surface="night"` (défaut) sur la scène ; `surface="paper"` sur papier chaud ou blanc
 * (menthe jamais en texte sur fond clair ; ambre #8A5A12 sur clair).
 */
export type ChannelState = "available" | "soon" | "planned" | "running" | "connected" | "error" | "not_connected";

export const CHANNEL_STATUS_LABEL: Record<ChannelState, string> = {
  available: "DISPONIBLE",
  soon: "PROCHAINEMENT",
  planned: "PRÉVU · PAS DE DATE",
  running: "EN COURS",
  connected: "CONNECTÉ",
  error: "ERREUR",
  not_connected: "NON CONNECTÉ",
};

const NIGHT: Record<ChannelState, string> = {
  available: "bg-mint text-night border-mint",
  soon: "border-amber/45 bg-amber/10 text-amber",
  planned: "border-on-night/20 text-on-night-muted",
  running: "border-on-night/25 bg-on-night/6 text-on-night",
  connected: "border-mint/60 bg-mint/10 text-mint",
  error: "border-danger-on-night/50 bg-danger-on-night/10 text-danger-on-night",
  not_connected: "border-dashed border-on-night/25 text-on-night-muted",
};

const PAPER: Record<ChannelState, string> = {
  available: "bg-mint text-night border-mint",
  soon: "border-[#F0DDBB] bg-[#FBF1E2] text-[#8A5A12]",
  planned: "border-paper-marketing-rule-strong text-[#5B6676]",
  running: "border-[#CDDBF2] bg-[#EAF0FB] text-[#24518F]",
  connected: "border-[#BFE3D2] bg-[#E3F8EE] text-[#1E7F57]",
  error: "border-[#F3D2D2] bg-[#FBE9E9] text-[#B03A3A]",
  not_connected: "border-dashed border-paper-marketing-rule-strong text-[#5B6676]",
};

export function ChannelStatus({ state, surface = "night", size = "md", className }: { state: ChannelState; surface?: "night" | "paper"; size?: "sm" | "md"; className?: string }) {
  const palette = surface === "night" ? NIGHT : PAPER;
  return (
    <span
      data-channel-status={state}
      className={cn(
        "inline-flex shrink-0 items-center gap-[5px] whitespace-nowrap rounded-[6px] border font-mono font-semibold uppercase leading-none tracking-[0.08em]",
        size === "sm" ? "px-[6px] py-[4px] text-[9px]" : "px-[7px] py-[5px] text-[10.5px]",
        palette[state],
        className,
      )}
    >
      <span aria-hidden="true" className={cn("block h-[5px] w-[5px] shrink-0 rounded-full", state === "available" ? "bg-night" : state === "not_connected" || state === "planned" ? "border border-current" : "bg-current", state === "running" && "mk-loop ms-pulse")} />
      {CHANNEL_STATUS_LABEL[state]}
    </span>
  );
}
