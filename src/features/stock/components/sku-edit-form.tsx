"use client";
import { useActionState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, FormError, FormSuccess, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/result";
import type { Product, ProductVariant, StockOverviewRow } from "@/db/types";
import { updateProductAction, updateSkuAction } from "@/features/stock/actions";

export function SkuEditForm({ row, variant, suppliers, updatedAt }: { row: StockOverviewRow; variant: ProductVariant | null; suppliers: Array<{ id: string; name: string }>; updatedAt: string | null }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(updateSkuAction, null);
  const err = state && !state.ok ? state : null;
  const fe = err?.fieldErrors;
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="sku_id" value={row.sku_id ?? ""} />
      {updatedAt ? <input type="hidden" name="expected_updated_at" value={updatedAt} /> : null}
      <FormError message={err?.error} />
      {state?.ok ? <FormSuccess message="SKU enregistré." /> : null}
      <Card>
        <CardHeader title="Variante" />
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Nom de la variante" htmlFor="variant_name" error={fe?.variant_name} className="sm:col-span-2">
            <Input id="variant_name" name="variant_name" defaultValue={row.variant_name ?? ""} />
          </Field>
          <Field label="État" htmlFor="condition" error={fe?.condition}>
            <Select id="condition" name="condition" defaultValue={row.condition ?? "unknown"}>
              <option value="new">Neuf</option>
              <option value="refurbished">Reconditionné</option>
              <option value="used">Occasion</option>
              <option value="unknown">Non précisé</option>
            </Select>
          </Field>
          <Field label="Grade" htmlFor="grade" error={fe?.grade}>
            <Input id="grade" name="grade" defaultValue={row.grade ?? ""} />
          </Field>
          <Field label="Stockage" htmlFor="storage" error={fe?.storage}>
            <Input id="storage" name="storage" defaultValue={attr(variant, "storage")} placeholder="128 Go" />
          </Field>
          <Field label="Couleur" htmlFor="color" error={fe?.color}>
            <Input id="color" name="color" defaultValue={attr(variant, "color")} placeholder="Noir" />
          </Field>
          <Field label="EAN / GTIN" htmlFor="ean" error={fe?.ean} hint="8, 12, 13 ou 14 chiffres.">
            <Input id="ean" name="ean" defaultValue={variant?.ean ?? ""} inputMode="numeric" maxLength={14} />
          </Field>
          <Field label="MPN" htmlFor="mpn" error={fe?.mpn}>
            <Input id="mpn" name="mpn" defaultValue={variant?.mpn ?? ""} />
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader title="SKU" description="Prix, seuils et fournisseur. Les quantités se modifient via les mouvements de stock." />
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Code SKU">
            <Input value={row.code ?? ""} disabled className="font-mono" />
          </Field>
          <Field label="Code-barres" htmlFor="barcode" error={fe?.barcode}>
            <Input id="barcode" name="barcode" defaultValue={row.barcode ?? ""} />
          </Field>
          <Field label={`Coût d'achat (${row.currency})`} htmlFor="cost_price" hint="Vide = inconnu." error={fe?.cost_price}>
            <Input id="cost_price" name="cost_price" type="number" step="0.01" min="0" max="1000000" defaultValue={row.cost_price ?? ""} />
          </Field>
          <Field label={`Prix de vente (${row.currency})`} htmlFor="sale_price" error={fe?.sale_price}>
            <Input id="sale_price" name="sale_price" type="number" step="0.01" min="0" max="1000000" defaultValue={row.sale_price ?? ""} />
          </Field>
          <Field label="Emplacement" htmlFor="location" error={fe?.location}>
            <Input id="location" name="location" defaultValue={row.location ?? ""} />
          </Field>
          <Field label="Seuil de réappro." htmlFor="reorder_point" error={fe?.reorder_point}>
            <Input id="reorder_point" name="reorder_point" type="number" step="1" min="0" defaultValue={row.reorder_point ?? 0} />
          </Field>
          <Field label="Stock de sécurité" htmlFor="safety_stock" error={fe?.safety_stock}>
            <Input id="safety_stock" name="safety_stock" type="number" step="1" min="0" defaultValue={row.safety_stock ?? 0} />
          </Field>
          <Field label="Délai fournisseur (jours)" htmlFor="lead_time_days" error={fe?.lead_time_days}>
            <Input id="lead_time_days" name="lead_time_days" type="number" step="1" min="0" max="365" defaultValue={row.lead_time_days ?? ""} />
          </Field>
          <Field label="Fournisseur par défaut" htmlFor="default_supplier_id" error={fe?.default_supplier_id}>
            <Select id="default_supplier_id" name="default_supplier_id" defaultValue={row.default_supplier_id ?? ""}>
              <option value="">Aucun</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Actif" htmlFor="is_active" error={fe?.is_active}>
            <Select id="is_active" name="is_active" defaultValue={row.is_active ? "true" : "false"}>
              <option value="true">Actif</option>
              <option value="false">Archivé</option>
            </Select>
          </Field>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <SubmitButton pendingText="Enregistrement…">Enregistrer</SubmitButton>
      </div>
    </form>
  );
}

function attr(variant: ProductVariant | null, key: string): string {
  const a = variant?.attributes;
  if (!a || typeof a !== "object" || Array.isArray(a)) return "";
  const v = (a as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
}

export function ProductEditForm({ product }: { product: Product }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(updateProductAction, null);
  const err = state && !state.ok ? state : null;
  const fe = err?.fieldErrors;
  return (
    <form action={action}>
      <input type="hidden" name="product_id" value={product.id} />
      <Card>
        <CardHeader title="Produit" description="Commun à toutes les variantes." />
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormError message={err?.error} />
          {state?.ok ? <FormSuccess message="Produit enregistré." /> : null}
          <Field label="Nom" htmlFor="p_name" error={fe?.name} className="sm:col-span-2">
            <Input id="p_name" name="name" defaultValue={product.name} required />
          </Field>
          <Field label="Marque" htmlFor="p_brand" error={fe?.brand}>
            <Input id="p_brand" name="brand" defaultValue={product.brand ?? ""} />
          </Field>
          <Field label="Catégorie" htmlFor="p_category" error={fe?.category}>
            <Input id="p_category" name="category" defaultValue={product.category ?? ""} />
          </Field>
          <Field label="URL de l'image" htmlFor="p_image_url" error={fe?.image_url} className="sm:col-span-2">
            <Input id="p_image_url" name="image_url" type="url" defaultValue={product.image_url ?? ""} />
          </Field>
          <Field label="Description" htmlFor="p_description" error={fe?.description} className="sm:col-span-2">
            <Textarea id="p_description" name="description" defaultValue={product.description ?? ""} />
          </Field>
          <div className="sm:col-span-2 flex justify-end">
            <SubmitButton variant="secondary" pendingText="Enregistrement…">
              Enregistrer le produit
            </SubmitButton>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
