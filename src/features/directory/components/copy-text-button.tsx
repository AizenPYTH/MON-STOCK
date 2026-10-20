"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Copie un texte dans le presse-papiers (e-mail de demande d'accès prêt à envoyer). */
export function CopyButton({ text, label = "Copier", copiedLabel = "Copié", className, wrapperClassName }: { text: string; label?: string; copiedLabel?: string; className?: string; wrapperClassName?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
      window.setTimeout(() => setState("idle"), 2500);
    } catch {
      setState("failed");
    }
  };
  return (
    <span className={cn("inline-flex flex-col gap-1", wrapperClassName)}>
      <Button variant="secondary" onClick={() => void copy()} className={className}>
        {state === "copied" ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
        {state === "copied" ? copiedLabel : label}
      </Button>
      <span role="status" aria-live="polite" className="text-xs font-semibold text-danger empty:hidden">
        {state === "failed" ? "Copie impossible : sélectionnez le texte puis copiez-le." : ""}
      </span>
    </span>
  );
}
