"use client";
import { useActionState, useId, useState } from "react";
import Link from "next/link";
import { CircleCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/result";
import { ACCOUNT_DELETE_CONFIRMATION, type AccountDeletionResultDTO } from "@/features/mobile-api/contract";
import { deleteMyAccountAction } from "@/features/account/actions";

/**
 * « Supprimer mon compte » : explication, puis confirmation SAISIE dans une boîte de dialogue
 * (variante danger). Le serveur revérifie tout (session, mot de confirmation, seul propriétaire) ;
 * le succès ne s'affiche qu'après sa réponse.
 */
export function DeleteAccountSection({ email, organizations }: { email: string | null; organizations: Array<{ name: string; roleLabel: string; isDemo: boolean }> }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const inputId = useId();
  const [state, action] = useActionState<ActionResult<AccountDeletionResultDTO> | null, FormData>(async (prev, formData) => {
    const result = await deleteMyAccountAction(prev, formData);
    if (result.ok) setOpen(false);
    return result;
  }, null);
  const err = state && !state.ok ? state : null;
  const matches = typed.trim() === ACCOUNT_DELETE_CONFIRMATION;

  if (state?.ok) return <DeletionDone result={state.data} />;

  return (
    <section aria-labelledby="delete-account-title" className="rounded-2xl border border-danger-line bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-4 px-4 py-4 sm:px-5">
        <div className="min-w-0 max-w-[620px] flex-[1_1_320px]">
          <h3 id="delete-account-title" className="text-[15px] font-bold text-foreground">
            Supprimer mon compte
          </h3>
          <p className="mt-1 text-[13.5px] font-semibold leading-[19px] text-muted">
            Suppression définitive de votre compte MON STOCK{email ? <> (<span className="text-foreground">{email}</span>)</> : null}, sur le web comme sur iPhone. Elle ne peut pas être annulée.
          </p>
        </div>
        <Button variant="danger" onClick={() => setOpen(true)}>
          <Trash2 aria-hidden="true" className="h-4 w-4" />
          Supprimer mon compte…
        </Button>
      </div>
      <div className="border-t border-line-soft px-4 py-4 sm:px-5">
        <ul className="grid gap-2.5 text-[13px] font-semibold leading-[18px] text-muted-strong md:grid-cols-3">
          <li className="flex gap-2">
            <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red" />
            Les organisations dont vous êtes le seul membre sont supprimées avec toutes leurs données (stock, ventes, fournisseurs, connexions eBay).
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-4" />
            Vous quittez les organisations partagées : elles restent à leurs autres membres.
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />
            Seul propriétaire d&apos;une organisation qui a d&apos;autres membres ? Désignez d&apos;abord un autre propriétaire : sinon la suppression est refusée et rien n&apos;est modifié.
          </li>
        </ul>
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title="Supprimer définitivement votre compte ?"
        description="Cette action est irréversible. Aucune donnée supprimée ne peut être récupérée."
      >
        <form action={action} className="space-y-4">
          {organizations.length > 0 ? (
            <div className="space-y-1.5">
              <p className="ms-mono text-[10.5px] leading-[14px] text-ink-3">Vos organisations</p>
              <ul className="divide-y divide-line-soft rounded-xl border border-border">
                {organizations.map((o) => (
                  <li key={`${o.name}-${o.roleLabel}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate font-semibold text-foreground">
                      {o.name}
                      {o.isDemo ? <span className="ml-1.5 text-xs font-semibold text-warning-ink">DÉMO</span> : null}
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-muted">{o.roleLabel}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs font-semibold text-muted">Le serveur vérifie pour chacune si vous en êtes le seul membre avant toute suppression.</p>
            </div>
          ) : null}
          <FormError message={err && !err.fieldErrors ? err.error : null} action={err?.action} />
          <Field label={<>Saisissez <span className="ms-code">{ACCOUNT_DELETE_CONFIRMATION}</span> pour confirmer</>} htmlFor={inputId} error={err?.fieldErrors?.confirmation}>
            <Input id={inputId} name="confirmation" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} required className="ms-code tracking-[0.08em]" />
          </Field>
          <div className="flex flex-wrap justify-end gap-2 border-t border-line-soft pt-4">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <SubmitButton variant="danger" pendingText="Suppression en cours…" disabled={!matches} title={matches ? undefined : `Saisissez ${ACCOUNT_DELETE_CONFIRMATION} pour activer ce bouton`}>
              Supprimer définitivement
            </SubmitButton>
          </div>
        </form>
      </Dialog>
    </section>
  );
}

/** Compte supprimé (réponse du serveur) : ce qui a été fait, et la suite. */
function DeletionDone({ result }: { result: AccountDeletionResultDTO }) {
  return (
    <section role="status" className="ms-fade space-y-3 rounded-2xl border border-success-line bg-success-soft px-4 py-4 text-success-ink sm:px-5">
      <h3 className="flex items-center gap-2 text-[15px] font-bold">
        <CircleCheck aria-hidden="true" className="h-4 w-4" />
        Votre compte a été supprimé
      </h3>
      <ul className="space-y-1 text-sm font-semibold">
        <li>Organisations supprimées avec leurs données : {result.organizationsDeleted}</li>
        <li>Organisations partagées quittées : {result.organizationsLeft}</li>
        <li>Connexions de vente déconnectées : {result.channelConnectionsDisconnected}</li>
      </ul>
      {result.remoteRevocationIncomplete ? (
        <p className="rounded-xl border border-warning-line bg-warning-soft px-3 py-2 text-[13px] font-semibold text-warning-ink">
          La révocation chez eBay n&apos;a pas pu être confirmée : les jetons ont été supprimés de MON STOCK, retirez aussi l&apos;accès depuis votre compte eBay.
        </p>
      ) : null}
      {/* prefetch={false} : la session vient d'être fermée, aucune page ne doit venir du cache client. */}
      <Link href="/" prefetch={false} className="inline-flex min-h-10 items-center rounded-xl bg-inverse px-4 text-sm font-bold text-on-inverse hover:bg-inverse-hover">
        Retour à l&apos;accueil
      </Link>
    </section>
  );
}
