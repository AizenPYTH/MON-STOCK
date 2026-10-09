import { useEffect, useState } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from "@expo-google-fonts/manrope";
import { SessionProvider } from "~/auth/session-provider";
import { OrgProvider } from "~/org/org-provider";
import { appConfig } from "~/lib/config";
import { createQueryClient, wireQueryEnvironment } from "~/lib/query-client";
import { OfflineBanner } from "~/components/offline-banner";
import { ConfigErrorScreen } from "~/features/config-error";
import { ToastProvider } from "~/components/ui";
import { color } from "~/theme/tokens";

void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  // Polices embarquées dans l'application (aucun téléchargement) ; repli système en cas d'échec.
  const [fontsLoaded, fontError] = useFonts({ Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold });
  useEffect(() => wireQueryEnvironment(), []);
  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  if (!appConfig.ok) {
    return (
      <SafeAreaProvider>
        <ConfigErrorScreen issues={appConfig.issues} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <OrgProvider>
            <ToastProvider>
              <StatusBar style="dark" />
              <View style={{ flex: 1, backgroundColor: color.bg }}>
                <OfflineBanner />
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }} />
              </View>
            </ToastProvider>
          </OrgProvider>
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
