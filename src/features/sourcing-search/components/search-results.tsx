"use client";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, ExternalLink, LayoutGrid, Table2 } from "lucide-react";
import type { SimpleRankedOfferDTO, SimpleSearchDTO } from "@/features/mobile-api/contract";
import { MarketRuler, MonoLabel, Paper, StageFigure } from "@/components/instrument";
import { SupplierBadge } from "@/features/directory/components/supplier-badge";
import { frenchTitle, OFFER_CATEGORIES, OFFER_CATEGORY_LABEL, shortSupplierName, type OfferCategory } from "@/domain/sourcing/offer-display";
import { formatMoney, formatNumber } from "@/lib/format";
import { cn, safeExternalUrl } from "@/lib/utils";
import {
  SORT_HINT,
  SORT_LABEL,
  bestOpportunity,
  defaultCategory,
  groupByCategory,
  isStale,
  marketGapText,
  offerGroups,
  priceView,
  rankedOffers,
  rulerCaption,
  rulerEmptyCaption,
  rulerShortCaption,
  shortAge,
  signedEstimate,
  stockText,
  visibleOffers,
  type OfferGroup,
  type SearchSort,
} from "@/features/sourcing-search/display";
import { SearchSummary, SourcingScene } from "@/features/sourcing-search/components/search-scene";
import { AccessTag, DealBadge } from "@/features/sourcing-search/components/deal-badge";
import { AnalysisPanel } from "@/features/sourcing-search/components/analysis-panel";

const PAGE = 50;
const SORTS: SearchSort[] = ["price", "deals", "supplier"];
type View = "table" | "cards";

/**
 * Résultats de la recherche fournisseurs (scène + papier). Le tri, la catégorie et l'affichage se
 * changent dans le navigateur (sans relancer la recherche en direct, qui peut durer ~35 s) ;
 * l'analyse d'une offre s'ouvre dans un panneau droit.
 */
export function SupplierSearchView({ data, notice }: { data: SimpleSearchDTO; notice?: ReactNode }) {
  const cur = data.currency;
  const ranked = useMemo(() => rankedOffers(data), [data]);
  const byCategory = useMemo(() => groupByCategory(ranked), [ranked]);
  const [category, setCategory] = useState<OfferCategory | "all" | null>(null);
  const [sort, setSort] = useState<SearchSort>("price");
  const [view, setView] = useState<View>("table");
  const [shown, setShown] = useState(PAGE);
  const [analyzedId, setAnalyzedId] = useState<string | null>(null);
  const active = category ?? defaultCategory(data.query, byCategory);
  const offers = useMemo(() => visibleOffers(ranked, active, sort), [ranked, active, sort]);
  const groups = useMemo(() => offerGroups(offers, sort, shown), [offers, sort, shown]);
  const best = useMemo(() => bestOpportunity(offers), [offers]);
  const analyzed = analyzedId ? (ranked.find((o) => o.id === analyzedId) ?? null) : null;
  const close = useCallback(() => setAnalyzedId(null), []);
  const compared = ranked.filter((o) => o.deal?.comparable).length;
  const supplierCount = new Set(ranked.map((o) => o.supplierId)).size;
  const provisional = offers.some((o) => o.deal && o.deal.margin !== null && o.deal.provisional) || (offers.some((o) => o.deal && o.deal.margin !== null) && (data.missingCostSettings?.length ?? 0) > 0);

  const choose = (c: OfferCategory | "all") => {
    setCategory(c);
    setShown(PAGE);
  };

  return (
    <>
      <SourcingScene
        query={data.query}
        below={
          <SearchSummary>
            {formatNumber(data.total)} offre{data.total > 1 ? "s" : ""} · {supplierCount} fournisseur{supplierCount > 1 ? "s" : ""} · {compared} comparée{compared > 1 ? "s" : ""} · « {data.query} » · en {formatNumber(data.durationMs / 1000, 1)} s
          </SearchSummary>
        }
        aside={best && best.deal ? <BestOpportunity offer={best} currency={cur} onOpen={() => setAnalyzedId(best.id)} /> : null}
      />
      <Paper>
        {notice}
        <div className="flex flex-wrap items-center gap-2.5">
          <div role="radiogroup" aria-label="Classer les offres" className="flex w-full rounded-xl bg-track p-[3px] sm:w-[360px]">
            {SORTS.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={sort === s}
                onClick={() => {
                  setSort(s);
                  setShown(PAGE);
                }}
                className={cn("h-[34px] flex-1 rounded-[10px] text-[13px] font-bold transition-colors", sort === s ? "bg-surface text-foreground shadow-[0_2px_6px_rgba(16,28,44,.08)]" : "text-muted hover:text-foreground")}
              >
                {SORT_LABEL[s]}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Catégories" className="flex flex-wrap gap-1.5">
            <Chip label="Tout" count={ranked.length} selected={active === "all"} onClick={() => choose("all")} />
            {OFFER_CATEGORIES.filter((c) => (byCategory.get(c)?.length ?? 0) > 0).map((c) => (
              <Chip key={c} label={OFFER_CATEGORY_LABEL[c]} count={byCategory.get(c)?.length ?? 0} selected={active === c} onClick={() => choose(c)} />
            ))}
          </div>
          <span className="flex-1" />
          <div role="radiogroup" aria-label="Affichage" className="hidden rounded-[10px] bg-track p-[3px] md:flex">
            {(
              [
                ["table", "Tableau", Table2],
                ["cards", "Cartes", LayoutGrid],
              ] as const
            ).map(([v, label, Icon]) => (
              <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)} className={cn("flex h-[34px] items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-bold transition-colors", view === v ? "bg-surface text-foreground" : "text-ink-3 hover:text-foreground")}>
                <Icon aria-hidden="true" className="h-[15px] w-[15px]" />
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mx-0.5 mb-2.5 mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12.5px] font-semibold leading-[17px] text-ink-3">{SORT_HINT[sort]}</p>
          {provisional ? (
            <p className="text-[12.5px] font-semibold leading-[17px] text-warning" title={data.missingCostSettings?.length ? `Coûts non renseignés : ${data.missingCostSettings.join(", ")}` : undefined}>
              Marges provisoires ·{" "}
              <Link href="/radar/settings" className="font-bold underline">
                compléter mes coûts
              </Link>
            </p>
          ) : null}
        </div>

        {offers.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border-strong bg-surface p-6 text-center text-sm font-medium text-muted">Aucune offre dans cette catégorie.</p>
        ) : (
          <>
            {view === "table" ? (
              <div className="hidden md:block">
                <OfferTable groups={groups} sort={sort} currency={cur} selectedId={analyzedId} onOpen={setAnalyzedId} />
              </div>
            ) : null}
            <div className={cn("grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr))]", view === "table" && "md:hidden")}>
              {groups.flatMap((g) => g.rows).map((o) => (
                <OfferCard key={o.id} offer={o} currency={cur} selected={analyzedId === o.id} onOpen={() => setAnalyzedId(o.id)} />
              ))}
            </div>
          </>
        )}
        {offers.length > shown ? (
          <div className="mt-4 flex justify-center">
            <button type="button" onClick={() => setShown((n) => n + PAGE)} className="h-10 rounded-xl border border-border bg-surface px-4 text-sm font-bold hover:bg-line-soft">
              Afficher {Math.min(PAGE, offers.length - shown)} de plus ({offers.length - shown} restante{offers.length - shown > 1 ? "s" : ""})
            </button>
          </div>
        ) : null}
        {data.total > ranked.length ? <p className="mt-3 text-xs font-semibold text-ink-3">Seules les {formatNumber(ranked.length)} offres les moins chères sont listées : précisez la recherche.</p> : null}
        <CheckedLine checked={data.checked} />
      </Paper>
      {analyzed ? <AnalysisPanel offer={analyzed} orgCurrency={cur} onClose={close} /> : null}
    </>
  );
}

function Chip({ label, count, selected, onClick }: { label: string; count: number; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className={cn("inline-flex h-9 items-center whitespace-nowrap rounded-full border px-3 text-[13px] font-bold transition-colors", selected ? "border-night bg-night text-on-night" : "border-border bg-surface text-foreground hover:bg-line-soft")}>
      {label} · <span className="ml-1 tnum">{count}</span>
    </button>
  );
}

/** « Consultés en direct : A, B, C (sans réponse). » */
export function CheckedLine({ checked }: { checked: SimpleSearchDTO["checked"] }) {
  if (checked.length === 0) return <p className="mt-3.5 text-xs font-semibold leading-[17px] text-ink-3">Aucun fournisseur interrogé en direct pour cette recherche : seules les offres enregistrées ont été comparées.</p>;
  return (
    <p className="mt-3.5 text-xs font-semibold leading-[17px] text-ink-3">
      Consultés en direct :{" "}
      {checked.map((c, i) => (
        <span key={`${c.supplierName}-${i}`} title={c.ok ? `${c.found} offre${c.found > 1 ? "s" : ""} trouvée${c.found > 1 ? "s" : ""}` : (c.message ?? "Sans réponse")} className={c.ok ? undefined : "text-warning"}>
          {c.supplierName}
          {c.ok ? "" : " (sans réponse)"}
          {i < checked.length - 1 ? ", " : ""}
        </span>
      ))}
      .
    </p>
  );
}

function purchaseFigure(o: SimpleRankedOfferDTO, currency: string): string {
  if (o.price === null || !o.currency) return "—";
  if (o.currency.toUpperCase() === currency.toUpperCase()) return formatMoney(o.price, currency);
  return o.priceConverted !== null ? `≈ ${formatMoney(o.priceConverted, currency)}` : formatMoney(o.price, o.currency);
}

function BestOpportunity({ offer: o, currency, onOpen }: { offer: SimpleRankedOfferDTO; currency: string; onOpen: () => void }) {
  const d = o.deal!;
  const title = frenchTitle(o.title);
  const age = shortAge(o.seenAt);
  const meta = [shortSupplierName(o.supplierName), o.access === "account" ? "votre compte" : null, o.quantity !== null && o.stock !== "out_of_stock" ? `${formatNumber(o.quantity)} en stock` : null, age ? `il y a ${age}` : null].filter(Boolean).join(" · ");
  const gap = marketGapText(d);
  return (
    <button type="button" onClick={onOpen} aria-label={`Meilleure opportunité : ${title}. Ouvrir l'analyse`} className="ms-fade flex min-w-[min(100%,320px)] flex-[0_1_460px] flex-col gap-3 rounded-2xl border border-night-line bg-night-deep p-3.5 text-left hover:border-night-stroke">
      <span className="flex w-full justify-between gap-2">
        <span className="ms-mono text-[10px] leading-[13px] text-mint">Meilleure opportunité</span>
        {d.score !== null ? <span className="ms-mono text-[10px] leading-[13px] text-on-night-subtle tnum">Score {d.score}/100</span> : null}
      </span>
      <span className="flex w-full items-center gap-2.5">
        <SupplierBadge name={o.supplierName} domain={o.domain} className="h-9 w-9 rounded-[10px]" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-bold leading-[19px] text-on-night">{title}</span>
          <span className="truncate text-xs font-semibold leading-4 text-on-night-muted">{meta}</span>
        </span>
      </span>
      <span className="flex flex-wrap gap-x-7 gap-y-2">
        <span className="flex flex-col gap-0.5">
          <MonoLabel onNight>Achat {o.taxType === "ht" ? "HT" : o.taxType === "ttc" ? "TTC" : ""}</MonoLabel>
          <StageFigure value={purchaseFigure(o, currency)} size="xs" />
        </span>
        <span className="flex flex-col gap-0.5">
          <MonoLabel onNight>Marge / unité</MonoLabel>
          <StageFigure value={signedEstimate(d.margin, currency)} size="xs" tone={d.margin !== null && d.margin < 0 ? "danger" : "mint"} />
        </span>
      </span>
      <span className="block w-full">
        <MarketRuler onNight cost={d.totalCost} market={d.marketPrice} caption={rulerCaption(d, currency)} emptyCaption={rulerEmptyCaption(d)} />
      </span>
      <span className="flex w-full items-center gap-2">
        <span className="flex-1 text-[12.5px] font-semibold leading-[17px] text-on-night-muted">{gap ?? d.summary}</span>
        <span className="flex items-center text-[13px] font-bold text-mint">
          Analyse
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </span>
      </span>
    </button>
  );
}

function rowFacts(o: SimpleRankedOfferDTO, currency: string) {
  const pv = priceView(o, currency);
  const title = frenchTitle(o.title);
  const age = shortAge(o.seenAt);
  const d = o.deal ?? null;
  const m = d?.margin ?? null;
  return {
    pv,
    title,
    name: shortSupplierName(o.supplierName),
    link: safeExternalUrl(o.url),
    age: age ? `prix il y a ${age}` : "date du prix inconnue",
    stale: isStale(o.seenAt) || !age,
    origin: title !== o.title ? `origine : ${o.title}` : null,
    priceSub: [pv.tax ?? (o.price !== null ? "HT/TTC ?" : null), pv.converted].filter(Boolean).join(" · "),
    stock: stockText(o),
    stockTone: o.stock === "out_of_stock" ? "text-danger" : o.stock === "unknown" ? "text-muted" : "text-success",
    margin: m === null ? "—" : signedEstimate(m, currency),
    marginTone: m === null ? "text-ink-3" : m >= 0 ? "text-success" : "text-danger",
    marginSub: m === null ? "non calculable" : `${d?.marginPercent !== null && d?.marginPercent !== undefined ? `${formatNumber(d.marginPercent, 1)} %` : "—"}${d?.provisional ? " · provisoire" : ""}`,
    marginSubTone: d?.provisional && m !== null ? "text-warning" : "text-ink-3",
  };
}

function OfferTable({ groups, sort, currency, selectedId, onOpen }: { groups: OfferGroup<SimpleRankedOfferDTO>[]; sort: SearchSort; currency: string; selectedId: string | null; onOpen: (id: string) => void }) {
  const th = "ms-mono sticky top-14 z-[5] h-10 bg-surface px-1 text-[10.5px] font-medium leading-[13px] text-ink-3 border-b border-border";
  return (
    <div className="overflow-clip rounded-2xl border border-border bg-surface">
      <table className="w-full table-fixed border-separate border-spacing-0 text-left">
        <caption className="sr-only">Offres fournisseurs, {SORT_LABEL[sort].toLowerCase()}</caption>
        <thead>
          <tr>
            <th scope="col" className={cn(th, "w-[140px] pl-4 xl:w-[172px]")}>
              Fournisseur
            </th>
            <th scope="col" className={th}>
              Offre
            </th>
            <th scope="col" className={cn(th, "w-[112px] text-right")}>
              Prix
            </th>
            <th scope="col" className={cn(th, "hidden w-[96px] text-right min-[1400px]:table-cell")}>
              Stock
            </th>
            <th scope="col" className={cn(th, "hidden w-[168px] pl-3 xl:table-cell")}>
              Règle de marché
            </th>
            <th scope="col" className={cn(th, "hidden w-[136px] min-[1400px]:table-cell")}>
              Niveau
            </th>
            <th scope="col" className={cn(th, "w-[112px] text-right")}>
              Marge ≈
            </th>
            <th scope="col" className={cn(th, "w-[44px] pr-3")}>
              <span className="sr-only">Lien</span>
            </th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.key}>
            <tr className="bg-[#f7f8fa]">
              <th scope="colgroup" colSpan={2} className="h-[34px] border-b border-line-soft px-4 text-left font-normal">
                <span className="ms-mono text-[11px] leading-[14px] tracking-[0.08em] text-muted">{g.label}</span>
                <span className="ms-code ml-2 text-[11px] leading-[14px] text-foreground">{sort === "supplier" ? `${g.rows.length} résultat${g.rows.length > 1 ? "s" : ""}` : g.rows.length}</span>
              </th>
              {/* cellules vides alignées sur les colonnes visibles (une colonne masquée ne doit pas être recréée par un colSpan) */}
              <td className="border-b border-line-soft" />
              <td className="hidden border-b border-line-soft min-[1400px]:table-cell" />
              <td className="hidden border-b border-line-soft xl:table-cell" />
              <td className="hidden border-b border-line-soft min-[1400px]:table-cell" />
              <td className="border-b border-line-soft" />
              <td className="border-b border-line-soft" />
            </tr>
            {g.rows.map((o) => (
              <OfferRow key={o.id} offer={o} currency={currency} selected={selectedId === o.id} onOpen={() => onOpen(o.id)} />
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function OfferRow({ offer: o, currency, selected, onOpen }: { offer: SimpleRankedOfferDTO; currency: string; selected: boolean; onOpen: () => void }) {
  const f = rowFacts(o, currency);
  const d = o.deal ?? null;
  const td = "border-b border-line-soft px-1 py-2 align-middle";
  return (
    <tr onClick={onOpen} className={cn("cursor-pointer", selected ? "bg-selection shadow-[inset_3px_0_0_var(--night)]" : "hover:bg-[#f7f8fa]")}>
      <td className={cn(td, "pl-4")}>
        <span className="flex min-w-0 items-center gap-2.5">
          <SupplierBadge name={o.supplierName} domain={o.domain} className="h-[30px] w-[30px] rounded-[9px]" />
          <span className="flex min-w-0 flex-col gap-[3px]">
            <span className="truncate text-[13.5px] font-bold leading-[18px]" title={o.supplierName}>
              {f.name}
            </span>
            <span className="flex">
              <AccessTag access={o.access} />
            </span>
          </span>
        </span>
      </td>
      <td className={td}>
        <button type="button" onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }} className="block w-full min-w-0 rounded text-left" aria-label={`Analyse de l'offre ${f.title} chez ${f.name}`}>
          <span className="block truncate text-sm font-semibold leading-[19px]" title={f.title}>
            {f.title}
          </span>
          <span className="ms-code block truncate text-[10.5px] leading-[14px] text-ink-3">
            <span className={f.stale ? "text-warning" : undefined}>{f.age}</span>
            {f.origin ? ` · ${f.origin}` : ""}
          </span>
        </button>
      </td>
      <td className={cn(td, "text-right")}>
        <span className="block whitespace-nowrap text-[15px] font-extrabold leading-5 tracking-[-0.2px] tnum">{f.pv.price}</span>
        <span className="ms-code block truncate text-[10px] leading-[13px] text-ink-3">{f.priceSub}</span>
      </td>
      <td className={cn(td, "hidden text-right text-[12.5px] font-bold leading-[17px] min-[1400px]:table-cell", f.stockTone)}>{f.stock}</td>
      <td className={cn(td, "hidden pl-3 xl:table-cell")}>{d ? <MarketRuler cost={d.totalCost} market={d.marketPrice} caption={rulerShortCaption(d)} emptyCaption={rulerShortCaption(d)} /> : <span className="text-xs text-ink-3">—</span>}</td>
      <td className={cn(td, "hidden min-[1400px]:table-cell")}>{d ? <DealBadge level={d.level} label={d.label} /> : <span className="text-xs text-ink-3">—</span>}</td>
      <td className={cn(td, "text-right")}>
        <span className={cn("block whitespace-nowrap text-sm font-extrabold leading-[19px] tnum", f.marginTone)}>{f.margin}</span>
        <span className={cn("block whitespace-nowrap text-[10.5px] font-bold leading-[14px]", f.marginSubTone)}>{f.marginSub}</span>
      </td>
      <td className={cn(td, "pr-3")}>
        {f.link ? (
          <a href={f.link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} aria-label={`Voir l'offre chez ${f.name} (nouvel onglet)`} title="Voir l'offre chez le fournisseur" className="flex h-10 w-8 items-center justify-center rounded-lg text-ink-3 hover:bg-line-soft hover:text-foreground">
            <ExternalLink aria-hidden="true" className="h-4 w-4" />
          </a>
        ) : (
          <span className="sr-only">Lien indisponible</span>
        )}
      </td>
    </tr>
  );
}

function OfferCard({ offer: o, currency, selected, onOpen }: { offer: SimpleRankedOfferDTO; currency: string; selected: boolean; onOpen: () => void }) {
  const f = rowFacts(o, currency);
  const d = o.deal ?? null;
  return (
    <button type="button" onClick={onOpen} aria-label={`Analyse de l'offre ${f.title} chez ${f.name}`} className={cn("flex min-w-0 flex-col gap-2.5 rounded-2xl border p-3.5 pb-3 text-left hover:bg-line-soft", selected ? "border-night bg-selection" : "border-border bg-surface")}>
      <span className="flex min-h-6 w-full items-center gap-2">
        <SupplierBadge name={o.supplierName} domain={o.domain} size="sm" className="h-6 w-6 rounded-[7px]" />
        <span className="min-w-0 truncate text-[13px] font-bold leading-[18px]">{f.name}</span>
        <AccessTag access={o.access} />
        <span className="flex-1" />
        <span className={cn("ms-code shrink-0 text-[11px] leading-[15px]", f.stale ? "text-warning" : "text-ink-3")}>{f.age.replace("prix ", "")}</span>
      </span>
      <span className="flex min-h-10 w-full items-start gap-3">
        <span className="min-w-0 flex-1 text-[15px] font-semibold leading-5">{f.title}</span>
        <span className="flex shrink-0 flex-col items-end">
          <span className="whitespace-nowrap text-[17px] font-extrabold leading-[22px] tracking-[-0.3px] tnum">{f.pv.price}</span>
          <span className="ms-code whitespace-nowrap text-[10.5px] leading-[15px] text-ink-3">{f.priceSub}</span>
        </span>
      </span>
      <span className="block w-full">{d ? <MarketRuler cost={d.totalCost} market={d.marketPrice} caption={rulerCaption(d, currency) ?? undefined} emptyCaption={rulerEmptyCaption(d)} /> : null}</span>
      <span className="flex min-h-6 w-full flex-wrap items-center gap-2">
        {d ? <DealBadge level={d.level} label={d.label} /> : null}
        <span className={cn("text-[13.5px] font-extrabold tnum", f.marginTone)}>{f.margin}</span>
        {d?.provisional && d.margin !== null ? <span className="text-[11px] font-bold text-warning">provisoire</span> : null}
        <span className="flex-1" />
        <span className={cn("text-[12.5px] font-bold", f.stockTone)}>{f.stock}</span>
      </span>
    </button>
  );
}
