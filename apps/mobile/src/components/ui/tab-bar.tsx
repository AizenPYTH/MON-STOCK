import { createContext, useContext } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "expo-router/tabs";
import * as Haptics from "expo-haptics";
import { color, radius, shadow, size, space } from "~/theme/tokens";
import { useLayout } from "~/theme/layout";
import { Txt } from "~/components/ui/text";

/**
 * Barre d'onglets flottante (handoff « Atelier ») : pilule `surfaceDark` de 64 pt (56 sur iPhone
 * SE), marges 16, à 22 pt du bas + safe area ; l'onglet actif est une pastille blanche.
 * Les écrans d'onglet réservent la place via `useTabBarClearance()` (0 hors des onglets).
 */
export const TabBarClearanceContext = createContext(0);

export function useTabBarClearance() {
  return useContext(TabBarClearanceContext);
}

/** Hauteur à réserver sous le contenu défilant d'un onglet (barre + écart + safe area). */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return space.tabBarClearance + insets.bottom;
}

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { compact, screenX } = useLayout();
  const height = compact ? 56 : size.tabBar;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: screenX, paddingBottom: size.tabBarBottom + insets.bottom }}
    >
      <View
        accessibilityRole="tablist"
        style={[{ flexDirection: "row", alignItems: "center", height, borderRadius: height / 2, backgroundColor: color.surfaceDark, paddingHorizontal: 6, width: "100%", maxWidth: 560, alignSelf: "center" }, shadow.tabBar]}
      >
        {state.routes.map((route, index) => {
          const options = descriptors[route.key]?.options ?? {};
          const focused = state.index === index;
          const title = typeof options.tabBarLabel === "string" ? options.tabBarLabel : (options.title ?? route.name);
          const label = compact && route.name === "today" ? "Auj." : title;
          const fg = focused ? color.ink : color.inkOnDarkMuted;
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
              style={{ flex: 1, alignItems: "center", justifyContent: "center", height: "100%" }}
            >
              <View style={{ alignItems: "center", justifyContent: "center", gap: 2, paddingVertical: 6, paddingHorizontal: compact ? 8 : 12, borderRadius: radius.pill, backgroundColor: focused ? color.surface : "transparent", minWidth: compact ? 48 : 58 }}>
                {options.tabBarIcon?.({ focused, color: fg, size: compact ? 18 : 20 })}
                <Txt variant="tab" color={fg} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                  {label}
                </Txt>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
