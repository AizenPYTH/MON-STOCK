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
      <label htmlFor={id} className="block text-[12.5px] font-bold leading-[17px] text-foreground">
        {label}
      </label>
      <div className={cn("flex items-center rounded-xl border bg-surface pr-2 transition-[border-color,box-shadow] duration-150 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25", error ? "border-danger bg-danger-soft" : "border-border-control hover:border-muted")}>
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
          className={cn("min-w-0 flex-1 rounded-[10px] bg-transparent px-3 font-extrabold text-foreground tnum placeholder:font-semibold placeholder:text-ink-4 focus:outline-none disabled:cursor-not-allowed", large ? "h-14 text-2xl" : "h-11 text-base")}
        />
        {suffix ? <span className="mr-2 text-sm font-semibold text-ink-3">{suffix}</span> : null}
        {value && !disabled ? (
          <button type="button" onClick={() => onChange("")} aria-label={`Effacer ${label}`} className="relative rounded-full p-1 text-muted after:absolute after:-inset-2 after:content-[''] hover:bg-line-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {error ? <AlertCircle aria-hidden="true" className="ml-1 h-4 w-4 text-danger" /> : null}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-semibold text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs font-semibold text-ink-3">
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
        <div id={id} className="text-[12.5px] font-bold leading-[17px] text-foreground">
          {label}
        </div>
      ) : null}
      <div role="group" aria-labelledby={label ? id : undefined} className="flex flex-wrap gap-1.5">
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
                "relative whitespace-nowrap rounded-full border font-bold transition-colors after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                size === "lg" ? "h-10 px-4 text-[13.5px]" : "h-8 px-3 text-[12.5px]",
                selected ? "border-inverse bg-inverse text-on-inverse hover:bg-inverse-hover" : "border-border-strong bg-surface text-foreground hover:bg-surface-2",
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
    <div className={total ? "-mx-4 bg-surface-2 px-4 py-3" : "py-[9px]"}>
      <div className="flex items-center justify-between gap-3">
        <dt className={cn("flex min-w-0 flex-wrap items-center gap-2 text-[13.5px] leading-[19px]", total ? "font-extrabold text-foreground" : kind === "muted" ? "font-medium text-ink-3" : "font-medium text-muted")}>
          {line.label}
          {kind === "input" ? <span className="rounded-md bg-line-soft px-1.5 py-px text-[10.5px] font-bold leading-[15px] text-muted">saisi</span> : null}
        </dt>
        <dd className={cn("shrink-0 text-right tnum", total ? "text-[22px] font-extrabold leading-7 tracking-[-0.3px] text-foreground" : kind === "muted" ? "text-[13.5px] font-semibold text-ink-3" : "text-[13.5px] font-semibold text-muted")}>{line.value}</dd>
      </div>
      {line.note ? <p className="mt-0.5 text-xs font-semibold text-ink-3">{line.note}</p> : null}
    </div>
  );
}

export function ResultCard({ title, lines, copyText, children }: { title?: string; lines: ResultLine[]; copyText?: string; children?: ReactNode }) {
  return (
    <Card className="overflow-hidden px-4 pt-3">
      {title || copyText ? (
        <div className="mb-1.5 flex min-h-8 items-center justify-between gap-2">
          {title ? <h3 className="ms-mono text-[11px] leading-[14px] tracking-[0.08em] text-muted">{title}</h3> : <span />}
          {copyText ? <CopyButton text={copyText} /> : null}
        </div>
      ) : null}
      <dl aria-live="polite" className="divide-y divide-line-soft border-t border-line-soft">
        {lines.map((l, i) => (
          <ResultRow key={`${l.label}-${i}`} line={l} />
        ))}
      </dl>
      {children ? <div className="pb-3">{children}</div> : <div className="pb-1" />}
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
      className="relative inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-border-strong bg-surface px-2.5 text-[12.5px] font-bold text-foreground after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] hover:bg-line-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45"
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
    <div className="rounded-2xl border border-dashed border-amber bg-warning-soft px-4 py-3 text-[13px] font-semibold text-warning">
      <p className="font-bold">{title}</p>
      <ul className="mt-1 space-y-0.5">
        {items.map((m) => (
          <li key={m}>– {m}</li>
        ))}
      </ul>
    </div>
  );
}

export function EstimateNote({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold leading-[17px] text-ink-3">{children}</p>;
}

/** Message tant qu'aucun résultat n'est calculable. */
export function Waiting({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border-strong bg-surface px-5 py-5">
      <p className="ms-mono text-[10.5px] leading-[14px] text-ink-3">Résultat</p>
      <p className="mt-2 text-[22px] font-light leading-7 text-ink-4" aria-hidden="true">
        —
      </p>
      <p className="mt-1 text-[13.5px] font-semibold text-muted">{children}</p>
    </div>
  );
}

/** Bloc titré d'un formulaire d'outil. */
export function FormBlock({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-2", className)}>
      {title || action ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {title ? <h2 className="ms-mono text-[11px] leading-[14px] tracking-[0.08em] text-muted">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      <Card className="space-y-4 p-4">{children}</Card>
    </section>
  );
}
