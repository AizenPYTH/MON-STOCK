import Link from "next/link";
import type { SearchRejections } from "@/services/sourcing/search";
import { formatMoney } from "@/lib/format";

/** « n offres écartées » : liste dépliable, raison(s) par offre (filtre de pertinence offer-filter.ts). */
export function RejectedOffersPanel({ rejected, currency }: { rejected: SearchRejections; currency: string }) {
  if (rejected.count === 0) return null;
  return (
    <details className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium">
        {rejected.count} offre{rejected.count > 1 ? "s" : ""} écartée{rejected.count > 1 ? "s" : ""}
        <span className="ml-2 text-xs font-normal text-muted">{rejected.groups.map((g) => `${g.label} (${g.count})`).join(" · ")}</span>
      </summary>
      <p className="mt-2 text-xs text-muted">
        Offres trouvées mais qui ne correspondent pas à la recherche ou ne sont pas exploitables (modèle, stockage ou grade différents, accessoire, pièce, offre expirée, prix aberrant…).
        {rejected.referenceMedian !== null ? ` Prix aberrants évalués par rapport à la médiane du résultat : ${formatMoney(rejected.referenceMedian, currency)}.` : ""}
      </p>
      <ul className="mt-2 divide-y divide-border">
        {rejected.offers.map((r) => (
          <li key={r.id} className="py-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link href={`/sourcing/offers/${r.id}` as never} className="min-w-0 truncate font-medium hover:underline">
                {r.title}
              </Link>
              <span className="text-xs text-muted">
                {r.supplierName}
                {r.comparableUnitPrice !== null ? ` · ${formatMoney(r.comparableUnitPrice, currency)}` : " · prix non comparable"}
              </span>
            </div>
            <ul className="mt-0.5 text-xs text-danger">
              {r.reasons.map((reason) => (
                <li key={`${r.id}-${reason.code}-${reason.message}`}>{reason.message}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {rejected.count > rejected.offers.length ? <p className="mt-2 text-xs text-muted">{rejected.count - rejected.offers.length} autre(s) offre(s) écartée(s) non listée(s).</p> : null}
    </details>
  );
}
