"use client";
import { useActionState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { ButtonLink } from "@/components/ui/button";
import type { ActionResult } from "@/lib/result";
import { saveAlertAction } from "@/features/sourcing/actions";

export interface AlertFormValues {
  alert_id?: string;
  name?: string;
  query_text?: string;
  max_price?: number | null;
  min_quantity?: number | null;
  countries?: string;
  max_moq?: number | null;
  grades?: string;
  condition?: string;
  max_delivery_days?: number | null;
  sku_id?: string | null;
}

export function AlertForm({ initial, currency }: { initial: AlertFormValues; currency: string }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(saveAlertAction, null);
  const err = state && !state.ok ? state : null;
  const fe = err?.fieldErrors;
  return (
    <form action={action}>
      {initial.alert_id ? <input type="hidden" name="alert_id" value={initial.alert_id} /> : null}
      {initial.sku_id ? <input type="hidden" name="sku_id" value={initial.sku_id} /> : null}
      <Card>
        <CardHeader title={initial.alert_id ? "Modifier l'alerte" : "Nouvelle alerte de sourcing"} description="Vous serez prévenu dès qu'une offre correspond à ces critères (évaluation à chaque synchronisation)." />
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-4">
            <FormError message={err?.error} />
          </div>
          <Field label="Nom" htmlFor="al_name" error={fe?.name} className="sm:col-span-2">
            <Input id="al_name" name="name" defaultValue={initial.name ?? ""} placeholder="ex. iPhone 13 128 Go sous 230 €" required />
          </Field>
          <Field label="Produit recherché" htmlFor="al_query" error={fe?.query_text} className="sm:col-span-2">
            <Input id="al_query" name="query_text" defaultValue={initial.query_text ?? ""} placeholder="iPhone 13 128 Go noir grade A" required />
          </Field>
          <Field label={`Prix max (${currency}, unitaire)`} htmlFor="al_max_price" error={fe?.max_price}>
            <Input id="al_max_price" name="max_price" type="number" min={0} step="0.01" defaultValue={initial.max_price ?? ""} />
          </Field>
          <Field label="Quantité min. disponible" htmlFor="al_min_qty" error={fe?.min_quantity}>
            <Input id="al_min_qty" name="min_quantity" type="number" min={0} step={1} defaultValue={initial.min_quantity ?? ""} />
          </Field>
          <Field label="Pays (codes, séparés par des virgules)" htmlFor="al_countries" error={fe?.countries}>
            <Input id="al_countries" name="countries" defaultValue={initial.countries ?? ""} placeholder="FR, DE" />
          </Field>
          <Field label="MOQ max" htmlFor="al_max_moq" error={fe?.max_moq}>
            <Input id="al_max_moq" name="max_moq" type="number" min={1} step={1} defaultValue={initial.max_moq ?? ""} />
          </Field>
          <Field label="Grades acceptés" htmlFor="al_grades" error={fe?.grades} hint="ex. A, A+">
            <Input id="al_grades" name="grades" defaultValue={initial.grades ?? ""} />
          </Field>
          <Field label="État" htmlFor="al_condition" error={fe?.condition}>
            <Select id="al_condition" name="condition" defaultValue={initial.condition ?? ""}>
              <option value="">Indifférent</option>
              <option value="new">Neuf</option>
              <option value="refurbished">Reconditionné</option>
              <option value="used">Occasion</option>
            </Select>
          </Field>
          <Field label="Délai max (jours)" htmlFor="al_delay" error={fe?.max_delivery_days}>
            <Input id="al_delay" name="max_delivery_days" type="number" min={0} step={1} defaultValue={initial.max_delivery_days ?? ""} />
          </Field>
          <div className="flex items-end justify-end gap-2 sm:col-span-2 lg:col-span-4">
            <ButtonLink href="/sourcing/alerts" variant="ghost">
              Annuler
            </ButtonLink>
            <SubmitButton pendingText="Enregistrement…">{initial.alert_id ? "Enregistrer" : "Créer l'alerte"}</SubmitButton>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
