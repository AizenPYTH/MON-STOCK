"use client";
import { useActionState } from "react";
import { FormError, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/result";
import { inviteMemberAction } from "@/features/organizations/actions";
import { CopyLinkButton } from "@/features/organizations/components/copy-link-button";

/**
 * Création d'une invitation (handoff v5) : e-mail + rôle sur une ligne. L'e-mail n'est pas
 * envoyé automatiquement : le lien s'affiche ici pour être transmis.
 */
export function InviteMemberForm() {
  const [state, action] = useActionState<ActionResult<{ link: string }> | null, FormData>(inviteMemberAction, null);
  const err = state && !state.ok ? state : null;
  const emailError = err?.fieldErrors?.email;
  const roleError = err?.fieldErrors?.role;
  return (
    <form action={action} className="flex flex-col gap-3.5 rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div>
        <h3 className="text-[15px] font-bold text-foreground">Inviter un membre</h3>
        <p className="mt-0.5 text-[13px] font-semibold text-ink-3">Un lien d&apos;invitation est créé ; vous le transmettez vous-même à la personne.</p>
      </div>
      <FormError message={err?.error} />
      {state?.ok ? (
        <div role="status" className="ms-fade flex flex-col gap-2 rounded-xl border border-success-line bg-success-soft px-3 py-2.5 text-sm font-semibold text-success-ink">
          <span>Invitation créée. Transmettez ce lien à la personne invitée :</span>
          <span className="flex flex-wrap items-center gap-2">
            <code className="ms-code min-w-0 flex-1 break-all rounded-lg bg-surface px-2 py-1.5 text-xs text-foreground">{state.data.link}</code>
            <CopyLinkButton value={state.data.link} />
          </span>
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-2.5">
        <label className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
          <span className="text-[13px] font-bold text-foreground">Adresse e-mail</span>
          <Input name="email" type="email" required placeholder="prenom@exemple.fr" autoComplete="off" className="h-11 rounded-[10px] text-[15px]" aria-invalid={emailError ? true : undefined} aria-describedby={emailError ? "invite-email-error" : undefined} />
        </label>
        <label className="flex flex-[1_1_160px] flex-col gap-1.5 sm:flex-none">
          <span className="text-[13px] font-bold text-foreground">Rôle</span>
          <Select name="role" defaultValue="member" className="h-11 w-full rounded-[10px] sm:w-48" aria-invalid={roleError ? true : undefined}>
            <option value="member">Membre</option>
            <option value="admin">Administrateur</option>
            <option value="viewer">Lecture seule</option>
          </Select>
        </label>
        <SubmitButton pendingText="Création…" className="h-11 max-sm:w-full">
          Créer l&apos;invitation
        </SubmitButton>
      </div>
      {emailError ? (
        <p id="invite-email-error" role="alert" className="-mt-1.5 text-xs font-semibold text-danger">
          {emailError.join(" ")}
        </p>
      ) : null}
      {roleError ? (
        <p role="alert" className="text-xs font-semibold text-danger">
          {roleError.join(" ")}
        </p>
      ) : null}
      <p className="border-t border-line-soft pt-3 text-[12.5px] font-semibold text-ink-3">L&apos;e-mail d&apos;invitation n&apos;est pas envoyé automatiquement : le lien s&apos;affiche ici pour que vous le transmettiez. L&apos;invitation est liée à l&apos;adresse saisie.</p>
    </form>
  );
}
