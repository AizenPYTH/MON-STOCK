"use client";
import { useId, useState, type ReactNode } from "react";
import { AlertCircle, Copy, X } from "lucide-react";
import { sanitizeAmountInput } from "@/domain/tools/decimal";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/** Composants communs aux outils (web) : saisie de montant, choix exclusifs, résultats, copie. */

/**
 * Champ numérique : virgule française, suffixe (€, %, kg…), bouton d'effacement. La valeur reste
 * du texte : le calcul exact se fait à partir de la saisie, sans conversion flottante.
 */
export function AmountField({
  label,
  value,
  onChange,
  suffix,
  error,
  hint,
  large = false,
  placeholder = "0,00",
  allowNegative = false,
  disabled,
  onFocus,
  autoFocus,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  error?: string;
  hint?: ReactNode;
  large?: boolean;
  placeholder?: string;
  allowNegative?: boolean;
  disabled?: boolean;
  onFocus?: () => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("space-y-1", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <div className={cn("flex items-center rounded-lg border bg-surface pr-2 focus-within:ring-2 focus-within:ring-ring", error ? "border-red-300" : "border-border")}>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(sanitizeAmountInput(e.target.value, allowNegative))}
          onFocus={onFocus}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn("min-w-0 flex-1 rounded-lg bg-transparent px-3 font-semibold text-foreground tnum placeholder:font-normal placeholder:text-zinc-500 focus:outline-none disabled:cursor-not-allowed", large ? "h-14 text-2xl" : "h-10 text-base")}
        />
        {suffix ? <span className="mr-2 text-sm text-muted">{suffix}</span> : null}
        {value && !disabled ? (
          <button type="button" onClick={() => onChange("")} aria-label={`Effacer ${label}`} className="rounded-full p-1 text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {error ? <AlertCircle aria-hidden="true" className="ml-1 h-4 w-4 text-danger" /> : null}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Choix exclusif sous forme de pastilles (taux, régime, mode…) : boutons bascule, un seul enfoncé. */
export function ChoiceChips<T extends string | number | boolean | null>({ options, value, onChange, label, size = "md" }: { options: { value: T; label: string; a11y?: string }[]; value: T; onChange: (v: T) => void; label?: string; size?: "md" | "lg" }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      {label ? (
        <div id={id} className="text-sm font-medium text-foreground">
          {label}
        </div>
      ) : null}
      <div role="group" aria-labelledby={label ? id : undefined} className="flex flex-wrap gap-2">
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <button
              key={String(o.value)}
              type="button"
              aria-pressed={selected}
              aria-label={o.a11y}
              onClick={() => onChange(o.value)}
              className={cn(
                "rounded-full border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                size === "lg" ? "px-4 py-2 text-sm" : "px-3 py-1 text-sm",
                selected ? "border-night bg-night text-on-night" : "border-border bg-surface text-muted-strong hover:bg-surface-muted",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type ResultKind = "input" | "estimate" | "total" | "muted";

export interface ResultLine {
  label: string;
  value: string;
  kind?: ResultKind;
  note?: string;
}

/** Ligne de résultat : les données saisies sont marquées « saisi », les valeurs calculées non. */
function ResultRow({ line }: { line: ResultLine }) {
  const kind = line.kind ?? "estimate";
  const total = kind === "total";
  return (
    <div className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <dt className={cn("flex flex-wrap items-center gap-2", total ? "font-semibold text-foreground" : kind === "muted" ? "text-muted" : "text-muted-strong")}>
          {line.label}
          {kind === "input" ? <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-strong">saisi</span> : null}
        </dt>
        <dd className={cn("text-right tnum", total ? "text-lg font-semibold text-foreground" : kind === "muted" ? "text-muted" : "font-medium text-foreground")}>{line.value}</dd>
      </div>
      {line.note ? <p className="mt-0.5 text-xs text-muted">{line.note}</p> : null}
    </div>
  );
}

export function ResultCard({ title, lines, copyText, children }: { title?: string; lines: ResultLine[]; copyText?: string; children?: ReactNode }) {
  return (
    <Card className="px-5 py-3">
      {title || copyText ? (
        <div className="mb-1 flex items-center justify-between gap-2">
          {title ? <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3> : <span />}
          {copyText ? <CopyButton text={copyText} /> : null}
        </div>
      ) : null}
      <dl className="divide-y divide-border">
        {lines.map((l, i) => (
          <ResultRow key={`${l.label}-${i}`} line={l} />
        ))}
      </dl>
      {children}
    </Card>
  );
}

export function CopyButton({ text, label = "Copier", disabled }: { text: string; label?: string; disabled?: boolean }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label === "Copier" ? "Copier les résultats" : label}
      onClick={() => {
        if (!navigator.clipboard) return toast.error("Copie impossible dans ce navigateur.");
        navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true);
            toast.success("Résultats copiés.");
            window.setTimeout(() => setCopied(false), 1800);
          },
          () => toast.error("Copie impossible dans ce navigateur."),
        );
      }}
      className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3 py-1 text-xs font-medium text-foreground hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      <Copy aria-hidden="true" className="h-3.5 w-3.5" />
      {copied ? "Copié" : label}
    </button>
  );
}

/** Éléments non saisis (jamais comptés pour 0). */
export function MissingList({ items, title = "Non renseigné (non déduit)" }: { items: string[]; title?: string }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-warning-soft px-4 py-3 text-sm text-amber-900">
      <p className="font-semibold">{title}</p>
      <ul className="mt-1 space-y-0.5">
        {items.map((m) => (
          <li key={m}>– {m}</li>
        ))}
      </ul>
    </div>
  );
}

export function EstimateNote({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted">{children}</p>;
}

/** Message tant qu'aucun résultat n'est calculable. */
export function Waiting({ children }: { children: ReactNode }) {
  return <Card className="px-5 py-4 text-sm text-muted-strong">{children}</Card>;
}

/** Bloc titré d'un formulaire d'outil. */
export function FormBlock({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-2", className)}>
      {title || action ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {title ? <h2 className="text-sm font-semibold text-foreground">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      <Card className="space-y-4 px-5 py-4">{children}</Card>
    </section>
  );
}
