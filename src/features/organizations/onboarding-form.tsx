"use client";
import { useActionState } from "react";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/result";
import { createOrganizationAction } from "@/features/organizations/actions";
import { createDemoOrganizationAction } from "@/features/demo/actions";

export function OnboardingForm({ hasOrganization }: { hasOrganization: boolean }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(createOrganizationAction, null);
  const [demoState, demoAction] = useActionState<ActionResult | null, FormData>(createDemoOrganizationAction, null);
  const err = state && !state.ok ? state : null;
  const demoErr = demoState && !demoState.ok ? demoState : null;
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">{hasOrganization ? "Nouvelle organisation" : "Créez votre organisation"}</h1>
        <p className="mt-1 text-sm text-muted">
          Une organisation regroupe votre stock, vos ventes, vos fournisseurs et vos collaborateurs. Vous pourrez inviter des membres ensuite.
        </p>
        <form action={action} className="mt-5 space-y-4">
          <FormError message={err?.error} />
          <Field label="Nom de l'organisation" htmlFor="name" error={err?.fieldErrors?.name}>
            <Input id="name" name="name" placeholder="Ex. Ma Boutique Reconditionnée" required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pays" htmlFor="country" error={err?.fieldErrors?.country}>
              <Input id="country" name="country" placeholder="FR" maxLength={2} defaultValue="FR" />
            </Field>
            <Field label="Devise" htmlFor="default_currency" error={err?.fieldErrors?.default_currency}>
              <Select id="default_currency" name="default_currency" defaultValue="EUR">
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
                <option value="CHF">CHF</option>
              </Select>
            </Field>
          </div>
          <SubmitButton className="w-full" pendingText="Création…">
            Créer l'organisation
          </SubmitButton>
        </form>
      </div>

      <div className="rounded-xl border border-dashed border-border-strong bg-surface p-6">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">DEMO</span>
          <h2 className="text-sm font-semibold">Explorer avec des données fictives</h2>
        </div>
        <p className="mt-1 text-sm text-muted">
          Crée une organisation de démonstration séparée, remplie de produits, commandes, fournisseurs et offres fictifs. Chaque écran affichera clairement le bandeau « Mode démonstration ». Aucune donnée réelle n'est mélangée.
        </p>
        <form action={demoAction} className="mt-4">
          <FormError message={demoErr?.error} />
          <SubmitButton variant="secondary" pendingText="Génération des données…">
            Créer une organisation de démonstration
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
