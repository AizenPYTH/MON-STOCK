import { Children, cloneElement, isValidElement, type InputHTMLAttributes, type LabelHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Contrôle de saisie : contour ≥ 3:1 (WCAG 1.4.11), focus = contour bleu + halo, erreur = contour rouge.
 * Au doigt (pointer: coarse), texte 16 px pour éviter le zoom automatique d'iOS.
 */
const control =
  "block w-full rounded-xl border border-border-control bg-surface px-3 py-2 text-sm font-semibold text-foreground transition-[border-color,box-shadow] duration-150 ease-standard placeholder:font-medium placeholder:text-ink-3 hover:border-muted focus:border-ring focus:outline-none focus:ring-[3px] focus:ring-ring/25 disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-3 disabled:text-muted aria-invalid:border-danger aria-invalid:focus:ring-danger/25 pointer-coarse:text-base";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-sm font-bold text-foreground", className)} {...props} />;
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
  return <input className={cn(control, "h-10", className)} {...props} aria-label={fallbackLabel(props)} />;
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
    <select className={cn(control, "h-10 pr-8", className)} {...props} aria-label={label}>
      {children}
    </select>
  );
}

export function Checkbox({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="checkbox" className={cn("h-4 w-4 shrink-0 cursor-pointer rounded border-border-control accent-inverse disabled:cursor-not-allowed pointer-coarse:h-5 pointer-coarse:w-5", className)} {...props} />;
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
            <p key={e} className="flex items-start gap-1 text-xs font-semibold text-danger">
              <CircleAlert aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>{e}</span>
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
    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-danger-line bg-danger-soft px-3 py-2.5 text-sm font-semibold text-danger-ink">
      <span className="flex min-w-0 items-start gap-2">
        <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="min-w-0">{message}</span>
      </span>
      {action ? (
        <Link href={action.href as never} className="font-bold underline underline-offset-2 hover:no-underline">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export function FormSuccess({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="status" className="flex items-start gap-2 rounded-xl border border-success-line bg-success-soft px-3 py-2.5 text-sm font-semibold text-success-ink">
      <CircleCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0">{message}</span>
    </div>
  );
}
