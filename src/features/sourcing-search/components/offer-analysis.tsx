import Link from "next/link";
import { ExternalLink, TriangleAlert } from "lucide-react";
import type { SimpleRankedOfferDTO } from "@/features/mobile-api/contract";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { frenchTitle, shortSupplierName } from "@/domain/sourcing/offer-display";
import { formatMoney, formatNumber, formatRelative } from "@/lib/format";
import { safeExternalUrl, cn } from "@/lib/utils";
import { ACCESS_LABEL, DEAL_VARIANT, dealCascade, isStale, priceView, rulerCaption, rulerEmptyCaption, signedEstimate, stockText } from "@/features/sourcing-search/display";
import { MarketRuler } from "@/features/sourcing-search/components/market-ruler";

/**
 * Analyse d'une offre (contenu du panneau) : marge estimée, position face au marché, cascade
 * prix → frais → coût rendu → revente → marge, points à vérifier. Uniquement les montants calculés
 * par le serveur (champ `deal`) ; rien n'est commandé ni envoyé au fournisseur.
 */
export function OfferAnalysis({ offer: o, orgCurrency }: { offer: SimpleRankedOfferDTO; orgCurrency: string }) {
  const d = o.deal ?? null;
  const link = safeExternalUrl(o.url);
  const name = shortSupplierName(o.supplierName);
  const title = frenchTitle(o.title);
  const pv = priceView(o, orgCurrency);
  const money = (v: number | null) => (v === null ? "—" : formatMoney(v, orgCurrency));
  const shareOfResale = d && d.margin !== null && d.resalePrice ? Math.round((d.margin / d.resalePrice) * 1000) / 10 : null;
  const lines = d ? dealCascade(d) : [];
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">{name}</span>
          {o.access ? <Badge variant={o.access === "account" ? "accent" : "outline"}>{ACCESS_LABEL[o.access]}</Badge> : null}
          {o.country ? <span className="text-xs text-muted">{o.country}</span> : null}
        </div>
        <p className="text-base font-semibold text-foreground">{title}</p>
        {title !== o.title ? <p className="text-xs text-muted">Titre d&apos;origine : {o.title}</p> : null}
        <p className="text-xs text-muted tnum">
          {pv.price}
          {pv.tax ? ` ${pv.tax}` : ""}
          {pv.converted ? ` (${pv.converted})` : ""} · {stockText(o)} ·{" "}
          <span className={isStale(o.seenAt) ? "font-medium text-warning" : undefined}>{o.seenAt ? `prix vu ${formatRelative(o.seenAt)}` : "date du prix inconnue"}</span>
        </p>
      </div>

      {d ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={DEAL_VARIANT[d.level]}>{d.label}</Badge>
          {d.provisional ? <Badge variant="warning">provisoire</Badge> : null}
          {d.score !== null ? <span className="text-xs text-muted tnum">Score {d.score}/100</span> : null}
        </div>
      ) : null}

      {d && d.margin !== null ? (
        <section className="space-y-3" aria-label="Marge estimée">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted">Marge estimée par unité</div>
              <div className={cn("text-2xl font-semibold tnum", d.margin >= 0 ? "text-success" : "text-danger")}>{signedEstimate(d.margin, orgCurrency)}</div>
            </div>
            {shareOfResale !== null ? (
              <div className="text-right text-xs text-muted">
                <span className="block text-sm font-semibold text-foreground tnum">{formatNumber(shareOfResale, 1)} %</span>
                du prix de revente
              </div>
            ) : null}
          </div>
          {d.provisional ? (
            <p className="text-xs text-warning">
              Provisoire : coûts non comptés ({d.missingCosts.join(", ") || "paramètres incomplets"}).{" "}
              <Link href="/radar/settings" className="font-medium underline">
                Compléter mes coûts
              </Link>
            </p>
          ) : null}
          <MarketRuler large cost={d.totalCost} market={d.marketPrice} resale={d.resalePrice} caption={rulerCaption(d, orgCurrency)} emptyCaption={rulerEmptyCaption(d)} />
        </section>
      ) : (
        <div className="rounded-lg border border-dashed border-border-strong p-4 text-sm">
          <p className="font-medium">{d ? d.label : "Analyse indisponible"}</p>
          <p className="mt-1 text-muted">{d ? d.summary : "Aucune offre équivalente pour comparer ce prix."}</p>
        </div>
      )}

      {lines.length > 0 ? (
        <section aria-labelledby="cascade-title" className="space-y-2">
          <h3 id="cascade-title" className="text-xs font-semibold uppercase tracking-wide text-muted">
            Calcul par unité
          </h3>
          <table className="w-full text-sm">
            <caption className="sr-only">Cascade de marge : prix, frais, coût rendu, revente, marge</caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Étape</th>
                <th scope="col">Montant</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.label} className={cn("border-b border-border last:border-0", l.kind === "subtotal" || l.kind === "result" ? "font-semibold" : "")}>
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                    <span className={l.kind === "subtotal" || l.kind === "result" ? "font-semibold" : undefined}>{l.label}</span>
                    {l.note ? <span className="ml-1 text-xs text-muted">({l.note})</span> : null}
                  </th>
                  <td className={cn("py-1.5 text-right tnum", l.kind === "result" && l.amount !== null ? (l.amount >= 0 ? "text-success" : "text-danger") : "")}>
                    {l.amount === null ? "—" : l.kind === "add" ? `+ ${money(l.amount)}` : l.kind === "minus" ? `− ${money(l.amount)}` : l.kind === "result" ? signedEstimate(l.amount, orgCurrency) : money(l.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {d && d.marketPrice !== null ? (
            <p className="text-xs text-muted">
              Marché ≈ {money(d.marketPrice)} ({d.marketBasis === "marketplace" ? `${d.marketCount} annonce${d.marketCount > 1 ? "s" : ""} équivalente${d.marketCount > 1 ? "s" : ""}` : d.marketBasis === "suppliers" ? `${d.marketCount} autres fournisseurs` : `${d.marketCount} offre${d.marketCount > 1 ? "s" : ""}`})
              {d.discountPercent !== null ? ` · ${d.discountPercent > 0 ? `${formatNumber(d.discountPercent, 1)} % sous le marché` : `${formatNumber(Math.abs(d.discountPercent), 1)} % au-dessus du marché`}` : ""}
            </p>
          ) : null}
          {d?.summary ? <p className="text-xs text-muted-strong">{d.summary}</p> : null}
        </section>
      ) : null}

      {d && d.uncertainties.length > 0 ? (
        <section aria-labelledby="verify-title" className="space-y-2">
          <h3 id="verify-title" className="text-xs font-semibold uppercase tracking-wide text-muted">
            À vérifier avant d&apos;acheter
          </h3>
          <ul className="space-y-1.5">
            {d.uncertainties.map((u) => (
              <li key={u} className="flex items-start gap-2 text-sm text-warning">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{u}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-xs text-muted">Estimation sur vos paramètres de coûts. Rien n&apos;est commandé ni envoyé au fournisseur.</p>
      <div className="flex justify-end">
        {link ? (
          <ButtonLink href={link} aria-label={`Voir l'offre chez ${name} (nouvel onglet)`}>
            <ExternalLink className="h-4 w-4" aria-hidden="true" /> Voir l&apos;offre
          </ButtonLink>
        ) : (
          <span className="text-sm text-muted">Lien indisponible</span>
        )}
      </div>
    </div>
  );
}
