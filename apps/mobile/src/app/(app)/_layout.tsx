import { View } from "react-native";
import { Redirect, Stack } from "expo-router";
import { useSession } from "~/auth/session-provider";
import { useOrg } from "~/org/org-provider";
import { userMessage } from "~/lib/errors";
import { ErrorState, Screen, SkeletonList, TabHeader } from "~/components/ui";
import { OnboardingScreen } from "~/features/onboarding";
import { color } from "~/theme/tokens";

/**
 * Garde de l'application : session valide ET organisation active, sinon redirection.
 * La base vérifie l'organisation à chaque requête (RLS) ; cette garde n'est qu'un aiguillage.
 * Onglets + écrans de détail empilés au-dessus (sans barre d'onglets, comme dans le design).
 */
export default function AppLayout() {
  const session = useSession();
  const org = useOrg();

  if (session.status === "loading") return <View style={{ flex: 1, backgroundColor: color.bg }} />;
  if (session.status === "signedOut") return <Redirect href="/login" />;
  if (org.status === "loading")
    return (
      <Screen scroll={false}>
        <TabHeader title="MON STOCK" />
        <SkeletonList rows={6} thumb={false} />
      </Screen>
    );
  if (org.status === "error")
    return (
      <Screen scroll={false}>
        <TabHeader title="MON STOCK" />
        <ErrorState description={userMessage(org.error)} onRetry={org.retry} />
      </Screen>
    );
  if (org.status === "none") return <OnboardingScreen onCreated={org.refresh} />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="adjust" options={{ presentation: "modal" }} />
    </Stack>
  );
}
