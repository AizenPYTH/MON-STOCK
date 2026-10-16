import type { ColorValue } from "react-native";
import { Tabs } from "expo-router/tabs";
import { LayoutDashboard, Package, ScanSearch, Tag, Wrench, type LucideIcon } from "lucide-react-native";
import { InTabsContext, MonStockTabBar } from "~/components/ui/tab-bar";
import { color } from "~/theme/tokens";

function tabIcon(Icon: LucideIcon) {
  function TabIcon({ color: c, focused, size }: { color: ColorValue; focused: boolean; size: number }) {
    return <Icon size={size} color={c as string} strokeWidth={focused ? 2.2 : 1.8} />;
  }
  return TabIcon;
}

/**
 * 5 onglets (v4) : Aujourd'hui (pilotage) · Stock · Ventes · Sourcing (recherche d'offres, fournisseurs,
 * imports) · Outils, barre ancrée. Réglages et Diagnostic passent par l'avatar (haut droite). Pas de badge numérique.
 */
export default function TabsLayout() {
  return (
    <InTabsContext.Provider value>
      <Tabs initialRouteName="today" tabBar={(props) => <MonStockTabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.bg } }}>
        <Tabs.Screen name="today" options={{ title: "Aujourd'hui", tabBarIcon: tabIcon(LayoutDashboard) }} />
        <Tabs.Screen name="stock" options={{ title: "Stock", tabBarIcon: tabIcon(Package) }} />
        <Tabs.Screen name="sales" options={{ title: "Ventes", tabBarIcon: tabIcon(Tag) }} />
        <Tabs.Screen name="sourcing" options={{ title: "Sourcing", tabBarIcon: tabIcon(ScanSearch), tabBarAccessibilityLabel: "Sourcing : offres et fournisseurs" }} />
        <Tabs.Screen name="tools" options={{ title: "Outils", tabBarIcon: tabIcon(Wrench), tabBarAccessibilityLabel: "Mes outils" }} />
      </Tabs>
    </InTabsContext.Provider>
  );
}
