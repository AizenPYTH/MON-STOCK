import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Search } from "lucide-react";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { PageHeader, Stat, Section, DescriptionList, Callout } from "@/components/ui/page";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { getSkuDetail } from "@/features/stock/queries";
import { StockLevelBadge, TrendIcon } from "@/features/stock/components/stock-level-badge";
import { AdjustStockButton } from "@/features/stock/components/adjust-stock-form";
import { MovementsTimeline } from "@/features/stock/components/movements-timeline";
import { ApplyPendingSalesForm } from "@/features/stock/components/sku-actions";
import { formatDate, formatDateTime, formatDays, formatMoney, formatNumber, formatRelative, NOT_PROVIDED } from "@/lib/format";
import { buildRecommendation, pickCheapestOffer } from "@/features/analytics/replenishment.pure";
import { findCheaperHref, findCheaperQuantity } from "@/features/sourcing/links";
import { computeRotation } from "@/domain/inventory/rotation";
import { UNKNOWN_COST_LABEL } from "@/domain/pricing/margin";
import { safeExternalUrl } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ sku: string }> }): Promise<Metadata> {
  const { sku } = await params;
  return { title: decodeURIComponent(sku) };
}

const PROVIDER_LABEL: Record<string, string> = { ebay: "eBay", amazon: "Amazon", shopify: "Shopify", woocommerce: "WooCommerce", manual: "Manuel" };
const CONDITION_LABEL: Record<string, string> = { new: "Neuf", refurbished: "Reconditionné", used: "Occasion", unknown: "Non précisé" };

export default async function SkuPage({ params }: { params: Promise<{ sku: string }> }) {
  const ctx = await requireOrgContext();
  const { sku } = await params;
  const detail = await getSkuDetail(ctx, decodeURIComponent(sku));
  if (!detail) notFound();
  const { row, view, product, variant, movements, listings, offers, orderItems, priceHistory, siblings, pendingSalesCount, onOrder, rotation: rotationData, defaultSupplier } = detail;
  const writable = canWrite(ctx.role);
  const currency = row.currency ?? "EUR";
  const code = row.code ?? "";
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

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/stock" className="hover:text-foreground">
            Stock
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            {row.product_name}
            <StockLevelBadge level={view.classification.level} title={view.classification.reason} />
            {!row.is_active ? <Badge variant="outline">Archivé</Badge> : null}
          </span>
        }
        description={
          <span>
            <code className="font-mono text-foreground">{code}</code>
            {row.brand ? ` · ${row.brand}` : ""}
            {row.variant_name && row.variant_name !== "Standard" ? ` · ${row.variant_name}` : ""}
          </span>
        }
        actions={
          <>
            <ButtonLink href={cheaperHref} variant="secondary">
              <Search className="h-4 w-4" /> Trouver moins cher
            </ButtonLink>
            {writable ? <AdjustStockButton skuId={row.sku_id ?? ""} available={row.quantity_available ?? 0} /> : null}
            {writable ? (
              <ButtonLink href={`/stock/${encodeURIComponent(code)}/edit`} variant="secondary">
                Modifier
              </ButtonLink>
            ) : null}
          </>
        }
      />

      {pendingSalesCount > 0 ? (
        <Callout
          tone="warning"
          className="mb-5"
          title={`${pendingSalesCount} vente(s) rattachée(s) à ce SKU n'ont pas été déduites du stock.`}
          action={
            writable ? <ApplyPendingSalesForm skuId={row.sku_id ?? ""} code={code} /> : null
          }
        >
          Ces commandes ont été importées avant l'association de l'annonce au SKU. Vérifiez votre stock physique avant d'appliquer la déduction.
        </Callout>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <Stat label="En stock" value={formatNumber(row.quantity_on_hand)} hint={row.location ? `Emplacement ${row.location}` : undefined} />
        <Stat label="Disponible" value={formatNumber(row.quantity_available)} hint={`${formatNumber(row.quantity_reserved)} réservé(s)${onOrder ? ` · ${onOrder} en commande` : ""}`} tone={view.classification.level === "out_of_stock" ? "danger" : undefined} />
        <Stat label="Ventes 7 j / 30 j" value={`${formatNumber(row.units_7d)} / ${formatNumber(row.units_30d)}`} hint={<span>Tendance <TrendIcon trend={view.velocity.trend} percent={view.velocity.trendPercent} /></span>} />
        <Stat label="Vitesse" value={view.velocity.dailyVelocity === null ? "—" : `${view.velocity.dailyVelocity.toFixed(view.velocity.dailyVelocity < 1 ? 2 : 1)} / j`} hint={view.velocity.dailyVelocity === null ? "Pas assez de données" : view.velocity.explanation} />
        <Stat label="Jours de stock" value={view.daysOfCover === null ? "—" : formatDays(view.daysOfCover)} hint={view.classification.reason} tone={view.classification.level === "at_risk" ? "warning" : undefined} />
        <Stat
          label="Rotation (30 j)"
          value={rotation === null || rotation.rotation === null ? <span className="text-base font-medium text-muted">Pas assez de données</span> : `${formatNumber(rotation.rotation, 2)}×`}
          hint={rotation?.explanation ?? "Pas assez de données."}
        />
        <Stat label="Marge brute" value={view.margin.grossMargin === null ? "Coût inconnu" : formatMoney(view.margin.grossMargin, currency)} hint={view.margin.grossMarginPercent !== null ? `${view.margin.grossMarginPercent.toFixed(1)} % du prix de vente` : view.margin.caveat ?? undefined} tone={view.margin.grossMargin !== null && view.margin.grossMargin < 0 ? "danger" : undefined} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Produit et variante" />
            <CardContent className="flex gap-5">
              {safeExternalUrl(product?.image_url) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={safeExternalUrl(product?.image_url) ?? undefined} alt="" referrerPolicy="no-referrer" className="h-24 w-24 shrink-0 rounded-lg border border-border object-cover" />
              ) : (
                <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted">Pas d'image</div>
              )}
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Historique du stock" description={`${movements.length} dernier(s) mouvement(s)`} />
            <CardContent>
              <MovementsTimeline movements={movements} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Annonces (listings)" description="Annonces marketplace rattachées à ce SKU." actions={<ButtonLink href="/settings/integrations#mapping" variant="ghost" size="sm">Gérer les associations</ButtonLink>} />
            <CardContent className="p-0">
              {listings.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted">Aucune annonce associée. Connectez un canal puis associez vos annonces à ce SKU.</p>
              ) : (
                <Table className="min-w-[640px]">
                  <THead>
                    <tr>
                      <TH>Canal</TH>
                      <TH>Annonce</TH>
                      <TH align="right">Prix</TH>
                      <TH align="right">Qté en ligne</TH>
                      <TH>Statut</TH>
                      <TH>Sync</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {listings.map((l) => (
                      <TR key={l.id}>
                        <TD>{PROVIDER_LABEL[l.provider] ?? l.provider}</TD>
                        <TD>
                          <div className="max-w-[320px] truncate">{l.title}</div>
                          <div className="font-mono text-xs text-muted">
                            {l.external_listing_id}
                            {l.external_variation_id ? ` / ${l.external_variation_id}` : ""}
                            {safeExternalUrl(l.listing_url) ? (
                              <a href={safeExternalUrl(l.listing_url) ?? undefined} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex align-middle text-muted hover:text-foreground">
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : null}
                          </div>
                        </TD>
                        <TD align="right">{formatMoney(l.price, l.currency ?? currency)}</TD>
                        <TD align="right">{formatNumber(l.quantity_available ?? l.quantity_listed)}</TD>
                        <TD>
                          <Badge variant={l.status === "active" ? "success" : "neutral"}>{l.status}</Badge>
                        </TD>
                        <TD className="text-xs text-muted">{formatRelative(l.last_synced_at)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Ventes récentes" />
            <CardContent className="p-0">
              {orderItems.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted">Aucune vente enregistrée pour ce SKU.</p>
              ) : (
                <Table className="min-w-[560px]">
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
                          <TD className="text-muted">{formatDateTime(o?.placed_at)}</TD>
                          <TD>{o ? PROVIDER_LABEL[o.provider] ?? o.provider : "—"}</TD>
                          <TD className="font-mono text-xs">{o?.order_number ?? o?.external_order_id}</TD>
                          <TD align="right">{oi.quantity}</TD>
                          <TD align="right">{formatMoney(oi.unit_price, oi.currency ?? currency)}</TD>
                          <TD>
                            {o && (o.status === "cancelled" || o.status === "refunded") ? (
                              <Badge variant="neutral">{o.status === "cancelled" ? "Annulée · sans effet sur le stock" : "Remboursée · sans effet sur le stock"}</Badge>
                            ) : oi.inventory_applied ? (
                              <Badge variant="success">Déduite</Badge>
                            ) : (
                              <Badge variant="warning">Non déduite</Badge>
                            )}
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Prix et marge" />
            <CardContent>
              <DescriptionList
                className="sm:grid-cols-1"
                items={[
                  { label: "Prix de vente", value: formatMoney(row.sale_price, currency) },
                  { label: "Coût d'achat", value: row.cost_price === null ? "Coût inconnu" : formatMoney(row.cost_price, currency) },
                  { label: "Prix de vente moyen (30 j)", value: row.avg_sale_price_30d === null ? "Pas de vente sur 30 j" : formatMoney(row.avg_sale_price_30d, currency) },
                  { label: "Commission marketplace", value: view.margin.marketplaceFee === null ? "Inconnue" : formatMoney(view.margin.marketplaceFee, currency) },
                  { label: "Frais de paiement", value: view.margin.paymentFee === null ? "Inconnus" : formatMoney(view.margin.paymentFee, currency) },
                  { label: "Transport", value: view.margin.shippingCost === null ? "Inconnu" : formatMoney(view.margin.shippingCost, currency) },
                  { label: "Bénéfice net estimé / unité", value: view.margin.netProfit === null ? "Non calculable" : formatMoney(view.margin.netProfit, currency) },
                ]}
              />
              {view.margin.caveat ? <p className="mt-3 text-xs text-amber-700">{view.margin.caveat}</p> : null}
              {view.margin.unknownCosts.length > 0 && view.margin.netProfit !== null ? (
                <p className="mt-1 text-xs text-muted">
                  Impact : le bénéfice ci-dessus ignore {view.margin.unknownCosts.filter((u) => u !== "cost_price" && u !== "sale_price").map((u) => UNKNOWN_COST_LABEL[u]).join(", ")}.{" "}
                  <Link href="/settings/organization" className="underline">
                    Renseigner les frais
                  </Link>
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Trouver moins cher" description="Compare votre coût d'achat actuel aux offres fournisseurs réellement trouvées (sources connectées, recherche en direct). Aucune économie n'est affichée sans offre réelle." />
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted">
                Coût actuel : <span className="font-semibold text-foreground">{row.cost_price === null ? "non renseigné" : formatMoney(row.cost_price, currency)}</span> · quantité comparée : {cheaperQty} unité{cheaperQty > 1 ? "s" : ""}
                {replenishment.recommendedQuantity !== null && replenishment.recommendedQuantity >= 1 ? " (réapprovisionnement recommandé)" : ""}
              </p>
              <ButtonLink href={cheaperHref} size="sm">
                <Search className="h-4 w-4" /> Trouver moins cher
              </ButtonLink>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Réapprovisionnement" />
            <CardContent className="space-y-2 text-sm">
              {replenishment.recommendedQuantity === null ? (
                <p className="text-muted">{replenishment.explanation}</p>
              ) : (
                <>
                  <div className="text-2xl font-semibold tnum">{replenishment.recommendedQuantity} <span className="text-sm font-normal text-muted">unité(s) recommandée(s)</span></div>
                  <p className="text-muted">{replenishment.explanation}</p>
                  {replenishment.warnings.map((w) => (
                    <p key={w} className="text-xs text-amber-700">
                      {w}
                    </p>
                  ))}
                  {replenishment.needed && orderSupplier ? (
                    <ButtonLink
                      href={`/suppliers/${orderSupplier.id}/orders?order_sku=${row.sku_id}&qty=${replenishment.recommendedQuantity}${recommendation.offerId ? `&offer=${recommendation.offerId}` : ""}`}
                      variant="secondary"
                      size="sm"
                    >
                      Préparer une commande chez {orderSupplier.name}
                    </ButtonLink>
                  ) : replenishment.needed && writable ? (
                    <p className="text-xs text-muted">
                      Aucun fournisseur associé :{" "}
                      <Link href={`/stock/${encodeURIComponent(code)}/edit` as never} className="underline">
                        choisissez un fournisseur par défaut
                      </Link>{" "}
                      ou associez une offre depuis le sourcing.
                    </p>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Fournisseurs" description="Offres rattachées à ce SKU, de la moins chère à la plus chère." actions={<ButtonLink href={cheaperHref} variant="ghost" size="sm">Trouver moins cher</ButtonLink>} />
            <CardContent className="p-0">
              {offers.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted">Aucune offre fournisseur associée à ce SKU.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {offers.map((o, i) => {
                    const s = o.supplier as { id: string; name: string; country: string | null } | null;
                    const savings = i > 0 && offers[0]?.normalized_price != null && o.normalized_price != null ? null : null;
                    void savings;
                    return (
                      <li key={o.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                        <div className="min-w-0">
                          <Link href={`/sourcing/offers/${o.id}` as never} className="font-medium hover:underline">
                            {s?.name ?? "Fournisseur"}
                          </Link>
                          <div className="text-xs text-muted">
                            MOQ {o.moq ?? "—"} · délai {o.delivery_max_days ?? o.delivery_min_days ?? "—"} j · {o.country ?? s?.country ?? "pays non communiqué"} · vérifié {formatRelative(o.last_seen_at)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold tnum">
                            {formatMoney(o.normalized_price ?? o.original_price, o.normalized_currency ?? o.original_currency)}
                            <span className="ml-1 text-xs font-normal text-muted">{o.tax_type === "ht" ? "HT" : o.tax_type === "ttc" ? "TTC" : "HT/TTC ?"}</span>
                          </div>
                          {row.cost_price !== null && o.normalized_price !== null && o.normalized_price < row.cost_price ? (
                            <div className="text-xs text-success">−{formatMoney(row.cost_price - o.normalized_price, currency)} / unité vs votre coût</div>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Historique des prix" />
            <CardContent className="p-0">
              {priceHistory.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted">Aucun changement de prix enregistré.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {priceHistory.map((p) => (
                    <li key={p.id} className="flex items-center justify-between px-5 py-2">
                      <span className="text-muted">
                        {formatDate(p.recorded_at)} · {p.kind === "cost" ? "coût" : "vente"}
                      </span>
                      <span className="tnum">{formatMoney(p.price, p.currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {siblings.length > 0 || writable ? (
            <Card>
              <CardHeader title="Autres variantes" actions={writable ? <ButtonLink href={`/stock/new?product=${row.product_id}`} variant="ghost" size="sm">Ajouter</ButtonLink> : null} />
              <CardContent className="p-0">
                {siblings.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-muted">Ce produit n'a qu'une variante.</p>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {siblings.map((s) => (
                      <li key={s.sku_id} className="flex items-center justify-between px-5 py-2">
                        <Link href={`/stock/${encodeURIComponent(s.code ?? "")}` as never} className="hover:underline">
                          <span className="font-mono text-xs">{s.code}</span> <span className="text-muted">{s.variant_name}</span>
                        </Link>
                        <span className="tnum">{formatNumber(s.quantity_available)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
      <Section className="mt-6">
        <p className="text-xs text-muted">Créé le {formatDate(product?.created_at)} · dernier mouvement {formatRelative(row.last_movement_at)}</p>
      </Section>
    </>
  );
}
