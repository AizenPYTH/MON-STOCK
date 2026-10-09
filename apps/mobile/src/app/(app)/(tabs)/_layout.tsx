import type { ColorValue } from "react-native";
import { Tabs } from "expo-router/tabs";
import { BarChart3, Package, Tag, Truck, type LucideIcon } from "lucide-react-native";
import { color } from "~/theme/tokens";
import { fontFamily } from "~/theme/typography";

function tabIcon(Icon: LucideIcon) {
  function TabIcon({ color: c, focused }: { color: ColorValue; focused: boolean }) {
    return <Icon size={24} color={c as string} strokeWidth={focused ? 2.2 : 1.8} />;
  }
  return TabIcon;
}

/** 4 onglets (Stock, Ventes, Sourcing, Intelligence) ; pas de badge numérique (les alertes vivent dans « À faire »). */
export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="intelligence"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.ink,
        tabBarInactiveTintColor: color.ink3,
        tabBarStyle: { backgroundColor: color.surface, borderTopColor: color.line, borderTopWidth: 1 },
        tabBarLabelStyle: { fontFamily: fontFamily[700], fontSize: 10 },
      }}
    >
      <Tabs.Screen name="stock" options={{ title: "Stock", tabBarIcon: tabIcon(Package) }} />
      <Tabs.Screen name="sales" options={{ title: "Ventes", tabBarIcon: tabIcon(Tag) }} />
      <Tabs.Screen name="sourcing" options={{ title: "Sourcing", tabBarIcon: tabIcon(Truck) }} />
      <Tabs.Screen name="intelligence" options={{ title: "Intelligence", tabBarIcon: tabIcon(BarChart3) }} />
    </Tabs>
  );
}
