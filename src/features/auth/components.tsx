"use client";
import { useActionState } from "react";
import Link from "next/link";
import { Field, FormError, FormSuccess, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/result";
import { requestPasswordResetAction, signInAction, signUpAction, updatePasswordAction } from "@/features/auth/actions";

function Title({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
    </div>
  );
}

export function LoginForm({ next, initialError }: { next?: string; initialError?: string }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(signInAction, null);
  const err = state && !state.ok ? state : null;
  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <Title title="Connexion" subtitle="Accédez à votre espace MON STOCK." />
      <form action={action} className="space-y-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <FormError message={err?.error ?? initialError} />
        <Field label="Email" htmlFor="email" error={err?.fieldErrors?.email}>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Mot de passe" htmlFor="password" error={err?.fieldErrors?.password}>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <SubmitButton className="w-full" pendingText="Connexion…">
          Se connecter
        </SubmitButton>
      </form>
      <div className="mt-4 flex items-center justify-between text-sm text-muted">
        <Link href="/reset-password" className="hover:text-foreground">
          Mot de passe oublié ?
        </Link>
        <Link href="/signup" className="font-medium text-foreground hover:underline">
          Créer un compte
        </Link>
      </div>
    </div>
  );
}

export function SignupForm() {
  const [state, action] = useActionState<ActionResult<{ needsConfirmation: boolean }> | null, FormData>(signUpAction, null);
  const err = state && !state.ok ? state : null;
  if (state?.ok && state.data.needsConfirmation) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <Title title="Vérifiez votre boîte mail" subtitle="Nous vous avons envoyé un lien de confirmation. Cliquez dessus pour activer votre compte." />
        <Link href="/login" className="text-sm font-medium text-foreground hover:underline">
          Retour à la connexion
        </Link>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <Title title="Créer un compte" subtitle="Votre espace vendeur en moins d'une minute." />
      <form action={action} className="space-y-4">
        <FormError message={err?.error} />
        <Field label="Nom complet" htmlFor="full_name" error={err?.fieldErrors?.full_name}>
          <Input id="full_name" name="full_name" autoComplete="name" required />
        </Field>
        <Field label="Email" htmlFor="email" error={err?.fieldErrors?.email}>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Mot de passe" htmlFor="password" hint="8 caractères minimum." error={err?.fieldErrors?.password}>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <SubmitButton className="w-full" pendingText="Création…">
          Créer mon compte
        </SubmitButton>
      </form>
      <p className="mt-4 text-sm text-muted">
        Déjà un compte ?{" "}
        <Link href="/login" className="font-medium text-foreground hover:underline">
          Se connecter
        </Link>
      </p>
    </div>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState<ActionResult<{ sent: boolean }> | null, FormData>(requestPasswordResetAction, null);
  const err = state && !state.ok ? state : null;
  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <Title title="Réinitialiser le mot de passe" subtitle="Nous vous enverrons un lien par email." />
      <form action={action} className="space-y-4">
        <FormError message={err?.error} />
        {state?.ok ? <FormSuccess message="Si un compte existe pour cette adresse, un email vient d'être envoyé." /> : null}
        <Field label="Email" htmlFor="email" error={err?.fieldErrors?.email}>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <SubmitButton className="w-full" pendingText="Envoi…">
          Envoyer le lien
        </SubmitButton>
      </form>
      <p className="mt-4 text-sm text-muted">
        <Link href="/login" className="font-medium text-foreground hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </div>
  );
}

export function UpdatePasswordForm() {
  const [state, action] = useActionState<ActionResult | null, FormData>(updatePasswordAction, null);
  const err = state && !state.ok ? state : null;
  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <Title title="Nouveau mot de passe" />
      <form action={action} className="space-y-4">
        <FormError message={err?.error} action={err?.action} />
        <Field label="Nouveau mot de passe" htmlFor="password" error={err?.fieldErrors?.password}>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <Field label="Confirmation" htmlFor="confirm" error={err?.fieldErrors?.confirm}>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <SubmitButton className="w-full" pendingText="Enregistrement…">
          Enregistrer
        </SubmitButton>
      </form>
    </div>
  );
}
