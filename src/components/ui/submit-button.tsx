"use client";
import type { MouseEvent } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * Bouton de soumission d'une Server Action : désactivé + `aria-busy` + indicateur pendant l'envoi
 * (jamais de succès affiché avant la réponse). `confirmMessage` demande une confirmation explicite
 * (actions destructives) avant l'envoi.
 */
export function SubmitButton({ children, pendingText, confirmMessage, onClick, loading, ...props }: ButtonProps & { pendingText?: string; confirmMessage?: string }) {
  const { pending } = useFormStatus();
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (confirmMessage && !window.confirm(confirmMessage)) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };
  return (
    <Button type="submit" {...props} onClick={handleClick} loading={pending || loading} loadingText={pendingText}>
      {children}
    </Button>
  );
}
