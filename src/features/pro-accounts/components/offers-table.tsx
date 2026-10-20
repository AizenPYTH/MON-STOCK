import type { SupplierOffersDTO } from "@/features/mobile-api/contract";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { OFFER_ACCESS_LABEL } from "@/domain/sourcing/pro-accounts";
import { STOCK_STATUS_LABEL, TAX_LABEL } from "@/features/sourcing/labels";
import { formatDateTime, formatMoney, formatNumber, formatRelative } from "@/lib/format";
import { safeExternalUrl } from "@/lib/utils";

/**
 * Produits récupérés pour un fournisseur (offres actives les plus récemment vues). Prix d'origine
 * tel que reçu ; conversion en devise de l'organisation affichée « ≈ » (taux BCE), « — » si
 * impossible ; date de dernière observation visible (âge du prix).
 */
export function SupplierOffersTable({ offers, orgCurrency, caption }: { offers: SupplierOffersDTO["offers"]; orgCurrency: string; caption: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
    <Table className="min-w-[900px]">
      <caption className="sr-only">{caption}</caption>
      <THead>
        <tr>
          <TH scope="col">Produit</TH>
          <TH scope="col" align="right">
            Prix fournisseur
          </TH>
          <TH scope="col" align="right">
            ≈ en {orgCurrency}
          </TH>
          <TH scope="col">Stock</TH>
          <TH scope="col">Origine du prix</TH>
          <TH scope="col">Vu</TH>
        </tr>
      </THead>
      <TBody>
        {offers.map((o) => {
          const url = safeExternalUrl(o.url);
          return (
            <TR key={o.id}>
              <TD className="max-w-[380px]">
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 hover:underline">
                    {o.title}
                  </a>
                ) : (
                  <span className="line-clamp-2">{o.title}</span>
                )}
              </TD>
              <TD align="right">
                {o.price !== null && o.currency ? formatMoney(o.price, o.currency) : "—"}
                <span className="ml-1 text-xs text-muted">{TAX_LABEL[o.taxType]}</span>
              </TD>
              <TD align="right">{o.priceConverted !== null && o.currency !== orgCurrency ? `≈ ${formatMoney(o.priceConverted, orgCurrency)}` : o.currency === orgCurrency ? <span className="text-xs text-muted">même devise</span> : "—"}</TD>
              <TD className="text-xs">
                {STOCK_STATUS_LABEL[o.stock] ?? "—"}
                {o.quantity !== null ? ` · ${formatNumber(o.quantity)}` : ""}
              </TD>
              <TD>{o.access ? <Badge variant={o.access === "account" ? "success" : o.access === "marketplace" ? "info" : "neutral"}>{OFFER_ACCESS_LABEL[o.access]}</Badge> : "—"}</TD>
              <TD className="whitespace-nowrap text-xs" title={o.seenAt ? formatDateTime(o.seenAt) : undefined}>
                {o.seenAt ? formatRelative(o.seenAt) : "—"}
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
    </div>
  );
}

