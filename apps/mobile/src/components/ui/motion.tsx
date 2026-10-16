import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AccessibilityInfo, Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming, type SharedValue } from "react-native-reanimated";
import { motion } from "~/theme/tokens";

/**
 * Mouvement v5 « Instrument » (Reanimated 4, thread UI) :
 *  - courbes : `instrument` (entrées, indicateurs, comptage), `sheet` (feuilles, écrans poussés),
 *    `press` (appui), `pop` (favori, coche de succès), `exit` (sorties) ;
 *  - durées : jetons `motion` de theme/tokens.ts ;
 *  - seuls `transform` et `opacity` sont animés ; aucune boucle hors chargement ; aucune action
 *    n'attend la fin d'une animation ;
 *  - « Réduire les animations » : tout est immédiat (lu UNE fois pour toute l'application).
 *
 * Piège connu : ne jamais écrire `x.value` dans un objet `style` hors `useAnimatedStyle` (le plugin
 * Babel des worklets le prend pour une valeur animée).
 */
export const curve = {
  instrument: Easing.bezier(0.22, 1, 0.36, 1),
  sheet: Easing.bezier(0.32, 0.72, 0, 1),
  press: Easing.bezier(0.3, 0, 0.5, 1),
  pop: Easing.bezier(0.34, 1.56, 0.64, 1),
  exit: Easing.bezier(0.4, 0, 1, 1),
};

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

/** Décalage par élément, plafonné à 8 éléments. */
export const staggerOf = (index: number, step: number = motion.stagger) => Math.min(Math.max(index, 0), 8) * step;

/** Apparition (fondu + 8 pt), décalée pour les premiers éléments ; instantanée si l'animation est réduite. */
export function FadeIn({ index = 0, delay = 0, offset = 8, step = motion.staggerSections, children, style }: { index?: number; delay?: number; offset?: number; step?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) {
      p.value = 1;
      return;
    }
    p.value = withDelay(delay + staggerOf(index, step), withTiming(1, { duration: motion.base, easing: curve.instrument }));
  }, [reduce, index, delay, step, p]);
  const a = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * offset }] }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

/** Valeur partagée animée vers `to` (0–1) ; immédiate si l'animation est réduite. */
export function useProgress(to: number, { delay = 0, duration = motion.progress }: { delay?: number; duration?: number } = {}): SharedValue<number> {
  const reduce = useReduceMotion();
  const v = useSharedValue(reduce ? to : 0);
  useEffect(() => {
    if (reduce) {
      v.value = to;
      return;
    }
    v.value = withDelay(delay, withTiming(to, { duration, easing: curve.instrument }));
  }, [reduce, to, delay, duration, v]);
  return v;
}

/** Compatibilité v4 : progression animée (désormais une valeur partagée Reanimated). */
export const useAnimatedProgress = (to: number) => useProgress(to);

/**
 * Élément qui « se dresse » depuis sa base : échelle 0 → 1 sur l'axe donné (barres, segments).
 * `axis="x"` part de la gauche, `axis="y"` du bas. Uniquement `transform`.
 */
export function Grow({ axis = "x", delay = 0, duration = motion.progress, style, children }: { axis?: "x" | "y"; delay?: number; duration?: number; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const p = useProgress(1, { delay, duration });
  const a = useAnimatedStyle(() => (axis === "x" ? { transform: [{ scaleX: p.value }] } : { transform: [{ scaleY: p.value }] }));
  return <Animated.View style={[style, { transformOrigin: axis === "x" ? "left" : "bottom" }, a]}>{children}</Animated.View>;
}

/** Remplissage d'une barre vers une fraction réelle (0–1), par `scaleX` depuis la gauche. */
export function FillBar({ ratio, delay = 0, style }: { ratio: number; delay?: number; style?: StyleProp<ViewStyle> }) {
  const r = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  const p = useProgress(r, { delay });
  const a = useAnimatedStyle(() => ({ transform: [{ scaleX: p.value }] }));
  return <Animated.View style={[{ position: "absolute", left: 0, top: 0, bottom: 0, width: "100%", transformOrigin: "left" }, style, a]} />;
}

/** Indicateur qui glisse vers une position (onglets, contrôle segmenté) ; saut immédiat si réduit. */
export function useSlide(target: number, duration: number = motion.base): SharedValue<number> {
  const reduce = useReduceMotion();
  const v = useSharedValue(target);
  const first = useRef(true);
  useEffect(() => {
    if (first.current || reduce) {
      first.current = false;
      v.value = target;
      return;
    }
    v.value = withTiming(target, { duration, easing: curve.instrument });
  }, [target, reduce, duration, v]);
  return v;
}

/** Rotation d'un chevron (0 → 180°) selon `open`. */
export function Chevron({ open, children }: { open: boolean; children: ReactNode }) {
  const v = useSlide(open ? 1 : 0, motion.quick);
  const a = useAnimatedStyle(() => ({ transform: [{ rotate: `${v.value * 180}deg` }] }));
  return <Animated.View style={a}>{children}</Animated.View>;
}

/**
 * Zone tactile avec retour d'appui : échelle (0,98 par défaut ; tuiles 0,96, boutons ronds 0,92)
 * en 90 ms ; opacité 0,7 si l'animation est réduite. L'action part immédiatement.
 */
export function PressScale({ scale = 0.98, style, children, ...props }: Omit<PressableProps, "style" | "children"> & { scale?: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const reduce = useReduceMotion();
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => (reduce ? { opacity: s.value < 1 ? 0.7 : 1 } : { transform: [{ scale: s.value }] }));
  return (
    <Pressable
      {...props}
      onPressIn={(e) => {
        s.set(reduce ? 0.99 : withTiming(scale, { duration: motion.press, easing: curve.press }));
        props.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.set(reduce ? 1 : withTiming(1, { duration: motion.press * 1.5, easing: curve.press }));
        props.onPressOut?.(e);
      }}
    >
      <Animated.View style={[style, a]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Rebond bref (favori, coche) déclenché quand `trigger` change : 1 → `peak` → 1. */
export function Pop({ trigger, peak = 1.3, children }: { trigger: unknown; peak?: number; children: ReactNode }) {
  const reduce = useReduceMotion();
  const s = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduce) return;
    s.value = withSequence(withTiming(peak, { duration: motion.press, easing: curve.press }), withTiming(1, { duration: 260, easing: curve.pop }));
  }, [trigger, reduce, peak, s]);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={a}>{children}</Animated.View>;
}

/**
 * Comptage d'un chiffre de 0 à `value` (600 ms, sortie « instrument ») à l'ouverture ou quand la
 * valeur change ; immédiat si l'animation est réduite ou si `enabled` est faux. Le lecteur d'écran
 * doit annoncer la valeur finale (libellé porté par le parent).
 */
export function useCountUp(value: number, enabled = true): number {
  const reduce = useReduceMotion();
  const immediate = reduce || !enabled || !Number.isFinite(value);
  const [shown, setShown] = useState(() => (immediate ? value : 0));
  const from = useRef(immediate ? value : 0);
  useEffect(() => {
    if (immediate) {
      from.current = value;
      return;
    }
    const start = from.current;
    if (start === value) return;
    const t0 = Date.now();
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, (Date.now() - t0) / motion.figure);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(start + (value - start) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, immediate]);
  return immediate ? value : shown;
}
