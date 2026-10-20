"use client";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { toggleSavedOfferAction } from "@/features/radar/actions";
import type { ActionResult } from "@/lib/result";

type MessageResult = ActionResult<{ message: string }>;

/** Enregistrer / retirer l'offre (prix figé à l'enregistrement) : bouton signet 48 px. */
export function SaveOfferButton({ offerId, saved, disabled, disabledReason }: { offerId: string; saved: boolean; disabled: boolean; disabledReason?: string }) {
  const [state, action] = useActionState<MessageResult | null, FormData>(toggleSavedOfferAction, null);
  const toast = useToast();
  useEffect(() => {
    if (!state) return;
    if (state.ok) toast.success(state.data.message);
    else toast.error(state.error);
  }, [state, toast]);
  const label = saved ? "Retirer des offres enregistrées" : "Enregistrer pour comparer";
  return (
    <form action={action}>
      <input type="hidden" name="offer_id" value={offerId} />
      <Inner saved={saved} label={disabled ? (disabledReason ?? label) : label} disabled={disabled} />
    </form>
  );
}

function Inner({ saved, label, disabled }: { saved: boolean; label: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  const Icon = saved ? BookmarkCheck : Bookmark;
  return (
    <button type="submit" disabled={disabled || pending} aria-pressed={saved} aria-label={label} title={label} className={cn("flex h-12 w-12 items-center justify-center rounded-xl border border-border-strong hover:bg-line-soft disabled:cursor-not-allowed disabled:opacity-50", saved ? "bg-warning-soft text-warning" : "bg-surface text-foreground", pending && "ms-pulse")}>
      <Icon aria-hidden="true" className="h-[18px] w-[18px]" fill={saved ? "currentColor" : "none"} />
    </button>
  );
}
