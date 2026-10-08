import { Children, cloneElement, isValidElement, type InputHTMLAttributes, type LabelHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const control =
  "block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 shadow-[0_1px_2px_rgba(0,0,0,0.02)] focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted aria-invalid:border-red-300 aria-invalid:focus:ring-red-200";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-sm font-medium text-foreground", className)} {...props} />;
}

/**
 * Nom accessible de repli : un champ sans <label> associé (filtres compacts) reprend son
 * placeholder comme `aria-label`, pour ne jamais être annoncé comme « champ sans nom ».
 */
function fallbackLabel(props: { id?: string; placeholder?: string; "aria-label"?: string; "aria-labelledby"?: string }): string | undefined {
  if (props["aria-label"] || props["aria-labelledby"] || props.id) return props["aria-label"];
  return props.placeholder;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "h-9", className)} {...props} aria-label={fallbackLabel(props)} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "min-h-20", className)} {...props} aria-label={fallbackLabel(props)} />;
}

/** Filtre compact `<option value="">Marque</option>` : son texte sert de nom accessible de repli. */
function emptyOptionText(children: ReactNode): string | undefined {
  const first = Children.toArray(children)[0];
  if (!isValidElement<{ value?: unknown; children?: unknown }>(first) || first.type !== "option") return undefined;
  return first.props.value === "" && typeof first.props.children === "string" ? first.props.children : undefined;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const label = props["aria-label"] || props["aria-labelledby"] || props.id ? props["aria-label"] : emptyOptionText(children);
  return (
    <select className={cn(control, "h-9 pr-8", className)} {...props} aria-label={label}>
      {children}
    </select>
  );
}

export function Checkbox({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="checkbox" className={cn("h-4 w-4 rounded border-border accent-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)} {...props} />;
}

/**
 * Champ étiqueté. L'astérisque « obligatoire » s'affiche avec `required` ou automatiquement
 * si le contrôle enfant porte l'attribut `required`. En cas d'erreur, le contrôle enfant
 * reçoit `aria-invalid` et `aria-describedby` (messages annoncés via `role="alert"`).
 */
export function Field({ label, htmlFor, hint, error, children, className, required }: { label: ReactNode; htmlFor?: string; hint?: ReactNode; error?: string[] | string | undefined; children: ReactNode; className?: string; required?: boolean }) {
  const errs = Array.isArray(error) ? error : error ? [error] : [];
  const hintId = htmlFor && hint && errs.length === 0 ? `${htmlFor}-hint` : undefined;
  const errorId = htmlFor && errs.length > 0 ? `${htmlFor}-error` : undefined;
  const child = isValidElement<{ required?: boolean; "aria-invalid"?: unknown; "aria-describedby"?: string }>(children) ? children : null;
  const isRequired = required ?? child?.props.required === true;
  const describedBy = [child?.props["aria-describedby"], errorId ?? hintId].filter(Boolean).join(" ") || undefined;
  const fieldControl = child && (errorId || hintId) ? cloneElement(child, { "aria-describedby": describedBy, ...(errorId ? { "aria-invalid": true } : {}) }) : children;
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {isRequired ? (
          <>
            <span aria-hidden="true" className="ml-0.5 text-danger">
              *
            </span>
            <span className="sr-only"> (obligatoire)</span>
          </>
        ) : null}
      </Label>
      {fieldControl}
      {hint && errs.length === 0 ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {errs.length > 0 ? (
        <div id={errorId} role="alert" className="space-y-0.5">
          {errs.map((e) => (
            <p key={e} className="text-xs text-danger">
              {e}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function FormError({ message, action }: { message?: string | null; action?: { label: string; href: string } }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-danger-soft px-3 py-2 text-sm text-red-700">
      <span>{message}</span>
      {action ? (
        <Link href={action.href as never} className="font-medium underline underline-offset-2 hover:text-red-900">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export function FormSuccess({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="status" className="rounded-lg border border-green-200 bg-success-soft px-3 py-2 text-sm text-green-700">
      {message}
    </div>
  );
}
