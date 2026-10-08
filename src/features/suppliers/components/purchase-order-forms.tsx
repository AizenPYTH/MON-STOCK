"use client";
import { useActionState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, FormError, FormSuccess, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/result";
import { addPurchaseOrderItemAction, createPurchaseOrderAction, receivePurchaseOrderAction } from "@/features/suppliers/actions";
import type { SkuOption } from "@/features/suppliers/components/manual-offer-form";

export interface OrderPrefill {
  skuId: string;
  skuLabel: string;
  quantity: number;
  unitCost: number | null;
  offerId: string | null;
}

export function CreatePurchaseOrderForm({ supplierId, currency, skus, prefill }: { supplierId: string; currency: string; skus: SkuOption[]; prefill: OrderPrefill | null }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(createPurchaseOrderAction, null);
  const err = state && !state.ok ? state : null;
  const fe = err?.fieldErrors;
  return (
    <form action={action}>
      <input type="hidden" name="supplier_id" value={supplierId} />
      {prefill?.offerId ? <input type="hidden" name="offer_id" value={prefill.offerId} /> : null}
      <Card>
        <CardHeader title="Nouvelle commande fournisseur" description={prefill ? `Pré-remplie pour ${prefill.skuLabel}.` : "Créez un brouillon, ajoutez des lignes, puis marquez la commande envoyée."} />
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-4">
            <FormError message={err?.error} />
          </div>
          <Field label="Référence" htmlFor="po_ref" error={fe?.reference}>
            <Input id="po_ref" name="reference" placeholder="PO-2026-001" />
          </Field>
          <Field label="Devise" htmlFor="po_currency" error={fe?.currency}>
            <Input id="po_currency" name="currency" defaultValue={currency} maxLength={3} required />
          </Field>
          <Field label="Livraison prévue" htmlFor="po_expected" error={fe?.expected_at}>
            <Input id="po_expected" name="expected_at" type="date" />
          </Field>
          <Field label="SKU (première ligne)" htmlFor="po_sku" error={fe?.sku_id}>
            <Select id="po_sku" name="sku_id" defaultValue={prefill?.skuId ?? ""}>
              <option value="">— aucune ligne pour l'instant —</option>
              {skus.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quantité" htmlFor="po_qty" error={fe?.quantity}>
            <Input id="po_qty" name="quantity" type="number" min={1} step={1} defaultValue={prefill?.quantity ?? ""} />
          </Field>
          <Field label="Coût unitaire" htmlFor="po_cost" error={fe?.unit_cost} hint="Vide = inconnu">
            <Input id="po_cost" name="unit_cost" type="number" min={0} step="0.01" defaultValue={prefill?.unitCost ?? ""} />
          </Field>
          <Field label="Notes" htmlFor="po_notes" error={fe?.notes} className="sm:col-span-2">
            <Textarea id="po_notes" name="notes" className="min-h-9" />
          </Field>
          <div className="flex items-end justify-end sm:col-span-2 lg:col-span-4">
            <SubmitButton pendingText="Création…">Créer le brouillon</SubmitButton>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

export function AddItemForm({ purchaseOrderId, skus }: { purchaseOrderId: string; skus: SkuOption[] }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(addPurchaseOrderItemAction, null);
  const err = state && !state.ok ? state : null;
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="purchase_order_id" value={purchaseOrderId} />
      <Field label="SKU" htmlFor={`ai_sku_${purchaseOrderId}`} error={err?.fieldErrors?.sku_id} className="min-w-[240px] flex-1">
        <Select id={`ai_sku_${purchaseOrderId}`} name="sku_id" defaultValue="" required>
          <option value="">Choisir un SKU</option>
          {skus.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} — {s.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Quantité" htmlFor={`ai_qty_${purchaseOrderId}`} error={err?.fieldErrors?.quantity}>
        <Input id={`ai_qty_${purchaseOrderId}`} name="quantity" type="number" min={1} step={1} required className="w-24" />
      </Field>
      <Field label="Coût unitaire" htmlFor={`ai_cost_${purchaseOrderId}`} error={err?.fieldErrors?.unit_cost}>
        <Input id={`ai_cost_${purchaseOrderId}`} name="unit_cost" type="number" min={0} step="0.01" className="w-28" />
      </Field>
      <SubmitButton size="md" variant="secondary" pendingText="Ajout…">
        Ajouter la ligne
      </SubmitButton>
      {err ? <div className="w-full"><FormError message={err.error} /></div> : null}
    </form>
  );
}

export function ReceiveForm({ purchaseOrderId, items }: { purchaseOrderId: string; items: Array<{ id: string; label: string; ordered: number; received: number }> }) {
  const [state, action] = useActionState<ActionResult<{ message: string }> | null, FormData>(receivePurchaseOrderAction, null);
  const err = state && !state.ok ? state : null;
  const remaining = items.filter((i) => i.ordered - i.received > 0);
  if (remaining.length === 0) return <p className="text-sm text-muted">Toutes les lignes ont été reçues.</p>;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="purchase_order_id" value={purchaseOrderId} />
      <FormError message={err?.error} />
      {state?.ok ? <FormSuccess message={state.data.message} /> : null}
      <p className="text-xs text-muted">Chaque quantité reçue crée un mouvement de stock « réception fournisseur » et devient le coût de référence du SKU s'il était inconnu.</p>
      <ul className="space-y-2">
        {remaining.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-3 text-sm">
            <span className="min-w-[220px] flex-1">{i.label}</span>
            <span className="text-xs text-muted">reste {i.ordered - i.received} / {i.ordered}</span>
            <Input name={`receive_${i.id}`} type="number" min={0} max={i.ordered - i.received} step={1} defaultValue={i.ordered - i.received} className="w-24" aria-label={`Quantité reçue pour ${i.label}`} />
          </li>
        ))}
      </ul>
      <SubmitButton pendingText="Réception…">Enregistrer la réception</SubmitButton>
    </form>
  );
}
