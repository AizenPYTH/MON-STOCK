import { Stack } from "expo-router";
import { colors } from "~/ui/theme";

export default function SalesLayout() {
  return (
    <Stack screenOptions={{ headerTintColor: colors.primary, headerStyle: { backgroundColor: colors.surface }, headerTitleStyle: { color: colors.text } }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[orderId]" options={{ title: "Commande", headerBackTitle: "Ventes" }} />
    </Stack>
  );
}
