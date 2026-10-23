import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, Link2Off } from "lucide-react";
import { z } from "zod";
import { requireOrgContext } from "@/features/auth/dal";
import { DescriptionList, Callout } from "@/components/ui/page";
import { MonoTitle, Paper, Scene, SceneHeader } from "@/components/instrument";
import { SceneStatGrid } from "@/features/analytics/components/scene-stats";
import { OrderStatusBadge, OrderSteps } from "@/features/analytics/components/order-status";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ButtonLink } from "@/components/ui/button";
import { getOrder } from "@/features/analytics/sales";
import { PROVIDER_LABEL } from "@/features/analytics/labels";
import { formatDateTime, formatMoney, formatNumber, NOT_PROVIDED } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Commande" };

const MOVEMENT_LABEL: Record<string, string> = { sale: "Vente (déduction)", cancellation: "Annulation (recrédit)", return: "Retour client", correction: "Correction" };

function signed(n: number): string {
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatNumber(Math.abs(n))}`;
}

function AmountRow({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", strong ? "border-t border-border pt-3 text-base font-extrabold text-foreground" : "text-sm text-muted")}>
      <dt>{label}</dt>
      <dd className={cn("tnum", strong ? "text-[18px]" : "font-semibold text-foreground")}>{value}</dd>
    </div>
  );
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgContext();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const detail = await getOrder(ctx, id);
  if (!detail) notFound();
  const { order, channel, items, movements } = detail;
  const cancelled = order.status === "cancelled" || order.status === "refunded";
  const unmapped = items.filter((i) => i.sku === null);
  const pending = items.filter((i) => i.sku !== null && !i.item.inventory_applied);
  const movementsByItem = new Map<string, typeof movements>();
  for (const m of movements) {
    if (!m.reference_id) continue;
    const list = movementsByItem.get(m.reference_id) ?? [];
    list.push(m);
    movementsByItem.set(m.reference_id, list);
  }
  const units = items.reduce((a, i) => a + i.item.quantity, 0);

  return (
    <>
      <Scene>
        <SceneHeader
          back={{ href: "/sales", label: "Ventes" }}
          eyebrow={`${channel ? `${PROVIDER_LABEL[channel.provider] ?? channel.provider} · ${channel.name}` : (PROVIDER_LABEL[order.provider] ?? order.provider)} · passée le ${formatDateTime(order.placed_at)}`}
          title={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span>Commande</span> <span className="ms-code text-[24px] tracking-normal">{order.order_number ?? order.external_order_id}</span>
              <OrderStatusBadge status={order.status} size="md" />
            </span>
          }
        />
        <OrderSteps status={order.status} className="mt-5 max-w-[560px]" />
        <SceneStatGrid
          stats={[
            { label: "Total", value: order.total === null ? null : formatMoney(order.total, order.currency) },
            { label: "Lignes", value: formatNumber(items.length), hint: `${formatNumber(units)} unité(s)` },
            { label: "Stock déduit", value: order.inventory_applied ? "Oui" : cancelled ? "Sans effet" : "Non", tone: !order.inventory_applied && !cancelled && items.length > 0 ? "warning" : undefined, hint: unmapped.length > 0 ? `${unmapped.length} ligne(s) non associée(s)` : undefined },
            { label: "Acheteur", value: order.buyer_username ?? NOT_PROVIDED },
          ]}
        />
      </Scene>
      <Paper>
        {unmapped.length > 0 ? (
          <Callout tone="warning" className="mb-4" title={`${unmapped.length} ligne(s) non associée(s) à un SKU : leur stock n'a pas été déduit.`} action={<ButtonLink href="/settings/integrations/mapping" variant="secondary" size="sm">Associer les annonces</ButtonLink>}>
            Associez l&apos;annonce correspondante à un SKU ; les ventes passées seront rattachées, puis vous pourrez appliquer la déduction depuis la fiche SKU.
          </Callout>
        ) : null}
        {pending.length > 0 && !cancelled ? (
          <Callout tone="warning" className="mb-4" title={`${pending.length} ligne(s) rattachée(s) à un SKU mais non déduite(s) du stock.`}>
            Ces lignes ont été associées après l&apos;import. Ouvrez la fiche SKU pour appliquer la déduction après vérification du stock physique.
          </Callout>
        ) : null}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
          <section aria-labelledby="order-items" className="min-w-0 space-y-2.5">
            <MonoTitle title="Articles" count={items.length} aside={`${formatNumber(units)} unité(s)`} as="div" />
            <h2 id="order-items" className="sr-only">
              Articles de la commande
            </h2>
            <Card>
              {items.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted">Aucune ligne enregistrée pour cette commande.</p>
              ) : (
                <ul className="divide-y divide-line-soft">
                  {items.map(({ item, sku }) => {
                    const mv = movementsByItem.get(item.id) ?? [];
                    const cur = item.currency ?? order.currency;
                    const lineTotal = item.total ?? (item.unit_price !== null ? item.unit_price * item.quantity : null);
                    const refs = [item.external_sku ? `SKU externe ${item.external_sku}` : null, item.external_listing_id ? `annonce ${item.external_listing_id}${item.external_variation_id ? ` / ${item.external_variation_id}` : ""}` : null].filter(Boolean).join(" · ");
                    return (
                      <li key={item.id} className="grid gap-x-6 gap-y-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5">
                        <div className="min-w-0 space-y-2">
                          <div>
                            <p className="font-semibold leading-5 text-foreground">{item.title || "Article sans titre"}</p>
                            {refs ? <p className="ms-code mt-0.5 break-all text-[11.5px] text-ink-3">{refs}</p> : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                            {sku ? (
                              <Link href={`/stock/${encodeURIComponent(sku.code)}`} className="group inline-flex min-w-0 max-w-full items-baseline gap-2 rounded-md bg-surface-2 px-2 py-1 ring-1 ring-inset ring-border hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                                <span className="ms-code shrink-0 text-xs font-semibold text-foreground">{sku.code}</span>
                                <span className="truncate text-xs text-muted group-hover:text-foreground">
                                  {sku.productName}
                                  {sku.variantName ? ` · ${sku.variantName}` : ""}
                                </span>
                              </Link>
                            ) : (
                              <Link href="/settings/integrations/mapping" className="inline-flex rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                                <StatusBadge tone="warning" icon={<Link2Off />}>
                                  Non associée · associer
                                </StatusBadge>
                              </Link>
                            )}
                            {sku === null ? (
                              <span className="text-xs text-muted">Stock : sans effet</span>
                            ) : item.inventory_applied ? (
                              <StatusBadge tone="success" variant="plain">
                                Stock déduit
                              </StatusBadge>
                            ) : cancelled ? (
                              <span className="text-xs text-muted">Recrédité / sans effet</span>
                            ) : (
                              <StatusBadge tone="warning" variant="plain">
                                Stock non déduit
                              </StatusBadge>
                            )}
                          </div>
                          {mv.length > 0 ? (
                            <ul className="space-y-0.5 text-xs text-muted" aria-label="Mouvements de cette ligne">
                              {mv.map((m) => (
                                <li key={m.id} className="tnum">
                                  {MOVEMENT_LABEL[m.type] ?? m.type} <span className={m.quantity < 0 ? "font-semibold text-danger" : "font-semibold text-success"}>{signed(m.quantity)}</span> → {formatNumber(m.quantity_after)} · {formatDateTime(m.occurred_at)}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                        <div className="flex items-baseline justify-between gap-4 border-t border-line-soft pt-2 text-right sm:block sm:border-0 sm:pt-0">
                          <p className="text-sm text-muted tnum">
                            {formatNumber(item.quantity)} × {formatMoney(item.unit_price, cur)}
                          </p>
                          <p className="text-base font-bold text-foreground tnum sm:mt-0.5">{formatMoney(lineTotal, cur)}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <dl className="space-y-2 border-t border-border bg-surface-2 px-4 py-4 sm:px-5 rounded-b-2xl">
                <AmountRow label="Sous-total" value={formatMoney(order.subtotal, order.currency)} />
                <AmountRow label="Livraison" value={formatMoney(order.shipping_total, order.currency)} />
                <AmountRow label="Taxes" value={formatMoney(order.tax_total, order.currency)} />
                <AmountRow label="Frais du canal" value={order.fee_total === null ? <span className="font-medium text-muted">Non communiqués</span> : formatMoney(order.fee_total, order.currency)} />
                <AmountRow label="Total" value={formatMoney(order.total, order.currency)} strong />
              </dl>
            </Card>
          </section>

          <div className="min-w-0 space-y-5">
            <Card>
              <CardHeader title="Commande et acheteur" />
              <CardContent>
                <DescriptionList
                  className="sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"
                  items={[
                    { label: "Acheteur", value: order.buyer_username ?? NOT_PROVIDED },
                    { label: "Identifiant externe", value: <span className="ms-code break-all text-xs">{order.external_order_id}</span> },
                    { label: "Paiement", value: order.payment_status ?? NOT_PROVIDED },
                    { label: "Expédition", value: order.fulfillment_status ?? NOT_PROVIDED },
                    { label: "Stock déduit", value: order.inventory_applied ? `Oui${order.inventory_applied_at ? ` (${formatDateTime(order.inventory_applied_at)})` : ""}` : cancelled ? "Non (commande annulée)" : "Non" },
                    { label: "Dernière modification côté canal", value: <span className="tnum">{formatDateTime(order.external_modified_at)}</span> },
                    { label: "Importée le", value: <span className="tnum">{formatDateTime(order.created_at)}</span> },
                  ]}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader title="Mouvements de stock" description="Références des mouvements générés par cette commande." />
              {movements.length === 0 ? (
                <p className="px-5 py-5 text-sm text-muted">Aucun mouvement de stock lié à cette commande.</p>
              ) : (
                <ul className="divide-y divide-line-soft text-sm">
                  {movements.map((m) => {
                    const Icon = m.quantity < 0 ? ArrowDownRight : ArrowUpRight;
                    return (
                      <li key={m.id} className="flex items-start gap-3 px-5 py-3">
                        <span aria-hidden="true" className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", m.quantity < 0 ? "bg-danger-soft text-danger-ink" : "bg-success-soft text-success-ink")}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-semibold text-foreground">{MOVEMENT_LABEL[m.type] ?? m.type}</span>
                            <span className={cn("font-bold tnum", m.quantity < 0 ? "text-danger" : "text-success")}>{signed(m.quantity)}</span>
                          </div>
                          <div className="mt-0.5 text-xs text-muted tnum">
                            {formatDateTime(m.occurred_at)} · stock après : {formatNumber(m.quantity_after)} · <span className="ms-code">{m.id.slice(0, 8)}</span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </Paper>
    </>
  );
}
