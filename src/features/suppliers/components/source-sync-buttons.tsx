"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormError, FormSuccess, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/result";
import { checkRobotsAction, connectSupplierAccountAction, runFeedSyncAction, runSourceCrawlAction } from "@/features/suppliers/actions";

type Msg = ActionResult<{ message: string }> | null;

function Feedback({ state }: { state: Msg }) {
  if (!state) return null;
  return state.ok ? <FormSuccess message={state.data.message} /> : <FormError message={state.error} />;
}

export function CrawlSourceButton({ sourceId, disabled, reason }: { sourceId: string; disabled?: boolean; reason?: string }) {
  const [state, action] = useActionState<Msg, FormData>(runSourceCrawlAction, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="source_id" value={sourceId} />
      <SubmitButton size="sm" variant="secondary" pendingText="Lecture des pages…" disabled={disabled} title={reason}>
        Synchroniser maintenant
      </SubmitButton>
      <Feedback state={state} />
    </form>
  );
}

export function CheckRobotsButton({ sourceId }: { sourceId: string }) {
  const [state, action] = useActionState<Msg, FormData>(checkRobotsAction, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="source_id" value={sourceId} />
      <SubmitButton size="sm" variant="ghost" pendingText="Vérification…">
        Vérifier robots.txt
      </SubmitButton>
      <Feedback state={state} />
    </form>
  );
}

export function SyncFeedButton({ feedId, hasUrl }: { feedId: string; hasUrl: boolean }) {
  const [state, action] = useActionState<Msg, FormData>(runFeedSyncAction, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="feed_id" value={feedId} />
      <div className="flex flex-wrap items-center gap-2">
        {!hasUrl ? <Input type="file" name="file" accept=".csv,.txt,.xml,.json" className="h-8 max-w-xs text-xs" required /> : null}
        <SubmitButton size="sm" variant="secondary" pendingText="Synchronisation…">
          {hasUrl ? "Synchroniser maintenant" : "Importer le fichier"}
        </SubmitButton>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function ConnectAccountButton() {
  const [state, action] = useActionState<ActionResult | null, FormData>(connectSupplierAccountAction, null);
  return (
    <form action={action} className="space-y-2">
      <Button type="submit" variant="secondary">
        Connecter mon compte fournisseur
      </Button>
      {state && !state.ok ? <FormError message={state.error} /> : null}
    </form>
  );
}
