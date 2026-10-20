"use client";
import { useId, useState } from "react";
import type { CatalogMapping, CatalogPreviewDTO } from "@/features/mobile-api/contract";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/form";
import { ESSENTIAL_FIELDS, MAPPABLE_FIELDS, mappingIssues, withColumn } from "@/features/catalog-imports/labels";

const CONST_VALUE = "__const__";

/**
 * Correspondance des colonnes du fichier (ou du flux) avec les champs MON STOCK. Partagé par
 * l'assistant d'import et l'ajout d'un flux distant. Une constante issue du mapping proposé
 * (ex. type de prix) est conservée telle quelle.
 */
export function MappingEditor({ preview, mapping, onChange }: { preview: Pick<CatalogPreviewDTO, "columns" | "mappingSource" | "mappingConfidence">; mapping: CatalogMapping; onChange: (next: CatalogMapping) => void }) {
  const [allFields, setAllFields] = useState(false);
  const id = useId();
  const fields = MAPPABLE_FIELDS.filter((f) => allFields || ESSENTIAL_FIELDS.has(f.field) || mapping[f.field]);
  const issues = mappingIssues(mapping);
  return (
    <div className="space-y-3">
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
        {fields.map((f) => {
          const v = mapping[f.field];
          const value = typeof v === "string" ? v : v ? CONST_VALUE : "";
          const medium = Boolean(v) && preview.mappingSource === "suggested" && preview.mappingConfidence?.[f.field] === "medium";
          return (
            <div key={f.field} className="space-y-1">
              <label htmlFor={`${id}-${f.field}`} className="flex items-center gap-2 text-sm font-medium text-foreground">
                {f.label}
                {f.required ? (
                  <>
                    <span aria-hidden="true" className="text-danger">
                      *
                    </span>
                    <span className="sr-only">(obligatoire)</span>
                  </>
                ) : null}
                {medium ? <Badge variant="warning">proposé, à vérifier</Badge> : null}
              </label>
              <Select id={`${id}-${f.field}`} value={value} onChange={(e) => {
                  if (e.target.value !== CONST_VALUE) onChange(withColumn(mapping, f.field, e.target.value || null));
                }}
              >
                <option value="">— (non associé)</option>
                {v && typeof v === "object" ? <option value={CONST_VALUE}>Valeur fixe : {v.const}</option> : null}
                {preview.columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
          );
        })}
      </div>
      <Button variant="ghost" size="sm" onClick={() => setAllFields((x) => !x)} aria-expanded={allFields}>
        {allFields ? "Moins de champs" : `Plus de champs (${MAPPABLE_FIELDS.length - ESSENTIAL_FIELDS.size})`}
      </Button>
      {issues.length > 0 ? (
        <ul role="alert" className="space-y-0.5 text-sm text-danger">
          {issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
