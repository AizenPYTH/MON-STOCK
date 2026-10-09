import { useEffect, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import NetInfo from "@react-native-community/netinfo";
import { AlertBanner } from "~/components/ui/display";
import { space } from "~/theme/tokens";

/**
 * Bannière hors ligne (persistante tant que NetInfo indique l'absence de réseau).
 * Différence assumée avec le design : les écritures ne sont PAS mises en file d'attente —
 * un mouvement de stock doit être confirmé par la base, jamais rejoué plus tard à l'aveugle.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const insets = useSafeAreaInsets();
  useEffect(() => NetInfo.addEventListener((s) => setOffline(s.isConnected === false || s.isInternetReachable === false)), []);
  if (!offline) return null;
  return (
    <View style={{ position: "absolute", zIndex: 10, left: space[5], right: space[5], top: insets.top + space[2] }} accessibilityLiveRegion="polite">
      <AlertBanner tone="dark" text="Hors ligne · données possiblement anciennes, modifications indisponibles" />
    </View>
  );
}
