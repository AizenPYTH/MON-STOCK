import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, TriangleAlert } from "lucide-react";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { EmptyState } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/status-badge";
import { FilterChip } from "@/components/instrument";
import { Pagination } from "@/components/ui/pagination";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ButtonLink } from "@/components/ui/button";
import { getSupplier, getSupplierOffers, getSupplierTabCounts } from "@/features/suppliers/queries";
import { searchSkus } from "@/features/stock/queries";
import { SupplierHeader } from "@/features/suppliers/components/supplier-header";
import { ManualOfferButton } from "@/features/suppliers/components/manual-offer-form";
import { LinkOfferDialog } from "@/features/sourcing/components/link-offer-dialog";
import { freshness } from "@/domain/sourcing/pricing";
import { formatMoney, formatNumber, NOT_PROVIDED } from "@/lib/format";
import { OFFER_STATUS_LABEL, SOURCE_TYPE_LABEL, STOCK_STATUS_LABEL, TAX_LABEL } from "@/features/sourcing/labels";
import { safeExternalUrl } from "@/lib/utils";

export const metadata: Metadata = { title: "Offres fournisseur" };

export default async function SupplierOffersPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const { id } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const status = sp.status === "all" ? "all" : "active";
  const supplier = await getSupplier(ctx, id);
  if (!supplier) notFound();
  const [counts, offers, skus] = await Promise.all([getSupplierTabCounts(ctx, supplier.id), getSupplierOffers(ctx, supplier.id, page, status), searchSkus(ctx, "", 300)]);
  const writable = canWrite(ctx.role);
  const skuOptions = skus.filter((s) => s.sku_id && s.code).map((s) => ({ id: s.sku_id!, code: s.code!, label: `${s.product_name ?? ""}${s.variant_name && s.variant_name !== "Standard" ? ` · ${s.variant_name}` : ""}` }));
  const makeHref = (p: number) => `/suppliers/${supplier.id}/offers?page=${p}${status === "all" ? "&status=all" : ""}`;
  return (
    <SupplierHeader supplier={supplier} tab="offers" counts={counts}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Offres affichées" className="flex flex-wrap items-center gap-1.5">
          <FilterChip href={`/suppliers/${supplier.id}/offers`} selected={status === "active"}>
            Actives
          </FilterChip>
          <FilterChip href={`/suppliers/${supplier.id}/offers?status=all`} selected={status === "all"}>
            Toutes (expirées, rejetées…)
          </FilterChip>
        </nav>
        {writable ? <ManualOfferButton supplierId={supplier.id} defaultCurrency={supplier.currency} skus={skuOptions} /> : null}
      </div>
      {offers.rows.length === 0 ? (
        <EmptyState title="Aucune offre pour ce fournisseur." description="Saisissez une offre manuellement, importez un flux ou déclarez une page publique autorisée dans l'onglet « Sources & flux »." action={<ButtonLink href={`/suppliers/${supplier.id}/sources`} variant="secondary">Sources & flux</ButtonLink>} />
      ) : (
        <div className="space-y-3">
          <Table className="min-w-[960px]" stackOnMobile caption="Offres du fournisseur">
            <THead>
              <tr>
                <TH>Offre</TH>
                <TH align="right">Prix</TH>
                <TH align="right">MOQ</TH>
                <TH align="right">Stock</TH>
                <TH>Grade</TH>
                <TH>Source</TH>
                <TH>Vérifiée</TH>
                <TH>SKU</TH>
                <TH></TH>
              </tr>
            </THead>
            <TBody>
              {offers.rows.map((o) => {
                const f = freshness(o.last_seen_at);
                return (
                  <TR key={o.id}>
                    <TD primary>
                      <Link href={`/sourcing/offers/${o.id}`} className="font-bold hover:underline">
                        <span className="block max-w-[320px] truncate">{o.title_original}</span>
                      </Link>
                      <div className="flex flex-wrap items-center gap-1 text-xs text-muted">
                        {o.status !== "active" ? <StatusBadge tone={o.status === "expired" ? "neutral" : o.status === "rejected" ? "danger" : "warning"}>{OFFER_STATUS_LABEL[o.status]}</StatusBadge> : null}
                        {o.external_product_id ? <span className="font-mono">{o.external_product_id}</span> : null}
                        {safeExternalUrl(o.source_url) ? (
                          <a href={safeExternalUrl(o.source_url) ?? undefined} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 hover:text-foreground">
                            <ExternalLink aria-hidden="true" className="h-3 w-3" /> source
                          </a>
                        ) : null}
                      </div>
                    </TD>
                    <TD label="Prix" align="right">
                      <div className="font-bold tnum">
                        {formatMoney(Number(o.original_price), o.original_currency)} <span className="text-xs font-normal text-muted">{TAX_LABEL[o.tax_type]}</span>
                      </div>
                      {o.normalized_price !== null && o.normalized_currency && o.normalized_currency !== o.original_currency ? <div className="text-xs text-muted">≈ {formatMoney(o.normalized_price, o.normalized_currency)}</div> : null}
                    </TD>
                    <TD label="MOQ" align="right">{o.moq ?? NOT_PROVIDED}</TD>
                    <TD label="Stock" align="right">{o.available_quantity !== null ? formatNumber(o.available_quantity) : <span className="text-xs text-muted">{STOCK_STATUS_LABEL[o.stock_status]}</span>}</TD>
                    <TD label="Grade">{o.grade ?? "—"}</TD>
                    <TD label="Source" className="text-xs">{SOURCE_TYPE_LABEL[o.source_type] ?? o.source_type}</TD>
                    <TD label="Vérifiée" className={`text-xs ${f.stale ? "font-semibold text-warning" : "text-muted"}`}>
                      {f.stale ? <TriangleAlert aria-hidden="true" className="mr-1 inline h-3.5 w-3.5 align-[-2px]" /> : null}
                      {f.label}
                      {f.warning ? ` · ${f.warning}` : ""}
                    </TD>
                    <TD label="SKU">
                      {o.sku ? (
                        <Link href={`/stock/${encodeURIComponent(o.sku.code)}`} className="font-mono text-xs hover:underline">
                          {o.sku.code}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted">Non associée</span>
                      )}
                    </TD>
                    <TD>{writable ? <LinkOfferDialog offerId={o.id} currentSkuCode={o.sku?.code ?? null} label={o.sku ? "Changer" : "Associer à un SKU"} /> : null}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <Pagination page={offers.page} pageSize={offers.pageSize} total={offers.total} makeHref={makeHref} />
        </div>
      )}
    </SupplierHeader>
  );
}
