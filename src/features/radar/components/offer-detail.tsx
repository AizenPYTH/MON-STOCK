import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink, TriangleAlert } from "lucide-react";
import type { RadarOfferDetailDTO } from "@/features/mobile-api/contract";
import { MonoLabel, MonoTitle, ScoreBar, StageFigure } from "@/components/instrument";
import { SupplierBadge } from "@/features/directory/components/supplier-badge";
import { formatMoney, formatNumber, formatRelative } from "@/lib/format";
import { cn, safeExternalUrl } from "@/lib/utils";
import { FRESHNESS_LABEL, PRICE_ORIGIN_SHORT, STATUS_LABEL, VERDICT_LABEL, ageDaysText, appraisalText, signedProfit } from "@/features/radar/labels";
import { Chip, STATUS_CHIP, VERDICT_CHIP, VERDICT_TEXT } from "@/features/radar/components/chips";
import { RadarWaterfall } from "@/features/radar/components/radar-waterfall";
import { SaveOfferButton } from "@/features/radar/components/save-offer-button";
import { DraftDialogButton } from "@/features/radar/components/draft-dialog";

/**
 * Détail d'une offre du radar (colonne droite collante de /radar ou pleine page /radar/[offerId]) :
 * offre, statut + score, bénéfice par unité, cascade du serveur, points à vérifier, scénarios de
 * quantité, autres offres, appréciation ; pied : voir l'offre, enregistrer, préparer un brouillon.
 * Rien n'est commandé ni envoyé au fournisseur sans confirmation.
 */
export function RadarOfferDetail({
  detail,
  writable,
  variant,
  peerHref,
  quantity,
}: {
  detail: RadarOfferDetailDTO;
  writable: boolean;
  variant: "column" | "page";
  peerHref: (offerId: string) => string;
  /** formulaire « Simuler une quantité » (GET sur la page courante) */
  quantity: { action: string; hidden: Record<string, string>; value: number | null };
}) {
  const { item, scenarios, peers } = detail;
  const e = item.evaluation;
  const o = item.offer;
  const cur = item.sku.currency;
  const money = (v: number) => formatMoney(v, cur);
  const orMoney = (v: number | null) => (v === null ? "—" : money(v));
  const link = safeExternalUrl(o.sourceUrl);
  const tax = o.taxType === "ht" ? "HT" : o.taxType === "ttc" ? "TTC" : null;
  const toCheck = [...e.missing.map((m) => `Coût inconnu : ${m}`), ...e.cautions];
  const d = item.details;
  const extras = [
    d.condition ? `état ${d.condition}` : null,
    d.grade ? `grade ${d.grade}` : null,
    d.warrantyMonths !== null ? `garantie ${d.warrantyMonths} mois` : null,
    d.shipFromCountry ? `expédié depuis ${d.shipFromCountry}` : null,
    d.vatRegime ? `TVA : ${d.vatRegime}` : null,
    d.orderMultiple ? `par multiple de ${d.orderMultiple}` : null,
    d.deliveryMaxDays !== null ? `livraison ≤ ${d.deliveryMaxDays} j` : null,
  ].filter((x): x is string => Boolean(x));
  const profit = e.estimatedProfit;
  const offerMeta = [o.availableQuantity !== null ? `${formatNumber(o.availableQuantity)} dispo` : o.stockStatus === "out_of_stock" ? "en rupture" : "stock non indiqué", o.moq ? `MOQ ${formatNumber(o.moq)}` : null, o.lastSeenAt ? `vu ${formatRelative(o.lastSeenAt)}` : "date du prix inconnue", o.supplierCountry].filter(Boolean).join(" · ");
  const draftBlock = !writable ? "Lecture seule : votre rôle ne permet pas de préparer une commande." : o.price === null ? "Prix de l'offre inconnu : brouillon impossible." : null;
  const column = variant === "column";

  return (
    <div className={cn("flex flex-col rounded-2xl border border-border bg-surface", column && "xl:max-h-[calc(100vh-88px)]")}>
      <div className={cn("flex flex-col gap-5 p-5", column && "min-h-0 flex-1 overflow-y-auto")}>
        {column ? (
          <div className="flex flex-col gap-1">
            <p className="ms-mono truncate text-[11px] leading-[14px] tracking-[0.08em] text-muted tnum">
              {item.sku.code} · stock {formatNumber(item.sku.quantityAvailable)} · {formatNumber(item.sku.units30d)} ventes / 30 j
            </p>
            <h2 className="text-[22px] font-extrabold leading-7 tracking-[-0.4px]">
              <Link href={`/radar/${o.offerId}` as never} className="hover:underline">
                {item.sku.name}
              </Link>
            </h2>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 rounded-[14px] bg-background p-3.5">
          <div className="flex items-center gap-3">
            <SupplierBadge name={o.supplierName} className="h-9 w-9 rounded-[10px]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold leading-5">{o.supplierName}</p>
              <p className="ms-code truncate text-[10.5px] uppercase leading-[15px] text-ink-3 tnum">{offerMeta}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[17px] font-extrabold leading-[22px] tracking-[-0.3px] tnum">{o.price !== null && o.currency ? formatMoney(o.price, o.currency) : "—"}</p>
              <p className={cn("ms-code text-[10.5px] leading-[15px]", tax ? "text-ink-3" : "text-warning")}>{tax ?? "HT/TTC ?"}</p>
            </div>
          </div>
          <p className="text-[13px] font-semibold leading-[18px] text-ink-3">{o.title}</p>
          {item.priceAtSave !== null && o.price !== null && item.priceAtSave !== o.price ? <p className="text-xs font-semibold text-ink-3">Enregistrée à {money(item.priceAtSave)}</p> : null}
          <div className="flex flex-wrap items-center gap-3">
            <Chip className={STATUS_CHIP[e.status]}>{STATUS_LABEL[e.status]}</Chip>
            <ScoreBar score={e.score} className="min-w-[160px] flex-1" />
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <MonoLabel>Bénéfice estimé par unité</MonoLabel>
            <StageFigure value={signedProfit(profit, e.status, money)} size="sm" onNight={false} tone={profit === null ? undefined : profit >= 0 ? "success" : "danger"} />
            <p className={cn("text-xs font-semibold leading-[17px]", e.freshness === "stale" || e.freshness === "unknown" ? "text-warning" : "text-ink-3")}>
              {FRESHNESS_LABEL[e.freshness]} ({ageDaysText(e.ageDays)}) · {PRICE_ORIGIN_SHORT[o.priceOrigin]}
            </p>
          </div>
          {e.marginPercent !== null ? (
            <p className="text-right text-[13px] font-semibold leading-[18px] text-ink-3">
              <b className="font-bold text-foreground tnum">{formatNumber(e.marginPercent, 1)} %</b>
              <br />
              du prix de vente
            </p>
          ) : null}
        </div>
        {e.missing.length > 0 && profit !== null ? <p className="-mt-3 text-xs font-semibold text-warning">Provisoire : calculé avec les seuls coûts connus.</p> : null}

        <section className="flex flex-col gap-2.5" aria-label="Calcul par unité">
          <MonoTitle title="Calcul par unité" as="h3" />
          {e.breakdown.length > 0 ? (
            <RadarWaterfall evaluation={e} format={money} />
          ) : (
            <p className="rounded-2xl border-[1.5px] border-dashed border-border-strong p-3.5 text-[13px] font-semibold text-ink-3">Calcul impossible : données essentielles manquantes ({e.missing.join(", ") || "prix"}).</p>
          )}
        </section>

        {toCheck.length > 0 ? (
          <section className="flex flex-col gap-2" aria-label="À vérifier avant d'acheter">
            <MonoTitle title="À vérifier avant d'acheter" as="h3" />
            <ul className="flex flex-col gap-2">
              {toCheck.map((m) => (
                <li key={m} className="flex items-start gap-2 text-[13px] font-semibold leading-[18px] text-warning">
                  <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{m}</span>
                </li>
              ))}
            </ul>
            {e.missing.length > 0 ? (
              <Link href="/radar/settings" className="inline-flex h-10 items-center self-start rounded-[10px] border border-border-strong bg-surface px-3 text-sm font-extrabold hover:bg-line-soft">
                Compléter mes coûts
              </Link>
            ) : null}
          </section>
        ) : null}

        {scenarios.length > 0 ? (
          <section className="flex flex-col gap-2.5" aria-label="Scénarios de quantité">
            <MonoTitle
              title="Scénarios de quantité"
              as="h3"
              right={
                <form method="get" action={quantity.action} className="flex items-center gap-1.5">
                  {Object.entries(quantity.hidden).map(([k, v]) => (
                    <input key={k} type="hidden" name={k} value={v} />
                  ))}
                  <label htmlFor={`qty-${variant}`} className="sr-only">
                    Simuler une quantité
                  </label>
                  <input id={`qty-${variant}`} name="quantity" type="number" min={1} max={100000} step={1} defaultValue={quantity.value ?? ""} placeholder="Qté" className="h-10 w-20 rounded-[10px] border border-border-control bg-surface px-2 text-[13px] font-semibold tnum focus:border-ring focus:outline-none focus:ring-[3px] focus:ring-ring/25" />
                  <button type="submit" className="h-10 rounded-[10px] border border-border-strong bg-surface px-3 text-[13px] font-bold hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                    Simuler
                  </button>
                </form>
              }
            />
            <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
              {scenarios.map((sc) => (
                <div key={`${sc.quantity}-${sc.label}`} className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-3.5">
                  <p className="text-[15px] font-bold leading-5 tnum">
                    {formatNumber(sc.quantity)} u. <span className="text-[13px] font-semibold text-ink-3">· {sc.label}</span>
                  </p>
                  <p className="text-[13px] font-semibold leading-[18px] text-ink-3 tnum">Capital {orMoney(sc.capital)}</p>
                  <p className={cn("text-[13px] font-bold leading-[18px] tnum", sc.totalProfit === null ? "text-ink-3" : sc.totalProfit >= 0 ? "text-success" : "text-danger")}>{sc.totalProfit === null ? "Bénéfice —" : `Bénéfice ${signedProfit(sc.totalProfit, sc.missing.length > 0 ? "estimated" : e.status, money)}`}</p>
                  {sc.exceedsStock ? <Chip className="self-start bg-danger-soft text-danger">Dépasse le stock annoncé</Chip> : null}
                  {sc.missing.length > 0 ? <p className="text-xs font-semibold leading-[17px] text-warning">Manque : {sc.missing.join(", ")}</p> : null}
                  {sc.assumption ? <p className="text-xs font-semibold leading-[17px] text-ink-3">{sc.assumption}</p> : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {peers.length > 0 ? (
          <section className="flex flex-col gap-2.5" aria-label="Autres offres pour ce produit">
            <MonoTitle title="Autres offres" count={peers.length} as="h3" />
            <ul className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-border bg-surface">
              {peers.map((p) => (
                <li key={p.offerId}>
                  <Link href={peerHref(p.offerId) as never} scroll={false} className="flex items-center justify-between gap-2 px-3.5 py-2.5 hover:bg-line-soft">
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[15px] font-semibold leading-5">{p.supplierName}</span>
                      <span className="ms-code truncate text-[10.5px] uppercase leading-[15px] text-ink-3 tnum">
                        {p.availableQuantity !== null ? `${formatNumber(p.availableQuantity)} dispo` : p.stockStatus === "out_of_stock" ? "en rupture" : "stock ?"} · {ageDaysText(p.ageDays)}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-[3px]">
                      <span className={cn("text-[15px] font-bold leading-5 tnum", p.landedCost !== null && e.landedCost !== null && p.landedCost < e.landedCost && "text-success")}>{orMoney(p.landedCost)}</span>
                      <Chip className={VERDICT_CHIP[p.verdict]}>{VERDICT_LABEL[p.verdict]}</Chip>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-xs font-semibold leading-[17px] text-ink-3">Coût rendu par unité ; seules les offres rattachées au même article sont comparées.</p>
          </section>
        ) : null}

        <details className="group rounded-2xl border border-border bg-surface">
          <summary className="flex min-h-[48px] cursor-pointer list-none items-center gap-3 px-4 py-3.5 hover:opacity-80 [&::-webkit-details-marker]:hidden">
            <span className="flex flex-1 flex-col">
              <span className="text-[15px] font-semibold leading-5">Appréciation</span>
              <span className={cn("text-[13px] font-semibold leading-[18px]", VERDICT_TEXT[item.assessment.verdict])}>{VERDICT_LABEL[item.assessment.verdict]}</span>
            </span>
            <ChevronDown aria-hidden="true" className="h-4 w-4 text-ink-3 transition-transform duration-150 group-open:rotate-180" />
          </summary>
          <div className="flex flex-col gap-2 border-t border-line-soft px-4 pb-4 pt-3">
            {item.assessment.verdictReasons.map((r) => (
              <p key={r} className="text-[13px] font-semibold leading-[18px] text-muted">
                – {r}
              </p>
            ))}
            <dl className="flex flex-col gap-1">
              {(
                [
                  ["Compétitivité", item.assessment.competitiveness],
                  ["Fiabilité de la source", item.assessment.sourceReliability],
                  ["Confiance des données", item.assessment.dataConfidence],
                ] as const
              ).map(([label, a]) => (
                <div key={label} className="flex justify-between gap-2 text-[13px] font-semibold leading-[18px]">
                  <dt>{label}</dt>
                  <dd className="tnum">{appraisalText(a)}</dd>
                </div>
              ))}
            </dl>
            {extras.length > 0 ? <p className="text-xs font-semibold leading-[17px] text-ink-3">Annoncé par le fournisseur : {extras.join(" · ")}</p> : null}
            {e.reasons.length > 0 ? <p className="text-xs font-semibold leading-[17px] text-ink-3">{e.reasons.join(" ")}</p> : null}
          </div>
        </details>
        <p className="text-xs font-semibold leading-[17px] text-ink-3">Estimation sur vos paramètres de coûts. Rien n&apos;est commandé ni envoyé au fournisseur.</p>
      </div>

      <Footer>
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" aria-label={`Voir l'offre chez ${o.supplierName} (nouvel onglet)`} title="Voir l'offre chez le fournisseur" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border-strong bg-surface hover:bg-line-soft">
            <ExternalLink aria-hidden="true" className="h-[18px] w-[18px]" />
          </a>
        ) : (
          <span title="Lien de l'offre indisponible" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-dashed border-border-strong text-ink-4">
            <ExternalLink aria-hidden="true" className="h-[18px] w-[18px]" />
            <span className="sr-only">Lien de l&apos;offre indisponible</span>
          </span>
        )}
        <SaveOfferButton offerId={o.offerId} saved={Boolean(item.savedAt)} disabled={!writable} disabledReason="Lecture seule : enregistrement impossible" />
        <DraftDialogButton offerId={o.offerId} supplierName={o.supplierName} moq={o.moq} unitPrice={o.price} currency={o.currency ?? cur} taxLabel={tax} disabledReason={draftBlock} />
      </Footer>
    </div>
  );
}

function Footer({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 gap-2.5 rounded-b-2xl border-t border-border bg-surface px-4 py-3">{children}</div>;
}
