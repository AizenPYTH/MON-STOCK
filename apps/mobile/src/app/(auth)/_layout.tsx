import { View } from "react-native";
import { Redirect, Stack } from "expo-router";
import { useSession } from "~/auth/session-provider";
import { color } from "~/theme/tokens";

/** Écrans publics : un utilisateur déjà connecté est renvoyé vers l'application. */
export default function AuthLayout() {
  const session = useSession();
  if (session.status === "loading") return <View style={{ flex: 1, backgroundColor: color.bg }} />;
  if (session.status === "signedIn") return <Redirect href="/intelligence" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }} />;
}
