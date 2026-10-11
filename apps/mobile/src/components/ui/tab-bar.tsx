import { createContext, useContext } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "expo-router/tabs";
import * as Haptics from "expo-haptics";
import { color, size } from "~/theme/tokens";
import { useLayout } from "~/theme/layout";
import { Txt } from "~/components/ui/text";

/**
 * Barre d'onglets v3 ANCRÉE (non flottante) : fond blanc, filet haut, onglet actif = icône bleu
 * nuit dans une pastille menthe 52×28 + libellé encre ; inactifs en gris. La zone de sécurité est
 * incluse (aucun contenu ne passe dessous). Libellé « Auj. » sur petit écran.
 */

/** Hauteur à réserver sous le contenu des onglets (0 : la barre est ancrée). */
export const TabBarClearanceContext = createContext(0);
export function useTabBarClearance() {
  return useContext(TabBarClearanceContext);
}

/** Vrai dans les écrans racines des onglets (avatar Réglages dans l'en-tête). */
export const InTabsContext = createContext(false);
export function useInTabs() {
  return useContext(InTabsContext);
}

/** Compatibilité : barre ancrée, rien à réserver. */
export function useTabBarSpace() {
  return 0;
}

export function MonStockTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { compact } = useLayout();
  const height = compact ? 48 : size.tabBar;
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", backgroundColor: color.surface, borderTopWidth: 1, borderTopColor: color.line, paddingBottom: insets.bottom, paddingTop: 4 }}>
      {state.routes.map((route, index) => {
        const options = descriptors[route.key]?.options ?? {};
        const focused = state.index === index;
        const title = typeof options.tabBarLabel === "string" ? options.tabBarLabel : (options.title ?? route.name);
        const label = compact && route.name === "today" ? "Auj." : title;
        const onPress = () => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            void Haptics.selectionAsync().catch(() => {});
            navigation.navigate(route.name, route.params);
          }
        };
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? title}
            testID={options.tabBarButtonTestID ?? `tab-${route.name}`}
            onPress={onPress}
            onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
            style={{ flex: 1, height, alignItems: "center", justifyContent: "center", gap: 3 }}
          >
            <View style={{ width: 52, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: focused ? color.mint : "transparent" }}>
              {options.tabBarIcon?.({ focused, color: focused ? color.brand : color.ink3, size: size.tabIcon })}
            </View>
            <Txt variant="tab" color={focused ? color.ink : color.ink3} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Ancien nom (barre flottante) conservé pour compatibilité. */
export const FloatingTabBar = MonStockTabBar;
