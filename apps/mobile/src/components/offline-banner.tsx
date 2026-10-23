import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
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
  const prevRef = useRef(false);
  const insets = useSafeAreaInsets();
  useEffect(
    () =>
      NetInfo.addEventListener((s) => {
        const next = s.isConnected === false || s.isInternetReachable === false;
        if (prevRef.current !== next) AccessibilityInfo.announceForAccessibility?.(next ? "Hors ligne : aucune modification ne sera envoyée." : "Connexion rétablie.");
        prevRef.current = next;
        setOffline(next);
      }),
    [],
  );
  if (!offline) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", zIndex: 10, left: space[5], right: space[5], bottom: insets.bottom + 64 }} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <AlertBanner tone="dark" text="Hors ligne · données affichées possiblement anciennes · aucune modification n'est envoyée" />
    </View>
  );
}
