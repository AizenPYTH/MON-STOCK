import { Redirect, Stack } from "expo-router";
import { useSession } from "~/auth/session-provider";
import { LoadingState } from "~/ui/components";

/** Écrans publics : un utilisateur déjà connecté est renvoyé vers l'application. */
export default function AuthLayout() {
  const session = useSession();
  if (session.status === "loading") return <LoadingState />;
  if (session.status === "signedIn") return <Redirect href="/dashboard" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
