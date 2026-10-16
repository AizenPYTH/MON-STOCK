import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, type StyleProp, type ViewStyle } from "react-native";
import { motion } from "~/theme/tokens";

/**
 * Mouvement v4 : apparitions courtes (220 ms, décalage 40 ms plafonné), aucun rebond appuyé, et
 * RIEN quand « Réduire les animations » est actif (iOS / Android). La préférence système est lue
 * une seule fois pour toute l'application (un seul abonnement, pas un par composant).
 */
let reduceMotion = false;
const listeners = new Set<() => void>();
let subscribed = false;

function ensureSubscribed() {
  if (subscribed) return;
  subscribed = true;
  const set = (v: boolean) => {
    if (v === reduceMotion) return;
    reduceMotion = v;
    for (const l of listeners) l();
  };
  void AccessibilityInfo.isReduceMotionEnabled()
    .then(set)
    .catch(() => {});
  AccessibilityInfo.addEventListener?.("reduceMotionChanged", set);
}

function subscribe(l: () => void) {
  ensureSubscribed();
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Vrai si l'utilisateur a demandé de réduire les animations. */
export function useReduceMotion(): boolean {
  return useSyncExternalStore(subscribe, () => reduceMotion, () => false);
}

/** Apparition discrète (fondu + 8 px), décalée pour les premiers éléments ; instantanée si l'animation est réduite. */
export function FadeIn({ index = 0, children, style }: { index?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const [v] = useState(() => new Animated.Value(reduce ? 1 : 0));
  useEffect(() => {
    if (reduce) {
      v.setValue(1);
      return;
    }
    const a = Animated.timing(v, { toValue: 1, duration: motion.enter, delay: Math.min(index, 8) * motion.stagger, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [reduce, index, v]);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>{children}</Animated.View>;
}

/** Valeur animée de 0 à `to` (barres de progression) ; immédiate si l'animation est réduite. */
export function useAnimatedProgress(to: number): Animated.Value {
  const reduce = useReduceMotion();
  const [v] = useState(() => new Animated.Value(reduce ? to : 0));
  useEffect(() => {
    if (reduce) {
      v.setValue(to);
      return;
    }
    const a = Animated.timing(v, { toValue: to, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [reduce, to, v]);
  return v;
}
