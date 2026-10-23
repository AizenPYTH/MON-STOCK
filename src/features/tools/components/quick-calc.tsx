"use client";
import { useId, useState, type ReactNode } from "react";
import type { Dec } from "@/domain/tools/decimal";
import type { QuickResult } from "@/domain/tools/quick-calc";
import { sanitizeAmountInput } from "@/domain/tools/decimal";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { evaluateQuick, fmtQuick, focusField, quickCopyText, type CalcField, type QuickState } from "@/features/tools/quick-view";
import { ChoiceChips, CopyButton } from "@/features/tools/components/ui";

export type { CalcField } from "@/features/tools/quick-view";

export interface QuickTabs {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: { value: string; label: string; a11y?: string }[];
}

/**
 * Calculateur « version simple » (maquette v3 Outils) : onglets (taux, marge voulue, remise,
 * devise), 2 à 4 cases et un résultat calculé pendant la frappe. En mode bidirectionnel (TVA,
 * devises), la case touchée devient la saisie et les autres suivent.
 */
export function QuickCalc({
  title,
  tabs,
  fields,
  bidir = false,
  initialActive,
  initialEntries,
  compute,
  hint,
  aside,
}: {
  title: string;
  tabs?: QuickTabs;
  fields: CalcField[];
  bidir?: boolean;
  initialActive?: string;
  initialEntries?: Record<string, string>;
  compute: (values: Record<string, Dec | null>, active: string) => QuickResult;
  hint?: string | null;
  aside?: ReactNode;
}) {
  const inputs = fields.filter((f) => !f.result);
  const [state, setState] = useState<QuickState>({ active: initialActive ?? inputs[0]!.key, entries: initialEntries ?? {} });
  const baseId = useId();
  const view = evaluateQuick(fields, state, bidir, compute);

  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {tabs ? <ChoiceChips label={tabs.label} size="lg" options={tabs.options.map((o) => ({ value: o.value, label: o.label, a11y: o.a11y }))} value={tabs.value} onChange={tabs.onChange} /> : <p className="ms-mono self-center text-[11px] leading-[14px] tracking-[0.08em] text-muted">{title}</p>}
        <div className="flex items-center gap-2">
          {aside}
          <CopyButton text={quickCopyText(title, fields, view)} disabled={!view.anyResult} />
        </div>
      </div>
      <div className={cn("grid gap-3", fields.length > 3 ? "sm:grid-cols-2" : fields.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        {fields.map((f) => {
          const id = `${baseId}-${f.key}`;
          if (f.result) {
            const v = view.valueOf(f.key);
            return (
              <div key={f.key} className="rounded-xl bg-night px-4 py-3 text-on-night ring-1 ring-inset ring-night-line">
                <div id={`${id}-label`} className="ms-mono text-[10px] leading-[13px] text-on-night-subtle">
                  {f.label}
                </div>
                <output aria-labelledby={`${id}-label`} aria-live="polite" className={cn("mt-1.5 block text-[30px] font-light leading-[34px] tracking-[-0.8px] tnum", v !== null && v.n < 0n ? "text-danger-on-night" : "text-on-night")}>
                  {fmtQuick(v)}
                  {f.unit ? <span className="ml-1 text-[15px] font-medium text-on-night-muted">{f.unit}</span> : null}
                </output>
                {view.out.sub ? <div className="mt-0.5 text-[13px] font-semibold text-mint">{view.out.sub}</div> : null}
              </div>
            );
          }
          const on = f.key === state.active;
          const v = view.valueOf(f.key);
          const value = !bidir || on ? (state.entries[f.key] ?? "") : v ? fmtQuick(v) : "";
          return (
            <div key={f.key} className={cn("rounded-xl border bg-surface px-4 py-3 transition-[border-color,box-shadow] duration-150 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25", on && bidir ? "border-inverse ring-1 ring-inverse" : "border-border-control hover:border-muted")}>
              <label htmlFor={id} className="ms-mono block text-[10px] leading-[13px] text-ink-3">
                {f.label}
                {on && bidir ? <span className="sr-only"> (saisie)</span> : null}
              </label>
              <div className="mt-1 flex items-baseline gap-1">
                <input
                  id={id}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={value}
                  placeholder="—"
                  onFocus={() => setState((s) => focusField(s, f.key, bidir, view))}
                  onChange={(e) => {
                    const next = sanitizeAmountInput(e.target.value);
                    setState((s) => ({ active: f.key, entries: { ...(bidir && s.active !== f.key ? {} : s.entries), [f.key]: next } }));
                  }}
                  className="w-full min-w-0 bg-transparent text-[30px] font-extrabold leading-[34px] text-foreground tnum placeholder:font-light placeholder:text-ink-4 focus:outline-none"
                />
                {f.unit ? <span className="text-[15px] font-semibold text-ink-3">{f.unit}</span> : null}
              </div>
            </div>
          );
        })}
      </div>
      {hint ? <p className="text-center text-xs font-semibold text-ink-3">{hint}</p> : null}
    </Card>
  );
}
