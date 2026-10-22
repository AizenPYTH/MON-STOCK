"use client";
import { useActionState, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { ActionResult } from "@/lib/result";
import { cn } from "@/lib/utils";
import { requestPasswordResetAction, signInAction, signUpAction, updatePasswordAction } from "@/features/auth/actions";

/*
 * Formulaires d'authentification — gabarit unique du handoff v5 (Connexion / Inscription /
 * Mot de passe) : sur-titre mono, titre 30/36, erreur encadrée, carte blanche rayon 24,
 * champs 52 px rayon 12, action menthe 52 px. La logique (Server Actions) est inchangée.
 */

export function AuthFrame({ eyebrow, title, subtitle, error, errorAction, children, footer }: { eyebrow: string; title: string; subtitle?: ReactNode; error?: string | null; errorAction?: { label: string; href: string }; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-[18px]">
      <div className="flex flex-col gap-1.5">
        <span className="ms-mono text-[11px] leading-[14px] tracking-[0.07em] text-muted">{eyebrow}</span>
        <h1 className="text-[28px] font-extrabold leading-[34px] tracking-[-0.7px] text-foreground sm:text-[30px] sm:leading-9">{title}</h1>
        {subtitle ? <p className="text-[15px] font-medium leading-[22px] text-muted">{subtitle}</p> : null}
      </div>
      <AuthError message={error} action={errorAction} />
      {children}
      {footer}
    </div>
  );
}

/** Erreur encadrée (fond #FBE9E9, filet #F3D2D2) annoncée aux lecteurs d'écran. */
function AuthError({ message, action }: { message?: string | null; action?: { label: string; href: string } }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-[14px] border border-danger-line bg-danger-soft px-3.5 py-3 text-sm font-semibold leading-5 text-danger">
      {message}
      {action ? (
        <>
          {" "}
          <Link href={action.href as never} className="font-extrabold underline underline-offset-2">
            {action.label}
          </Link>
        </>
      ) : null}
    </div>
  );
}

function AuthSuccess({ message }: { message: string }) {
  return (
    <div role="status" className="rounded-[14px] border border-[#bfe9d3] bg-success-soft px-3.5 py-3 text-sm font-semibold leading-5 text-success">
      {message}
    </div>
  );
}

export function AuthCard({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3.5 rounded-3xl border border-border bg-surface p-5 sm:p-6">{children}</div>;
}

export const authInputClass =
  "h-[52px] w-full rounded-xl border border-border-strong bg-surface px-3.5 text-base font-semibold text-foreground placeholder:font-semibold placeholder:text-ink-3 aria-invalid:border-[1.5px] aria-invalid:border-red disabled:bg-line-soft";

/** Champ étiqueté du gabarit : libellé 13/700, aide ou erreur sous le champ (reliées par aria-describedby). */
export function AuthField({ id, label, labelAside, hint, error, children }: { id: string; label: string; labelAside?: ReactNode; hint?: string; error?: string[]; children: (describedBy: string | undefined, invalid: boolean) => ReactNode }) {
  const errorId = error && error.length > 0 ? `${id}-error` : undefined;
  const hintId = hint && !errorId ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-bold text-foreground">
          {label}
        </label>
        {labelAside}
      </div>
      {children(errorId ?? hintId, Boolean(errorId))}
      {hintId ? (
        <p id={hintId} className="text-[12.5px] font-semibold text-ink-3">
          {hint}
        </p>
      ) : null}
      {errorId ? (
        <p id={errorId} className="text-[12.5px] font-semibold text-danger">
          {error!.join(" ")}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({ invalid, describedBy, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid: boolean; describedBy?: string }) {
  return <input {...props} aria-invalid={invalid || undefined} aria-describedby={describedBy} className={authInputClass} />;
}

/** Mot de passe avec « Afficher / Masquer » dans le champ. */
function PasswordInput({ invalid, describedBy, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid: boolean; describedBy?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <span className={cn("flex h-[52px] items-center rounded-xl border bg-surface pl-3.5 pr-1.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring", invalid ? "border-[1.5px] border-red" : "border-border-strong")}>
      <input {...props} type={shown ? "text" : "password"} aria-invalid={invalid || undefined} aria-describedby={describedBy} className="h-full min-w-0 flex-1 bg-transparent text-base font-semibold text-foreground focus-visible:outline-none" />
      <button type="button" onClick={() => setShown((v) => !v)} aria-pressed={shown} aria-label={shown ? "Masquer le mot de passe" : "Afficher le mot de passe"} className="h-10 shrink-0 rounded-[9px] px-2.5 text-[13px] font-bold text-muted hover:bg-line-soft">
        {shown ? "Masquer" : "Afficher"}
      </button>
    </span>
  );
}

/**
 * Bouton d'envoi : désactivé pendant l'envoi, et tant que `locked` (ex. création réussie, redirection
 * en cours) pour empêcher un second envoi.
 */
export function AuthSubmit({ children, pendingText, locked = false, lockedText }: { children: ReactNode; pendingText: string; locked?: boolean; lockedText?: string }) {
  const { pending } = useFormStatus();
  const busy = pending || locked;
  return (
    <button type="submit" disabled={busy} aria-busy={busy || undefined} className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-mint px-5 text-base font-extrabold text-night transition-colors hover:bg-mint-pressed disabled:opacity-60">
      {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
      {pending ? pendingText : locked ? (lockedText ?? pendingText) : children}
    </button>
  );
}

export function SwitchLine({ text, href, link }: { text: string; href: string; link: string }) {
  return (
    <p className="text-center text-sm font-semibold text-muted">
      {text}{" "}
      <Link href={href as never} className="font-extrabold text-foreground underline underline-offset-2 hover:text-muted">
        {link}
      </Link>
    </p>
  );
}

const SIGNUP_NOTE = "Après l'inscription : confirmation par e-mail, puis création de votre organisation (ou d'une organisation de démonstration « DÉMO »).";

export function AuthNote({ children }: { children: ReactNode }) {
  return <p className="text-center text-[12.5px] font-semibold leading-[18px] text-ink-3">{children}</p>;
}

export function LoginForm({ next, initialError }: { next?: string; initialError?: string }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(signInAction, null);
  const err = state && !state.ok ? state : null;
  return (
    <AuthFrame
      eyebrow="Espace vendeur"
      title="Connexion"
      subtitle="Retrouvez votre stock, vos ventes et vos fournisseurs."
      error={err?.error ?? initialError}
      footer={
        <>
          <SwitchLine text="Pas encore de compte ?" href="/signup" link="Créer un compte" />
          <AuthNote>{SIGNUP_NOTE}</AuthNote>
        </>
      }
    >
      <form action={action}>
        <AuthCard>
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <AuthField id="email" label="E-mail" error={err?.fieldErrors?.email}>
            {(d, inv) => <TextInput id="email" name="email" type="email" autoComplete="email" placeholder="vous@exemple.fr" required invalid={inv} describedBy={d} />}
          </AuthField>
          <AuthField
            id="password"
            label="Mot de passe"
            error={err?.fieldErrors?.password}
            labelAside={
              <Link href="/reset-password" className="text-[13px] font-bold text-foreground underline underline-offset-2 hover:text-muted">
                Mot de passe oublié ?
              </Link>
            }
          >
            {(d, inv) => <PasswordInput id="password" name="password" autoComplete="current-password" required invalid={inv} describedBy={d} />}
          </AuthField>
          <AuthSubmit pendingText="Connexion…">Se connecter</AuthSubmit>
        </AuthCard>
      </form>
    </AuthFrame>
  );
}

export function SignupForm({ next }: { next?: string } = {}) {
  const [state, action] = useActionState<ActionResult<{ needsConfirmation: boolean }> | null, FormData>(signUpAction, null);
  const err = state && !state.ok ? state : null;
  if (state?.ok && state.data.needsConfirmation) {
    return (
      <AuthFrame eyebrow="Inscription" title="Vérifiez votre boîte mail" subtitle="Nous vous avons envoyé un lien de confirmation. Cliquez dessus pour activer votre compte, puis créez votre organisation.">
        <SwitchLine text="Compte confirmé ?" href="/login" link="Retour à la connexion" />
      </AuthFrame>
    );
  }
  return (
    <AuthFrame
      eyebrow="Inscription"
      title="Créer un compte"
      subtitle="Même compte sur le web et sur iPhone."
      error={err?.error}
      footer={
        <>
          <SwitchLine text="Déjà un compte ?" href="/login" link="Se connecter" />
          <AuthNote>{SIGNUP_NOTE}</AuthNote>
        </>
      }
    >
      <form action={action}>
        <AuthCard>
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <AuthField id="full_name" label="Nom complet" error={err?.fieldErrors?.full_name}>
            {(d, inv) => <TextInput id="full_name" name="full_name" autoComplete="name" required invalid={inv} describedBy={d} />}
          </AuthField>
          <AuthField id="email" label="E-mail" error={err?.fieldErrors?.email}>
            {(d, inv) => <TextInput id="email" name="email" type="email" autoComplete="email" placeholder="vous@exemple.fr" required invalid={inv} describedBy={d} />}
          </AuthField>
          <AuthField id="password" label="Mot de passe" hint="8 caractères minimum." error={err?.fieldErrors?.password}>
            {(d, inv) => <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={8} invalid={inv} describedBy={d} />}
          </AuthField>
          <AuthSubmit pendingText="Création…">Créer mon compte</AuthSubmit>
        </AuthCard>
      </form>
    </AuthFrame>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState<ActionResult<{ sent: boolean }> | null, FormData>(requestPasswordResetAction, null);
  const err = state && !state.ok ? state : null;
  return (
    <AuthFrame
      eyebrow="Connexion"
      title="Mot de passe oublié"
      subtitle="Saisissez votre e-mail : un lien pour choisir un nouveau mot de passe vous est envoyé."
      error={err?.error}
      footer={<SwitchLine text="Vous l'avez retrouvé ?" href="/login" link="Retour à la connexion" />}
    >
      {state?.ok ? <AuthSuccess message="Si un compte existe pour cette adresse, un e-mail vient d'être envoyé." /> : null}
      <form action={action}>
        <AuthCard>
          <AuthField id="email" label="E-mail" error={err?.fieldErrors?.email}>
            {(d, inv) => <TextInput id="email" name="email" type="email" autoComplete="email" placeholder="vous@exemple.fr" required invalid={inv} describedBy={d} />}
          </AuthField>
          <AuthSubmit pendingText="Envoi…">Envoyer le lien</AuthSubmit>
        </AuthCard>
      </form>
    </AuthFrame>
  );
}

export function UpdatePasswordForm() {
  const [state, action] = useActionState<ActionResult | null, FormData>(updatePasswordAction, null);
  const err = state && !state.ok ? state : null;
  return (
    <AuthFrame eyebrow="Mot de passe" title="Nouveau mot de passe" subtitle="Choisissez un mot de passe d'au moins 8 caractères." error={err?.error} errorAction={err?.action}>
      <form action={action}>
        <AuthCard>
          <AuthField id="password" label="Nouveau mot de passe" error={err?.fieldErrors?.password}>
            {(d, inv) => <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={8} invalid={inv} describedBy={d} />}
          </AuthField>
          <AuthField id="confirm" label="Confirmation" error={err?.fieldErrors?.confirm}>
            {(d, inv) => <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required minLength={8} invalid={inv} describedBy={d} />}
          </AuthField>
          <AuthSubmit pendingText="Enregistrement…">Enregistrer</AuthSubmit>
        </AuthCard>
      </form>
    </AuthFrame>
  );
}
