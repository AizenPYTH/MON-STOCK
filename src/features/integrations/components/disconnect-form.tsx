"use client";
import { useActionState, useState } from "react";
import { Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormError, FormSuccess } from "@/components/ui/form";
import type { ActionResult } from "@/lib/result";
import { disconnectConnectionAction } from "@/features/integrations/actions";

/** Déconnexion eBay : action destructive, toujours confirmée dans une boîte de dialogue (variante danger). */
export function DisconnectForm({ connectionId, username }: { connectionId: string; username: string | null }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionResult<{ note: string }> | null, FormData>(async (prev, formData) => {
    const result = await disconnectConnectionAction(prev, formData);
    if (result.ok) setOpen(false);
    return result;
  }, null);
  return (
    <>
      <Button variant="secondary" size="md" onClick={() => setOpen(true)} className="border-danger-line text-danger hover:border-danger hover:bg-danger-soft">
        <Unplug aria-hidden="true" className="h-4 w-4" />
        Déconnecter eBay
      </Button>
      {state?.ok ? <FormSuccess message={`Compte eBay déconnecté. ${state.data.note}`} /> : null}
      <Dialog open={open} onClose={() => setOpen(false)} size="sm" title={`Déconnecter eBay${username ? ` (${username})` : ""} ?`} description="La synchronisation s'arrêtera pour ce compte.">
        <form action={action} className="space-y-4">
          <input type="hidden" name="connection_id" value={connectionId} />
          <input type="hidden" name="confirm" value="yes" />
          <ul className="space-y-2 text-sm font-medium text-muted-strong">
            <li className="flex gap-2">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red" />
              Les jetons d&apos;autorisation sont supprimés : plus aucune annonce, commande ni quantité n&apos;est lue ou envoyée.
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-4" />
              Les annonces, commandes et associations déjà importées sont conservées.
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-4" />
              Vous pourrez reconnecter le même compte plus tard pour tout retrouver.
            </li>
          </ul>
          {state && !state.ok ? <FormError message={state.error} action={state.action} /> : null}
          <div className="flex flex-wrap justify-end gap-2 border-t border-line-soft pt-4">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <SubmitButton variant="danger" pendingText="Déconnexion…">
              Déconnecter eBay
            </SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}
