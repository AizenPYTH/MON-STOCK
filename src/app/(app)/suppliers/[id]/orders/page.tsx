import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/page";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { getPurchaseOrder, getSupplier, getSupplierPurchaseOrders, getSupplierTabCounts, leadTimeDays } from "@/features/suppliers/queries";
import { getStockRowById, searchSkus } from "@/features/stock/queries";
import { SupplierHeader } from "@/features/suppliers/components/supplier-header";
import { AddItemForm, CreatePurchaseOrderForm, PurchaseOrderActionButton, ReceiveForm, type OrderPrefill } from "@/features/suppliers/components/purchase-order-forms";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { PO_STATUS_LABEL } from "@/features/sourcing/labels";

export const metadata: Metadata = { title: "Commandes fournisseur" };

function statusTone(s: string): "success" | "warning" | "danger" | "neutral" | "info" {
  if (s === "received") return "success";
  if (s === "partially_received" || s === "confirmed") return "info";
  if (s === "sent") return "warning";
  if (s === "cancelled") return "danger";
  return "neutral";
}

export default async function SupplierOrdersPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const { id } = await params;
  const sp = await searchParams;
  const supplier = await getSupplier(ctx, id);
  if (!supplier) notFound();
  const selectedId = typeof sp.po === "string" ? sp.po : null;
  const orderSku = typeof sp.order_sku === "string" ? sp.order_sku : null;
  const showNew = sp.new === "1" || Boolean(orderSku);
  const [counts, orders, selected, skus, prefillRow] = await Promise.all([
    getSupplierTabCounts(ctx, supplier.id),
    getSupplierPurchaseOrders(ctx, supplier.id),
    selectedId ? getPurchaseOrder(ctx, selectedId) : Promise.resolve(null),
    searchSkus(ctx, "", 300),
    orderSku ? getStockRowById(ctx, orderSku) : Promise.resolve(null),
  ]);
  const writable = canWrite(ctx.role);
  const skuOptions = skus.filter((s) => s.sku_id && s.code).map((s) => ({ id: s.sku_id!, code: s.code!, label: `${s.product_name ?? ""}${s.variant_name && s.variant_name !== "Standard" ? ` · ${s.variant_name}` : ""}` }));
  let prefill: OrderPrefill | null = null;
  if (prefillRow && prefillRow.sku_id) {
    let unitCost: number | null = null;
    const offerId = typeof sp.offer === "string" ? sp.offer : null;
    if (offerId) {
      const { data: offer } = await ctx.supabase.from("sourcing_offers").select("normalized_price, normalized_currency, original_price, original_currency").eq("organization_id", ctx.organization.id).eq("id", offerId).maybeSingle();
      // Coût prérempli uniquement dans la devise de la commande (celle du fournisseur) : jamais de prix converti présenté comme tel.
      if (offer) unitCost = offer.original_currency === supplier.currency ? Number(offer.original_price) : offer.normalized_currency === supplier.currency ? offer.normalized_price : null;
    }
    prefill = { skuId: prefillRow.sku_id, skuLabel: `${prefillRow.code} — ${prefillRow.product_name ?? ""}`, quantity: Math.min(100_000, Math.max(1, Math.floor(Number(sp.qty ?? "1")) || 1)), unitCost, offerId };
  }
  const base = `/suppliers/${supplier.id}/orders`;

  return (
    <>
      <SupplierHeader supplier={supplier} tab="orders" counts={counts} />
      <div className="space-y-6">
        {writable && !showNew ? (
          <div className="flex justify-end">
            <ButtonLink href={`${base}?new=1`}>Nouvelle commande</ButtonLink>
          </div>
        ) : null}
        {writable && showNew ? <CreatePurchaseOrderForm supplierId={supplier.id} currency={supplier.currency} skus={skuOptions} prefill={prefill} /> : null}

        {selected ? (
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  Commande {selected.reference ?? selected.id.slice(0, 8)} <Badge variant={statusTone(selected.status)}>{PO_STATUS_LABEL[selected.status]}</Badge>
                </span>
              }
              description={`Créée le ${formatDateTime(selected.created_at)}${selected.sent_at ? ` · envoyée le ${formatDate(selected.sent_at)}` : ""}${selected.received_at ? ` · reçue le ${formatDate(selected.received_at)}` : ""}${selected.expected_at ? ` · livraison prévue ${formatDate(selected.expected_at)}` : ""}`}
              actions={
                writable ? (
                  <div className="flex flex-wrap gap-2">
                    {selected.status === "draft" ? (
                      <PurchaseOrderActionButton kind="status" fields={{ purchase_order_id: selected.id, status: "sent" }} disabled={selected.items.length === 0} pendingText="Envoi…">
                        Marquer envoyée
                      </PurchaseOrderActionButton>
                    ) : null}
                    {selected.status === "sent" ? (
                      <>
                        <PurchaseOrderActionButton kind="status" fields={{ purchase_order_id: selected.id, status: "confirmed" }} variant="secondary" pendingText="Enregistrement…">
                          Marquer confirmée
                        </PurchaseOrderActionButton>
                        <PurchaseOrderActionButton kind="status" fields={{ purchase_order_id: selected.id, status: "draft" }} variant="ghost" pendingText="Enregistrement…">
                          Repasser en brouillon
                        </PurchaseOrderActionButton>
                      </>
                    ) : null}
                    {["draft", "sent", "confirmed", "partially_received"].includes(selected.status) ? (
                      <PurchaseOrderActionButton
                        kind="status"
                        fields={{ purchase_order_id: selected.id, status: "cancelled" }}
                        confirmMessage={selected.status === "partially_received" ? "Annuler le reste de cette commande ? Les quantités déjà reçues restent en stock." : "Annuler cette commande fournisseur ?"}
                        variant="ghost"
                        className="text-danger"
                        pendingText="Annulation…"
                      >
                        Annuler
                      </PurchaseOrderActionButton>
                    ) : null}
                  </div>
                ) : null
              }
            />
            <CardContent className="space-y-4">
              {selected.items.length === 0 ? (
                <p className="text-sm text-muted">Aucune ligne : ajoutez un SKU et une quantité.</p>
              ) : (
                <Table className="min-w-[640px]">
                  <THead>
                    <tr>
                      <TH>SKU</TH>
                      <TH align="right">Commandé</TH>
                      <TH align="right">Reçu</TH>
                      <TH align="right">Coût unitaire</TH>
                      <TH align="right">Total ligne</TH>
                      <TH></TH>
                    </tr>
                  </THead>
                  <TBody>
                    {selected.items.map((it) => (
                      <TR key={it.id}>
                        <TD>
                          {it.sku ? (
                            <Link href={`/stock/${encodeURIComponent(it.sku.code)}` as never} className="hover:underline">
                              <span className="font-mono text-xs">{it.sku.code}</span> {it.sku.product?.name}
                              {it.sku.variant?.name && it.sku.variant.name !== "Standard" ? ` · ${it.sku.variant.name}` : ""}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </TD>
                        <TD align="right">{it.quantity_ordered}</TD>
                        <TD align="right">{it.quantity_received}</TD>
                        <TD align="right">{it.unit_cost === null ? <span className="text-xs text-muted">Inconnu</span> : formatMoney(it.unit_cost, it.currency ?? selected.currency)}</TD>
                        <TD align="right">{it.unit_cost === null ? "—" : formatMoney(it.unit_cost * it.quantity_ordered, it.currency ?? selected.currency)}</TD>
                        <TD>
                          {writable && selected.status === "draft" ? (
                            <PurchaseOrderActionButton kind="remove_item" fields={{ item_id: it.id }} variant="ghost" pendingText="Retrait…">
                              Retirer
                            </PurchaseOrderActionButton>
                          ) : null}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
              <p className="text-sm">
                Total : <span className="font-semibold tnum">{selected.total === null ? (selected.items.length === 0 ? "—" : "Non calculable (coût inconnu ou ligne dans une autre devise)") : formatMoney(selected.total, selected.currency)}</span>
              </p>
              {writable && selected.status === "draft" ? <AddItemForm purchaseOrderId={selected.id} skus={skuOptions} /> : null}
              {writable && ["sent", "confirmed", "partially_received"].includes(selected.status) ? (
                <div className="rounded-lg border border-border p-4">
                  <h4 className="mb-2 text-sm font-semibold">Réception</h4>
                  <ReceiveForm
                    key={selected.items.map((it) => `${it.id}:${it.quantity_received}`).join("|")}
                    purchaseOrderId={selected.id}
                    items={selected.items.map((it) => ({ id: it.id, label: `${it.sku?.code ?? ""} ${it.sku?.product?.name ?? ""}`.trim(), ordered: it.quantity_ordered, received: it.quantity_received }))} />
                </div>
              ) : null}
              {selected.notes ? <p className="text-xs text-muted">Notes : {selected.notes}</p> : null}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Historique des achats" description={orders.length === 0 ? undefined : `${orders.length} commande(s).`} />
          <CardContent className="p-0">
            {orders.length === 0 ? (
              <EmptyState className="border-0" title="Aucune commande chez ce fournisseur." description="Créez une commande depuis cette page, depuis une offre du sourcing ou depuis la fiche d'un SKU (réapprovisionnement)." />
            ) : (
              <Table className="min-w-[720px]">
                <THead>
                  <tr>
                    <TH>Référence</TH>
                    <TH>Statut</TH>
                    <TH>Créée</TH>
                    <TH>Envoyée</TH>
                    <TH>Reçue</TH>
                    <TH align="right">Délai réel</TH>
                    <TH align="right">Lignes</TH>
                    <TH align="right">Total</TH>
                  </tr>
                </THead>
                <TBody>
                  {orders.map((po) => {
                    const lt = leadTimeDays(po);
                    return (
                      <TR key={po.id} className={po.id === selectedId ? "bg-surface-muted/60" : undefined}>
                        <TD>
                          <Link href={`${base}?po=${po.id}` as never} className="font-medium hover:underline">
                            {po.reference ?? po.id.slice(0, 8)}
                          </Link>
                        </TD>
                        <TD>
                          <Badge variant={statusTone(po.status)}>{PO_STATUS_LABEL[po.status]}</Badge>
                        </TD>
                        <TD className="text-xs text-muted">{formatDate(po.created_at)}</TD>
                        <TD className="text-xs text-muted">{formatDate(po.sent_at)}</TD>
                        <TD className="text-xs text-muted">{formatDate(po.received_at)}</TD>
                        <TD align="right">{lt === null ? "—" : `${lt} j`}</TD>
                        <TD align="right">{po.items.length}</TD>
                        <TD align="right">{po.total === null ? "—" : formatMoney(po.total, po.currency)}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
