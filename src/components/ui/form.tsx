import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const control =
  "block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-400 shadow-[0_1px_2px_rgba(0,0,0,0.02)] focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-surface-muted disabled:text-muted";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-sm font-medium text-foreground", className)} {...props} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "min-h-20", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(control, "h-9 pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="checkbox" className={cn("h-4 w-4 rounded border-border text-accent focus:ring-ring", className)} {...props} />;
}

export function Field({ label, htmlFor, hint, error, children, className }: { label: ReactNode; htmlFor?: string; hint?: ReactNode; error?: string[] | string | undefined; children: ReactNode; className?: string }) {
  const errs = Array.isArray(error) ? error : error ? [error] : [];
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && errs.length === 0 ? <p className="text-xs text-muted">{hint}</p> : null}
      {errs.map((e) => (
        <p key={e} className="text-xs text-danger">
          {e}
        </p>
      ))}
    </div>
  );
}

export function FormError({ message, action }: { message?: string | null; action?: { label: string; href: string } }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-danger-soft px-3 py-2 text-sm text-red-700">
      <span>{message}</span>
      {action ? (
        <a href={action.href} className="font-medium underline">
          {action.label}
        </a>
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
