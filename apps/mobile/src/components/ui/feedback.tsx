import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, KeyboardAvoidingView, Modal, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ReAnimated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Check, CircleAlert, X } from "lucide-react-native";
import { color, motion, radius, shadow, space } from "~/theme/tokens";
import { Txt } from "~/components/ui/text";
import { Button } from "~/components/ui/controls";
import { useLayout } from "~/theme/layout";
import { curve, useReduceMotion, useScreenReader } from "~/components/ui/motion";

export function EmptyState({ icon, title, description, actions = [] }: { icon?: ReactNode; title: string; description: string; actions?: { label: string; onPress: () => void; variant?: "primary" | "secondary"; disabled?: boolean }[] }) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: space[6], paddingHorizontal: space[5], gap: space[3], backgroundColor: color.card, borderRadius: radius.xl, borderWidth: 1, borderColor: color.line }}>
      {icon ? <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: color.surfaceSunken, alignItems: "center", justifyContent: "center" }}>{icon}</View> : null}
      <Txt variant="headline" style={{ textAlign: "center" }}>
        {title}
      </Txt>
      <Txt variant="bodyRegular" style={{ textAlign: "center" }}>
        {description}
      </Txt>
      {actions.length > 0 ? (
        <View style={{ alignSelf: "stretch", gap: space[2], marginTop: space[2] }}>
          {actions.map((a) => (
            <Button key={a.label} label={a.label} onPress={a.onPress} variant={a.variant === "secondary" ? "secondary" : "primary"} disabled={a.disabled} compact />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function ErrorState({ title = "Impossible de charger les données", description, onRetry }: { title?: string; description: string; onRetry?: () => void }) {
  return (
    <View style={{ backgroundColor: color.dangerSoft, borderRadius: radius.card, borderWidth: 1, borderColor: color.dangerLine, padding: space[5], alignItems: "center", gap: space[2] }} accessibilityRole="alert">
      <CircleAlert size={24} color={color.dangerInk} strokeWidth={2} />
      <Txt variant="headline" color={color.dangerInk} style={{ fontSize: 16, textAlign: "center" }}>
        {title}
      </Txt>
      <Txt variant="bodyRegular" color={color.dangerInk} style={{ textAlign: "center" }}>
        {description}
      </Txt>
      {onRetry ? <Button label="Réessayer" onPress={onRetry} compact variant="secondary" style={{ marginTop: space[2] }} /> : null}
    </View>
  );
}

/** Bloc de chargement : opacité 0,45 ↔ 1 sur 1 s (fixe si « Réduire les animations »). Jamais de spinner plein écran. */
export function Skeleton({ w, h, r = radius.sm }: { w: number | `${number}%`; h: number; r?: number }) {
  const reduce = useReduceMotion();
  const [opacity] = useState(() => new Animated.Value(0.45));
  useEffect(() => {
    if (reduce) {
      opacity.setValue(0.75);
      return;
    }
    const loop = Animated.loop(Animated.sequence([Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }), Animated.timing(opacity, { toValue: 0.45, duration: 500, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [opacity, reduce]);
  return <Animated.View style={{ width: w, height: h, borderRadius: r, backgroundColor: color.skeletonStrong, opacity }} />;
}

export function SkeletonList({ rows = 8, thumb = true }: { rows?: number; thumb?: boolean }) {
  return (
    <View accessibilityLabel="Chargement" accessibilityRole="progressbar" style={{ backgroundColor: color.card, borderRadius: radius.xl, borderWidth: 1, borderColor: color.line, overflow: "hidden" }}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[3], paddingHorizontal: space[4], borderBottomWidth: i === rows - 1 ? 0 : 1, borderBottomColor: color.lineSoft }}>
          {thumb ? <Skeleton w={44} h={44} r={radius.md} /> : null}
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton w={`${55 + ((i * 17) % 30)}%`} h={14} />
            <Skeleton w="35%" h={11} />
          </View>
          <Skeleton w={28} h={22} r={radius.xs} />
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Toast (file d'un seul message, disparition après 4 s, action « Annuler » optionnelle)
// ---------------------------------------------------------------------------------------------
/** Durée d'affichage d'une notification (ms) : avec action « Annuler », plus longue ; ×3 avec VoiceOver. */
export function toastDuration(hasAction: boolean, screenReader: boolean): number {
  const base = hasAction ? motion.toastAutoDismiss : 3000;
  return screenReader ? base * 3 : base;
}

type ToastInput = { text: string; tone?: "success" | "error"; action?: { label: string; onPress: () => void } };
const ToastContext = createContext<(t: ToastInput) => void>(() => {});

/**
 * Notification v5 : bleu nuit, contour `nightStroke`, rayon 16 ; entrée `translateY -150 → 0`
 * (280 ms, courbe « instrument ») + fondu ; disparition après 3 s (4 s avec une action « Annuler »).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastInput & { id: number }) | null>(null);
  const insets = useSafeAreaInsets();
  const p = useSharedValue(0);
  const show = useCallback((t: ToastInput) => setToast({ ...t, id: Date.now() }), []);
  const reduce = useReduceMotion();
  const screenReader = useScreenReader();

  useEffect(() => {
    if (!toast) return;
    p.value = reduce ? 1 : withTiming(1, { duration: motion.toast, easing: curve.instrument });
    // iOS n'annonce pas les régions « live » : lecture explicite par VoiceOver.
    if (screenReader) AccessibilityInfo.announceForAccessibility?.(toast.action ? `${toast.text}. Action disponible : ${toast.action.label}.` : toast.text);
    // M-23 : délai d'action allongé, très largement avec un lecteur d'écran (WCAG 2.2.1).
    const timer = setTimeout(() => setToast(null), toastDuration(Boolean(toast.action), screenReader));
    return () => {
      clearTimeout(timer);
      p.value = 0;
    };
  }, [toast, p, reduce, screenReader]);
  const a = useAnimatedStyle(() => ({ opacity: Math.min(1, p.value * 1.4), transform: [{ translateY: (1 - p.value) * -150 }] }));

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <ReAnimated.View pointerEvents="box-none" style={[{ position: "absolute", left: space[4], right: space[4], top: Math.max(insets.top - 6, space[2]) }, a]} accessibilityLiveRegion="polite">
          <View style={[{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: color.brand, borderRadius: radius.card, borderWidth: 1, borderColor: color.nightStroke, paddingVertical: space[3], paddingHorizontal: 14 }, shadow.toast]} accessibilityRole="alert">
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: toast.tone === "error" ? color.dangerOnDark : color.mint, alignItems: "center", justifyContent: "center" }}>
              {toast.tone === "error" ? <X size={13} color={color.brand} strokeWidth={3} /> : <Check size={13} color={color.onMint} strokeWidth={3} />}
            </View>
            <Txt variant="bodyRegular" color={color.inkOnDark} style={{ flex: 1, fontFamily: "Manrope_600SemiBold", fontSize: 14, lineHeight: 19 }}>
              {toast.text}
            </Txt>
            {toast.action ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={toast.action.label}
                hitSlop={8}
                style={{ minHeight: 44, minWidth: 44, paddingHorizontal: space[2], alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: color.nightRaised }}
                onPress={() => {
                  toast.action?.onPress();
                  setToast(null);
                }}
              >
                <Txt variant="label" color={color.mint} style={{ fontFamily: "Manrope_700Bold" }}>
                  {toast.action.label}
                </Txt>
              </Pressable>
            ) : null}
          </View>
        </ReAnimated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

// ---------------------------------------------------------------------------------------------
// Bottom sheet de confirmation (action irréversible)
// ---------------------------------------------------------------------------------------------
export function BottomSheet({ visible, title, description, children, onClose }: { visible: boolean; title: string; description?: string; children: ReactNode; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { maxWidth } = useLayout();
  const reduce = useReduceMotion();
  return (
    <Modal visible={visible} transparent animationType={reduce ? "fade" : "slide"} onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: color.overlay }} accessibilityRole="button" accessibilityLabel="Fermer" onPress={onClose} />
        <View
          accessibilityViewIsModal
          style={{ ...shadow.sheet, backgroundColor: color.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingTop: space[3], paddingHorizontal: space[4], paddingBottom: Math.max(insets.bottom, 34), gap: space[3], width: "100%", maxWidth, alignSelf: "center" }}
        >
          <View style={{ alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: color.lineStrong, marginBottom: space[2] }} />
          <Txt variant="title2" accessibilityRole="header">
            {title}
          </Txt>
          {description ? <Txt variant="bodyRegular">{description}</Txt> : null}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function useBoolean(initial = false) {
  const [value, setValue] = useState(initial);
  return useMemo(() => ({ value, on: () => setValue(true), off: () => setValue(false) }), [value]);
}
