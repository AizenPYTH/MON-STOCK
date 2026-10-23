"use client";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { OAUTH_RETURN_FIELD, ONBOARDING_PLATFORM_PATH } from "@/features/integrations/oauth-return";

/**
 * Démarrage du flux OAuth eBay depuis le parcours : POST (jamais un lien, anti-CSRF) vers la route
 * serveur, avec la page de retour du parcours (validée par liste blanche côté serveur). Pendant le
 * départ vers eBay : indicateur dans le bouton, second envoi ignoré. Retour arrière du navigateur
 * (page restaurée du cache) : le bouton redevient utilisable.
 */
export function ConnectEbayForm({ label, variant = "primary" }: { label: string; variant?: "primary" | "secondary" }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setLeaving(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);
  return (
    <form
      method="post"
      action="/api/integrations/ebay/connect"
      onSubmit={(e) => {
        if (leaving) e.preventDefault();
        else setLeaving(true);
      }}
    >
      <input type="hidden" name={OAUTH_RETURN_FIELD} value={ONBOARDING_PLATFORM_PATH} />
      <button
        type="submit"
        aria-disabled={leaving || undefined}
        aria-busy={leaving || undefined}
        className={cn(
          "group inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[14px] px-6 text-base font-extrabold transition-[background-color,transform] duration-300 ease-instrument focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto",
          variant === "primary" ? "bg-mint text-night hover:bg-mint-pressed" : "border border-border-strong bg-surface text-foreground hover:bg-line-soft",
          leaving ? "cursor-progress opacity-70" : "pointer-fine:hover:-translate-y-0.5",
        )}
      >
        {leaving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
        {leaving ? "Redirection vers eBay…" : label}
        {leaving ? null : <ArrowRight aria-hidden="true" className="h-4 w-4" />}
      </button>
    </form>
  );
}
