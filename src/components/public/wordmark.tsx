import { cn } from "@/lib/utils";

/** Mot-symbole MON STOCK : 5 barres (code-barres) + nom en capitales espacées (charte v5). */
export function Wordmark({ className, tone = "night" }: { className?: string; tone?: "night" | "light" }) {
  const ink = tone === "night" ? "text-on-night" : "text-foreground";
  return (
    <span className={cn("inline-flex items-center gap-2.5", ink, className)}>
      <svg aria-hidden="true" viewBox="0 0 22 18" className="h-[18px] w-[22px]" fill="currentColor">
        <rect x="0" y="0" width="3" height="18" rx="1" />
        <rect x="5" y="0" width="2" height="18" rx="1" />
        <rect x="9" y="0" width="4" height="18" rx="1" />
        <rect x="15" y="0" width="2" height="18" rx="1" />
        <rect x="19" y="0" width="3" height="18" rx="1" fill="var(--mint)" />
      </svg>
      <span className="whitespace-nowrap text-[15px] font-extrabold tracking-[0.18em]">MON STOCK</span>
    </span>
  );
}
