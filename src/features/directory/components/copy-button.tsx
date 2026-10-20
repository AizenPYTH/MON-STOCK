"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Copie un texte dans le presse-papiers (e-mail de demande d'accès prêt à envoyer). */
export function CopyButton({ text, label = "Copier", copiedLabel = "Copié", className }: { text: string; label?: string; copiedLabel?: string; className?: string }) {
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
    <span className="inline-flex items-center gap-2">
      <Button variant="secondary" size="sm" onClick={() => void copy()} className={className}>
        {state === "copied" ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : <Copy aria-hidden="true" className="h-3.5 w-3.5" />}
        {state === "copied" ? copiedLabel : label}
      </Button>
      <span role="status" aria-live="polite" className="text-xs text-muted">
        {state === "failed" ? "Copie impossible : sélectionnez le texte puis copiez-le." : ""}
      </span>
    </span>
  );
}
