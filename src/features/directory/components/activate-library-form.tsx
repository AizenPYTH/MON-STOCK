"use client";
import { useActionState, useId } from "react";
import { ExternalLink } from "lucide-react";
import { Checkbox, FormError, FormSuccess, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { buttonClasses } from "@/components/ui/button";
import { activateLibrarySourceAction } from "@/features/directory/actions";
import { safeExternalUrl } from "@/lib/utils";

/**
 * Activation d'une source publique vérifiée : validation humaine obligatoire (conditions
 * d'utilisation lues), enregistrée avec l'utilisateur et la date. Quand MON STOCK n'a pas confirmé
 * la page des conditions, l'utilisateur indique l'adresse de celle qu'il a lue. Le serveur refuse
 * toute source non vérifiée « ok ».
 */
export function ActivateLibraryForm({ libraryKey, name, termsUrl, termsConfirmed }: { libraryKey: string; name: string; termsUrl: string; termsConfirmed: boolean }) {
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
          {termsConfirmed ? "Lire les conditions d’utilisation" : "Ouvrir le site du fournisseur"}
        </a>
      ) : null}
      {termsConfirmed ? null : (
        <div className="space-y-1">
          <p className="text-xs text-muted">Page des conditions non vérifiée par MON STOCK : trouvez les conditions d&apos;utilisation (CGU / CGV) sur le site et indiquez leur adresse exacte.</p>
          <label htmlFor={`${id}-terms`} className="text-sm">
            Adresse de la page des conditions lue
          </label>
          <Input id={`${id}-terms`} name="termsUrl" type="url" inputMode="url" required placeholder="https://…" maxLength={500} />
        </div>
      )}
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
