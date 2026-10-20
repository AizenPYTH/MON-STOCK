"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Copie un lien d'invitation dans le presse-papiers (aucun e-mail n'est envoyé). Si le
 * presse-papiers est refusé, le lien reste lisible et sélectionnable à côté du bouton.
 */
export function CopyLinkButton({ value, label = "Copier le lien", className }: { value: string; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
      window.setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("failed");
    }
  };
  return (
    <span className={cn("inline-flex flex-col items-end gap-1", className)}>
      <button type="button" onClick={copy} className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] border border-border-strong bg-surface px-2.5 text-[13px] font-bold text-foreground hover:bg-line-soft">
        {state === "copied" ? <Check aria-hidden="true" className="h-4 w-4 text-success" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
        {state === "copied" ? "Lien copié" : label}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {state === "copied" ? "Lien copié dans le presse-papiers." : ""}
      </span>
      {state === "failed" ? <span className="max-w-[260px] text-right text-xs font-semibold text-warning">Copie refusée par le navigateur : sélectionnez le lien et copiez-le.</span> : null}
    </span>
  );
}
