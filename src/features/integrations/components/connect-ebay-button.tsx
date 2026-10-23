import { Plug, Sparkles } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

/**
 * Démarre le flux OAuth : POST vers la route serveur (évite tout préchargement de lien). Composant serveur.
 * `extended` : demande en plus les autorisations de l'« analyse complète » (finances, trafic, marketing — lecture).
 */
export function ConnectEbayButton({ label = "Connecter eBay", variant = "primary", extended = false }: { label?: string; variant?: "primary" | "secondary"; extended?: boolean }) {
  return (
    <form method="post" action="/api/integrations/ebay/connect">
      {extended ? <input type="hidden" name="extended" value="1" /> : null}
      <button type="submit" className={buttonClasses(variant, "md")}>
        {extended ? <Sparkles aria-hidden="true" className="h-4 w-4" /> : <Plug aria-hidden="true" className="h-4 w-4" />} {label}
      </button>
    </form>
  );
}
