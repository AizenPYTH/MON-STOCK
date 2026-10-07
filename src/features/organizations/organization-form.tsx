"use client";
import { useActionState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, FormError, FormSuccess, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/result";
import type { Organization } from "@/db/types";
import { updateOrganizationAction } from "@/features/organizations/actions";

export function OrganizationForm({ organization, disabled }: { organization: Organization; disabled: boolean }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(updateOrganizationAction, null);
  const err = state && !state.ok ? state : null;
  const settings = (organization.settings ?? {}) as { default_shipping_cost?: number | null; vat_rate?: number | null };
  return (
    <Card>
      <CardHeader title="Informations" description="Nom, pays et devise de référence." />
      <CardContent>
        <form action={action} className="space-y-4">
          <FormError message={err?.error} />
          {state?.ok ? <FormSuccess message="Paramètres enregistrés." /> : null}
          <Field label="Nom" htmlFor="name" error={err?.fieldErrors?.name}>
            <Input id="name" name="name" defaultValue={organization.name} disabled={disabled} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pays" htmlFor="country" error={err?.fieldErrors?.country}>
              <Input id="country" name="country" defaultValue={organization.country ?? ""} maxLength={2} disabled={disabled} />
            </Field>
            <Field label="Devise" htmlFor="default_currency" error={err?.fieldErrors?.default_currency}>
              <Input id="default_currency" name="default_currency" defaultValue={organization.default_currency} maxLength={3} disabled={disabled} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Transport par unité (défaut)" htmlFor="default_shipping_cost" hint="Laisser vide = coût inconnu." error={err?.fieldErrors?.default_shipping_cost}>
              <Input id="default_shipping_cost" name="default_shipping_cost" type="number" step="0.01" min="0" defaultValue={settings.default_shipping_cost ?? ""} disabled={disabled} />
            </Field>
            <Field label="TVA (%)" htmlFor="vat_rate" hint="Utilisée pour convertir HT ↔ TTC." error={err?.fieldErrors?.vat_rate}>
              <Input id="vat_rate" name="vat_rate" type="number" step="0.1" min="0" max="100" defaultValue={settings.vat_rate ?? ""} disabled={disabled} />
            </Field>
          </div>
          {!disabled ? <SubmitButton pendingText="Enregistrement…">Enregistrer</SubmitButton> : null}
        </form>
      </CardContent>
    </Card>
  );
}
