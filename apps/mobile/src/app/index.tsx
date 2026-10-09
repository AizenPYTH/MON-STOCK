import { View } from "react-native";
import { Redirect } from "expo-router";
import { useSession } from "~/auth/session-provider";
import { color } from "~/theme/tokens";

/** Point d'entrée : l'application s'ouvre sur Intelligence › Aujourd'hui (session restaurée), sinon connexion. */
export default function Index() {
  const session = useSession();
  if (session.status === "loading") return <View style={{ flex: 1, backgroundColor: color.bg }} accessibilityLabel="Ouverture de MON STOCK" />;
  return <Redirect href={session.status === "signedIn" ? "/intelligence" : "/login"} />;
}
