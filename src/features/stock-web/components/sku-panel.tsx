import { ScanSearch } from "lucide-react";
import { StageStats } from "@/components/instrument";
import { SidePanel } from "@/components/instrument/side-panel";
import { StageFigure } from "@/components/instrument/figure";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/page";
import type { SkuDetail } from "@/features/stock/queries";
import { skuLabel } from "@/features/stock/model";
import { ApplyPendingSalesForm } from "@/features/stock/components/sku-actions";
import { BestOfferCard, ListingsCard, MovementsCard, NightLevelChip, PriceTiles, QuantityCard, skuStageStats } from "@/features/stock-web/components/sku-sections";
import { AdjustStockLauncher, SkuPanelBar } from "@/features/stock-web/components/sku-client";

export function sourcingHref(detail: SkuDetail): string {
  return `/sourcing?q=${encodeURIComponent(detail.row.product_name ?? detail.row.code ?? "")}`;
}

/** Fiche SKU en panneau droit 540 px, au-dessus de la liste (ouverte par ?sku=…). */
export function SkuPanel({ detail, closeHref, prevHref, nextHref, writable }: { detail: SkuDetail; closeHref: string; prevHref: string | null; nextHref: string | null; writable: boolean }) {
  const { row, view, pendingSalesCount } = detail;
  const code = row.code ?? "";
  const title = skuLabel(row);
  const available = row.quantity_available ?? 0;
  const fullHref = `/stock/${encodeURIComponent(code)}`;
  const findHref = sourcingHref(detail);
  return (
    <SidePanel
      closeHref={closeHref}
      label={`Fiche SKU : ${title}`}
      width={540}
      footer={
        <div className="flex flex-col gap-2.5 pb-1 min-[440px]:flex-row">
          <ButtonLink href={findHref} variant="secondary" size="lg" className="min-h-12 flex-1 px-3">
            <ScanSearch aria-hidden="true" className="h-[18px] w-[18px]" />
            Trouver un fournisseur
          </ButtonLink>
          {writable && row.sku_id ? <AdjustStockLauncher className="flex-1 px-3" target={{ skuId: row.sku_id, code, label: title, onHand: row.quantity_on_hand ?? 0, available }} /> : null}
        </div>
      }
    >
      <div className="bg-night px-5 pb-11 pt-2.5 text-on-night">
        <SkuPanelBar closeHref={closeHref} prevHref={prevHref} nextHref={nextHref} fullHref={fullHref} editHref={writable ? `${fullHref}/edit` : null} />
        <div className="ms-mono mt-1.5 truncate text-[11px] leading-[14px] tracking-[0.08em] text-on-night-muted">
          {row.category ?? "Sans catégorie"} · {code}
        </div>
        <div className="mt-1 flex items-start justify-between gap-3">
          <h2 className="text-[22px] font-extrabold leading-7 tracking-[-0.4px] text-on-night">{title}</h2>
          <span className="mt-1">
            <NightLevelChip level={view.classification.level} />
          </span>
        </div>
        <div className="mt-4 flex items-baseline gap-2">
          <StageFigure value={String(available)} size="md" tone={available < 0 ? "danger" : undefined} />
          <span className="text-[20px] font-medium leading-[22px] text-on-night-muted">{Math.abs(available) > 1 ? "unités disponibles" : "unité disponible"}</span>
        </div>
        <StageStats className="mt-3.5 pt-3" size="sm" stats={skuStageStats(detail)} />
      </div>
      <div className="relative -mt-6 flex flex-col gap-[18px] rounded-t-3xl bg-background px-5 pb-6 pt-[22px]">
        {pendingSalesCount > 0 ? (
          <Callout tone="warning" title={`${pendingSalesCount} vente(s) rattachée(s) non déduite(s) du stock.`} action={writable && row.sku_id ? <ApplyPendingSalesForm skuId={row.sku_id} code={code} /> : null}>
            Vérifiez votre stock physique avant d&apos;appliquer la déduction.
          </Callout>
        ) : null}
        <PriceTiles detail={detail} />
        <QuantityCard detail={detail} writable={writable} />
        <BestOfferCard detail={detail} writable={writable} findHref={findHref} />
        <ListingsCard detail={detail} limit={3} />
        <MovementsCard detail={detail} limit={8} moreHref={`${fullHref}#mouvements`} />
      </div>
    </SidePanel>
  );
}

/** Panneau « référence introuvable » (lien périmé, SKU archivé ou supprimé). */
export function SkuPanelMissing({ code, closeHref }: { code: string; closeHref: string }) {
  return (
    <SidePanel closeHref={closeHref} label="Fiche SKU introuvable" width={540}>
      <div className="bg-night px-5 pb-11 pt-2.5">
        <SkuPanelBar closeHref={closeHref} prevHref={null} nextHref={null} fullHref={`/stock/${encodeURIComponent(code)}`} editHref={null} />
        <h2 className="mt-3 text-[22px] font-extrabold leading-7 text-on-night">Référence introuvable</h2>
        <p className="ms-code mt-1 text-[12px] text-on-night-muted">{code}</p>
      </div>
      <div className="relative -mt-6 rounded-t-3xl bg-background px-5 pb-6 pt-[22px] text-sm font-medium text-muted">Ce SKU n&apos;existe pas (ou plus) dans cette organisation.</div>
    </SidePanel>
  );
}
