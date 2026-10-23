"use client";
import { useActionState } from "react";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/result";
import { addSkuAction, createProductAction } from "@/features/stock/actions";
import { FormActions, FormSection } from "@/features/stock/components/form-layout";

export interface ProductFormDefaults {
  name?: string;
  code?: string;
  sale_price?: string;
}

export function ProductForm({ product, suppliers, currency, defaults, cancelHref }: { product?: { id: string; name: string; brand: string | null } | null; suppliers: Array<{ id: string; name: string }>; currency: string; defaults?: ProductFormDefaults; cancelHref?: string }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(product ? addSkuAction : createProductAction, null);
  const err = state && !state.ok ? state : null;
  const fe = err?.fieldErrors;
  return (
    <form action={action} className="space-y-8">
      <FormError message={err?.error} />
      {product ? <input type="hidden" name="product_id" value={product.id} /> : null}

      {!product ? (
        <FormSection step="1 · Produit" title="Produit" description="Le produit regroupe des variantes ; chaque variante possède un SKU et son propre stock.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom du produit" htmlFor="name" error={fe?.name} className="sm:col-span-2">
              <Input id="name" name="name" placeholder="Apple iPhone 13" required defaultValue={defaults?.name ?? ""} />
            </Field>
            <Field label="Marque" htmlFor="brand" error={fe?.brand}>
              <Input id="brand" name="brand" placeholder="Apple" />
            </Field>
            <Field label="Catégorie" htmlFor="category" error={fe?.category}>
              <Input id="category" name="category" placeholder="Smartphones" />
            </Field>
            <Field label="URL de l'image" htmlFor="image_url" error={fe?.image_url} className="sm:col-span-2">
              <Input id="image_url" name="image_url" type="url" placeholder="https://…" />
            </Field>
            <Field label="Description" htmlFor="description" error={fe?.description} className="sm:col-span-2">
              <Textarea id="description" name="description" rows={3} />
            </Field>
          </div>
        </FormSection>
      ) : (
        <FormSection step="1 · Produit" title="Produit" description="La nouvelle variante est ajoutée à ce produit.">
          <div className="ms-mono text-[10.5px] leading-[14px] text-ink-3">Produit parent</div>
          <div className="mt-1 text-[15px] font-bold text-foreground">
            {product.brand ? <span className="font-semibold text-muted">{product.brand} · </span> : null}
            {product.name}
          </div>
        </FormSection>
      )}

      <FormSection step="2 · Variante" title="Variante" description="Capacité, couleur, état, grade. Le nom est généré automatiquement si vide.">
        <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:gap-x-4 xl:grid-cols-4">
          <Field label="Stockage" htmlFor="storage" error={fe?.storage}>
            <Input id="storage" name="storage" placeholder="128 Go" />
          </Field>
          <Field label="Couleur" htmlFor="color" error={fe?.color}>
            <Input id="color" name="color" placeholder="Noir" />
          </Field>
          <Field label="État" htmlFor="condition" error={fe?.condition}>
            <Select id="condition" name="condition" defaultValue="unknown">
              <option value="new">Neuf</option>
              <option value="refurbished">Reconditionné</option>
              <option value="used">Occasion</option>
              <option value="unknown">Non précisé</option>
            </Select>
          </Field>
          <Field label="Grade" htmlFor="grade" error={fe?.grade}>
            <Input id="grade" name="grade" placeholder="A" />
          </Field>
          <Field label="Nom de la variante" htmlFor="variant_name" hint="Optionnel : sinon composé à partir des champs ci-dessus." error={fe?.variant_name} className="col-span-2">
            <Input id="variant_name" name="variant_name" placeholder="128 Go / Noir / Grade A" />
          </Field>
          <Field label="EAN / GTIN" htmlFor="ean" error={fe?.ean} hint="8, 12, 13 ou 14 chiffres.">
            <Input id="ean" name="ean" inputMode="numeric" maxLength={14} />
          </Field>
          <Field label="MPN" htmlFor="mpn" error={fe?.mpn}>
            <Input id="mpn" name="mpn" />
          </Field>
        </div>
      </FormSection>

      <FormSection step="3 · SKU et stock" title="SKU, prix et stock" description="Un coût laissé vide est « inconnu » : il ne sera jamais supposé égal à zéro.">
        <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:gap-x-4 xl:grid-cols-3">
          <Field label="Code SKU" htmlFor="code" error={fe?.code} hint="Lettres, chiffres, points, tirets, barres obliques." className="col-span-2">
            <Input id="code" name="code" placeholder="IPH13-128-BLK-A" required className="font-mono" defaultValue={defaults?.code ?? ""} />
          </Field>
          <Field label="Code-barres" htmlFor="barcode" error={fe?.barcode}>
            <Input id="barcode" name="barcode" />
          </Field>
          <Field label={`Coût d'achat (${currency})`} htmlFor="cost_price" error={fe?.cost_price} hint="Vide = inconnu.">
            <Input id="cost_price" name="cost_price" type="number" inputMode="decimal" step="0.01" min="0" max="1000000" className="tnum" />
          </Field>
          <Field label={`Prix de vente (${currency})`} htmlFor="sale_price" error={fe?.sale_price}>
            <Input id="sale_price" name="sale_price" type="number" inputMode="decimal" step="0.01" min="0" max="1000000" defaultValue={defaults?.sale_price ?? ""} className="tnum" />
          </Field>
          <Field label="Stock initial" htmlFor="initial_quantity" error={fe?.initial_quantity} hint="Crée le premier mouvement.">
            <Input id="initial_quantity" name="initial_quantity" type="number" step="1" min="0" max="1000000" defaultValue={0} />
          </Field>
          <Field label="Emplacement" htmlFor="location" error={fe?.location}>
            <Input id="location" name="location" placeholder="A-12" />
          </Field>
          <Field label="Seuil de réappro." htmlFor="reorder_point" error={fe?.reorder_point} hint="Stock faible en dessous.">
            <Input id="reorder_point" name="reorder_point" type="number" step="1" min="0" defaultValue={0} />
          </Field>
          <Field label="Stock de sécurité" htmlFor="safety_stock" error={fe?.safety_stock}>
            <Input id="safety_stock" name="safety_stock" type="number" step="1" min="0" defaultValue={0} />
          </Field>
          <Field label="Délai fournisseur (jours)" htmlFor="lead_time_days" error={fe?.lead_time_days}>
            <Input id="lead_time_days" name="lead_time_days" type="number" step="1" min="0" max="365" />
          </Field>
          <Field label="Fournisseur par défaut" htmlFor="default_supplier_id" error={fe?.default_supplier_id} className="col-span-2 xl:col-span-1">
            <Select id="default_supplier_id" name="default_supplier_id" defaultValue="">
              <option value="">Aucun</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </FormSection>

      <FormActions cancelHref={cancelHref} note="Les champs marqués * sont obligatoires.">
        <SubmitButton pendingText="Création…">{product ? "Ajouter la variante" : "Créer le produit"}</SubmitButton>
      </FormActions>
    </form>
  );
}
