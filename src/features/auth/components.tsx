"use client";
import { useActionState, useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode, type Ref } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { CircleAlert, CircleCheck, Eye, EyeOff, Loader2 } from "lucide-react";
import type { ActionResult } from "@/lib/result";
import { cn } from "@/lib/utils";
import { requestPasswordResetAction, signInAction, signUpAction, updatePasswordAction } from "@/features/auth/actions";
import { internalRoute } from "@/lib/routes";
import { PASSWORD_MIN_LENGTH, passwordStrength } from "@/features/auth/password-strength";
import { parcoursMotion as motion } from "@/components/auth-shell/motion";

/*
 * Formulaires d'authentification — gabarit unique (Connexion / Inscription / Mot de passe /
 * Onboarding / Invitation), habillage du parcours v2 (handoff §D) : arrivée d'écran (y +16, 500 ms),
 * erreur encadrée annoncée (`role=alert`) qui tremble une fois (±4 px), champs 52 px rayon 12 à
 * contour ≥ 3:1 (`aria-invalid` en erreur), afficher / masquer le mot de passe, jauge de robustesse
 * INDICATIVE (la seule règle réelle reste 8 caractères, côté serveur), action menthe 52 px avec
 * indicateur de chargement. Dans `AuthShell`, le titre de page est porté par la scène (h1) : le
 * titre du formulaire descend en h2 (`headingLevel`).
 * La logique (Server Actions, `next`, confirmation par e-mail, erreurs du serveur, champs, verrous
 * d'envoi) est inchangée : ce fichier ne porte que le visuel.
 */

export function AuthFrame({ eyebrow, title, subtitle, error, errorAction, children, footer, headingLevel = "h1" }: { eyebrow: string; title: string; subtitle?: ReactNode; error?: string | null; errorAction?: { label: string; href: string }; children: ReactNode; footer?: ReactNode; headingLevel?: "h1" | "h2" }) {
  const Heading = headingLevel;
  return (
    <div className={cn(motion.arrive, "flex w-full flex-col gap-[18px]")}>
      <div className="flex flex-col gap-1.5">
        <span className="ms-mono text-[11px] leading-[14px] tracking-[0.08em] text-muted">{eyebrow}</span>
        <Heading className={cn("font-extrabold text-foreground", headingLevel === "h1" ? "text-[28px] leading-[34px] tracking-[-0.7px] sm:text-[30px] sm:leading-9" : "text-[22px] leading-7 tracking-[-0.5px] sm:text-2xl sm:leading-[30px]")}>{title}</Heading>
        {subtitle ? <p className="text-[15px] font-medium leading-[22px] text-muted">{subtitle}</p> : null}
      </div>
      <AuthError message={error} action={errorAction} />
      {children}
      {footer}
    </div>
  );
}

/** Erreur encadrée (jetons « danger ») annoncée aux lecteurs d'écran ; icône + texte ; tremble à chaque nouveau message. */
function AuthError({ message, action }: { message?: string | null; action?: { label: string; href: string } }) {
  if (!message) return null;
  return (
    <div key={message} role="alert" className={cn(motion.shake, "flex items-start gap-2.5 rounded-[14px] border border-danger-line bg-danger-soft px-3.5 py-3 text-sm font-semibold leading-5 text-danger-ink")}>
      <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0">
        {message}
        {action ? (
          <>
            {" "}
            <Link href={internalRoute(action.href)} className="font-extrabold underline underline-offset-2">
              {action.label}
            </Link>
          </>
        ) : null}
      </span>
    </div>
  );
}

function AuthSuccess({ message }: { message: string }) {
  return (
    <div role="status" className="ms-fade flex items-start gap-2.5 rounded-[14px] border border-success-line bg-success-soft px-3.5 py-3 text-sm font-semibold leading-5 text-success-ink">
      <CircleCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0">{message}</span>
    </div>
  );
}

export function AuthCard({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 rounded-[20px] border border-border bg-surface p-5 sm:p-6">{children}</div>;
}

/** Champ 52 px : contour ≥ 3:1 (border-control), focus = contour bleu + halo, erreur = contour rouge. */
export const authInputClass =
  "h-[52px] w-full rounded-xl border border-border-control bg-surface px-3.5 text-base font-semibold text-foreground transition-[border-color,box-shadow] duration-150 ease-standard placeholder:font-medium placeholder:text-ink-3 hover:border-muted focus:border-ring focus:outline-none focus:ring-[3px] focus:ring-ring/25 aria-invalid:border-[1.5px] aria-invalid:border-danger aria-invalid:focus:ring-danger/25 disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-muted";

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
        <p id={errorId} role="alert" className="flex items-start gap-1 text-[12.5px] font-semibold text-danger">
          <CircleAlert aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{error!.join(" ")}</span>
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({ invalid, describedBy, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid: boolean; describedBy?: string }) {
  return <input {...props} aria-invalid={invalid || undefined} aria-describedby={describedBy} className={authInputClass} />;
}

/** Mot de passe avec « Afficher / Masquer » dans le champ. */
function PasswordInput({ invalid, describedBy, inputRef, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid: boolean; describedBy?: string; inputRef?: Ref<HTMLInputElement> }) {
  const [shown, setShown] = useState(false);
  const Icon = shown ? EyeOff : Eye;
  return (
    <span
      className={cn(
        "flex h-[52px] items-center rounded-xl border bg-surface pl-3.5 pr-1.5 transition-[border-color,box-shadow] duration-150 ease-standard focus-within:ring-[3px]",
        invalid ? "border-[1.5px] border-danger focus-within:ring-danger/25" : "border-border-control hover:border-muted focus-within:border-ring focus-within:ring-ring/25",
      )}
    >
      <input {...props} ref={inputRef} type={shown ? "text" : "password"} aria-invalid={invalid || undefined} aria-describedby={describedBy} className="h-full min-w-0 flex-1 bg-transparent text-base font-semibold text-foreground focus:outline-none focus-visible:outline-none" />
      <button type="button" onClick={() => setShown((v) => !v)} aria-pressed={shown} aria-label={shown ? "Masquer le mot de passe" : "Afficher le mot de passe"} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[9px] px-2.5 text-[13px] font-bold text-muted transition-colors hover:bg-line-soft hover:text-foreground">
        <Icon aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
        <span>{shown ? "Masquer" : "Afficher"}</span>
      </button>
    </span>
  );
}

const STRENGTH_FILL = ["bg-track", "bg-danger-strong", "bg-warning-strong", "bg-success-strong", "bg-success-strong"] as const;

/**
 * Jauge de robustesse INDICATIVE : 4 segments + libellé, annoncée poliment. Elle ne bloque rien
 * (aucun bouton désactivé, aucune validation ajoutée) : la règle réelle est celle du serveur.
 */
export function PasswordStrengthMeter({ password, id }: { password: string; id: string }) {
  const s = passwordStrength(password);
  return (
    <div id={id} className="flex items-center gap-3" data-score={s.score}>
      <span aria-hidden="true" className="grid flex-1 grid-cols-4 gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className="h-1 overflow-hidden rounded-full bg-track">
            <span className={cn("block h-full origin-left rounded-full transition-transform duration-300 ease-instrument", STRENGTH_FILL[s.score])} style={{ transform: `scaleX(${s.score >= i ? 1 : 0})` }} />
          </span>
        ))}
      </span>
      <span aria-live="polite" className="ms-mono shrink-0 text-[10.5px] leading-[14px] tracking-[0.06em] text-ink-3">
        {s.score > 0 ? <span className="sr-only">Robustesse indicative : </span> : null}
        {s.label}
      </span>
    </div>
  );
}

/**
 * Mot de passe à choisir : champ + jauge indicative (sans effet sur l'envoi). Le champ reste non
 * contrôlé (comme avant) : la jauge suit la saisie et repart de zéro quand React réinitialise le
 * formulaire après l'action.
 */
function NewPasswordField({ id, name, label, error, withMeter = true }: { id: string; name: string; label: string; error?: string[]; withMeter?: boolean }) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const onReset = () => setValue("");
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);
  return (
    <AuthField id={id} label={label} hint={`${PASSWORD_MIN_LENGTH} caractères minimum.`} error={error}>
      {(d, inv) => (
        <>
          <PasswordInput id={id} name={name} autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} invalid={inv} describedBy={withMeter ? [d, `${id}-strength`].filter(Boolean).join(" ") : d} inputRef={ref} onChange={(e) => setValue(e.target.value)} />
          {withMeter ? <PasswordStrengthMeter password={value} id={`${id}-strength`} /> : null}
        </>
      )}
    </AuthField>
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
    <button type="submit" disabled={busy} aria-busy={busy || undefined} className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-mint px-5 text-base font-extrabold text-night transition-[background-color,transform] duration-150 ease-standard hover:bg-mint-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px disabled:cursor-progress disabled:opacity-60">
      {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
      {pending ? pendingText : locked ? (lockedText ?? pendingText) : children}
    </button>
  );
}

export function SwitchLine({ text, href, link }: { text: string; href: string; link: string }) {
  return (
    <p className="text-center text-sm font-semibold text-muted">
      {text}{" "}
      <Link href={internalRoute(href)} className="inline-flex min-h-10 items-center font-extrabold text-foreground underline underline-offset-4 hover:text-interactive">
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
      headingLevel="h2"
      eyebrow="Vos identifiants"
      title="Connexion"
      subtitle="Le même compte que sur l'app iPhone."
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
              <Link href="/reset-password" className="text-[13px] font-bold text-interactive underline-offset-4 hover:text-interactive-hover hover:underline">
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
      <AuthFrame headingLevel="h2" eyebrow="Confirmation par e-mail" title="Vérifiez votre boîte mail" subtitle="Nous vous avons envoyé un lien de confirmation. Cliquez dessus pour activer votre compte, puis créez votre organisation.">
        <AuthCard>
          <ol className="flex flex-col gap-3">
            {["Ouvrez l'e-mail de confirmation (pensez aux indésirables).", "Cliquez sur le lien : il ne sert qu'une fois et expire rapidement.", "Créez votre organisation, ou une organisation de démonstration."].map((step, i) => (
              <li key={step} className="flex items-start gap-3 text-sm font-semibold leading-5 text-muted-strong">
                <span aria-hidden="true" className={cn("ms-code flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px]", i === 0 ? "bg-inverse text-on-inverse" : "border border-border-control/50 text-ink-3")}>
                  {i + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </AuthCard>
        <SwitchLine text="Compte confirmé ?" href="/login" link="Retour à la connexion" />
      </AuthFrame>
    );
  }
  return (
    <AuthFrame
      headingLevel="h2"
      eyebrow="Vos informations"
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
          <NewPasswordField id="password" name="password" label="Mot de passe" error={err?.fieldErrors?.password} />
          <AuthSubmit pendingText="Création du compte…">Créer mon compte</AuthSubmit>
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
      headingLevel="h2"
      eyebrow="Réinitialisation"
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
    <AuthFrame headingLevel="h2" eyebrow="Nouveau mot de passe" title="Choisissez-le" subtitle="Choisissez un mot de passe d'au moins 8 caractères." error={err?.error} errorAction={err?.action}>
      <form action={action}>
        <AuthCard>
          <NewPasswordField id="password" name="password" label="Nouveau mot de passe" error={err?.fieldErrors?.password} />
          <AuthField id="confirm" label="Confirmation" error={err?.fieldErrors?.confirm}>
            {(d, inv) => <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required minLength={8} invalid={inv} describedBy={d} />}
          </AuthField>
          <AuthSubmit pendingText="Enregistrement…">Enregistrer</AuthSubmit>
        </AuthCard>
      </form>
    </AuthFrame>
  );
}
