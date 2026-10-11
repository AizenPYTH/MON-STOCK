import type { ColorValue } from "react-native";
import { Tabs } from "expo-router/tabs";
import { Package, Sun, Tag, Truck, Wrench, type LucideIcon } from "lucide-react-native";
import { FloatingTabBar, TabBarClearanceContext, useTabBarSpace } from "~/components/ui/tab-bar";
import { color } from "~/theme/tokens";

function tabIcon(Icon: LucideIcon) {
  function TabIcon({ color: c, focused, size }: { color: ColorValue; focused: boolean; size: number }) {
    return <Icon size={size} color={c as string} strokeWidth={focused ? 2.4 : 2} />;
  }
  return TabIcon;
}

/**
 * 5 onglets (handoff « Atelier ») : Aujourd'hui · Stock · Ventes · Sourcing · Outils, barre
 * flottante. Réglages et Diagnostic passent par l'avatar (haut droite). Pas de badge numérique.
 */
export default function TabsLayout() {
  const clearance = useTabBarSpace();
  return (
    <TabBarClearanceContext.Provider value={clearance}>
      <Tabs initialRouteName="today" tabBar={(props) => <FloatingTabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.bg } }}>
        <Tabs.Screen name="today" options={{ title: "Aujourd'hui", tabBarIcon: tabIcon(Sun) }} />
        <Tabs.Screen name="stock" options={{ title: "Stock", tabBarIcon: tabIcon(Package) }} />
        <Tabs.Screen name="sales" options={{ title: "Ventes", tabBarIcon: tabIcon(Tag) }} />
        <Tabs.Screen name="sourcing" options={{ title: "Sourcing", tabBarIcon: tabIcon(Truck) }} />
        <Tabs.Screen name="tools" options={{ title: "Outils", tabBarIcon: tabIcon(Wrench), tabBarAccessibilityLabel: "Mes outils" }} />
      </Tabs>
    </TabBarClearanceContext.Provider>
  );
}
