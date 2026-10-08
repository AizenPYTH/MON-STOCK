"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, FormError } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/result";
import { formatNumber } from "@/lib/format";
import { mapListingAction, searchSkusAction, type SkuSearchRow } from "@/features/integrations/actions";

export function AssignSkuDialog({ listingId, listingTitle, externalSku, label = "Associer à un SKU" }: { listingId: string; listingTitle: string; externalSku: string | null; label?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(externalSku ?? "");
  const [results, setResults] = useState<SkuSearchRow[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SkuSearchRow | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const [state, action] = useActionState<ActionResult | null, FormData>(async (prev, formData) => {
    const result = await mapListingAction(prev, formData);
    if (result.ok) {
      setOpen(false);
      toast.success("Annonce associée au SKU.");
    }
    return result;
  }, null);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      startTransition(async () => {
        const r = await searchSkusAction(query);
        if (r.ok) {
          setResults(r.data);
          setSearchError(null);
        } else {
          setResults([]);
          setSearchError(r.error);
        }
      });
    }, 250);
    return () => clearTimeout(handle);
  }, [query, open]);

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Associer l'annonce à un SKU" className="max-w-xl">
        <div className="space-y-3">
          <p className="truncate text-sm text-muted" title={listingTitle}>
            {listingTitle}
          </p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher par nom, code SKU ou code-barres…" aria-label="Rechercher un SKU" className="pl-8" autoFocus />
          </div>
          {searchError ? <FormError message={searchError} /> : null}
          <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
            {pending && results.length === 0 ? <p className="px-3 py-3 text-sm text-muted">Recherche…</p> : null}
            {!pending && results.length === 0 ? <p className="px-3 py-3 text-sm text-muted">Aucun SKU trouvé. Vous pouvez créer un SKU depuis cette annonce.</p> : null}
            {results.map((r) => (
              <button
                key={r.sku_id}
                type="button"
                onClick={() => setSelected(r)}
                className={`flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-surface-muted ${selected?.sku_id === r.sku_id ? "bg-accent-soft" : ""}`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {r.brand ? `${r.brand} · ` : ""}
                    {r.product_name}
                    {r.variant_name ? ` — ${r.variant_name}` : ""}
                  </span>
                  <span className="font-mono text-xs text-muted">{r.code}</span>
                </span>
                <span className="shrink-0 text-xs text-muted tnum">Stock {formatNumber(r.quantity_available)}</span>
              </button>
            ))}
          </div>
          <form action={action} className="space-y-2">
            <input type="hidden" name="listing_id" value={listingId} />
            <input type="hidden" name="sku_id" value={selected?.sku_id ?? ""} />
            {state && !state.ok ? <FormError message={state.error} action={state.action} /> : null}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted">{selected ? `SKU sélectionné : ${selected.code}` : "Sélectionnez un SKU dans la liste."}</span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Annuler
                </Button>
                <SubmitButton disabled={!selected} pendingText="Association…">
                  Associer
                </SubmitButton>
              </div>
            </div>
          </form>
        </div>
      </Dialog>
    </>
  );
}
