import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { colors, spacing } from "~/ui/theme";

/** Bandeau persistant hors connexion : les données affichées peuvent dater, aucune écriture n'est possible. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => NetInfo.addEventListener((s) => setOffline(s.isConnected === false || s.isInternetReachable === false)), []);
  if (!offline) return null;
  return (
    <View style={{ backgroundColor: colors.warningBg, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg }} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={{ color: colors.warning, fontWeight: "600" }}>Hors connexion — données possiblement anciennes, modifications indisponibles.</Text>
    </View>
  );
}
