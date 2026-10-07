"use client";
import { useActionState, type ReactNode } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ButtonProps } from "@/components/ui/button";
import type { ActionResult } from "@/lib/result";
import { cn } from "@/lib/utils";

type MessageResult = ActionResult<{ message: string }>;

/** Formulaire minimal autour d'une Server Action : champs cachés + bouton + retour (erreur ou confirmation). */
export function ActionForm({
  action,
  fields = {},
  children,
  variant = "secondary",
  size = "sm",
  pendingText = "Patientez…",
  className,
  showSuccess = true,
}: {
  action: (prev: MessageResult | null, formData: FormData) => Promise<MessageResult>;
  fields?: Record<string, string>;
  children: ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  pendingText?: string;
  className?: string;
  showSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={cn("inline-flex flex-col items-start gap-1", className)}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SubmitButton variant={variant} size={size} pendingText={pendingText}>
        {children}
      </SubmitButton>
      {state && !state.ok ? (
        <span role="alert" className="text-xs text-danger">
          {state.error}
        </span>
      ) : null}
      {state?.ok && showSuccess ? (
        <span role="status" className="text-xs text-success">
          {state.data.message}
        </span>
      ) : null}
    </form>
  );
}
