import type { ColorValue } from "react-native";
import { Redirect } from "expo-router";
import { Tabs } from "expo-router/tabs";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSession } from "~/auth/session-provider";
import { useOrg } from "~/org/org-provider";
import { userMessage } from "~/lib/errors";
import { ErrorState, LoadingState, Screen } from "~/ui/components";
import { OnboardingScreen } from "~/features/onboarding";
import { colors } from "~/ui/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

function icon(name: IconName) {
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color as string} size={size} />;
  }
  return TabIcon;
}

/**
 * Garde de l'application : session valide ET organisation active, sinon redirection.
 * L'organisation est vérifiée côté base à chaque requête (RLS) ; cette garde n'est qu'un aiguillage.
 */
export default function AppLayout() {
  const session = useSession();
  const org = useOrg();

  if (session.status === "loading") return <LoadingState />;
  if (session.status === "signedOut") return <Redirect href="/login" />;
  if (org.status === "loading") return <LoadingState label="Chargement de vos organisations…" />;
  if (org.status === "error")
    return (
      <Screen scroll={false}>
        <ErrorState message={userMessage(org.error)} onRetry={org.retry} />
      </Screen>
    );
  if (org.status === "none") return <OnboardingScreen onCreated={org.refresh} />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: "Accueil", tabBarIcon: icon("home-outline"), tabBarAccessibilityLabel: "Tableau de bord" }} />
      <Tabs.Screen name="stock" options={{ title: "Stock", tabBarIcon: icon("cube-outline") }} />
      <Tabs.Screen name="sales" options={{ title: "Ventes", tabBarIcon: icon("receipt-outline") }} />
      <Tabs.Screen name="sourcing" options={{ title: "Sourcing", tabBarIcon: icon("search-outline") }} />
      <Tabs.Screen name="settings" options={{ title: "Réglages", tabBarIcon: icon("settings-outline") }} />
    </Tabs>
  );
}
