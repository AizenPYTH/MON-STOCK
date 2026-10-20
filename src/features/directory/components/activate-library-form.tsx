"use client";
import { useActionState, useId } from "react";
import { ExternalLink } from "lucide-react";
import { Checkbox, FormError, FormSuccess } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { buttonClasses } from "@/components/ui/button";
import { activateLibrarySourceAction } from "@/features/directory/actions";
import { safeExternalUrl } from "@/lib/utils";

/**
 * Activation d'une source publique vérifiée : attestation obligatoire (conditions d'utilisation
 * lues), comme sur l'application iPhone. Le serveur refuse toute source non vérifiée « ok ».
 */
export function ActivateLibraryForm({ libraryKey, name, termsUrl }: { libraryKey: string; name: string; termsUrl: string }) {
  const [state, action] = useActionState(activateLibrarySourceAction, null);
  const id = useId();
  const terms = safeExternalUrl(termsUrl);
  if (state?.ok) return <FormSuccess message={state.data.message} />;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="key" value={libraryKey} />
      <p className="text-xs text-muted">
        Le serveur MON STOCK lira automatiquement les offres publiques de {name} lors de vos recherches (robots.txt respecté, une requête à la fois).
      </p>
      {terms ? (
        <a href={terms} target="_blank" rel="noopener noreferrer" className={buttonClasses("link", "sm", "text-xs")}>
          <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
          Lire les conditions d&apos;utilisation
        </a>
      ) : null}
      <label htmlFor={`${id}-attest`} className="flex items-start gap-2 text-sm">
        <Checkbox id={`${id}-attest`} name="attest" required className="mt-0.5" />
        <span>J&apos;atteste avoir lu ses conditions d&apos;utilisation et qu&apos;elles autorisent cet usage.</span>
      </label>
      <FormError message={state && !state.ok ? state.error : null} />
      <SubmitButton size="sm" pendingText="Activation…">
        J&apos;atteste et j&apos;active
      </SubmitButton>
    </form>
  );
}
