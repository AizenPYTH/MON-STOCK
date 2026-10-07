"use client";
import { useActionState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/result";
import { inviteMemberAction } from "@/features/organizations/actions";

export function InviteMemberForm() {
  const [state, action] = useActionState<ActionResult<{ link: string }> | null, FormData>(inviteMemberAction, null);
  const err = state && !state.ok ? state : null;
  return (
    <Card>
      <CardHeader title="Inviter un membre" description="L'invitation est liée à l'adresse email." />
      <CardContent>
        <form action={action} className="space-y-4">
          <FormError message={err?.error} />
          {state?.ok ? (
            <div className="rounded-lg border border-green-200 bg-success-soft p-3 text-sm text-green-800">
              <div className="font-medium">Invitation créée.</div>
              <p className="mt-1">L'envoi d'email n'est pas encore activé : transmettez ce lien à la personne invitée.</p>
              <code className="mt-2 block break-all rounded bg-white/70 p-2 text-xs">{state.data.link}</code>
            </div>
          ) : null}
          <Field label="Email" htmlFor="invite_email" error={err?.fieldErrors?.email}>
            <Input id="invite_email" name="email" type="email" required />
          </Field>
          <Field label="Rôle" htmlFor="invite_role" error={err?.fieldErrors?.role}>
            <Select id="invite_role" name="role" defaultValue="member">
              <option value="admin">Administrateur</option>
              <option value="member">Membre</option>
              <option value="viewer">Lecture seule</option>
            </Select>
          </Field>
          <SubmitButton pendingText="Création…">Créer l'invitation</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
