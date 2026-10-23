"use client";
import { useActionState, useId } from "react";
import { ExternalLink, FileCheck2, FileWarning } from "lucide-react";
import { Checkbox, Field, FormError, FormSuccess, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { activateLibrarySourceAction } from "@/features/directory/actions";
import { cn, safeExternalUrl } from "@/lib/utils";

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
    <form action={action} className="space-y-3.5">
      <input type="hidden" name="key" value={libraryKey} />
      <div className={cn("flex items-start gap-2.5 rounded-xl border px-3.5 py-3", termsConfirmed ? "border-success-line bg-success-soft text-success-ink" : "border-warning-line bg-warning-soft text-warning-ink")}>
        {termsConfirmed ? <FileCheck2 aria-hidden="true" className="mt-px h-4 w-4 shrink-0" /> : <FileWarning aria-hidden="true" className="mt-px h-4 w-4 shrink-0" />}
        <div className="min-w-0 space-y-1">
          <p className="text-[13px] font-bold leading-[18px]">{termsConfirmed ? "CGU / CGV : page des conditions confirmée" : "CGU / CGV : page des conditions non vérifiée par MON STOCK"}</p>
          <p className="text-xs font-medium leading-[17px]">
            {termsConfirmed
              ? "Lisez-les avant d'activer : votre attestation est enregistrée avec votre nom et la date."
              : "Trouvez les conditions d'utilisation (CGU / CGV) sur le site et indiquez leur adresse exacte : l'activation est refusée sans elle."}
          </p>
          {terms ? (
            <a href={terms} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 text-xs font-bold underline underline-offset-2 hover:no-underline pointer-coarse:min-h-10">
              <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
              {termsConfirmed ? "Lire les conditions d’utilisation" : "Ouvrir le site du fournisseur"}
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
          ) : null}
        </div>
      </div>
      <p className="text-xs font-medium leading-[17px] text-muted">Le serveur MON STOCK lira automatiquement les offres publiques de {name} lors de vos recherches (robots.txt respecté, une requête à la fois).</p>
      {termsConfirmed ? null : (
        <Field label="Adresse de la page des conditions lue" htmlFor={`${id}-terms`} hint="Adresse complète (https://…) de la page CGU / CGV que vous avez lue.">
          <Input id={`${id}-terms`} name="termsUrl" type="url" inputMode="url" required placeholder="https://…" maxLength={500} />
        </Field>
      )}
      <label htmlFor={`${id}-attest`} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-3 text-sm font-semibold leading-5 text-foreground">
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
