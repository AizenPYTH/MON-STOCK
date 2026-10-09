import { useEffect, useState } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "~/auth/session-provider";
import { OrgProvider } from "~/org/org-provider";
import { appConfig } from "~/lib/config";
import { createQueryClient, wireQueryEnvironment } from "~/lib/query-client";
import { OfflineBanner } from "~/ui/offline-banner";
import { ConfigErrorScreen } from "~/features/config-error";
import { colors } from "~/ui/theme";

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  useEffect(() => wireQueryEnvironment(), []);

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
            <StatusBar style="dark" />
            <View style={{ flex: 1, backgroundColor: colors.background }}>
              <OfflineBanner />
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
            </View>
          </OrgProvider>
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
