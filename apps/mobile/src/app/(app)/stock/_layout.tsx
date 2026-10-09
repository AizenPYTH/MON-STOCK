import { Stack } from "expo-router";
import { colors } from "~/ui/theme";

export default function StockLayout() {
  return (
    <Stack screenOptions={{ headerTintColor: colors.primary, headerStyle: { backgroundColor: colors.surface }, headerTitleStyle: { color: colors.text } }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[skuId]" options={{ title: "Fiche SKU", headerBackTitle: "Stock" }} />
      <Stack.Screen name="movement" options={{ title: "Mouvement de stock", presentation: "modal" }} />
    </Stack>
  );
}
