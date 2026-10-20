import { cn } from "@/lib/utils";

/**
 * Mot-symbole MON STOCK (handoff v5) : 5 barres de 14 px (3 / 1,5 / 4 / 1,5 / 2,5 px, écart 1,5,
 * rayon 1), la 3ᵉ en menthe, puis « MON STOCK » Manrope 800 13/16, interlettrage 2,4 px.
 */
export function Wordmark({ className, tone = "night" }: { className?: string; tone?: "night" | "light" }) {
  const ink = tone === "night" ? "text-on-night" : "text-foreground";
  return (
    <span className={cn("inline-flex items-center gap-[7px]", ink, className)}>
      <svg aria-hidden="true" viewBox="0 0 18.5 14" className="h-[14px] w-[18.5px]" fill="currentColor">
        <rect x="0" y="0" width="3" height="14" rx="1" />
        <rect x="4.5" y="0" width="1.5" height="14" rx="0.75" />
        <rect x="7.5" y="0" width="4" height="14" rx="1" fill={tone === "night" ? "var(--mint)" : "currentColor"} />
        <rect x="13" y="0" width="1.5" height="14" rx="0.75" />
        <rect x="16" y="0" width="2.5" height="14" rx="1" />
      </svg>
      <span className="whitespace-nowrap text-[13px] font-extrabold leading-4 tracking-[2.4px]">MON STOCK</span>
    </span>
  );
}
