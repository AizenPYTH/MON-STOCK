"use client";
import { useFormStatus } from "react-dom";
import { ChevronDown, Loader2 } from "lucide-react";
import { switchOrganizationAction } from "@/features/organizations/actions";

type Option = { id: string; name: string; isDemo: boolean };

function SwitcherSelect({ options, currentId }: { options: Option[]; currentId: string }) {
  const { pending } = useFormStatus();
  return (
    <>
      <select
        name="organization_id"
        defaultValue={currentId}
        disabled={pending}
        aria-label="Organisation active"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-8 max-w-[11rem] appearance-none truncate rounded-lg border border-border bg-surface pl-2.5 pr-7 text-sm font-medium hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 sm:max-w-[16rem]"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.isDemo ? "DEMO · " : ""}
            {o.name}
          </option>
        ))}
      </select>
      {pending ? (
        <Loader2 aria-hidden="true" className="pointer-events-none absolute right-2 top-2 h-4 w-4 animate-spin text-muted" />
      ) : (
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2 top-2 h-4 w-4 text-muted" />
      )}
      <span role="status" className="sr-only">
        {pending ? "Changement d'organisation…" : ""}
      </span>
    </>
  );
}

/**
 * Sélecteur d'organisation : le changement est envoyé dès la sélection (JS actif).
 * Sans JavaScript, le bouton « Changer » (dans <noscript>) soumet le même formulaire.
 */
export function OrgSwitcher({ options, currentId }: { options: Option[]; currentId: string }) {
  return (
    <form action={switchOrganizationAction} className="flex min-w-0 items-center">
      <span className="relative min-w-0">
        <SwitcherSelect options={options} currentId={currentId} />
      </span>
      <noscript>
        <button type="submit" className="ml-2 text-xs text-muted underline hover:text-foreground">
          Changer
        </button>
      </noscript>
    </form>
  );
}
