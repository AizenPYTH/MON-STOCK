"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { ExternalLink, Store, TriangleAlert, X } from "lucide-react";
import type { SimpleRankedOfferDTO } from "@/features/mobile-api/contract";
import { MarginWaterfall, MarketRuler, MonoLabel, MonoTitle, ScoreBar, StageFigure } from "@/components/instrument";
import { SupplierBadge } from "@/features/directory/components/supplier-badge";
import { frenchTitle, shortSupplierName } from "@/domain/sourcing/offer-display";
import { formatMoney, formatNumber } from "@/lib/format";
import { safeExternalUrl } from "@/lib/utils";
import { analysisWaterfall, isStale, priceView, rulerCaption, rulerEmptyCaption, shortAge, signedEstimate, stockText } from "@/features/sourcing-search/display";
import { AccessTag, DealBadge } from "@/features/sourcing-search/components/deal-badge";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Analyse d'une offre : panneau droit 520 px (voile, Échap, focus dans le panneau). Uniquement les
 * montants calculés par le serveur (champ `deal`) ; rien n'est commandé ni envoyé au fournisseur.
 * L'état reste dans le navigateur : rouvrir une analyse ne relance pas la recherche en direct.
 */
export function AnalysisPanel({ offer: o, orgCurrency, onClose }: { offer: SimpleRankedOfferDTO; orgCurrency: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (back?.isConnected) back.focus();
    };
  }, [onClose]);

  const d = o.deal ?? null;
  const link = safeExternalUrl(o.url);
  const name = shortSupplierName(o.supplierName);
  const title = frenchTitle(o.title);
  const pv = priceView(o, orgCurrency);
  const age = shortAge(o.seenAt);
  const stale = isStale(o.seenAt);
  const share = d && d.margin !== null && d.resalePrice ? Math.round((d.margin / d.resalePrice) * 1000) / 10 : null;
  const lines = d ? analysisWaterfall(d, o.taxType) : [];
  const money = (n: number) => formatMoney(n, orgCurrency);

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Fermer l'analyse" className="ms-fade absolute inset-0 cursor-default bg-overlay" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={`Analyse de l'offre ${title}`} tabIndex={-1} className="ms-slide absolute inset-y-0 right-0 flex w-full max-w-[520px] flex-col bg-background shadow-[-12px_0_40px_rgba(10,20,32,.25)] focus:outline-none">
        <header className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-5 pb-3 pt-3.5">
          <SupplierBadge name={o.supplierName} domain={o.domain} className="h-9 w-9 rounded-[10px]" />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[15px] font-bold leading-5">{name}</span>
              <AccessTag access={o.access} />
            </div>
            <div className="ms-code truncate text-[10.5px] uppercase leading-[15px] text-ink-3">
              {stockText(o)}
              {o.country ? ` · ${o.country}` : ""} · <span className={stale ? "text-warning" : undefined}>{age ? `vu il y a ${age}` : "date du prix inconnue"}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer l'analyse (Échap)" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background hover:bg-line-soft">
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <div className="space-y-2.5">
            <h2 className="text-lg font-bold leading-6 tracking-[-0.2px]">{title}</h2>
            {title !== o.title ? <p className="ms-code -mt-1.5 text-[10.5px] leading-[15px] text-ink-3">Titre d&apos;origine : {o.title}</p> : null}
            <p className="text-[13px] font-semibold text-muted tnum">
              Achat {pv.price}
              {pv.tax ? ` ${pv.tax}` : pv.price !== "Prix non indiqué" ? " · HT/TTC non précisé" : ""}
              {pv.converted ? ` · ${pv.converted}` : ""}
            </p>
            {d ? (
              <div className="flex items-center gap-3">
                <DealBadge level={d.level} label={d.label} size="md" />
                {d.score !== null ? <ScoreBar score={d.score} className="flex-1" /> : null}
              </div>
            ) : null}
          </div>

          {d && d.margin !== null ? (
            <section aria-label="Marge estimée" className="space-y-3">
              <div className="flex items-end justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <MonoLabel>Marge estimée par unité</MonoLabel>
                  <StageFigure value={signedEstimate(d.margin, orgCurrency)} size="sm" onNight={false} tone={d.margin >= 0 ? "success" : "danger"} />
                </div>
                {share !== null ? (
                  <p className="text-right text-[13px] font-semibold leading-[18px] text-ink-3">
                    <b className="font-bold text-foreground tnum">{formatNumber(share, 1)} %</b>
                    <br />
                    du prix de revente
                  </p>
                ) : null}
              </div>
              {d.provisional ? (
                <p className="text-xs font-semibold leading-[17px] text-warning">
                  Provisoire, {d.missingCosts.length ? `coûts non comptés : ${d.missingCosts.join(", ")}` : "paramètres de coûts incomplets"} ·{" "}
                  <Link href="/radar/settings" className="font-bold underline">
                    compléter mes coûts
                  </Link>
                </p>
              ) : null}
              <div className="rounded-2xl border border-border bg-surface px-3.5 pb-2.5 pt-3">
                <MarketRuler large cost={d.totalCost} market={d.marketPrice} resale={d.resalePrice} emptyCaption={rulerEmptyCaption(d)} />
                {d.totalCost !== null && d.marketPrice !== null ? (
                  <>
                    <div className="ms-code relative mt-1 h-[13px] text-[9.5px] leading-[13px] text-ink-3" aria-hidden="true">
                      <span className="absolute left-0">−40 %</span>
                      <span className="absolute left-2/3 -translate-x-1/2">marché</span>
                      <span className="absolute right-0">+20 %</span>
                    </div>
                    <p className="ms-code mt-1.5 text-[10px] uppercase leading-[14px] tracking-[0.03em] text-ink-3 tnum">{rulerCaption(d, orgCurrency)}</p>
                    <ul className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 text-[11.5px] font-semibold leading-4 text-muted">
                      <li className="flex items-center gap-1.5">
                        <span aria-hidden="true" className="h-[9px] w-[9px] rounded-full bg-foreground" />
                        coût rendu
                      </li>
                      <li className="flex items-center gap-1.5">
                        <span aria-hidden="true" className="h-[11px] w-0.5 bg-foreground" />
                        {d.marketBasis === "marketplace" ? "médiane des annonces de revente" : d.marketBasis === "suppliers" ? "médiane des autres fournisseurs" : "médiane du marché"}
                      </li>
                      {d.resalePrice !== null ? (
                        <li className="flex items-center gap-1.5">
                          <span aria-hidden="true" className="h-2 w-2 rotate-45 bg-mint" />
                          votre revente
                        </li>
                      ) : null}
                    </ul>
                  </>
                ) : null}
              </div>
            </section>
          ) : (
            <div className="space-y-1.5 rounded-2xl border-[1.5px] border-dashed border-border-strong p-4">
              <p className="text-[15px] font-semibold">{d ? d.label : "Analyse indisponible"}</p>
              <p className="text-sm font-medium text-muted">{d ? d.summary : "Aucune offre équivalente pour comparer ce prix."}</p>
            </div>
          )}

          {lines.length > 0 ? (
            <section aria-labelledby="an-cascade" className="space-y-2.5">
              <MonoTitle title="Calcul par unité" as="h3" />
              <span id="an-cascade" className="sr-only">
                Calcul par unité : revente, achat, frais, coût rendu, frais de vente, marge
              </span>
              <MarginWaterfall lines={lines} format={money} />
            </section>
          ) : null}

          {d && d.uncertainties.length > 0 ? (
            <section className="space-y-2.5">
              <MonoTitle title="À vérifier avant d'acheter" as="h3" />
              <ul className="space-y-2">
                {d.uncertainties.map((u) => (
                  <li key={u} className="flex items-start gap-2 text-[13px] font-semibold leading-[18px] text-warning">
                    <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{u}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {d?.summary && d.margin !== null ? <p className="text-[13px] font-medium text-muted">{d.summary}</p> : null}
          <p className="text-xs font-semibold text-ink-3">Estimation sur vos paramètres de coûts. Rien n&apos;est commandé ni envoyé au fournisseur.</p>
        </div>

        <footer className="flex shrink-0 gap-2 border-t border-border bg-surface px-5 pb-4 pt-3">
          {UUID.test(o.supplierId) ? (
            <Link href={`/suppliers/${o.supplierId}` as never} aria-label={`Fiche du fournisseur ${name}`} title="Fiche fournisseur" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border-strong bg-surface hover:bg-line-soft">
              <Store aria-hidden="true" className="h-5 w-5" />
            </Link>
          ) : null}
          {link ? (
            <a href={link} target="_blank" rel="noopener noreferrer" className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-mint text-[15px] font-extrabold text-night hover:bg-mint-pressed" aria-label={`Voir l'offre chez ${name} (nouvel onglet)`}>
              <ExternalLink aria-hidden="true" className="h-[18px] w-[18px]" />
              Voir l&apos;offre
            </a>
          ) : (
            <span className="flex h-12 flex-1 items-center justify-center rounded-xl border border-dashed border-border-strong text-sm font-semibold text-ink-3">Lien de l&apos;offre indisponible</span>
          )}
        </footer>
      </div>
    </div>
  );
}
