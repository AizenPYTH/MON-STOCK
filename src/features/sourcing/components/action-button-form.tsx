"use client";
import { useActionState, type ReactNode } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ButtonProps } from "@/components/ui/button";
import type { ActionResult } from "@/lib/result";
import { cn } from "@/lib/utils";

export type MessageResult = ActionResult<{ message: string }>;

/**
 * Formulaire « un bouton » autour d'une Server Action qui retourne un ActionResult : champs cachés,
 * bouton de soumission, puis retour lisible (erreur en français — session expirée, rôle lecture
 * seule… — ou confirmation). Jamais de page d'erreur générique.
 */
export function ActionButtonForm({
  action,
  fields = {},
  children,
  variant = "secondary",
  size = "sm",
  pendingText,
  confirmMessage,
  buttonClassName,
  className,
  before,
  showSuccess = false,
}: {
  action: (prev: MessageResult | null, formData: FormData) => Promise<MessageResult>;
  fields?: Record<string, string>;
  children: ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  pendingText?: string;
  confirmMessage?: string;
  buttonClassName?: string;
  className?: string;
  /** contenu affiché avant le bouton (texte explicatif) */
  before?: ReactNode;
  showSuccess?: boolean;
}) {
  const [state, formAction] = useActionState<MessageResult | null, FormData>(action, null);
  return (
    <form action={formAction} className={cn("space-y-1", className)}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className={before ? "flex items-center justify-between gap-3 text-sm" : "inline-flex"}>
        {before}
        <SubmitButton variant={variant} size={size} pendingText={pendingText} confirmMessage={confirmMessage} className={buttonClassName}>
          {children}
        </SubmitButton>
      </div>
      {state && !state.ok ? (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      ) : null}
      {state?.ok && showSuccess ? (
        <p role="status" className="text-xs text-success">
          {state.data.message}
        </p>
      ) : null}
    </form>
  );
}
