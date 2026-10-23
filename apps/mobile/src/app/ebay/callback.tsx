import { router } from "expo-router";
import { Store } from "lucide-react-native";
import { Button, EmptyState, NightHeader, Screen } from "~/components/ui";
import { color } from "~/theme/tokens";

/**
 * `monstock://ebay/callback` ouvert HORS du flux de connexion (M-18) : normalement intercepté par
 * la fenêtre d'autorisation d'eBay. Ouvert seul (lien copié, ancien onglet), il ne finalise RIEN :
 * le code n'est jamais transmis au serveur depuis cet écran (l'état anti-CSRF exige le flux lancé
 * par l'utilisateur dans l'application).
 */
export default function EbayCallbackOutsideFlow() {
  return (
    <Screen header={<NightHeader over="eBay" title="Connexion non finalisée" />}>
      <EmptyState
        icon={<Store size={26} color={color.ink2} strokeWidth={1.8} />}
        title="Relancez la connexion depuis l'application"
        description="Ce retour d'eBay est arrivé en dehors de la fenêtre de connexion : par sécurité, il n'est pas utilisé. Ouvrez Réglages → eBay → « Connecter mon compte eBay »."
      />
      <Button label="Ouvrir les réglages eBay" onPress={() => router.replace("/ebay")} testID="ebay-callback-open" />
    </Screen>
  );
}
