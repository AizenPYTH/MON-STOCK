import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check } from "lucide-react-native";
import { color, motion, radius, shadow, space } from "~/theme/tokens";
import { Txt } from "~/components/ui/text";
import { Button } from "~/components/ui/controls";
import { useLayout } from "~/theme/layout";

export function EmptyState({ icon, title, description, actions = [] }: { icon?: ReactNode; title: string; description: string; actions?: { label: string; onPress: () => void; variant?: "primary" | "secondary"; disabled?: boolean }[] }) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: space[8], paddingHorizontal: space[6], gap: space[3] }}>
      {icon ? <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: color.line, alignItems: "center", justifyContent: "center" }}>{icon}</View> : null}
      <Txt variant="headline" style={{ textAlign: "center" }}>
        {title}
      </Txt>
      <Txt variant="bodyRegular" style={{ textAlign: "center" }}>
        {description}
      </Txt>
      {actions.length > 0 ? (
        <View style={{ alignSelf: "stretch", gap: space[2], marginTop: space[2] }}>
          {actions.map((a) => (
            <Button key={a.label} label={a.label} onPress={a.onPress} variant={a.variant ?? "primary"} disabled={a.disabled} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function ErrorState({ title = "Impossible de charger les données", description, onRetry }: { title?: string; description: string; onRetry?: () => void }) {
  return (
    <View style={{ backgroundColor: color.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: color.line, padding: space[5], alignItems: "center", gap: space[2] }} accessibilityRole="alert">
      <Txt variant="headline" style={{ fontSize: 16, textAlign: "center" }}>
        {title}
      </Txt>
      <Txt variant="bodyRegular" style={{ textAlign: "center" }}>
        {description}
      </Txt>
      {onRetry ? <Button label="Réessayer" onPress={onRetry} compact style={{ marginTop: space[2] }} /> : null}
    </View>
  );
}

/** Bloc de chargement : opacité 0.5 ↔ 1 sur 1 s. Jamais de spinner plein écran. */
export function Skeleton({ w, h, r = radius.sm }: { w: number | `${number}%`; h: number; r?: number }) {
  const [opacity] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }), Animated.timing(opacity, { toValue: 0.5, duration: 500, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={{ width: w, height: h, borderRadius: r, backgroundColor: color.skeleton, opacity }} />;
}

export function SkeletonList({ rows = 8, thumb = true }: { rows?: number; thumb?: boolean }) {
  return (
    <View accessibilityLabel="Chargement" accessibilityRole="progressbar" style={{ backgroundColor: color.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: color.line, overflow: "hidden" }}>
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
type ToastInput = { text: string; tone?: "success" | "error"; action?: { label: string; onPress: () => void } };
const ToastContext = createContext<(t: ToastInput) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastInput & { id: number }) | null>(null);
  const insets = useSafeAreaInsets();
  const [y] = useState(() => new Animated.Value(-120));
  const show = useCallback((t: ToastInput) => setToast({ ...t, id: Date.now() }), []);

  useEffect(() => {
    if (!toast) return;
    Animated.timing(y, { toValue: 0, duration: motion.toast, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(y, { toValue: -120, duration: motion.toast, useNativeDriver: true }).start(() => setToast(null));
    }, motion.toastAutoDismiss);
    return () => clearTimeout(timer);
  }, [toast, y]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="box-none"
          style={{ position: "absolute", left: space[5], right: space[5], top: insets.top + space[2], transform: [{ translateY: y }] }}
          accessibilityLiveRegion="polite"
        >
          <View style={[{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: color.surfaceDark, borderRadius: radius.lg, paddingVertical: space[3], paddingHorizontal: 14 }, shadow.toast]} accessibilityRole="alert">
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: toast.tone === "error" ? color.danger : color.success, alignItems: "center", justifyContent: "center" }}>
              {toast.tone === "error" ? <Txt variant="micro" color={color.inkOnDark}>!</Txt> : <Check size={12} color={color.inkOnDark} strokeWidth={3} />}
            </View>
            <Txt variant="bodyRegular" color={color.inkOnDark} style={{ flex: 1, fontFamily: "Manrope_600SemiBold" }}>
              {toast.text}
            </Txt>
            {toast.action ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={10}
                onPress={() => {
                  toast.action?.onPress();
                  setToast(null);
                }}
              >
                <Txt variant="label" color={color.inkOnDarkMuted} style={{ fontFamily: "Manrope_700Bold" }}>
                  {toast.action.label}
                </Txt>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
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
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: color.overlay }} accessibilityRole="button" accessibilityLabel="Fermer" onPress={onClose} />
        <View
          accessibilityViewIsModal
          style={{ backgroundColor: color.bg, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingTop: space[3], paddingHorizontal: space[5], paddingBottom: Math.max(insets.bottom, space[4]) + space[4], gap: space[3], width: "100%", maxWidth, alignSelf: "center" }}
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
