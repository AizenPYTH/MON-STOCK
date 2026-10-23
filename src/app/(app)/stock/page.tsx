import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Package, PackageSearch, TriangleAlert } from "lucide-react";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { Paper } from "@/components/instrument";
import { ButtonLink } from "@/components/ui/button";
import { Callout, EmptyState } from "@/components/ui/page";
import { getSkuDetail } from "@/features/stock/queries";
import { skuLabel, type StockRowView } from "@/features/stock/model";
import { loadStockWebList, type BestOfferChip } from "@/features/stock-web/queries";
import { DEFAULT_WEB_SORT, flattenParams, parseStockWebParams, SORT_LABEL, stockHref, type WebSort } from "@/features/stock-web/params";
import { channelDisplay, coverDisplay, levelDisplay, marginDisplay } from "@/features/stock-web/list.pure";
import { StockScene } from "@/features/stock-web/components/stock-scene";
import { StockToolbar } from "@/features/stock-web/components/stock-toolbar";
import { StockTableV5, type SortHeader, type StockRowDTO } from "@/features/stock-web/components/stock-table";
import { SkuPanel, SkuPanelMissing } from "@/features/stock-web/components/sku-panel";
import { UNKNOWN_COST_LABEL } from "@/domain/pricing/margin";
import { STOCK_LEVEL_LABEL } from "@/domain/inventory/alerts";
import { formatMoney, formatNumber, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Stock" };

/** Montant compact : « 39 € » si entier, « 11,90 € » sinon ; inconnu → « — ». */
function money(n: number | null | undefined, cur: string): string {
  if (n === null || n === undefined) return "—";
  return formatMoney(n, cur, { decimals: Number.isInteger(n) ? 0 : 2 });
}

function toRow(v: StockRowView, offer: BestOfferChip | undefined, openHref: string): StockRowDTO {
  const r = v.row;
  const cur = r.currency ?? "EUR";
  const lvl = levelDisplay(v.classification.level);
  const m = marginDisplay(v.margin);
  const restock =
    offer && v.classification.level !== "normal"
      ? { text: `Racheter dès ${money(offer.price, offer.currency)}${offer.supplier ? ` · ${offer.supplier}` : ""}`, title: `Meilleure offre rapprochée ${offer.taxType === "ht" ? "HT" : offer.taxType === "ttc" ? "TTC" : "(HT/TTC non précisé)"} · vue ${formatRelative(offer.lastSeenAt)}` }
      : null;
  return {
    skuId: r.sku_id ?? r.code ?? "",
    code: r.code ?? "",
    title: skuLabel(r),
    productName: r.product_name ?? r.code ?? "",
    category: r.category,
    qty: formatNumber(r.quantity_available),
    qtyNegative: (r.quantity_available ?? 0) < 0,
    onHand: r.quantity_on_hand ?? 0,
    available: r.quantity_available ?? 0,
    cover: coverDisplay(v),
    sales: formatNumber(r.units_30d),
    cost: money(r.cost_price, cur),
    price: money(r.sale_price, cur),
    margin: { text: m.text, tone: m.tone, title: m.provisional && m.title ? `Provisoire — ${m.title}` : m.title },
    channel: channelDisplay(r),
    level: { label: lvl.label, tone: lvl.tone, title: `${STOCK_LEVEL_LABEL[v.classification.level]} — ${v.classification.reason}` },
    restock,
    openHref,
  };
}

export default async function StockPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const flat = flattenParams(await searchParams);
  const params = parseStockWebParams(flat);
  const writable = canWrite(ctx.role);
  const archived = Boolean(params.base.archived);
  const [list, detail] = await Promise.all([loadStockWebList(ctx, params), params.sku ? getSkuDetail(ctx, params.sku) : Promise.resolve(null)]);
  const { analytics } = list;
  const currency = ctx.organization.default_currency;

  const hasFilters = Object.keys(flat).some((k) => !["page", "sort", "archived", "densite", "sku"].includes(k));
  const pageCount = Math.max(1, Math.ceil(list.total / list.pageSize));
  const from = list.rows.length ? (list.page - 1) * list.pageSize + 1 : 0;
  const to = from ? from + list.rows.length - 1 : 0;
  const pageHref = (page: number) => stockHref(flat, { page: page > 1 ? String(page) : null });
  const filterHref = (niveau: string | null) => stockHref(archived ? {} : flat, { niveau, status: null, archived: null, q: null, category: null });

  const exportSp = new URLSearchParams(flat);
  for (const k of ["page", "sku", "densite"]) exportSp.delete(k);
  const exportBase = `/stock/export.csv${exportSp.toString() ? `?${exportSp.toString()}` : ""}`;

  const sortHeader = (sort: WebSort, dir: SortHeader["dir"]): SortHeader => ({ href: stockHref(flat, { sort: sort === DEFAULT_WEB_SORT ? null : sort }), active: params.sort === sort, dir });
  const sortHeaders = {
    product: sortHeader("name", "ascending"),
    qty: sortHeader("low_stock", "ascending"),
    cover: sortHeader("cover", "ascending"),
    sales: sortHeader("best_sellers", "descending"),
    margin: sortHeader("margin", "descending"),
    level: sortHeader("urgency", "ascending"),
  };
  const rows = list.rows.map((v) => toRow(v, v.row.sku_id ? list.bestOffers[v.row.sku_id] : undefined, stockHref(flat, { sku: v.row.code ?? "" }, { keepPage: true })));

  // Frais non réglés : les marges affichées sont alors des estimations partielles.
  const sample = analytics.all[0]?.margin.unknownCosts ?? [];
  const missingFees = sample.filter((u) => u !== "cost_price" && u !== "sale_price").map((u) => UNKNOWN_COST_LABEL[u]);

  // Fiche ouverte : précédente / suivante dans la liste filtrée (en changeant de page si besoin).
  let panel = null;
  if (params.sku) {
    const closeHref = stockHref(flat, { sku: null }, { keepPage: true });
    if (!detail) panel = <SkuPanelMissing code={params.sku} closeHref={closeHref} />;
    else {
      const idx = list.orderedCodes.findIndex((c) => c.toLowerCase() === (detail.row.code ?? "").toLowerCase());
      const near = (i: number) => {
        const code = list.orderedCodes[i];
        if (idx < 0 || code === undefined) return null;
        const page = Math.floor(i / list.pageSize) + 1;
        return stockHref(flat, { sku: code, page: page > 1 ? String(page) : null });
      };
      panel = <SkuPanel detail={detail} closeHref={closeHref} prevHref={near(idx - 1)} nextHref={near(idx + 1)} writable={writable} />;
    }
  }

  const resetHref = archived ? "/stock?archived=1" : "/stock";
  const btn = "flex h-10 w-10 items-center justify-center rounded-[10px] border border-border-strong bg-surface text-foreground transition-colors duration-150 ease-standard hover:bg-surface-2";

  return (
    <>
      <StockScene analytics={analytics} currency={currency} archived={archived} exportHref={exportBase} filterHref={filterHref} />
      <Paper className="lg:pt-5">
        <StockToolbar
          flat={flat}
          params={params}
          analytics={analytics}
          facets={list.facets}
          summary={
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="ms-mono whitespace-nowrap text-[10.5px] leading-[14px] text-ink-3">
                <span className="tnum text-foreground">{formatNumber(list.total)}</span> référence{list.total > 1 ? "s" : ""} · {SORT_LABEL[params.sort]}
              </span>
              {missingFees.length > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold leading-[17px] text-warning">
                  <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    Marges provisoires : {missingFees.join(", ")} non réglé{missingFees.length > 1 ? "s" : ""} ·{" "}
                    <Link href="/settings/organization" className="font-bold underline underline-offset-2 hover:no-underline">
                      régler mes coûts
                    </Link>
                  </span>
                </span>
              ) : null}
            </div>
          }
        />
        <div className="h-3" />
        {list.truncated ? (
          <Callout tone="warning" className="mb-3">
            Analyse limitée aux premières références : affinez la recherche pour un résultat exhaustif. Les compteurs sont des minima.
          </Callout>
        ) : null}

        {list.bestOffersPartial ? (
          <Callout tone="info" className="mb-3">
            Meilleures offres fournisseur partielles sur cette page : toutes les offres n&apos;ont pas pu être lues. Une offre peut manquer.
          </Callout>
        ) : null}

        {list.rows.length === 0 ? (
          list.total > 0 ? (
            <EmptyState
              icon={<Package />}
              title="Cette page n'existe plus"
              description={`La liste compte ${formatNumber(list.total)} références : revenez à la première page.`}
              action={
                <ButtonLink href={pageHref(1)} variant="secondary">
                  Première page
                </ButtonLink>
              }
            />
          ) : hasFilters ? (
            <EmptyState
              icon={<PackageSearch />}
              title="Aucun résultat"
              description={params.base.q ? `Aucune référence ne correspond à « ${params.base.q} » avec ces filtres.` : "Aucune référence ne correspond à ces filtres."}
              action={<ButtonLink href={resetHref}>Effacer la recherche et les filtres</ButtonLink>}
              secondaryAction={
                params.base.q ? (
                  <ButtonLink href={`/sourcing?q=${encodeURIComponent(params.base.q)}`} variant="secondary">
                    Chercher « {params.base.q} » chez les fournisseurs
                  </ButtonLink>
                ) : undefined
              }
            />
          ) : archived ? (
            <EmptyState
              icon={<Package />}
              title="Aucun produit archivé"
              action={
                <ButtonLink href="/stock" variant="secondary">
                  Voir le stock actif
                </ButtonLink>
              }
            />
          ) : (
            <EmptyState
              icon={<Package />}
              title="Aucun produit"
              description="Ajoutez votre premier produit et ses variantes, ou connectez eBay pour importer vos annonces."
              action={writable ? <ButtonLink href="/stock/new">Créer un produit</ButtonLink> : undefined}
              secondaryAction={
                <ButtonLink href="/settings/integrations" variant="secondary">
                  Connecter eBay
                </ButtonLink>
              }
            />
          )
        ) : (
          <StockTableV5
            rows={rows}
            sortHeaders={sortHeaders}
            density={params.density}
            openCode={detail?.row.code ?? null}
            writable={writable}
            exportBase="/stock/export.csv"
            footer={
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft bg-surface-2 px-4 py-2.5">
                <span className="min-w-0 flex-1 basis-64 text-[12.5px] font-semibold leading-[17px] text-ink-3">Couverture : stock disponible ÷ vitesse de vente récente (7, 30 ou 90 jours selon l&apos;historique).</span>
                <nav aria-label="Pagination" className="flex items-center gap-2">
                  <span className="ms-code whitespace-nowrap text-[11px] leading-[15px] text-muted tnum">
                    {formatNumber(from)}–{formatNumber(to)} sur {formatNumber(list.total)}
                  </span>
                  {list.page > 1 ? (
                    <Link href={pageHref(list.page - 1) as never} rel="prev" aria-label="Page précédente" className={btn}>
                      <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                    </Link>
                  ) : (
                    <span aria-hidden="true" className={cn(btn, "pointer-events-none opacity-40")}>
                      <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                    </span>
                  )}
                  {list.page < pageCount ? (
                    <Link href={pageHref(list.page + 1) as never} rel="next" aria-label="Page suivante" className={btn}>
                      <ChevronRight aria-hidden="true" className="h-4 w-4" />
                    </Link>
                  ) : (
                    <span aria-hidden="true" className={cn(btn, "pointer-events-none opacity-40")}>
                      <ChevronRight aria-hidden="true" className="h-4 w-4" />
                    </span>
                  )}
                </nav>
              </div>
            }
          />
        )}
      </Paper>
      {panel}
    </>
  );
}
