import { Plug } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

/** Démarre le flux OAuth : POST vers la route serveur (évite tout préchargement de lien). Composant serveur. */
export function ConnectEbayButton({ label = "Connecter eBay", variant = "primary" }: { label?: string; variant?: "primary" | "secondary" }) {
  return (
    <form method="post" action="/api/integrations/ebay/connect">
      <button type="submit" className={buttonClasses(variant, "md")}>
        <Plug className="h-4 w-4" /> {label}
      </button>
    </form>
  );
}
