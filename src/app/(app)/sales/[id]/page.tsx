import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireOrgContext } from "@/features/auth/dal";
import { PageHeader, DescriptionList, Callout } from "@/components/ui/page";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { getOrder } from "@/features/analytics/sales";
import { ORDER_STATUS_LABEL, ORDER_STATUS_VARIANT, PROVIDER_LABEL } from "@/features/analytics/labels";
import { formatDateTime, formatMoney, formatNumber, NOT_PROVIDED } from "@/lib/format";

export const metadata: Metadata = { title: "Commande" };

const MOVEMENT_LABEL: Record<string, string> = { sale: "Vente (déduction)", cancellation: "Annulation (recrédit)", return: "Retour client", correction: "Correction" };

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

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/sales" className="hover:text-foreground">
            Ventes
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            Commande <span className="font-mono">{order.order_number ?? order.external_order_id}</span>
            <Badge variant={ORDER_STATUS_VARIANT[order.status] ?? "neutral"}>{ORDER_STATUS_LABEL[order.status] ?? order.status}</Badge>
          </span>
        }
        description={`${channel ? `${PROVIDER_LABEL[channel.provider] ?? channel.provider} · ${channel.name}` : PROVIDER_LABEL[order.provider] ?? order.provider} · passée le ${formatDateTime(order.placed_at)}`}
      />

      {unmapped.length > 0 ? (
        <Callout tone="warning" className="mb-5" title={`${unmapped.length} ligne(s) non associée(s) à un SKU : leur stock n'a pas été déduit.`} action={<ButtonLink href="/settings/integrations/mapping" variant="secondary" size="sm">Associer les annonces</ButtonLink>}>
          Associez l'annonce correspondante à un SKU ; les ventes passées seront rattachées, puis vous pourrez appliquer la déduction depuis la fiche SKU.
        </Callout>
      ) : null}
      {pending.length > 0 && !cancelled ? (
        <Callout tone="warning" className="mb-5" title={`${pending.length} ligne(s) rattachée(s) à un SKU mais non déduite(s) du stock.`}>
          Ces lignes ont été associées après l'import. Ouvrez la fiche SKU pour appliquer la déduction après vérification du stock physique.
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title={`${items.length} ligne(s)`} />
            <CardContent className="p-0">
              {items.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted">Aucune ligne enregistrée pour cette commande.</p>
              ) : (
                <Table className="min-w-[760px]">
                  <THead>
                    <tr>
                      <TH>Article</TH>
                      <TH>SKU</TH>
                      <TH align="right">Qté</TH>
                      <TH align="right">Prix unitaire</TH>
                      <TH align="right">Total</TH>
                      <TH>Stock</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {items.map(({ item, sku }) => {
                      const mv = movementsByItem.get(item.id) ?? [];
                      return (
                        <TR key={item.id} className="align-top">
                          <TD>
                            <div className="max-w-[320px] truncate font-medium">{item.title || "Article sans titre"}</div>
                            <div className="font-mono text-xs text-muted">
                              {item.external_sku ? `SKU externe ${item.external_sku} · ` : ""}
                              {item.external_listing_id ? `annonce ${item.external_listing_id}` : ""}
                              {item.external_variation_id ? ` / ${item.external_variation_id}` : ""}
                            </div>
                          </TD>
                          <TD>
                            {sku ? (
                              <Link href={`/stock/${encodeURIComponent(sku.code)}` as never} className="hover:underline">
                                <div className="font-mono text-xs">{sku.code}</div>
                                <div className="max-w-[220px] truncate text-xs text-muted">
                                  {sku.productName}
                                  {sku.variantName ? ` · ${sku.variantName}` : ""}
                                </div>
                              </Link>
                            ) : (
                              <Link href="/settings/integrations/mapping" className="inline-flex">
                                <Badge variant="outline">Non associée</Badge>
                              </Link>
                            )}
                          </TD>
                          <TD align="right">{formatNumber(item.quantity)}</TD>
                          <TD align="right">{formatMoney(item.unit_price, item.currency ?? order.currency)}</TD>
                          <TD align="right">{formatMoney(item.total ?? (item.unit_price !== null ? item.unit_price * item.quantity : null), item.currency ?? order.currency)}</TD>
                          <TD>
                            {sku === null ? (
                              <span className="text-xs text-muted">Sans effet</span>
                            ) : item.inventory_applied ? (
                              <Badge variant="success">Déduit</Badge>
                            ) : cancelled ? (
                              <span className="text-xs text-muted">Recrédité / sans effet</span>
                            ) : (
                              <Badge variant="warning">Non déduit</Badge>
                            )}
                            {mv.length > 0 ? (
                              <ul className="mt-1 space-y-0.5 text-xs text-muted">
                                {mv.map((m) => (
                                  <li key={m.id}>
                                    {MOVEMENT_LABEL[m.type] ?? m.type} {m.quantity > 0 ? "+" : ""}
                                    {m.quantity} → {m.quantity_after} · {formatDateTime(m.occurred_at)}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
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
            <CardHeader title="Détails" />
            <CardContent>
              <DescriptionList
                className="sm:grid-cols-1"
                items={[
                  { label: "Acheteur", value: order.buyer_username ?? NOT_PROVIDED },
                  { label: "Identifiant externe", value: <span className="font-mono text-xs">{order.external_order_id}</span> },
                  { label: "Paiement", value: order.payment_status ?? NOT_PROVIDED },
                  { label: "Expédition", value: order.fulfillment_status ?? NOT_PROVIDED },
                  { label: "Sous-total", value: formatMoney(order.subtotal, order.currency) },
                  { label: "Livraison", value: formatMoney(order.shipping_total, order.currency) },
                  { label: "Taxes", value: formatMoney(order.tax_total, order.currency) },
                  { label: "Frais du canal", value: order.fee_total === null ? "Non communiqués" : formatMoney(order.fee_total, order.currency) },
                  { label: "Total", value: <span className="font-semibold">{formatMoney(order.total, order.currency)}</span> },
                  { label: "Stock déduit", value: order.inventory_applied ? `Oui${order.inventory_applied_at ? ` (${formatDateTime(order.inventory_applied_at)})` : ""}` : cancelled ? "Non (commande annulée)" : "Non" },
                  { label: "Dernière modification côté canal", value: formatDateTime(order.external_modified_at) },
                  { label: "Importée le", value: formatDateTime(order.created_at) },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Mouvements de stock" description="Références des mouvements générés par cette commande." />
            <CardContent className="p-0">
              {movements.length === 0 ? (
                <p className="px-5 py-5 text-sm text-muted">Aucun mouvement de stock lié à cette commande.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {movements.map((m) => (
                    <li key={m.id} className="px-5 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span>{MOVEMENT_LABEL[m.type] ?? m.type}</span>
                        <span className={m.quantity < 0 ? "tnum text-danger" : "tnum text-success"}>
                          {m.quantity > 0 ? "+" : ""}
                          {m.quantity}
                        </span>
                      </div>
                      <div className="text-xs text-muted">
                        {formatDateTime(m.occurred_at)} · stock après : {m.quantity_after} · <span className="font-mono">{m.id.slice(0, 8)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
