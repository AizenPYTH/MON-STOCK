import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Touche de raccourci (« ⌘ K », « / », « Échap »). Sur papier par défaut ; `onNight` sur la scène. */
export function Kbd({ children, onNight = false, className }: { children: ReactNode; onNight?: boolean; className?: string }) {
  return (
    <kbd
      className={cn(
        "ms-code inline-flex h-5 min-w-5 items-center justify-center whitespace-nowrap rounded-[5px] border px-1.5 text-[10.5px] leading-none",
        onNight ? "border-night-stroke text-on-night-muted" : "border-border-strong bg-surface text-muted shadow-[inset_0_-1px_0_var(--border-strong)]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
