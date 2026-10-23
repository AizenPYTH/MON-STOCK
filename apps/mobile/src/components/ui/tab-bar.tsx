import { createContext, useContext, useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "expo-router/tabs";
import * as Haptics from "expo-haptics";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { color, motion, size } from "~/theme/tokens";
import { useLayout } from "~/theme/layout";
import { Txt } from "~/components/ui/text";
import { useSlide } from "~/components/ui/motion";

/**
 * Barre d'onglets v5 ANCRÉE : fond blanc à 96 %, filet haut ; un SEUL indicateur menthe 52 × 30
 * qui glisse vers l'onglet actif (280 ms, courbe « instrument » ; saut immédiat si « Réduire les
 * animations ») ; icône bleu nuit + libellé encre à l'actif, gris sinon. La zone de sécurité est
 * incluse. Libellé « Auj. » sur petit écran.
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
  const [width, setWidth] = useState(0);
  const col = state.routes.length ? width / state.routes.length : 0;
  const x = useSlide(state.index * col + (col - 52) / 2, motion.tabIndicator);
  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View accessibilityRole="tablist" onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ flexDirection: "row", backgroundColor: color.surface, borderTopWidth: 1, borderTopColor: color.line, paddingBottom: insets.bottom, paddingTop: 4 }}>
      {width > 0 ? <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: compact ? 6 : 8, width: 52, height: compact ? 26 : 30, borderRadius: 15, backgroundColor: color.mint }, indicator]} /> : null}
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
            <View style={{ width: 52, height: compact ? 26 : 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: focused && width === 0 ? color.mint : "transparent" }}>
              {options.tabBarIcon?.({ focused, color: focused ? color.brand : color.ink3, size: size.tabIcon })}
            </View>
            <Txt variant="tab" color={focused ? color.ink : color.ink3} numberOfLines={1} maxFontSizeMultiplier={1.4}>
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
