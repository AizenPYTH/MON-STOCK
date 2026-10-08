"use client";
import { useActionState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, FormError, FormSuccess, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/result";
import type { Supplier } from "@/db/types";
import { createSupplierAction, updateSupplierAction } from "@/features/suppliers/actions";

export function SupplierForm({ supplier, defaultCurrency }: { supplier?: Supplier; defaultCurrency: string }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(supplier ? updateSupplierAction : createSupplierAction, null);
  const err = state && !state.ok ? state : null;
  const fe = err?.fieldErrors;
  return (
    <form action={action} className="space-y-6">
      {supplier ? <input type="hidden" name="supplier_id" value={supplier.id} /> : null}
      <FormError message={err?.error} />
      {state?.ok ? <FormSuccess message="Fournisseur enregistré." /> : null}
      <Card>
        <CardHeader title="Identité" />
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Nom" htmlFor="s_name" error={fe?.name} className="sm:col-span-2">
            <Input id="s_name" name="name" defaultValue={supplier?.name ?? ""} required />
          </Field>
          <Field label="Société" htmlFor="s_company" error={fe?.company}>
            <Input id="s_company" name="company" defaultValue={supplier?.company ?? ""} />
          </Field>
          <Field label="Pays (code à 2 lettres)" htmlFor="s_country" error={fe?.country}>
            <Input id="s_country" name="country" defaultValue={supplier?.country ?? ""} placeholder="FR" maxLength={2} />
          </Field>
          <Field label="Site web" htmlFor="s_website" error={fe?.website} className="sm:col-span-2">
            <Input id="s_website" name="website" type="url" defaultValue={supplier?.website ?? ""} placeholder="https://" />
          </Field>
          <Field label="Email" htmlFor="s_email" error={fe?.email}>
            <Input id="s_email" name="email" type="email" defaultValue={supplier?.email ?? ""} />
          </Field>
          <Field label="Téléphone" htmlFor="s_phone" error={fe?.phone}>
            <Input id="s_phone" name="phone" defaultValue={supplier?.phone ?? ""} />
          </Field>
          <Field label="Contact" htmlFor="s_contact" error={fe?.contact_name} className="sm:col-span-2">
            <Input id="s_contact" name="contact_name" defaultValue={supplier?.contact_name ?? ""} />
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader title="Conditions commerciales" description="Laissez vide ce que vous ne connaissez pas : rien n'est supposé." />
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Devise" htmlFor="s_currency" error={fe?.currency}>
            <Input id="s_currency" name="currency" defaultValue={supplier?.currency ?? defaultCurrency} maxLength={3} />
          </Field>
          <Field label="Délai moyen annoncé (jours)" htmlFor="s_lead" error={fe?.average_lead_time_days}>
            <Input id="s_lead" name="average_lead_time_days" type="number" min={0} step={1} defaultValue={supplier?.average_lead_time_days ?? ""} />
          </Field>
          <Field label="MOQ par défaut" htmlFor="s_moq" error={fe?.default_moq}>
            <Input id="s_moq" name="default_moq" type="number" min={1} step={1} defaultValue={supplier?.default_moq ?? ""} />
          </Field>
          <Field label="Minimum de commande" htmlFor="s_mov" error={fe?.minimum_order_value}>
            <Input id="s_mov" name="minimum_order_value" type="number" min={0} step="0.01" defaultValue={supplier?.minimum_order_value ?? ""} />
          </Field>
          <Field label="Conditions de paiement" htmlFor="s_terms" error={fe?.payment_terms} className="sm:col-span-2">
            <Input id="s_terms" name="payment_terms" defaultValue={supplier?.payment_terms ?? ""} placeholder="ex. 30 jours fin de mois" />
          </Field>
          <Field label="Notes" htmlFor="s_notes" error={fe?.notes} className="sm:col-span-2 lg:col-span-4">
            <Textarea id="s_notes" name="notes" defaultValue={supplier?.notes ?? ""} />
          </Field>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <SubmitButton pendingText="Enregistrement…">{supplier ? "Enregistrer" : "Créer le fournisseur"}</SubmitButton>
      </div>
    </form>
  );
}
