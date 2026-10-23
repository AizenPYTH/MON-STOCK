"use client";
import { useActionState } from "react";
import { Field, FormError, FormSuccess, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/result";
import type { Product, ProductVariant, StockOverviewRow } from "@/db/types";
import { updateProductAction, updateSkuAction } from "@/features/stock/actions";
import { FormActions, FormSection } from "@/features/stock/components/form-layout";

export function SkuEditForm({ row, variant, suppliers, updatedAt, cancelHref }: { row: StockOverviewRow; variant: ProductVariant | null; suppliers: Array<{ id: string; name: string }>; updatedAt: string | null; cancelHref?: string }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(updateSkuAction, null);
  const err = state && !state.ok ? state : null;
  const fe = err?.fieldErrors;
  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="sku_id" value={row.sku_id ?? ""} />
      {updatedAt ? <input type="hidden" name="expected_updated_at" value={updatedAt} /> : null}
      {variant?.updated_at ? <input type="hidden" name="expected_variant_updated_at" value={variant.updated_at} /> : null}
      <FormError message={err?.error} />
      {state?.ok ? <FormSuccess message="SKU enregistré." /> : null}
      <FormSection step="2 · Variante" title="Variante" description="Capacité, couleur, état et grade de cette variante.">
        <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:gap-x-4 xl:grid-cols-4">
          <Field label="Nom de la variante" htmlFor="variant_name" error={fe?.variant_name} className="col-span-2">
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
        </div>
      </FormSection>
      <FormSection step="3 · SKU" title="SKU, prix et seuils" description="Prix, seuils et fournisseur. Les quantités se modifient via les mouvements de stock (Ajuster le stock).">
        <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:gap-x-4 xl:grid-cols-3">
          <Field label="Code SKU" htmlFor="sku_code_ro" hint="Non modifiable : il identifie les ventes et les mouvements.">
            <Input id="sku_code_ro" value={row.code ?? ""} disabled className="font-mono" />
          </Field>
          <Field label="Code-barres" htmlFor="barcode" error={fe?.barcode}>
            <Input id="barcode" name="barcode" defaultValue={row.barcode ?? ""} />
          </Field>
          <Field label={`Coût d'achat (${row.currency})`} htmlFor="cost_price" hint="Vide = inconnu." error={fe?.cost_price}>
            <Input id="cost_price" name="cost_price" type="number" inputMode="decimal" step="0.01" min="0" max="1000000" defaultValue={row.cost_price ?? ""} className="tnum" />
          </Field>
          <Field label={`Prix de vente (${row.currency})`} htmlFor="sale_price" error={fe?.sale_price}>
            <Input id="sale_price" name="sale_price" type="number" inputMode="decimal" step="0.01" min="0" max="1000000" defaultValue={row.sale_price ?? ""} className="tnum" />
          </Field>
          <Field label="Emplacement" htmlFor="location" error={fe?.location}>
            <Input id="location" name="location" defaultValue={row.location ?? ""} />
          </Field>
          <Field label="Seuil de réappro." htmlFor="reorder_point" error={fe?.reorder_point} hint="Stock faible en dessous.">
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
        </div>
      </FormSection>
      <FormActions cancelHref={cancelHref} note="Variante et SKU sont enregistrés ensemble ; une modification simultanée par un autre membre est détectée.">
        <SubmitButton pendingText="Enregistrement…">Enregistrer la variante et le SKU</SubmitButton>
      </FormActions>
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
      <FormSection step="1 · Produit" title="Produit" description="Commun à toutes les variantes. Enregistré séparément de la variante.">
        <div className="grid gap-4 sm:grid-cols-2">
          {err?.error || state?.ok ? (
            <div className="sm:col-span-2">
              <FormError message={err?.error} />
              {state?.ok ? <FormSuccess message="Produit enregistré." /> : null}
            </div>
          ) : null}
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
            <Textarea id="p_description" name="description" rows={3} defaultValue={product.description ?? ""} />
          </Field>
          <div className="flex justify-end border-t border-line-soft pt-4 sm:col-span-2">
            <SubmitButton variant="secondary" pendingText="Enregistrement…">
              Enregistrer le produit
            </SubmitButton>
          </div>
        </div>
      </FormSection>
    </form>
  );
}
