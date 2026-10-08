"use client";
import { useActionState, type ReactNode } from "react";
import { FormError, FormSuccess } from "@/components/ui/form";
import type { ActionResult } from "@/lib/result";
import { cn } from "@/lib/utils";

/**
 * Formulaire minimal autour d'une Server Action : champs cachés + bouton, affichage
 * de l'erreur (avec action éventuelle, ex. « Reconnecter eBay ») ou du succès.
 */
export function ActionForm<T = void>({
  action,
  hidden,
  children,
  successMessage,
  renderSuccess,
  className,
  inline,
}: {
  action: (prev: ActionResult<T> | null, formData: FormData) => Promise<ActionResult<T>>;
  hidden?: Record<string, string>;
  children: ReactNode;
  successMessage?: string;
  renderSuccess?: (data: T) => ReactNode;
  className?: string;
  inline?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionResult<T> | null, FormData>(action, null);
  return (
    <form action={formAction} aria-busy={pending || undefined} className={cn(inline ? "inline-flex flex-col gap-2" : "space-y-2", className)}>
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {/* Pendant l'envoi, les boutons sont désactivés (retour visuel + pas de double soumission). */}
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {state && !state.ok ? <FormError message={state.error} action={state.action} /> : null}
      {state?.ok && renderSuccess ? renderSuccess(state.data) : state?.ok && successMessage ? <FormSuccess message={successMessage} /> : null}
    </form>
  );
}
