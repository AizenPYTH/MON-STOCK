"use client";
import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { CatalogMapping, CatalogPreviewDTO } from "@/features/mobile-api/contract";
import { cn } from "@/lib/utils";
import { ESSENTIAL_FIELDS, MAPPABLE_FIELDS, mappingIssues, withColumn } from "@/features/catalog-imports/labels";

const CONST_VALUE = "__const__";

/**
 * Correspondance des colonnes du fichier (ou du flux) avec les champs MON STOCK. Partagé par
 * l'assistant d'import (une colonne, à côté de l'aperçu) et l'ajout d'un flux distant (grille).
 * Une constante issue du mapping proposé (ex. type de prix) est conservée telle quelle.
 */
export function MappingEditor({ preview, mapping, onChange, layout = "grid" }: { preview: Pick<CatalogPreviewDTO, "columns" | "mappingSource" | "mappingConfidence">; mapping: CatalogMapping; onChange: (next: CatalogMapping) => void; layout?: "column" | "grid" }) {
  const [allFields, setAllFields] = useState(false);
  const id = useId();
  const fields = MAPPABLE_FIELDS.filter((f) => allFields || ESSENTIAL_FIELDS.has(f.field) || mapping[f.field]);
  const issues = mappingIssues(mapping);
  return (
    <div className="flex flex-col gap-2.5">
      <div className={layout === "column" ? "flex flex-col gap-2.5" : "grid gap-x-5 gap-y-2.5 sm:grid-cols-2 xl:grid-cols-3"}>
        {fields.map((f) => {
          const v = mapping[f.field];
          const value = typeof v === "string" ? v : v ? CONST_VALUE : "";
          const medium = Boolean(v) && preview.mappingSource === "suggested" && preview.mappingConfidence?.[f.field] === "medium";
          const missing = f.required && !v;
          return (
            <div key={f.field} className="flex flex-col gap-1">
              <label htmlFor={`${id}-${f.field}`} className="flex items-baseline justify-between gap-2 text-[13px] font-bold leading-[18px] text-foreground">
                <span>
                  {f.label}
                  {f.required ? (
                    <>
                      <span aria-hidden="true"> *</span>
                      <span className="sr-only"> (obligatoire)</span>
                    </>
                  ) : null}
                </span>
                {medium ? <span className="font-semibold text-warning">proposé, à vérifier</span> : null}
              </label>
              <span className="relative block">
                <select
                  id={`${id}-${f.field}`}
                  value={value}
                  aria-invalid={missing || undefined}
                  onChange={(e) => {
                    if (e.target.value !== CONST_VALUE) onChange(withColumn(mapping, f.field, e.target.value || null));
                  }}
                  className={cn(
                    "ms-code block h-10 w-full cursor-pointer appearance-none truncate rounded-[10px] border bg-surface pl-2.5 pr-8 text-[12.5px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    missing ? "border-danger-line" : "border-border-strong",
                    value ? "text-foreground" : "text-ink-3",
                  )}
                >
                  <option value="">— Non associée</option>
                  {v && typeof v === "object" ? <option value={CONST_VALUE}>Valeur fixe : {v.const}</option> : null}
                  {preview.columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              </span>
            </div>
          );
        })}
      </div>
      <button type="button" onClick={() => setAllFields((x) => !x)} aria-expanded={allFields} className="min-h-10 self-start rounded-lg text-[13px] font-bold text-foreground hover:opacity-60">
        {allFields ? "Moins de champs" : `Plus de champs (${MAPPABLE_FIELDS.length - ESSENTIAL_FIELDS.size})`}
      </button>
      {issues.length > 0 ? (
        <ul role="alert" className="space-y-0.5 text-[13px] font-semibold leading-[18px] text-danger">
          {issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
