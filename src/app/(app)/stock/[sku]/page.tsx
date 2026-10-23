import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, ScanSearch, Search } from "lucide-react";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { MonoTitle, Panel, Paper, Scene, SceneHeader, StageStats } from "@/components/instrument";
import { StageFigure } from "@/components/instrument/figure";
import { Callout, DescriptionList } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/status-badge";
import { ButtonLink } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { getSkuDetail } from "@/features/stock/queries";
import { skuLabel } from "@/features/stock/model";
import { TrendIcon } from "@/features/stock/components/stock-level-badge";
import { ApplyPendingSalesForm } from "@/features/stock/components/sku-actions";
import { formatDate, formatDateTime, formatDays, formatMoney, formatNumber, formatRelative, NOT_PROVIDED } from "@/lib/format";
import { buildRecommendation, pickCheapestOffer } from "@/features/analytics/replenishment.pure";
import { findCheaperHref, findCheaperQuantity } from "@/features/sourcing/links";
import { computeRotation } from "@/domain/inventory/rotation";
import { safeExternalUrl } from "@/lib/utils";
import { BestOfferCard, ListingsCard, MovementsCard, NightLevelChip, PriceTiles, QuantityCard, skuStageStats } from "@/features/stock-web/components/sku-sections";
import { AdjustStockLauncher } from "@/features/stock-web/components/sku-client";
import { sourcingHref } from "@/features/stock-web/components/sku-panel";

export async function generateMetadata({ params }: { params: Promise<{ sku: string }> }): Promise<Metadata> {
  const { sku } = await params;
  return { title: decodeURIComponent(sku) };
}

const PROVIDER_LABEL: Record<string, string> = { ebay: "eBay", amazon: "Amazon", shopify: "Shopify", woocommerce: "WooCommerce", manual: "Manuel" };
const CONDITION_LABEL: Record<string, string> = { new: "Neuf", refurbished: "Reconditionné", used: "Occasion", unknown: "Non précisé" };

/** Fiche SKU pleine page (v5) : même contenu que le panneau de /stock, plus l'historique complet. */
export default async function SkuPage({ params }: { params: Promise<{ sku: string }> }) {
  const ctx = await requireOrgContext();
  const { sku } = await params;
  const detail = await getSkuDetail(ctx, decodeURIComponent(sku));
  if (!detail) notFound();
  const { row, view, product, variant, offers, orderItems, priceHistory, siblings, pendingSalesCount, onOrder, rotation: rotationData, defaultSupplier } = detail;
  const writable = canWrite(ctx.role);
  const currency = row.currency ?? "EUR";
  const code = row.code ?? "";
  const title = skuLabel(row);
  const available = row.quantity_available ?? 0;
  // Même calcul que le dashboard, les alertes et les insights (buildRecommendation) :
  // offre la moins chère → fournisseur de l'offre, à défaut fournisseur par défaut du SKU.
  const bestOffer = pickCheapestOffer(offers);
  const offerSupplier = (bestOffer?.supplier ?? null) as { id: string; name: string; average_lead_time_days: number | null; default_moq: number | null } | null;
  const recommendation = buildRecommendation(view, { offer: bestOffer, offerSupplier, defaultSupplier, onOrder });
  const replenishment = recommendation.result;
  const orderSupplier = recommendation.supplier;
  const rotation = rotationData ? computeRotation(rotationData) : null;
  const cheaperHref = findCheaperHref(code, replenishment.recommendedQuantity);
  const cheaperQty = findCheaperQuantity(replenishment.recommendedQuantity);
  const editHref = `/stock/${encodeURIComponent(code)}/edit`;
  const imageUrl = safeExternalUrl(product?.image_url);

  return (
    <>
      <Scene>
        <SceneHeader
          back={{ href: "/stock", label: "Stock" }}
          eyebrow={`${row.category ?? "Sans catégorie"} · ${code}`}
          title={
            <span className="flex flex-wrap items-center gap-2.5">
              {title}
              <NightLevelChip level={view.classification.level} />
              {!row.is_active ? <span className="rounded-md bg-night-raised px-2 py-[3px] text-[11.5px] font-bold tracking-normal text-on-night-muted">Archivé</span> : null}
            </span>
          }
          description={[row.brand, CONDITION_LABEL[row.condition ?? "unknown"], row.location ? `emplacement ${row.location}` : null].filter(Boolean).join(" · ")}
          actions={
            <>
              <ButtonLink href={sourcingHref(detail)} variant="night">
                <ScanSearch aria-hidden="true" className="h-4 w-4" /> Trouver un fournisseur
              </ButtonLink>
              {writable ? (
                <ButtonLink href={editHref} variant="night">
                  <Pencil aria-hidden="true" className="h-4 w-4" /> Modifier
                </ButtonLink>
              ) : null}
              {writable && row.sku_id ? <AdjustStockLauncher className="min-h-10 px-4 text-sm" target={{ skuId: row.sku_id, code, label: title, onHand: row.quantity_on_hand ?? 0, available }} /> : null}
            </>
          }
        />
        <div className="mt-5 flex flex-wrap items-end gap-x-14 gap-y-4">
          <div className="flex items-baseline gap-2">
            <StageFigure value={String(available)} size="md" tone={available < 0 ? "danger" : undefined} />
            <span className="text-[20px] font-medium leading-[22px] text-on-night-muted">{Math.abs(available) > 1 ? "unités disponibles" : "unité disponible"}</span>
          </div>
          <div className="min-w-0 flex-[1_1_440px] sm:max-w-[640px]">
            <StageStats className="pt-3 max-sm:grid-cols-2! max-sm:gap-y-3" stats={skuStageStats(detail)} />
          </div>
        </div>
      </Scene>
      <Paper>
        <nav aria-label="Sections de la fiche" className="-mx-1 mb-5 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {[
            { href: "#ventes", label: "Ventes", count: orderItems.length },
            { href: "#annonces", label: "Annonces", count: detail.listings.length },
            { href: "#mouvements", label: "Mouvements", count: detail.movements.length },
            { href: "#achats", label: "Achats", count: offers.length },
            { href: "#produit", label: "Fiche produit" },
          ].map((l) => (
            <a key={l.href} href={l.href} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3.5 text-[13.5px] font-semibold text-foreground transition-colors duration-150 ease-standard hover:bg-surface-2 pointer-coarse:h-10">
              {l.label}
              {l.count !== undefined && l.count > 0 ? <span className="tnum text-ink-3">· {l.count >= 100 ? "100+" : formatNumber(l.count)}</span> : null}
            </a>
          ))}
        </nav>
        {pendingSalesCount > 0 ? (
          <Callout
            tone="warning"
            className="mb-5"
            title={`${pendingSalesCount} vente(s) rattachée(s) à ce SKU n'ont pas été déduites du stock.`}
            action={writable ? <ApplyPendingSalesForm skuId={row.sku_id ?? ""} code={code} /> : null}
          >
            Ces commandes ont été importées avant l&apos;association de l&apos;annonce au SKU. Vérifiez votre stock physique avant d&apos;appliquer la déduction.
          </Callout>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-12">
          <div className="flex min-w-0 flex-col gap-[18px] lg:col-span-7">
            <PriceTiles detail={detail} />
            <QuantityCard detail={detail} writable={writable} />

            <section id="ventes" className="flex scroll-mt-20 flex-col gap-2.5" aria-label="Ventes et vitesse">
              <MonoTitle title="Ventes et vitesse" />
              <Panel className="grid grid-cols-2 gap-px overflow-hidden bg-line-soft sm:grid-cols-4">
                {[
                  { label: "Ventes 7 j / 30 j", value: `${formatNumber(row.units_7d)} / ${formatNumber(row.units_30d)}`, hint: <>Tendance <TrendIcon trend={view.velocity.trend} percent={view.velocity.trendPercent} /></> },
                  { label: "Vitesse", value: view.velocity.dailyVelocity === null ? "—" : `≈ ${formatNumber(view.velocity.dailyVelocity, view.velocity.dailyVelocity < 1 ? 2 : 1)} / j`, hint: view.velocity.dailyVelocity === null ? "Pas assez de données" : view.velocity.explanation },
                  { label: "Jours de stock", value: view.daysOfCover === null ? "—" : formatDays(view.daysOfCover), hint: view.classification.reason },
                  { label: "Rotation (30 j)", value: rotation === null || rotation.rotation === null ? "—" : `${formatNumber(rotation.rotation, 2)}×`, hint: rotation?.explanation ?? "Pas assez de données." },
                ].map((s) => (
                  <div key={s.label} className="min-w-0 bg-surface px-4 py-3">
                    <div className="ms-mono text-[10px] leading-[13px] text-ink-3">{s.label}</div>
                    <div className="mt-1 text-[17px] font-bold leading-[22px] tnum">{s.value}</div>
                    <div className="mt-0.5 line-clamp-2 text-[12px] font-semibold leading-4 text-ink-3">{s.hint}</div>
                  </div>
                ))}
              </Panel>
            </section>

            <div id="annonces" className="scroll-mt-20">
              <ListingsCard detail={detail} limit={100} />
            </div>

            <section className="flex flex-col gap-2.5" aria-label="Ventes récentes">
              <MonoTitle title="Ventes récentes" count={orderItems.length || undefined} />
              <Panel className="overflow-hidden">
                {orderItems.length === 0 ? (
                  <p className="px-4 py-3.5 text-sm font-medium text-muted">Aucune vente enregistrée pour ce SKU.</p>
                ) : (
                  <Table className="min-w-[560px]" density="compact" stackOnMobile caption="Ventes récentes de ce SKU">
                    <THead>
                      <tr>
                        <TH>Date</TH>
                        <TH>Canal</TH>
                        <TH>Commande</TH>
                        <TH align="right">Qté</TH>
                        <TH align="right">Prix unitaire</TH>
                        <TH>Stock</TH>
                      </tr>
                    </THead>
                    <TBody>
                      {orderItems.map((oi) => {
                        const o = oi.order;
                        return (
                          <TR key={oi.id}>
                            <TD primary className="whitespace-nowrap text-muted tnum">{formatDateTime(o?.placed_at)}</TD>
                            <TD label="Canal">{o ? PROVIDER_LABEL[o.provider] ?? o.provider : "—"}</TD>
                            <TD label="Commande" className="ms-code text-xs">{o?.order_number ?? o?.external_order_id}</TD>
                            <TD label="Qté" align="right" className="font-bold">{oi.quantity}</TD>
                            <TD label="Prix unitaire" align="right">{formatMoney(oi.unit_price, oi.currency ?? currency)}</TD>
                            <TD label="Stock">
                              {o && (o.status === "cancelled" || o.status === "refunded") ? (
                                <StatusBadge tone="neutral">{o.status === "cancelled" ? "Annulée · sans effet sur le stock" : "Remboursée · sans effet sur le stock"}</StatusBadge>
                              ) : oi.inventory_applied ? (
                                <StatusBadge tone="success" variant="plain">Déduite</StatusBadge>
                              ) : (
                                <StatusBadge tone="warning">Non déduite</StatusBadge>
                              )}
                            </TD>
                          </TR>
                        );
                      })}
                    </TBody>
                  </Table>
                )}
              </Panel>
            </section>

            <div id="mouvements" className="scroll-mt-20">
              <MovementsCard detail={detail} />
            </div>

            <section id="produit" className="flex scroll-mt-20 flex-col gap-2.5" aria-label="Produit et variante">
              <MonoTitle title="Produit et variante" />
              <Panel className="flex flex-col gap-5 p-4 sm:flex-row">
                {imageUrl ? (
                  // Image fournie par l'utilisateur pour CE produit (jamais une photo d'illustration).
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="" referrerPolicy="no-referrer" className="h-24 w-24 shrink-0 rounded-xl border border-border object-cover" />
                ) : null}
                <DescriptionList
                  className="flex-1"
                  items={[
                    { label: "Marque", value: row.brand ?? NOT_PROVIDED },
                    { label: "Catégorie", value: row.category ?? NOT_PROVIDED },
                    { label: "État", value: CONDITION_LABEL[row.condition ?? "unknown"] },
                    { label: "Grade", value: row.grade ?? NOT_PROVIDED },
                    { label: "EAN / GTIN", value: variant?.ean ?? NOT_PROVIDED },
                    { label: "MPN", value: variant?.mpn ?? NOT_PROVIDED },
                    { label: "Code-barres", value: row.barcode ?? NOT_PROVIDED },
                    { label: "Attributs", value: variant && Object.keys(variant.attributes as object).length > 0 ? Object.entries(variant.attributes as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join(" · ") : NOT_PROVIDED },
                  ]}
                />
              </Panel>
            </section>
          </div>

          <div id="achats" className="flex min-w-0 scroll-mt-20 flex-col gap-[18px] lg:col-span-5">
            <BestOfferCard detail={detail} writable={writable} findHref={sourcingHref(detail)} />

            <section className="flex flex-col gap-2.5" aria-label="Réapprovisionnement">
              <MonoTitle title="Réapprovisionnement" />
              <Panel className="space-y-2 p-4 text-sm">
                {replenishment.recommendedQuantity === null ? (
                  <p className="font-medium text-muted">{replenishment.explanation}</p>
                ) : (
                  <>
                    <div className="text-[22px] font-extrabold leading-7 tnum">
                      {replenishment.recommendedQuantity} <span className="text-sm font-semibold text-muted">unité(s) recommandée(s)</span>
                    </div>
                    <p className="font-medium text-muted">{replenishment.explanation}</p>
                    {replenishment.warnings.map((w) => (
                      <p key={w} className="text-xs font-semibold text-warning">
                        {w}
                      </p>
                    ))}
                    {replenishment.needed && orderSupplier ? (
                      <ButtonLink href={`/suppliers/${orderSupplier.id}/orders?order_sku=${row.sku_id}&qty=${replenishment.recommendedQuantity}${recommendation.offerId ? `&offer=${recommendation.offerId}` : ""}`} variant="secondary" size="sm">
                        Préparer une commande chez {orderSupplier.name}
                      </ButtonLink>
                    ) : replenishment.needed && writable ? (
                      <p className="text-xs font-medium text-muted">
                        Aucun fournisseur associé :{" "}
                        <Link href={editHref as never} className="underline">
                          choisissez un fournisseur par défaut
                        </Link>{" "}
                        ou associez une offre depuis le sourcing.
                      </p>
                    ) : null}
                  </>
                )}
              </Panel>
            </section>

            <section className="flex flex-col gap-2.5" aria-label="Trouver moins cher">
              <MonoTitle title="Trouver moins cher" />
              <Panel className="space-y-2.5 p-4 text-sm">
                <p className="font-medium text-muted">
                  Compare votre coût d&apos;achat actuel (<span className="font-bold text-foreground">{row.cost_price === null ? "non renseigné" : formatMoney(row.cost_price, currency)}</span>) aux offres réellement trouvées, pour {cheaperQty} unité{cheaperQty > 1 ? "s" : ""}
                  {replenishment.recommendedQuantity !== null && replenishment.recommendedQuantity >= 1 ? " (réapprovisionnement recommandé)" : ""}. Aucune économie n&apos;est affichée sans offre réelle.
                </p>
                <ButtonLink href={cheaperHref} variant="secondary" size="sm">
                  <Search aria-hidden="true" className="h-4 w-4" /> Trouver moins cher
                </ButtonLink>
              </Panel>
            </section>

            <section className="flex flex-col gap-2.5" aria-label="Offres fournisseurs">
              <MonoTitle title="Offres rapprochées" count={offers.length || undefined} />
              <Panel className="overflow-hidden">
                {offers.length === 0 ? (
                  <p className="px-4 py-3.5 text-sm font-medium text-muted">Aucune offre fournisseur associée à ce SKU.</p>
                ) : (
                  <ul className="divide-y divide-line-soft">
                    {offers.map((o) => {
                      const s = o.supplier as { id: string; name: string; country: string | null } | null;
                      return (
                        <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                          <div className="min-w-0">
                            <Link href={`/sourcing/offers/${o.id}` as never} className="font-bold hover:underline">
                              {s?.name ?? "Fournisseur"}
                            </Link>
                            <div className="text-xs font-semibold text-ink-3">
                              MOQ {o.moq ?? "—"} · délai {o.delivery_max_days ?? o.delivery_min_days ?? "—"} j · {o.country ?? s?.country ?? "pays non communiqué"} · vu {formatRelative(o.last_seen_at)}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="font-extrabold tnum">
                              {formatMoney(o.normalized_price ?? o.original_price, o.normalized_currency ?? o.original_currency)}
                              <span className="ml-1 text-xs font-semibold text-ink-3">{o.tax_type === "ht" ? "HT" : o.tax_type === "ttc" ? "TTC" : "HT/TTC ?"}</span>
                            </div>
                            {row.cost_price !== null && o.normalized_price !== null && o.normalized_price < row.cost_price ? <div className="text-xs font-bold text-success">−{formatMoney(row.cost_price - o.normalized_price, currency)} / u vs votre coût</div> : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
            </section>

            <section className="flex flex-col gap-2.5" aria-label="Historique des prix">
              <MonoTitle title="Historique des prix" />
              <Panel className="overflow-hidden">
                {priceHistory.length === 0 ? (
                  <p className="px-4 py-3.5 text-sm font-medium text-muted">Aucun changement de prix enregistré.</p>
                ) : (
                  <ul className="divide-y divide-line-soft text-sm">
                    {priceHistory.map((p) => (
                      <li key={p.id} className="flex items-center justify-between px-4 py-2.5">
                        <span className="font-semibold text-muted">
                          {formatDate(p.recorded_at)} · {p.kind === "cost" ? "coût" : "vente"}
                        </span>
                        <span className="font-bold tnum">{formatMoney(p.price, p.currency)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </section>

            {siblings.length > 0 || writable ? (
              <section className="flex flex-col gap-2.5" aria-label="Autres variantes">
                <MonoTitle
                  title="Autres variantes"
                  right={
                    writable ? (
                      <Link href={`/stock/new?product=${row.product_id}` as never} className="inline-flex min-h-10 items-center rounded-lg text-[13px] font-bold hover:underline">
                        Ajouter une variante
                      </Link>
                    ) : undefined
                  }
                />
                <Panel className="overflow-hidden">
                  {siblings.length === 0 ? (
                    <p className="px-4 py-3.5 text-sm font-medium text-muted">Ce produit n&apos;a qu&apos;une variante.</p>
                  ) : (
                    <ul className="divide-y divide-line-soft text-sm">
                      {siblings.map((s) => (
                        <li key={s.sku_id}>
                          <Link href={`/stock/${encodeURIComponent(s.code ?? "")}` as never} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2 hover:bg-line-soft">
                            <span className="min-w-0 truncate">
                              <span className="ms-code text-xs">{s.code}</span> <span className="font-semibold text-muted">{s.variant_name}</span>
                            </span>
                            <span className="font-bold tnum">{formatNumber(s.quantity_available)}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </section>
            ) : null}
          </div>
        </div>
        <p className="mt-6 text-xs font-semibold text-ink-3">
          Créé le {formatDate(product?.created_at)} · dernier mouvement {formatRelative(row.last_movement_at)}
        </p>
      </Paper>
    </>
  );
}
