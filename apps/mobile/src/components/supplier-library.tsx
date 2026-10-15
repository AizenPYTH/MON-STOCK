import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, Linking, Pressable, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { Star } from "lucide-react-native";
import { ACCESS_METHOD_LABEL, INTEGRATION_STATUS_LABEL, RELIABILITY_LABEL, SEGMENT_LABEL } from "@/domain/sourcing/supplier-registry";
import type { DirectoryEntryDTO } from "@/features/mobile-api/contract";
import { useConnectProAccount, useSyncProAccount } from "~/data/hooks";
import { mailtoLink } from "~/data/suppliers-pro";
import { userMessage } from "~/lib/errors";
import { safeExternalUrl } from "~/lib/url";
import { BottomSheet, Button, StatusChip, TextField, Txt, useToast, type ChipTone } from "~/components/ui";
import { color, space } from "~/theme/tokens";

export { ACCESS_METHOD_LABEL, INTEGRATION_STATUS_LABEL, RELIABILITY_LABEL, SEGMENT_LABEL };

export const ORG_STATUS_LABEL: Record<DirectoryEntryDTO["org"]["status"], string> = { connected: "Connecté", pending: "En attente", error: "Erreur", not_connected: "Non connecté" };
export const ORG_STATUS_TONE: Record<DirectoryEntryDTO["org"]["status"], ChipTone> = { connected: "success", pending: "accent", error: "danger", not_connected: "neutral" };

export const INTEGRATION_TONE: Record<DirectoryEntryDTO["registry"]["integrationStatus"], ChipTone> = {
  connected_tested: "success",
  in_progress: "accent",
  public_available: "dark",
  api_to_integrate: "dark",
  feed_to_integrate: "dark",
  file_import: "neutral",
  pro_account_required: "accent",
  commercial_access_needed: "accent",
  not_automatable: "neutral",
  abandoned: "danger",
};

/** Préférence système « Réduire les animations » (lue une fois, puis suivie). */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduce(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", (v: boolean) => setReduce(v));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}

/** Apparition discrète (fondu + 8 px), décalée pour les premiers éléments ; instantanée si l'animation est réduite. */
export function FadeIn({ index = 0, children }: { index?: number; children: ReactNode }) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) {
      v.setValue(1);
      return;
    }
    Animated.timing(v, { toValue: 1, duration: 220, delay: Math.min(index, 8) * 35, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [reduce, index, v]);
  return <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>{children}</Animated.View>;
}

/** Étoile des favoris : retour visuel immédiat (léger rebond) et haptique. */
export function FavoriteButton({ active, onPress, name }: { active: boolean; onPress: () => void; name: string }) {
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const press = () => {
    onPress();
    void Haptics.selectionAsync().catch(() => {});
    if (reduce) return;
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.25, duration: 90, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
  };
  return (
    <Pressable onPress={press} hitSlop={10} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={active ? `Retirer ${name} des favoris` : `Ajouter ${name} aux favoris`} testID={`favorite-${name}`}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Star size={20} color={active ? color.accent : color.ink3} fill={active ? color.accent : "transparent"} />
      </Animated.View>
    </Pressable>
  );
}

/** Feuille de connexion API : les identifiants partent au serveur (chiffrés), jamais conservés sur l'appareil. */
export function ConnectApiSheet({ entry, onClose }: { entry: Pick<DirectoryEntryDTO, "key" | "name" | "connector">; onClose: () => void }) {
  const toast = useToast();
  const connect = useConnectProAccount();
  const fields = entry.connector?.fields ?? [];
  const [values, setValues] = useState<Record<string, string>>({});
  const complete = fields.length > 0 && fields.every((f) => (values[f.name] ?? "").trim().length > 0);
  return (
    <BottomSheet visible title={`Configurer l'API ${entry.name}`} description="Vos identifiants partent uniquement vers le serveur MON STOCK, qui les chiffre et les teste auprès du fournisseur. Ils ne sont ni conservés sur ce téléphone ni réaffichés." onClose={onClose}>
      <View style={{ gap: space[3] }}>
        {fields.map((f) => (
          <TextField
            key={f.name}
            label={f.label}
            value={values[f.name] ?? ""}
            onChangeText={(v) => setValues((cur) => ({ ...cur, [f.name]: v }))}
            placeholder={f.placeholder ?? undefined}
            secureTextEntry={f.secret}
            autoCapitalize="none"
            autoCorrect={false}
            testID={`pro-field-${f.name}`}
          />
        ))}
        <Txt variant="label">Après la connexion : vos prix et stocks de ce compte arrivent dans la recherche et l'analyse des bonnes affaires.</Txt>
        <Button
          label="Connecter et tester"
          disabled={!complete}
          loading={connect.isPending}
          onPress={() =>
            connect.mutate(
              { key: entry.key, credentials: values },
              {
                onSuccess: (r) => {
                  void Haptics.notificationAsync(r.ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
                  toast({ text: r.message, tone: r.ok ? undefined : "error" });
                  onClose();
                },
                onError: (e) => toast({ text: userMessage(e), tone: "error" }),
              },
            )
          }
          testID="pro-connect-submit"
        />
      </View>
    </BottomSheet>
  );
}

/** Exécution de l'action principale d'une fiche (jamais une connexion simulée). */
export function useSupplierAction(entry: DirectoryEntryDTO, canWrite: boolean) {
  const toast = useToast();
  const sync = useSyncProAccount();
  const [sheet, setSheet] = useState(false);
  const site = () => {
    const url = safeExternalUrl(entry.catalogUrl ?? entry.website);
    if (url) void WebBrowser.openBrowserAsync(url).catch(() => toast({ text: "Lien impossible à ouvrir.", tone: "error" }));
  };
  const email = () => void Linking.openURL(mailtoLink(entry.email.fr)).catch(() => toast({ text: "Aucune application de messagerie configurée sur cet appareil.", tone: "error" }));
  const importFile = () => router.push({ pathname: "/sourcing-import", params: { supplierName: entry.name, ...(entry.org.supplierId ? { supplierId: entry.org.supplierId } : {}) } });
  const run = (kind = entry.registry.primaryAction.kind) => {
    const writeKinds = ["sync", "connect_api", "add_feed", "import_catalog"];
    if (!canWrite && writeKinds.includes(kind)) {
      toast({ text: "Votre rôle ne permet pas de modifier les sources. Demandez à un administrateur.", tone: "error" });
      return;
    }
    if (kind === "sync" && entry.org.connectionId)
      sync.mutate(entry.org.connectionId, {
        onSuccess: (r) => toast({ text: r.message }),
        onError: (e) => toast({ text: userMessage(e), tone: "error" }),
      });
    else if (kind === "connect_api") setSheet(true);
    else if (kind === "add_feed") router.push("/sourcing-feed-new");
    else if (kind === "import_catalog") importFile();
    else if (kind === "activate_public") router.push("/sourcing-sources");
    else if (kind === "get_pro_access") site();
    else site();
  };
  const node = sheet ? <ConnectApiSheet entry={entry} onClose={() => setSheet(false)} /> : null;
  return { run, busy: sync.isPending, sheet: node, email, site, importFile };
}

export function MethodChips({ methods, max = 3 }: { methods: DirectoryEntryDTO["registry"]["accessMethods"]; max?: number }) {
  const shown = methods.filter((m) => m !== "pro_account_first").slice(0, max);
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {shown.map((m) => (
        <StatusChip key={m} label={ACCESS_METHOD_LABEL[m]} tone={m === "official_api" || m === "public_integrated" ? "dark" : m === "not_automatable" ? "danger" : "neutral"} />
      ))}
      {methods.includes("pro_account_first") ? <StatusChip label={ACCESS_METHOD_LABEL.pro_account_first} tone="accent" /> : null}
    </View>
  );
}

/** Pays ISO → libellé court (drapeau emoji + code). */
export function countryLabel(country: string | null): string {
  if (!country || !/^[A-Z]{2}$/.test(country)) return country ?? "";
  const flag = String.fromCodePoint(...[...country].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  return `${flag} ${country}`;
}

export function segmentLabel(segment: string): string {
  return SEGMENT_LABEL[segment] ?? segment;
}

export function textColorFor(tone: ChipTone): string {
  return tone === "danger" ? color.dangerInk : tone === "success" ? color.success : tone === "accent" ? color.accentInkOnSoft : color.ink2;
}
