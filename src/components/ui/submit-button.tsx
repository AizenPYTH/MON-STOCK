"use client";
import type { MouseEvent } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * Bouton de soumission d'une Server Action : désactivé + indicateur pendant l'envoi.
 * `confirmMessage` demande une confirmation explicite (actions destructives) avant l'envoi.
 */
export function SubmitButton({ children, pendingText, confirmMessage, onClick, ...props }: ButtonProps & { pendingText?: string; confirmMessage?: string }) {
  const { pending } = useFormStatus();
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (confirmMessage && !window.confirm(confirmMessage)) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };
  return (
    <Button type="submit" {...props} onClick={handleClick} disabled={pending || props.disabled} aria-busy={pending || undefined}>
      {pending ? (
        <>
          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
          {pendingText ?? children}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
