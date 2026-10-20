import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Package } from "lucide-react";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { Paper } from "@/components/instrument";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/page";
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
  const btn = "flex h-10 w-10 items-center justify-center rounded-[9px] border border-border-strong hover:bg-line-soft";

  return (
    <>
      <StockScene analytics={analytics} currency={currency} archived={archived} exportHref={exportBase} filterHref={filterHref} />
      <Paper className="lg:pt-5">
        <StockToolbar flat={flat} params={params} analytics={analytics} facets={list.facets} />
        <div className="mx-0.5 mb-2.5 mt-3.5 flex flex-wrap items-center justify-between gap-3">
          <span className="ms-mono text-[10px] leading-[13px] text-ink-3">
            {formatNumber(list.total)} référence{list.total > 1 ? "s" : ""} · {SORT_LABEL[params.sort]}
          </span>
          {missingFees.length > 0 ? (
            <span className="text-[12.5px] font-semibold leading-[17px] text-warning">
              Marges provisoires : {missingFees.join(", ")} non réglé{missingFees.length > 1 ? "s" : ""} ·{" "}
              <Link href="/settings/organization" className="font-bold underline">
                régler mes coûts
              </Link>
            </span>
          ) : null}
        </div>
        {list.truncated ? (
          <Callout tone="warning" className="mb-3">
            Analyse limitée aux premières références : affinez la recherche pour un résultat exhaustif. Les compteurs sont des minima.
          </Callout>
        ) : null}

        {list.rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-6 py-10 text-center">
            <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-background text-muted">
              <Package className="h-7 w-7" strokeWidth={1.8} />
            </span>
            {list.total > 0 ? (
              <>
                <span className="text-[17px] font-bold leading-[22px]">Cette page n&apos;existe plus</span>
                <span className="max-w-[420px] text-sm font-medium text-muted">La liste compte {formatNumber(list.total)} références : revenez à la première page.</span>
                <ButtonLink href={pageHref(1)} variant="secondary">
                  Première page
                </ButtonLink>
              </>
            ) : hasFilters ? (
              <>
                <span className="text-[17px] font-bold leading-[22px]">Aucun résultat</span>
                <span className="max-w-[420px] text-sm font-medium text-muted">{params.base.q ? `Aucune référence ne correspond à « ${params.base.q} » avec ces filtres.` : "Aucune référence ne correspond à ces filtres."}</span>
                <div className="mt-1 flex flex-wrap justify-center gap-2">
                  <ButtonLink href={resetHref}>Effacer la recherche et les filtres</ButtonLink>
                  {params.base.q ? (
                    <ButtonLink href={`/sourcing?q=${encodeURIComponent(params.base.q)}`} variant="secondary">
                      Chercher « {params.base.q} » chez les fournisseurs
                    </ButtonLink>
                  ) : null}
                </div>
              </>
            ) : archived ? (
              <>
                <span className="text-[17px] font-bold leading-[22px]">Aucun produit archivé</span>
                <ButtonLink href="/stock" variant="secondary">
                  Voir le stock actif
                </ButtonLink>
              </>
            ) : (
              <>
                <span className="text-[17px] font-bold leading-[22px]">Aucun produit</span>
                <span className="max-w-[420px] text-sm font-medium text-muted">Ajoutez votre premier produit et ses variantes, ou connectez eBay pour importer vos annonces.</span>
                <div className="mt-1 flex flex-wrap justify-center gap-2">
                  {writable ? <ButtonLink href="/stock/new">Créer un produit</ButtonLink> : null}
                  <ButtonLink href="/settings/integrations" variant="secondary">
                    Connecter eBay
                  </ButtonLink>
                </div>
              </>
            )}
          </div>
        ) : (
          <StockTableV5
            rows={rows}
            sortHeaders={sortHeaders}
            density={params.density}
            openCode={detail?.row.code ?? null}
            writable={writable}
            exportBase="/stock/export.csv"
            footer={
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-[12.5px] font-semibold leading-[17px] text-ink-3">Couverture : stock disponible ÷ vitesse de vente récente (7, 30 ou 90 jours selon l&apos;historique).</span>
                <nav aria-label="Pagination" className="flex items-center gap-2">
                  <span className="ms-code whitespace-nowrap text-[11px] leading-[15px] text-muted tnum">
                    {formatNumber(from)}–{formatNumber(to)} sur {formatNumber(list.total)}
                  </span>
                  {list.page > 1 ? (
                    <Link href={pageHref(list.page - 1) as never} rel="prev" aria-label="Page précédente" className={btn}>
                      <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                    </Link>
                  ) : (
                    <span aria-hidden="true" className={cn(btn, "opacity-40")}>
                      <ChevronLeft className="h-4 w-4" />
                    </span>
                  )}
                  {list.page < pageCount ? (
                    <Link href={pageHref(list.page + 1) as never} rel="next" aria-label="Page suivante" className={btn}>
                      <ChevronRight aria-hidden="true" className="h-4 w-4" />
                    </Link>
                  ) : (
                    <span aria-hidden="true" className={cn(btn, "opacity-40")}>
                      <ChevronRight className="h-4 w-4" />
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
