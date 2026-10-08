"use client";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, FormSuccess, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/result";
import { createManualOfferAction } from "@/features/suppliers/actions";

export interface SkuOption {
  id: string;
  code: string;
  label: string;
}

export function ManualOfferButton({ supplierId, defaultCurrency, skus }: { supplierId: string; defaultCurrency: string; skus: SkuOption[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionResult<{ offerId: string; warnings: string[] }> | null, FormData>(createManualOfferAction, null);
  const err = state && !state.ok ? state : null;
  const fe = err?.fieldErrors;
  return (
    <>
      <Button onClick={() => setOpen(true)}>Saisir une offre</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Nouvelle offre fournisseur (saisie manuelle)" className="max-w-3xl">
        <form action={action} className="space-y-4">
          <input type="hidden" name="supplier_id" value={supplierId} />
          <FormError message={err?.error} />
          {state?.ok ? (
            <FormSuccess message={`Offre enregistrée.${state.data.warnings.length > 0 ? ` Avertissements : ${state.data.warnings.join(" ; ")}` : ""}`} />
          ) : null}
          <p className="text-xs text-muted">Seul le prix est obligatoire avec le titre : tout champ laissé vide sera affiché « Non communiqué ». Le titre est normalisé automatiquement (marque, modèle, stockage, couleur, grade).</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Titre de l'offre" htmlFor="mo_title" error={fe?.title} className="sm:col-span-2 lg:col-span-4">
              <Input id="mo_title" name="title" placeholder="Apple iPhone 13 128GB Black Grade A" required />
            </Field>
            <Field label="Prix unitaire" htmlFor="mo_price" error={fe?.price}>
              <Input id="mo_price" name="price" type="number" min={0.01} step="0.01" required />
            </Field>
            <Field label="Devise" htmlFor="mo_currency" error={fe?.currency}>
              <Input id="mo_currency" name="currency" defaultValue={defaultCurrency} maxLength={3} required />
            </Field>
            <Field label="HT / TTC" htmlFor="mo_tax" error={fe?.tax_type}>
              <Select id="mo_tax" name="tax_type" defaultValue="unknown">
                <option value="unknown">Non communiqué</option>
                <option value="ht">HT</option>
                <option value="ttc">TTC</option>
              </Select>
            </Field>
            <Field label="MOQ" htmlFor="mo_moq" error={fe?.moq}>
              <Input id="mo_moq" name="moq" type="number" min={1} step={1} />
            </Field>
            <Field label="Minimum de commande" htmlFor="mo_mov" error={fe?.minimum_order_value}>
              <Input id="mo_mov" name="minimum_order_value" type="number" min={0} step="0.01" />
            </Field>
            <Field label="Quantité disponible" htmlFor="mo_qty" error={fe?.available_quantity}>
              <Input id="mo_qty" name="available_quantity" type="number" min={0} step={1} />
            </Field>
            <Field label="Frais de port (commande)" htmlFor="mo_ship" error={fe?.shipping_cost}>
              <Input id="mo_ship" name="shipping_cost" type="number" min={0} step="0.01" />
            </Field>
            <Field label="Pays (code)" htmlFor="mo_country" error={fe?.country}>
              <Input id="mo_country" name="country" maxLength={2} placeholder="FR" />
            </Field>
            <Field label="Délai min (jours)" htmlFor="mo_dmin" error={fe?.delivery_min_days}>
              <Input id="mo_dmin" name="delivery_min_days" type="number" min={0} step={1} />
            </Field>
            <Field label="Délai max (jours)" htmlFor="mo_dmax" error={fe?.delivery_max_days}>
              <Input id="mo_dmax" name="delivery_max_days" type="number" min={0} step={1} />
            </Field>
            <Field label="État" htmlFor="mo_condition" error={fe?.condition}>
              <Select id="mo_condition" name="condition" defaultValue="unknown">
                <option value="unknown">Non communiqué</option>
                <option value="new">Neuf</option>
                <option value="refurbished">Reconditionné</option>
                <option value="used">Occasion</option>
              </Select>
            </Field>
            <Field label="Grade" htmlFor="mo_grade" error={fe?.grade}>
              <Input id="mo_grade" name="grade" placeholder="A" />
            </Field>
            <Field label="EAN" htmlFor="mo_ean" error={fe?.ean}>
              <Input id="mo_ean" name="ean" inputMode="numeric" />
            </Field>
            <Field label="MPN" htmlFor="mo_mpn" error={fe?.mpn}>
              <Input id="mo_mpn" name="mpn" />
            </Field>
            <Field label="Référence fournisseur" htmlFor="mo_sku" error={fe?.supplier_sku}>
              <Input id="mo_sku" name="supplier_sku" />
            </Field>
            <Field label="URL de l'offre" htmlFor="mo_url" error={fe?.source_url} className="sm:col-span-2">
              <Input id="mo_url" name="source_url" type="url" placeholder="https://" />
            </Field>
            <Field label="Associer à un SKU (optionnel)" htmlFor="mo_skuid" error={fe?.sku_id} className="sm:col-span-2">
              <Select id="mo_skuid" name="sku_id" defaultValue="">
                <option value="">Aucun — suggestions automatiques</option>
                {skus.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Fermer
            </Button>
            <SubmitButton pendingText="Enregistrement…">Enregistrer l'offre</SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}
