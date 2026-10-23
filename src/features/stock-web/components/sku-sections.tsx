import Link from "next/link";
import { ChevronRight, CircleCheck, CircleX, ClipboardList, ExternalLink, ScanSearch, Store, TriangleAlert } from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { MonoTitle, Panel } from "@/components/instrument";
import { initials } from "@/components/instrument/pure";
import { computeMargin, UNKNOWN_COST_LABEL } from "@/domain/pricing/margin";
import { buildRecommendation, pickCheapestOffer } from "@/features/analytics/replenishment.pure";
import type { SkuDetail } from "@/features/stock/queries";
import { MovementsTimeline } from "@/features/stock/components/movements-timeline";
import { coverDisplay, levelDisplay, marginDisplay, providerLabel } from "@/features/stock-web/list.pure";
import { QuantityStepper } from "@/features/stock-web/components/sku-client";
import { formatMoney, formatNumber, formatRelative } from "@/lib/format";
import { cn, safeExternalUrl } from "@/lib/utils";
import { internalRoute } from "@/lib/routes";

const DAY = 86_400_000;

/** Âge (jours) d'un prix fournisseur, lu au rendu serveur de la fiche. */
function ageInDays(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / DAY;
}

/** Puce de niveau posée sur la scène nuit : icône + texte (jamais la couleur seule). */
export function NightLevelChip({ level }: { level: SkuDetail["view"]["classification"]["level"] }) {
  const d = levelDisplay(level);
  const cls = d.tone === "out" ? "bg-danger-on-night/16 text-danger-on-night" : d.tone === "low" ? "bg-amber/16 text-amber" : "bg-mint/14 text-mint";
  const Icon = d.tone === "out" ? CircleX : d.tone === "low" ? TriangleAlert : CircleCheck;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 py-[3px] text-[11.5px] font-bold leading-[14px] tracking-normal", cls)}>
      <Icon aria-hidden="true" className="h-3 w-3" strokeWidth={2.25} />
      {d.label === "Risque" ? "Risque de rupture" : d.label}
    </span>
  );
}

/** Relevés de la scène de fiche : vendus 30 j, couverture, en commande, seuil d'alerte. */
export function skuStageStats(detail: SkuDetail) {
  const { row, view, onOrder } = detail;
  const cover = coverDisplay(view);
  return [
    { label: "Vendus 30 j", value: formatNumber(row.units_30d) },
    { label: "Couverture", value: cover.text, tone: cover.tone === "danger" ? ("danger" as const) : cover.tone === "warning" ? ("warning" as const) : undefined },
    { label: "En commande", value: formatNumber(onOrder) },
    { label: "Seuil", value: row.reorder_point && row.reorder_point > 0 ? formatNumber(row.reorder_point) : null },
  ];
}

function Tile({ label, value, reason, unknown, tone }: { label: string; value: string; reason: string; unknown?: boolean; tone?: "success" | "danger" }) {
  return (
    <div className={cn("flex min-h-[88px] min-w-0 flex-col justify-between gap-1 rounded-2xl bg-surface p-3 sm:p-3.5", unknown ? "border-[1.5px] border-dashed border-amber" : "border border-border")}>
      <span className="ms-mono text-[10.5px] leading-[14px] text-ink-3">{label}</span>
      <span className={cn("truncate text-[19px] font-extrabold leading-7 tracking-[-0.5px] tnum sm:text-[22px]", unknown ? "text-ink-3" : tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-foreground")}>{value}</span>
      <span className={cn("text-xs font-bold leading-4", unknown ? "text-warning" : tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-ink-3")}>{reason}</span>
    </div>
  );
}

/** Tuiles Prix / Coût / Marge nette (inconnu = filet pointillé ambre) + note des frais non déduits. */
export function PriceTiles({ detail }: { detail: SkuDetail }) {
  const { row, view } = detail;
  const cur = row.currency ?? "EUR";
  const m = view.margin;
  const md = marginDisplay(m);
  const missingFees = m.unknownCosts.filter((u) => u !== "cost_price" && u !== "sale_price");
  const profit = m.netProfit === null ? null : `≈ ${m.netProfit >= 0 ? "+" : "−"}${formatMoney(Math.abs(m.netProfit), cur)} / u${m.complete ? "" : " · provisoire"}`;
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Prix" value={formatMoney(row.sale_price, cur)} reason={row.sale_price === null ? "Prix de vente inconnu" : "Prix de vente"} unknown={row.sale_price === null} />
        <Tile label="Coût" value={formatMoney(row.cost_price, cur)} reason={row.cost_price === null ? "Coût inconnu · à renseigner" : "Coût d'achat"} unknown={row.cost_price === null} />
        <Tile label="Marge nette" value={md.text} reason={profit ?? "Non calculable"} unknown={m.netMarginPercent === null} tone={md.tone === "danger" ? "danger" : md.tone === "success" ? "success" : undefined} />
      </div>
      {missingFees.length > 0 && m.netProfit !== null ? (
        <p className="text-[13px] font-semibold leading-[18px] text-ink-3">
          Non déduit car inconnu : {missingFees.map((u) => UNKNOWN_COST_LABEL[u]).join(", ")} ·{" "}
          <Link href="/settings/organization" className="font-bold text-warning underline">
            régler mes coûts
          </Link>
        </p>
      ) : m.caveat && m.netProfit === null ? (
        <p className="text-[13px] font-semibold leading-[18px] text-ink-3">{m.caveat}</p>
      ) : null}
    </div>
  );
}

/** Carte Quantité : pas à pas (un pas = un mouvement) si l'utilisateur peut écrire. */
export function QuantityCard({ detail, writable }: { detail: SkuDetail; writable: boolean }) {
  const { row } = detail;
  const available = row.quantity_available ?? 0;
  return (
    <Panel className="flex items-center justify-between gap-3 p-4">
      <span className="flex min-w-0 flex-col">
        <span className="text-[15px] font-bold leading-5">Quantité disponible</span>
        <span className="text-[13px] font-semibold leading-[18px] text-ink-3">
          En main {formatNumber(row.quantity_on_hand)} · réservé {formatNumber(row.quantity_reserved)}
          {writable ? " · chaque pas crée un mouvement" : ""}
        </span>
      </span>
      {writable && row.sku_id ? <QuantityStepper skuId={row.sku_id} code={row.code ?? ""} available={available} /> : <span className={cn("text-[22px] font-extrabold tnum", available < 0 && "text-danger")}>{formatNumber(available)}</span>}
    </Panel>
  );
}

type OfferRow = SkuDetail["offers"][number];
type OfferSupplier = { id: string; name: string; average_lead_time_days: number | null; default_moq: number | null } | null;

/** Meilleure offre fournisseur rapprochée (offre active liée au SKU, la moins chère) ou « Aucune offre rapprochée ». */
export function BestOfferCard({ detail, writable, findHref }: { detail: SkuDetail; writable: boolean; findHref: string }) {
  const { row, view, offers, marginCtx, onOrder, defaultSupplier } = detail;
  const best = pickCheapestOffer(offers) as OfferRow | null;
  const supplier = (best?.supplier ?? null) as OfferSupplier;
  const seen = best ? best.last_price_at ?? best.last_seen_at : null;
  const ageDays = seen ? ageInDays(seen) : null;
  return (
    <section className="flex flex-col gap-2.5" aria-label="Meilleure offre fournisseur">
      <MonoTitle title="Meilleure offre fournisseur" right={seen ? <span className={cn("ms-code shrink-0 text-[11px] leading-[15px]", ageDays !== null && ageDays > 7 ? "text-warning" : "text-ink-3")}>prix {formatRelative(seen)}</span> : undefined} />
      {best ? (
        <OfferBody best={best} supplier={supplier} detail={detail} writable={writable} recommendation={buildRecommendation(view, { offer: best, offerSupplier: supplier, defaultSupplier, onOrder })} marginCtx={marginCtx} row={row} />
      ) : (
        <Panel className="flex items-center gap-3 px-4 py-3.5">
          <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-background text-muted">
            <ScanSearch className="h-4 w-4" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[14.5px] font-semibold leading-5">Aucune offre rapprochée</span>
            <span className="text-[12.5px] font-semibold leading-[17px] text-ink-3">Aucune offre fournisseur n&apos;est encore liée à ce SKU.</span>
          </span>
          <Link href={internalRoute(findHref)} className="inline-flex min-h-10 shrink-0 items-center gap-0.5 rounded-lg px-1 text-[13px] font-bold hover:opacity-60">
            Chercher <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </Panel>
      )}
    </section>
  );
}

function OfferBody({ best, supplier, writable, recommendation, marginCtx, row }: { best: OfferRow; supplier: OfferSupplier; detail: SkuDetail; writable: boolean; recommendation: ReturnType<typeof buildRecommendation>; marginCtx: SkuDetail["marginCtx"]; row: SkuDetail["row"] }) {
  const price = best.normalized_price ?? best.original_price;
  const cur = best.normalized_price !== null ? best.normalized_currency ?? best.original_currency : best.original_currency;
  const sameCurrency = (cur ?? "").toUpperCase() === (row.currency ?? "EUR").toUpperCase();
  const m = sameCurrency && row.sale_price !== null ? computeMargin({ salePrice: row.sale_price, costPrice: price, feePercent: marginCtx.feePercent, paymentFeePercent: marginCtx.paymentFeePercent, paymentFeeFixed: marginCtx.paymentFeeFixed, shippingCost: marginCtx.shippingCost }) : null;
  const tax = best.tax_type === "ht" ? "HT" : best.tax_type === "ttc" ? "TTC" : "HT/TTC ?";
  const meta = [tax, best.moq ? `MOQ ${best.moq}` : null, best.available_quantity !== null ? `${formatNumber(best.available_quantity)} dispo` : null].filter(Boolean).join(" · ");
  const recQty = recommendation.result.recommendedQuantity;
  const qty = recQty !== null && recQty >= 1 ? recQty : Math.max(1, best.moq ?? 1);
  const draftHref = supplier ? `/suppliers/${supplier.id}/orders?order_sku=${row.sku_id}&qty=${qty}&offer=${best.id}` : null;
  const name = supplier?.name ?? "Fournisseur";
  return (
    <Panel className="flex flex-col gap-2.5 p-3">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="ms-code flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] border border-border bg-surface text-[12px] font-semibold text-muted">
          {initials(name)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="ms-mono text-[10px] leading-[13px] text-ink-3">Offre rapprochée</span>
          <Link href={`/sourcing/offers/${best.id}`} className="truncate text-[15px] font-bold leading-5 hover:underline">
            {name}
          </Link>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className="whitespace-nowrap text-[17px] font-extrabold leading-[22px] tracking-[-0.3px] tnum">{formatMoney(price, cur ?? "EUR")}</span>
          <span className="ms-code whitespace-nowrap text-[10.5px] leading-[15px] text-ink-3">{meta}</span>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {m && m.netProfit !== null ? (
          <>
            <StatusBadge tone={m.netProfit > 0 ? "success" : "danger"}>{m.netProfit > 0 ? "Rentable" : "Non rentable"}</StatusBadge>
            <span className={cn("text-[13px] font-bold leading-[18px] tnum", m.netProfit > 0 ? "text-success" : "text-danger")}>
              ≈ {m.netProfit >= 0 ? "+" : "−"}
              {formatMoney(Math.abs(m.netProfit), row.currency ?? "EUR")} / u{m.complete ? "" : " · provisoire"}
            </span>
          </>
        ) : (
          <span className="text-[12.5px] font-semibold text-ink-3">{sameCurrency ? "Bénéfice non calculable : prix de vente inconnu." : "Devise différente : bénéfice non comparé."}</span>
        )}
        <span className="flex-1" />
        {writable && draftHref ? (
          <Link href={internalRoute(draftHref)} className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] border border-border-strong bg-surface px-3 text-[13.5px] font-extrabold hover:bg-line-soft">
            <ClipboardList aria-hidden="true" className="h-4 w-4" />
            Brouillon de commande · {qty} u.
          </Link>
        ) : null}
      </div>
      {writable && draftHref ? <p className="text-[12px] font-semibold leading-4 text-ink-3">Rien n&apos;est envoyé à {name} : vous relisez le brouillon avant tout envoi.</p> : null}
    </Panel>
  );
}

const LISTING_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  active: { label: "En ligne", tone: "success" },
  ended: { label: "Terminée", tone: "neutral" },
  unsold: { label: "Invendue", tone: "warning" },
  unknown: { label: "Statut inconnu", tone: "neutral" },
};

/** Annonces rattachées (pictogramme générique, jamais de logo de plateforme). */
export function ListingsCard({ detail, limit = 4 }: { detail: SkuDetail; limit?: number }) {
  const { listings, row } = detail;
  const shown = listings.slice(0, limit);
  return (
    <section className="flex flex-col gap-2.5" aria-label="Annonces">
      <MonoTitle title="Annonces" count={listings.length || undefined} />
      <Panel className="overflow-hidden">
        {shown.length === 0 ? (
          <p className="border-b border-line-soft px-4 py-3.5 text-sm font-medium text-muted">Aucune annonce associée : cette référence n&apos;est vendue sur aucune marketplace connectée.</p>
        ) : (
          <ul>
            {shown.map((l) => {
              const st = LISTING_STATUS[l.status] ?? { label: l.status, tone: "neutral" as const };
              const url = safeExternalUrl(l.listing_url);
              const qty = l.quantity_available ?? l.quantity_listed;
              return (
                <li key={l.id} className="flex items-center gap-3 border-b border-line-soft px-4 py-3">
                  <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-background text-muted">
                    <Store className="h-[18px] w-[18px]" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate text-sm font-semibold leading-[19px]" title={l.title}>
                      {l.title}
                    </span>
                    <span className="ms-code truncate text-[10.5px] leading-[15px] text-ink-3">
                      {providerLabel(l.provider)} · {l.external_listing_id} · qté publiée {formatNumber(qty)} · {formatMoney(l.price, l.currency ?? row.currency ?? "EUR")} · synchro {formatRelative(l.last_synced_at)}
                    </span>
                  </span>
                  <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Ouvrir l'annonce ${l.title}`} className="flex h-10 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:text-foreground">
                      <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <Link href="/settings/integrations#mapping" className="flex min-h-11 w-full items-center justify-center gap-1.5 bg-surface-2 text-[13.5px] font-bold text-foreground transition-colors duration-150 ease-standard hover:bg-line-soft">
          Gérer les associations d&apos;annonces
        </Link>
      </Panel>
    </section>
  );
}

/** Mouvements (historique non supprimable). */
export function MovementsCard({ detail, limit, moreHref }: { detail: SkuDetail; limit?: number; moreHref?: string }) {
  const { movements } = detail;
  return (
    <section className="flex flex-col gap-2.5" aria-label="Mouvements">
      <MonoTitle title="Mouvements" aside="historique non supprimable" />
      <Panel className="overflow-hidden">
        <MovementsTimeline movements={movements} limit={limit} />
        {moreHref && limit && movements.length > limit ? (
          <Link href={internalRoute(moreHref)} className="flex min-h-11 items-center justify-center border-t border-line-soft text-[13.5px] font-bold hover:bg-line-soft">
            Tout l&apos;historique ({movements.length})
          </Link>
        ) : null}
      </Panel>
    </section>
  );
}
