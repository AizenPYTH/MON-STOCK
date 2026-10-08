"use client";
import { startTransition, useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { FormError, FormSuccess, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/result";
import { formatMoney } from "@/lib/format";
import { MATCH_METHOD_LABEL } from "@/domain/sourcing/matching";
import { linkOfferToSkuAction, searchSkusAction, suggestMatchesAction, type SkuSearchResult } from "@/features/sourcing/actions";
import type { OfferMatchSuggestion } from "@/features/sourcing/queries";
import { MATCH_LEVEL_LABEL } from "@/features/sourcing/labels";

export function LinkOfferDialog({ offerId, currentSkuCode, label = "Associer à un SKU", size = "sm" }: { offerId: string; currentSkuCode?: string | null; label?: string; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<OfferMatchSuggestion[] | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SkuSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [state, action] = useActionState<ActionResult<{ skuCode: string }> | null, FormData>(linkOfferToSkuAction, null);

  useEffect(() => {
    if (!open || suggestions !== null) return;
    startTransition(async () => {
      try {
        setSuggestions(await suggestMatchesAction(offerId));
      } catch {
        setSuggestions([]);
      }
    });
  }, [open, suggestions, offerId]);

  const search = () => {
    setSearching(true);
    startTransition(async () => {
      try {
        setResults(await searchSkusAction(query));
      } finally {
        setSearching(false);
      }
    });
  };

  const err = state && !state.ok ? state : null;
  return (
    <>
      <Button variant="secondary" size={size} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Associer cette offre à un SKU" className="max-w-2xl">
        <div className="space-y-4 text-sm">
          {currentSkuCode ? <p className="text-muted">Actuellement associée au SKU <code className="font-mono text-foreground">{currentSkuCode}</code>. Choisir un autre SKU remplacera l'association.</p> : null}
          <FormError message={err?.error} />
          {state?.ok ? <FormSuccess message={`Offre associée au SKU ${state.data.skuCode}.`} /> : null}

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Suggestions automatiques</h3>
            {suggestions === null ? (
              <p className="text-muted">Analyse des correspondances…</p>
            ) : suggestions.length === 0 ? (
              <p className="text-muted">Aucune correspondance suffisamment sûre (confiance &lt; 60 %). Utilisez la recherche manuelle.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {suggestions.map((s) => (
                  <li key={s.skuId} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        <span className="font-mono text-xs">{s.code}</span> {s.label}
                      </div>
                      <div className="text-xs text-muted">
                        <Badge variant={s.level === "high" ? "success" : "warning"}>{MATCH_LEVEL_LABEL[s.level]}</Badge> {Math.round(s.confidence * 100)} % · {MATCH_METHOD_LABEL[s.method]} · {s.reasons.slice(0, 3).join(" · ")}
                      </div>
                    </div>
                    <form action={action}>
                      <input type="hidden" name="offer_id" value={offerId} />
                      <input type="hidden" name="sku_id" value={s.skuId} />
                      <SubmitButton size="sm" pendingText="Association…">
                        Confirmer
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-muted">Une suggestion n'est jamais appliquée sans votre confirmation.</p>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Recherche manuelle</h3>
            <div className="flex gap-2">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom de produit, code SKU, code-barres…" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }} />
              <Button variant="secondary" onClick={search} disabled={searching}>
                {searching ? "Recherche…" : "Rechercher"}
              </Button>
            </div>
            {results.length > 0 ? (
              <ul className="mt-2 max-h-64 divide-y divide-border overflow-auto rounded-lg border border-border">
                {results.map((r) => (
                  <li key={r.skuId} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate"><span className="font-mono text-xs">{r.code}</span> {r.label}</div>
                      <div className="text-xs text-muted">Coût {r.costPrice === null ? "inconnu" : formatMoney(r.costPrice)} · Vente {r.salePrice === null ? "inconnue" : formatMoney(r.salePrice)}</div>
                    </div>
                    <form action={action}>
                      <input type="hidden" name="offer_id" value={offerId} />
                      <input type="hidden" name="sku_id" value={r.skuId} />
                      <SubmitButton size="sm" variant="secondary" pendingText="Association…">
                        Associer
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </div>
      </Dialog>
    </>
  );
}
