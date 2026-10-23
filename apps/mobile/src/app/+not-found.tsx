import { router } from "expo-router";
import { Compass } from "lucide-react-native";
import { useSession } from "~/auth/session-provider";
import { Button, EmptyState, NightHeader, Screen } from "~/components/ui";
import { color } from "~/theme/tokens";

/**
 * Lien inconnu (M-18) : un lien `monstock://…` ancien ou mal formé ouvre cet écran explicite au
 * lieu de l'écran technique « Unmatched route ». Aucune action n'est exécutée automatiquement.
 */
export default function NotFoundScreen() {
  const session = useSession();
  const home = session.status === "signedIn" ? "/today" : "/login";
  return (
    <Screen header={<NightHeader over="MON STOCK" title="Page introuvable" />}>
      <EmptyState icon={<Compass size={26} color={color.ink2} strokeWidth={1.8} />} title="Ce lien ne mène nulle part" description="Il est peut-être ancien ou incomplet. Rien n'a été modifié dans vos données." />
      <Button label={session.status === "signedIn" ? "Revenir à Aujourd'hui" : "Aller à la connexion"} onPress={() => router.replace(home)} testID="not-found-home" />
    </Screen>
  );
}
