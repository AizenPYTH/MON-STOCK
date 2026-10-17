import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
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
import { BottomSheet, Button, Pop, StatusChip, TextField, Timeline, Txt, useToast, type ChipTone } from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";

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

// Mouvement partagé (une seule lecture de « Réduire les animations » pour toute l'application).
export { FadeIn, useReduceMotion } from "~/components/ui/motion";

/** Étoile des favoris : retour visuel immédiat (léger rebond) et haptique. */
export function FavoriteButton({ active, onPress, name, onDark = false }: { active: boolean; onPress: () => void; name: string; onDark?: boolean }) {
  const toast = useToast();
  const short = name.replace(/\s*\(.*\)\s*$/, "");
  const press = () => {
    onPress();
    void Haptics.selectionAsync().catch(() => {});
    toast({ text: active ? `${short} retiré des favoris.` : `${short} ajouté aux favoris de cet appareil.` });
  };
  return (
    <Pressable
      onPress={press}
      hitSlop={onDark ? 4 : 10}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={active ? `Retirer ${name} des favoris` : `Ajouter ${name} aux favoris`}
      testID={`favorite-${name}`}
      style={onDark ? ({ pressed }) => ({ width: 36, height: 36, margin: 4, borderRadius: radius.lg, backgroundColor: pressed ? color.surfaceDeep : color.nightRaised, alignItems: "center", justifyContent: "center" }) : { width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
    >
      <Pop trigger={active}>
        <Star size={onDark ? 18 : 20} color={active ? color.accent : onDark ? color.inkOnDark : color.ink3} fill={active ? color.accent : "transparent"} strokeWidth={2} />
      </Pop>
    </Pressable>
  );
}

/** Feuille de connexion API : les identifiants partent au serveur (chiffrés), jamais conservés sur l'appareil. */
export function ConnectApiSheet({ entry, onClose }: { entry: Pick<DirectoryEntryDTO, "key" | "name" | "connector">; onClose: () => void }) {
  const toast = useToast();
  const connect = useConnectProAccount();
  const fields = entry.connector?.fields ?? [];
  const [values, setValues] = useState<Record<string, string>>({});
  // résultat RENVOYÉ PAR LE SERVEUR après son test réel chez le fournisseur (jamais supposé)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const complete = fields.length > 0 && fields.every((f) => (values[f.name] ?? "").trim().length > 0);
  const step = result?.ok ? 3 : connect.isPending ? 2 : 1;
  const submit = () => {
    setResult(null);
    connect.mutate(
      { key: entry.key, credentials: values },
      {
        onSuccess: (r) => {
          void Haptics.notificationAsync(r.ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
          setResult({ ok: r.ok, message: r.message });
          if (r.ok) {
            setValues({});
            toast({ text: r.message });
          }
        },
        onError: (e) => setResult({ ok: false, message: userMessage(e) }),
      },
    );
  };
  return (
    <BottomSheet visible title={`Configurer l'API ${entry.name}`} description="Vos identifiants partent uniquement vers le serveur MON STOCK, qui les chiffre et les teste auprès du fournisseur. Ils ne sont ni conservés sur ce téléphone ni réaffichés." onClose={onClose}>
      <View style={{ gap: space[3] }}>
        <Timeline
          steps={[
            { label: "Identifiants de VOTRE compte", state: step > 1 ? "done" : "current" },
            { label: "Test par le serveur MON STOCK", state: step > 2 ? "done" : step === 2 ? "current" : "todo", meta: step === 2 ? "en cours…" : undefined },
            { label: "Première synchronisation des prix", state: step === 3 ? "current" : "todo", meta: step === 3 ? "lancée par le serveur" : undefined },
          ]}
        />
        {step === 3 && result ? (
          <View style={{ padding: space[3], borderRadius: radius.md, backgroundColor: color.successSoft }} accessibilityRole="alert">
            <Txt variant="body" color={color.success}>
              Connexion vérifiée par le serveur
            </Txt>
            <Txt variant="label" color={color.success}>
              {result.message}
            </Txt>
          </View>
        ) : (
          <>
            {fields.map((f) => (
              <TextField
                key={f.name}
                label={`${f.label} · obligatoire`}
                value={values[f.name] ?? ""}
                onChangeText={(v) => setValues((cur) => ({ ...cur, [f.name]: v }))}
                placeholder={f.placeholder ?? undefined}
                secureTextEntry={f.secret}
                autoCapitalize="none"
                autoCorrect={false}
                hint={f.secret ? "Masqué à la saisie ; jamais réaffiché ni écrit dans les journaux." : undefined}
                testID={`pro-field-${f.name}`}
              />
            ))}
            {result && !result.ok ? (
              <View style={{ padding: space[3], borderRadius: radius.md, backgroundColor: color.dangerSoft }} accessibilityRole="alert">
                <Txt variant="body" color={color.dangerInk}>
                  Le fournisseur a refusé la connexion
                </Txt>
                <Txt variant="label" color={color.dangerInk}>
                  {result.message} Vérifiez les identifiants puis réessayez.
                </Txt>
              </View>
            ) : (
              <Txt variant="label">Après la connexion : vos prix et stocks de ce compte arrivent dans la recherche et l'analyse des bonnes affaires.</Txt>
            )}
          </>
        )}
        {step === 3 ? (
          <Button label="Terminé" onPress={onClose} testID="pro-connect-done" />
        ) : (
          <Button label={result && !result.ok ? "Réessayer" : "Connecter et tester"} disabled={!complete} loading={connect.isPending} onPress={submit} testID="pro-connect-submit" />
        )}
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

/** Méthodes d'accès ; « Compte pro à ouvrir » disparaît dès que vous êtes connecté (le compte existe). */
export function MethodChips({ methods, max = 3, connected = false, showPro = true }: { methods: DirectoryEntryDTO["registry"]["accessMethods"]; max?: number; connected?: boolean; showPro?: boolean }) {
  const shown = methods.filter((m) => m !== "pro_account_first").slice(0, max);
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {shown.map((m) => (
        <StatusChip key={m} label={ACCESS_METHOD_LABEL[m]} tone={m === "official_api" || m === "public_integrated" ? "dark" : m === "not_automatable" ? "danger" : "neutral"} />
      ))}
      {methods.includes("pro_account_first") && !connected && showPro ? <StatusChip label={ACCESS_METHOD_LABEL.pro_account_first} tone="accent" /> : null}
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
