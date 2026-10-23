"use client";
import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { deleteConversationAction } from "@/features/advisor/actions";

/** Suppression définitive d'une conversation (confirmation explicite, comme sur iPhone). */
export function DeleteConversationButton({ conversationId, title }: { conversationId: string; title: string }) {
  const [state, formAction] = useActionState(deleteConversationAction, null);
  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="conversationId" value={conversationId} />
      <SubmitButton variant="ghost" size="sm" pendingText="Suppression…" confirmMessage={`Supprimer la conversation ?\n« ${title} » et ses messages seront supprimés définitivement.`} aria-label={`Supprimer : ${title}`}>
        <Trash2 aria-hidden="true" className="h-3.5 w-3.5 text-danger" /> <span className="text-danger max-sm:sr-only">Supprimer</span>
      </SubmitButton>
      {state && !state.ok ? (
        <span role="alert" className="text-xs text-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
