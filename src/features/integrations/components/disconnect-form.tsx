"use client";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormError, FormSuccess } from "@/components/ui/form";
import type { ActionResult } from "@/lib/result";
import { disconnectConnectionAction } from "@/features/integrations/actions";

export function DisconnectForm({ connectionId, username }: { connectionId: string; username: string | null }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionResult<{ note: string }> | null, FormData>(async (prev, formData) => {
    const result = await disconnectConnectionAction(prev, formData);
    if (result.ok) setOpen(false);
    return result;
  }, null);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Déconnecter
      </Button>
      {state?.ok ? <FormSuccess message={`Compte eBay déconnecté. ${state.data.note}`} /> : null}
      <Dialog open={open} onClose={() => setOpen(false)} title={`Déconnecter eBay${username ? ` (${username})` : ""} ?`}>
        <form action={action} className="space-y-4">
          <input type="hidden" name="connection_id" value={connectionId} />
          <input type="hidden" name="confirm" value="yes" />
          <p className="text-sm text-muted">
            Les tokens d'autorisation seront supprimés et la synchronisation s'arrêtera. Les annonces, commandes et associations déjà importées sont conservées. Vous pourrez reconnecter le même compte plus tard.
          </p>
          {state && !state.ok ? <FormError message={state.error} action={state.action} /> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <SubmitButton variant="danger" pendingText="Déconnexion…">
              Déconnecter
            </SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}
