"use client";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { DemoBadge } from "@/components/instrument";
import type { ActionResult } from "@/lib/result";
import { createOrganizationAction } from "@/features/organizations/actions";
import { createDemoOrganizationAction } from "@/features/demo/actions";
import { AuthCard, AuthField, AuthFrame, authInputClass, AuthSubmit, TextInput } from "@/features/auth/components";

/**
 * Création de l'organisation (gabarit d'authentification v5) : organisation réelle, ou
 * organisation de démonstration séparée, marquée « DÉMO » sur chaque écran. Logique inchangée.
 */
export function OnboardingForm({ hasOrganization }: { hasOrganization: boolean }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(createOrganizationAction, null);
  const [demoState, demoAction] = useActionState<ActionResult | null, FormData>(createDemoOrganizationAction, null);
  // Anti double-soumission (W-01) : une seule création à la fois, réelle OU démo. Le serveur refuse
  // aussi une seconde création identique rapprochée (creation-guard.ts).
  const createLock = useSubmissionLock(state);
  const demoLock = useSubmissionLock(demoState);
  const anyLocked = createLock.locked || demoLock.locked;
  const err = state && !state.ok ? state : null;
  const demoErr = demoState && !demoState.ok ? demoState : null;
  return (
    <AuthFrame
      eyebrow={hasOrganization ? "Organisation" : "Bienvenue"}
      title={hasOrganization ? "Nouvelle organisation" : "Créez votre organisation"}
      subtitle="Une organisation regroupe votre stock, vos ventes, vos fournisseurs et vos collaborateurs. Vous pourrez inviter des membres ensuite."
      error={err?.error}
      footer={
        <section aria-labelledby="demo-title" className="flex flex-col gap-3 rounded-3xl border-[1.5px] border-dashed border-border-strong bg-surface p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <DemoBadge onNight={false} />
            <h2 id="demo-title" className="text-[15px] font-bold text-foreground">
              Explorer avec des données fictives
            </h2>
          </div>
          <p className="text-sm font-medium leading-5 text-muted">
            Crée une organisation de démonstration séparée, remplie de produits, commandes, fournisseurs et offres fictifs. Chaque écran l&apos;indique par le badge « DÉMO ». Aucune donnée réelle n&apos;est mélangée.
          </p>
          {demoErr?.error ? (
            <div role="alert" className="rounded-[14px] border border-danger-line bg-danger-soft px-3.5 py-3 text-sm font-semibold text-danger">
              {demoErr.error}
            </div>
          ) : null}
          <form action={demoAction} onSubmit={(e) => (anyLocked ? e.preventDefault() : demoLock.lock())}>
            <SecondarySubmit pendingText="Génération des données…" locked={anyLocked}>
              Créer une organisation de démonstration
            </SecondarySubmit>
          </form>
        </section>
      }
    >
      <form action={action} onSubmit={(e) => (anyLocked ? e.preventDefault() : createLock.lock())}>
        <AuthCard>
          <AuthField id="name" label="Nom de l'organisation" error={err?.fieldErrors?.name}>
            {(d, inv) => <TextInput id="name" name="name" placeholder="Ex. Ma Boutique Reconditionnée" required invalid={inv} describedBy={d} />}
          </AuthField>
          <div className="grid grid-cols-2 gap-3">
            <AuthField id="country" label="Pays" error={err?.fieldErrors?.country}>
              {(d, inv) => <TextInput id="country" name="country" placeholder="FR" maxLength={2} defaultValue="FR" invalid={inv} describedBy={d} />}
            </AuthField>
            <AuthField id="default_currency" label="Devise" error={err?.fieldErrors?.default_currency}>
              {(d, inv) => (
                <select id="default_currency" name="default_currency" defaultValue="EUR" aria-invalid={inv || undefined} aria-describedby={d} className={authInputClass}>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                  <option value="CHF">CHF</option>
                </select>
              )}
            </AuthField>
          </div>
          <AuthSubmit pendingText="Création…" locked={anyLocked} lockedText="Ouverture du tableau de bord…">
            Créer l&apos;organisation
          </AuthSubmit>
        </AuthCard>
      </form>
    </AuthFrame>
  );
}

/** Durée maximale du verrou après un envoi sans réponse d'erreur (redirection perdue, onglet rouvert…). */
const SUBMISSION_LOCK_MS = 15_000;

/**
 * Verrou posé à l'envoi d'un formulaire d'action. Il tombe dès que l'action renvoie un nouveau
 * résultat (erreur affichée) ; si elle a redirigé, aucun résultat ne revient : il tombe après
 * SUBMISSION_LOCK_MS par sécurité.
 */
function useSubmissionLock(state: ActionResult | null): { locked: boolean; lock: () => void } {
  // `undefined` : aucun envoi en attente ; sinon, l'état au moment de l'envoi.
  const [lockedOn, setLockedOn] = useState<ActionResult | null | undefined>(undefined);
  const locked = lockedOn !== undefined && lockedOn === state;
  useEffect(() => {
    if (!locked) return;
    const t = setTimeout(() => setLockedOn(undefined), SUBMISSION_LOCK_MS);
    return () => clearTimeout(t);
  }, [locked]);
  return { locked, lock: () => setLockedOn(state) };
}

/** Bouton secondaire 52 px avec état d'envoi (la génération des données de démonstration peut durer). */
function SecondarySubmit({ children, pendingText, locked = false }: { children: string; pendingText: string; locked?: boolean }) {
  const { pending } = useFormStatus();
  const busy = pending || locked;
  return (
    <button type="submit" disabled={busy} aria-busy={busy || undefined} className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border border-border-strong bg-surface px-5 text-[15px] font-extrabold text-foreground transition-colors hover:bg-line-soft disabled:opacity-60">
      {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
      {busy ? pendingText : children}
    </button>
  );
}
