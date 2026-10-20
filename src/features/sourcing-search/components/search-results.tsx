"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { SimpleRankedOfferDTO, SimpleSearchDTO } from "@/features/mobile-api/contract";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { frenchTitle, OFFER_CATEGORIES, OFFER_CATEGORY_LABEL, shortSupplierName, type OfferCategory } from "@/domain/sourcing/offer-display";
import { formatMoney, formatNumber, formatRelative } from "@/lib/format";
import { cn, safeExternalUrl } from "@/lib/utils";
import {
  DEAL_VARIANT,
  SORT_HINT,
  SORT_LABEL,
  bestOpportunity,
  defaultCategory,
  groupByCategory,
  isStale,
  priceView,
  rankedOffers,
  rulerCaption,
  rulerEmptyCaption,
  signedEstimate,
  splitByAccess,
  stockText,
  visibleOffers,
  type SearchSort,
} from "@/features/sourcing-search/display";
import { MarketRuler } from "@/features/sourcing-search/components/market-ruler";
import { OfferAnalysis } from "@/features/sourcing-search/components/offer-analysis";

const PAGE = 50;

/**
 * Résultats de la recherche fournisseurs. Le tri et la catégorie se changent dans le navigateur
 * (sans relancer la recherche en direct, qui peut durer ~35 s) ; l'analyse s'ouvre dans un panneau.
 */
export function SupplierSearchResults({ data }: { data: SimpleSearchDTO }) {
  const cur = data.currency;
  const ranked = useMemo(() => rankedOffers(data), [data]);
  const byCategory = useMemo(() => groupByCategory(ranked), [ranked]);
  const [category, setCategory] = useState<OfferCategory | "all" | null>(null);
  const [sort, setSort] = useState<SearchSort>("price");
  const [shown, setShown] = useState(PAGE);
  const [analyzed, setAnalyzed] = useState<SimpleRankedOfferDTO | null>(null);
  const active = category ?? defaultCategory(data.query, byCategory);
  const offers = useMemo(() => visibleOffers(ranked, active, sort), [ranked, active, sort]);
  const best = useMemo(() => bestOpportunity(offers), [offers]);
  const compared = ranked.filter((o) => o.deal?.comparable).length;
  const withMargin = offers.some((o) => o.deal && o.deal.margin !== null);
  const sections = sort === "price" ? splitByAccess(offers) : null;
  const hasAccountSection = Boolean(sections && sections.account.length > 0);

  const choose = (c: OfferCategory | "all") => {
    setCategory(c);
    setShown(PAGE);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted tnum" aria-live="polite">
        {formatNumber(data.total)} offre{data.total > 1 ? "s" : ""} · {data.suppliers.length} fournisseur{data.suppliers.length > 1 ? "s" : ""}
        {compared ? ` · ${compared} comparée${compared > 1 ? "s" : ""} au marché` : ""} · recherche en {formatNumber(data.durationMs / 1000, 1)} s
      </p>

      {best && best.deal ? <BestOpportunity offer={best} currency={cur} onAnalyze={() => setAnalyzed(best)} /> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Catégories" className="flex flex-wrap gap-1.5">
          <CategoryChip label="Tout" count={ranked.length} selected={active === "all"} onClick={() => choose("all")} />
          {OFFER_CATEGORIES.filter((c) => (byCategory.get(c)?.length ?? 0) > 0).map((c) => (
            <CategoryChip key={c} label={OFFER_CATEGORY_LABEL[c]} count={byCategory.get(c)?.length ?? 0} selected={active === c} onClick={() => choose(c)} />
          ))}
        </div>
        <div role="group" aria-label="Tri" className="inline-flex rounded-lg border border-border bg-surface p-0.5">
          {(["price", "deals"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={sort === s}
              onClick={() => {
                setSort(s);
                setShown(PAGE);
              }}
              className={cn("rounded-md px-3 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", sort === s ? "bg-foreground text-white" : "text-muted-strong hover:bg-surface-muted")}
            >
              {SORT_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted">
        {SORT_HINT[sort]}
        {withMargin && data.missingCostSettings && data.missingCostSettings.length > 0 ? (
          <>
            {" "}
            <span className="text-warning">Marges provisoires (coûts non renseignés : {data.missingCostSettings.join(", ")}).</span>{" "}
            <Link href="/radar/settings" className="font-medium text-foreground underline">
              Compléter mes coûts
            </Link>
          </>
        ) : null}
      </p>

      {offers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-strong p-6 text-center text-sm text-muted">Aucune offre dans cette catégorie.</p>
      ) : sections && hasAccountSection ? (
        <>
          <OfferTable caption="Vos comptes fournisseurs" offers={sections.account.slice(0, shown)} currency={cur} onAnalyze={setAnalyzed} />
          {sections.other.length > 0 ? (
            <OfferTable caption="Sources publiques et places de marché" offers={sections.other.slice(0, Math.max(0, shown - sections.account.length))} currency={cur} onAnalyze={setAnalyzed} />
          ) : (
            <p className="text-xs text-muted">Aucune offre publique pour ce produit.</p>
          )}
        </>
      ) : (
        <OfferTable caption={`Offres — ${SORT_LABEL[sort].toLowerCase()}`} offers={offers.slice(0, shown)} currency={cur} onAnalyze={setAnalyzed} />
      )}
      {offers.length > shown ? (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => setShown((n) => n + PAGE)}>
            Afficher {Math.min(PAGE, offers.length - shown)} de plus ({offers.length - shown} restante{offers.length - shown > 1 ? "s" : ""})
          </Button>
        </div>
      ) : null}
      {data.total > ranked.length ? <p className="text-xs text-muted">Seules les {formatNumber(ranked.length)} offres les moins chères sont listées : précisez la recherche.</p> : null}

      <Dialog open={analyzed !== null} onClose={() => setAnalyzed(null)} title="Analyse de l'offre" className="max-w-2xl">
        {analyzed ? <OfferAnalysis offer={analyzed} orgCurrency={cur} /> : null}
      </Dialog>
    </div>
  );
}

function CategoryChip({ label, count, selected, onClick }: { label: string; count: number; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn("rounded-full border px-3 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selected ? "border-foreground bg-foreground text-white" : "border-border bg-surface text-muted-strong hover:bg-surface-muted")}
    >
      {label} <span className="tnum opacity-75">{count}</span>
    </button>
  );
}

function BestOpportunity({ offer: o, currency, onAnalyze }: { offer: SimpleRankedOfferDTO; currency: string; onAnalyze: () => void }) {
  const d = o.deal!;
  const pv = priceView(o, currency);
  return (
    <section aria-label="Meilleure opportunité" className="grid gap-3 rounded-xl border border-border bg-surface p-4 md:grid-cols-[1fr_auto] md:items-center">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold uppercase tracking-wide text-success">Meilleure opportunité</span>
          {d.score !== null ? <span className="text-muted tnum">Score {d.score}/100</span> : null}
        </div>
        <p className="truncate font-medium" title={o.title}>
          {frenchTitle(o.title)}
        </p>
        <p className="text-xs text-muted tnum">
          {shortSupplierName(o.supplierName)} · achat {pv.price}
          {pv.tax ? ` ${pv.tax}` : ""}
          {pv.converted ? ` (${pv.converted})` : ""} · marge {signedEstimate(d.margin, currency)} / unité{d.provisional ? " (provisoire)" : ""}
        </p>
        <MarketRuler cost={d.totalCost} market={d.marketPrice} caption={rulerCaption(d, currency)} emptyCaption={rulerEmptyCaption(d)} className="max-w-md" />
      </div>
      <Button variant="secondary" onClick={onAnalyze}>
        Voir l&apos;analyse
      </Button>
    </section>
  );
}

function OfferTable({ caption, offers, currency, onAnalyze }: { caption: string; offers: SimpleRankedOfferDTO[]; currency: string; onAnalyze: (o: SimpleRankedOfferDTO) => void }) {
  if (offers.length === 0) return null;
  return (
    <Table className="min-w-[1100px]">
      <caption className="px-1 pb-2 text-left text-sm font-semibold text-foreground">{caption}</caption>
      <THead>
        <tr>
          <TH>Fournisseur</TH>
          <TH>Produit</TH>
          <TH align="right">Prix</TH>
          <TH>Stock</TH>
          <TH>Prix vu</TH>
          <TH>Affaire</TH>
          <TH align="right">Marge ≈</TH>
          <TH className="w-44">Position marché</TH>
          <TH>
            <span className="sr-only">Actions</span>
          </TH>
        </tr>
      </THead>
      <TBody>
        {offers.map((o) => (
          <OfferRow key={o.id} offer={o} currency={currency} onAnalyze={onAnalyze} />
        ))}
      </TBody>
    </Table>
  );
}

function OfferRow({ offer: o, currency, onAnalyze }: { offer: SimpleRankedOfferDTO; currency: string; onAnalyze: (o: SimpleRankedOfferDTO) => void }) {
  const pv = priceView(o, currency);
  const d = o.deal ?? null;
  const title = frenchTitle(o.title);
  const link = safeExternalUrl(o.url);
  const name = shortSupplierName(o.supplierName);
  const stale = isStale(o.seenAt);
  return (
    <TR>
      <TD className="max-w-[180px]">
        <div className="truncate font-medium" title={o.supplierName}>
          {name}
        </div>
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted">
          {o.access === "account" ? <Badge variant="accent">Votre compte</Badge> : o.access === "marketplace" ? <span>Place de marché</span> : null}
          {o.country ? <span>{o.country}</span> : null}
        </div>
      </TD>
      <TD className="max-w-[340px]">
        <span className="line-clamp-2" title={title !== o.title ? `Titre d'origine : ${o.title}` : o.title}>
          {title}
        </span>
      </TD>
      <TD align="right" className="whitespace-nowrap tnum">
        <div className="font-medium">
          {pv.price}
          {pv.tax ? <span className="ml-1 text-xs font-normal text-muted">{pv.tax}</span> : null}
        </div>
        {pv.converted ? <div className="text-xs text-muted">{pv.converted}</div> : null}
      </TD>
      <TD className={cn("whitespace-nowrap text-xs font-medium", o.stock === "out_of_stock" ? "text-danger" : o.stock === "in_stock" || o.stock === "low" ? "text-success" : "text-muted")}>{stockText(o)}</TD>
      <TD className={cn("whitespace-nowrap text-xs", stale ? "font-medium text-warning" : "text-muted")}>
        {o.seenAt ? formatRelative(o.seenAt) : "—"}
        {stale ? <span className="sr-only"> (prix ancien)</span> : null}
      </TD>
      <TD className="whitespace-nowrap">
        {d && d.level !== "insufficient_data" ? (
          <span className="inline-flex flex-wrap items-center gap-1">
            <Badge variant={DEAL_VARIANT[d.level]}>{d.label}</Badge>
            {d.provisional ? <span className="text-[11px] text-warning">provisoire</span> : null}
          </span>
        ) : (
          <span className="text-xs text-muted">{d ? d.label : "—"}</span>
        )}
      </TD>
      <TD align="right" className={cn("whitespace-nowrap tnum", d?.margin === null || !d ? "text-muted" : d.margin >= 0 ? "font-semibold text-success" : "font-semibold text-danger")}>
        {d && d.margin !== null ? (
          <>
            {signedEstimate(d.margin, currency)}
            {d.marginPercent !== null ? <div className="text-[11px] font-normal text-muted">{formatNumber(d.marginPercent, 1)} %</div> : null}
          </>
        ) : (
          "—"
        )}
      </TD>
      <TD>{d ? <MarketRuler cost={d.totalCost} market={d.marketPrice} caption={d.marketPrice !== null ? `marché ${formatMoney(d.marketPrice, currency)} (${d.marketCount})` : null} emptyCaption={rulerEmptyCaption(d)} /> : <span className="text-xs text-muted">—</span>}</TD>
      <TD className="whitespace-nowrap">
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" variant="secondary" onClick={() => onAnalyze(o)} aria-label={`Analyse de l'offre ${title} chez ${name}`}>
            Analyse
          </Button>
          {link ? (
            <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-strong hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Voir l'offre chez ${name} (nouvel onglet)`}>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Offre
            </a>
          ) : (
            <span className="px-2 text-xs text-muted">Lien indisponible</span>
          )}
        </div>
      </TD>
    </TR>
  );
}
