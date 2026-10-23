import { Plug, Smartphone, Sparkles } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { ebayWebConnect, type EbayWebConnectStatus } from "@/features/integrations/ebay-web";

/** W-06 : texte affiché à la place du bouton quand la connexion web n'est pas possible. */
export const EBAY_WEB_UNAVAILABLE_TEXT: Record<Exclude<EbayWebConnectStatus, "ready">, string> = {
  web_runame_missing: "Connectez eBay depuis l'app iPhone, ou configurez le RuName web (EBAY_WEB_RU_NAME).",
  not_configured: "Intégration eBay non configurée sur ce serveur : connexion impossible pour le moment.",
};

/**
 * Démarre le flux OAuth : POST vers la route serveur (évite tout préchargement de lien). Composant serveur.
 * `extended` : demande en plus les autorisations de l'« analyse complète » (finances, trafic, marketing — lecture).
 * Sans RuName web dédié (W-06), le bouton est remplacé par un message : aucun faux bouton qui mènerait
 * au relais de l'application iPhone (`monstock://`, impasse sur ordinateur).
 */
export function ConnectEbayButton({ label = "Connecter eBay", variant = "primary", extended = false }: { label?: string; variant?: "primary" | "secondary"; extended?: boolean }) {
  const web = ebayWebConnect();
  if (web.status !== "ready") {
    return (
      <p className="flex max-w-[420px] items-start gap-1.5 text-xs font-semibold text-ink-3">
        <Smartphone aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
        <span>{EBAY_WEB_UNAVAILABLE_TEXT[web.status]}</span>
      </p>
    );
  }
  return (
    <form method="post" action="/api/integrations/ebay/connect">
      {extended ? <input type="hidden" name="extended" value="1" /> : null}
      <button type="submit" className={buttonClasses(variant, "md")}>
        {extended ? <Sparkles aria-hidden="true" className="h-4 w-4" /> : <Plug aria-hidden="true" className="h-4 w-4" />} {label}
      </button>
    </form>
  );
}
