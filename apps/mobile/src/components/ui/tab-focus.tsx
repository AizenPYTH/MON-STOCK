import { useCallback, type ReactNode } from "react";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useFocusEffect } from "expo-router";
import { motion } from "~/theme/tokens";
import { curve, useReduceMotion } from "~/components/ui/motion";

/**
 * Changement d'onglet v5 : l'écran entrant passe de `opacity 0, translateY 6` à `1, 0` (240 ms).
 * Rien si « Réduire les animations ». L'écran est interactif dès la première image.
 */
export function TabFocusFade({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  // Le crochet de focus n'existe que dans un navigateur : hors onglet, rendu direct.
  if (!enabled) return <>{children}</>;
  return <FocusFade>{children}</FocusFade>;
}

function FocusFade({ children }: { children: ReactNode }) {
  const reduce = useReduceMotion();
  const p = useSharedValue(1);
  useFocusEffect(
    useCallback(() => {
      if (reduce) return;
      p.set(0);
      p.set(withTiming(1, { duration: motion.base, easing: curve.instrument }));
    }, [reduce, p]),
  );
  const a = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * 6 }] }));
  return <Animated.View style={[{ flex: 1 }, a]}>{children}</Animated.View>;
}
