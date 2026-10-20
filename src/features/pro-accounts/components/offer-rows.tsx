import type { SupplierOffersDTO } from "@/features/mobile-api/contract";
import { OFFER_ACCESS_LABEL } from "@/domain/sourcing/pro-accounts";
import { STOCK_STATUS_LABEL, TAX_LABEL } from "@/features/sourcing/labels";
import { formatDateTime, formatMoney, formatNumber, formatRelative } from "@/lib/format";
import { safeExternalUrl } from "@/lib/utils";

function ageDays(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.max(0, (now - t) / 86_400_000);
}

/**
 * Aperçu compact v5 des produits récupérés (titre, origine · stock · âge du prix ; prix d'origine
 * et « ≈ » converti). Âge du prix en ambre au-delà de 7 jours ; inconnu → « — ».
 */
export function SupplierOfferRows({ offers, orgCurrency }: { offers: SupplierOffersDTO["offers"]; orgCurrency: string }) {
  return (
    <ul className="overflow-hidden rounded-2xl border border-border bg-surface">
      {offers.map((o, i) => {
        const url = safeExternalUrl(o.url);
        const age = ageDays(o.seenAt);
        const stock = o.quantity !== null ? `${formatNumber(o.quantity)} en stock` : (STOCK_STATUS_LABEL[o.stock] ?? "Stock non communiqué");
        const body = (
          <>
            <span className="flex min-w-0 flex-1 flex-col gap-px">
              <span className="truncate text-sm font-semibold leading-[19px]">{o.title}</span>
              <span className="truncate text-xs font-semibold leading-4 text-ink-3">
                {[o.access ? OFFER_ACCESS_LABEL[o.access] : null, stock].filter(Boolean).join(" · ")} ·{" "}
                <span className={age !== null && age > 7 ? "text-warning" : undefined} title={o.seenAt ? formatDateTime(o.seenAt) : undefined}>
                  prix {o.seenAt ? formatRelative(o.seenAt) : "non daté"}
                </span>
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end">
              <span className="text-[15px] font-extrabold tnum">
                {o.price !== null && o.currency ? formatMoney(o.price, o.currency) : "—"} <span className="text-[11px] font-semibold text-ink-3">{TAX_LABEL[o.taxType] === "HT/TTC non communiqué" ? "HT/TTC ?" : TAX_LABEL[o.taxType]}</span>
              </span>
              {o.currency && o.currency !== orgCurrency ? <span className="text-xs font-semibold text-ink-3 tnum">{o.priceConverted !== null ? `≈ ${formatMoney(o.priceConverted, orgCurrency)}` : "—"}</span> : null}
            </span>
          </>
        );
        return (
          <li key={o.id} className={i > 0 ? "border-t border-line-soft" : undefined}>
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-line-soft">
                {body}
                <span className="sr-only"> (page du produit, nouvel onglet)</span>
              </a>
            ) : (
              <div className="flex items-center gap-3 px-3.5 py-2.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
