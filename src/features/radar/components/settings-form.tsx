"use client";
import { useActionState } from "react";
import type { RadarCostSettings } from "@/features/mobile-api/contract";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, FormError, FormSuccess, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { ButtonLink } from "@/components/ui/button";
import type { ActionResult } from "@/lib/result";
import { saveRadarSettingsAction } from "@/features/radar/actions";
import { COST_FIELDS, settingText } from "@/features/radar/labels";

/** Paramètres de coûts : champ vide = inconnu (signalé comme manquant, jamais compté pour 0). */
export function RadarSettingsForm({ settings, readOnly }: { settings: RadarCostSettings; readOnly: boolean }) {
  const [state, action] = useActionState<ActionResult<{ message: string }> | null, FormData>(saveRadarSettingsAction, null);
  const err = state && !state.ok ? state : null;
  const fe = err?.fieldErrors;
  return (
    <form action={action} className="space-y-4">
      <FormError message={err?.error} />
      {state?.ok ? <FormSuccess message={state.data.message} /> : null}
      <Card>
        <CardHeader title="TVA" description="Le régime et la récupération de la TVA changent le prix d'achat retenu et le chiffre d'affaires hors TVA." />
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Régime de TVA" htmlFor="rs_regime" error={fe?.vatRegime}>
            <Select id="rs_regime" name="vatRegime" defaultValue={settings.vatRegime ?? ""} disabled={readOnly}>
              <option value="">Inconnu</option>
              <option value="normal">Normal</option>
              <option value="margin">Marge (occasion)</option>
              <option value="franchise">Franchise</option>
            </Select>
          </Field>
          <Field label="TVA payée aux fournisseurs récupérable ?" htmlFor="rs_recoverable" error={fe?.vatRecoverable}>
            <Select id="rs_recoverable" name="vatRecoverable" defaultValue={settings.vatRecoverable === true ? "yes" : settings.vatRecoverable === false ? "no" : ""} disabled={readOnly}>
              <option value="">Je ne sais pas</option>
              <option value="yes">Oui</option>
              <option value="no">Non</option>
            </Select>
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader title="Frais et provisions" description="Laissez vide un coût que vous ne connaissez pas : il restera listé comme manquant dans chaque calcul." />
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {COST_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} htmlFor={`rs_${f.key}`} hint={f.hint} error={fe?.[f.key]}>
              <Input id={`rs_${f.key}`} name={f.key} inputMode="decimal" autoComplete="off" defaultValue={settingText(settings[f.key])} placeholder="Inconnu" disabled={readOnly} />
            </Field>
          ))}
        </CardContent>
      </Card>
      <div className="flex justify-end gap-2">
        <ButtonLink href="/radar" variant="ghost">
          Retour au radar
        </ButtonLink>
        {readOnly ? null : <SubmitButton pendingText="Enregistrement…">Enregistrer</SubmitButton>}
      </div>
    </form>
  );
}
