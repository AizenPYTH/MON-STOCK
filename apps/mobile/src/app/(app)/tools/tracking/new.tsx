import { useState } from "react";
import { Linking, Modal, Pressable, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { CameraView, useCameraPermissions } from "expo-camera";
import { CARRIER_LABEL, detectCarriers, TRACKING_NUMBER_ERROR_LABEL, validateTrackingNumber, type CarrierCode } from "@/domain/tools/tracking";
import { FooterActions } from "~/components/calc-screen";
import { AlertBanner, BottomSheet, Button, FilterChip, NightHeader, Screen, TextField, Txt, useToast } from "~/components/ui";
import { useAddParcel, useOrdersForLink } from "~/data/hooks";
import { userMessage } from "~/lib/errors";
import { color, space } from "~/theme/tokens";

const CARRIERS = Object.keys(CARRIER_LABEL) as CarrierCode[];

/**
 * Suivre un colis (maquette v3) : une case N° de suivi, deux grandes touches Coller et Scanner,
 * transporteur détecté automatiquement, bouton « Suivre ». Libellé, transporteur, pays et
 * commande associée restent disponibles dans « Options ».
 */
export default function NewParcelScreen() {
  const add = useAddParcel();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [number, setNumber] = useState("");
  const [carrier, setCarrier] = useState<CarrierCode | null>(null);
  const [carrierManual, setCarrierManual] = useState(false);
  const [label, setLabel] = useState("");
  const [dest, setDest] = useState("");
  const [orderQuery, setOrderQuery] = useState("");
  const [order, setOrder] = useState<{ id: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const orders = useOrdersForLink(orderQuery);
  const validation = number.trim() ? validateTrackingNumber(number) : null;
  const candidates = validation?.ok ? detectCarriers(validation.number) : [];
  const suggested = candidates[0]?.carrier ?? null;
  const effectiveCarrier = carrierManual ? carrier : suggested && candidates[0]?.confidence !== "low" ? suggested : carrier;
  const detectedText = validation?.ok ? (effectiveCarrier ? `${CARRIER_LABEL[effectiveCarrier]} ${carrierManual ? "choisi" : "détecté"}` : "Transporteur détecté au premier suivi") : null;

  async function paste() {
    const text = (await Clipboard.getStringAsync().catch(() => "")).trim();
    if (!text) return toast({ text: "Presse-papiers vide.", tone: "error" });
    setNumber(text.replace(/\s+/g, "").slice(0, 60));
    void Haptics.selectionAsync().catch(() => {});
  }
  async function scan() {
    const p = permission?.granted ? permission : await requestPermission();
    if (!p.granted) {
      if (!p.canAskAgain) toast({ text: "Accès à l'appareil photo refusé : autorisez-le dans les Réglages iOS.", tone: "error" });
      return;
    }
    setScanning(true);
  }

  function submit() {
    setError(null);
    const v = validateTrackingNumber(number);
    if (!v.ok) return setError(TRACKING_NUMBER_ERROR_LABEL[v.error]);
    if (dest && !/^[A-Z]{2}$/.test(dest)) return setError("Pays de destination : code à 2 lettres (ex. FR).");
    add.mutate(
      { trackingNumber: v.number, carrierCode: effectiveCarrier, carrierSource: carrierManual ? "manual" : "auto", label, orderId: order?.id ?? null, destinationCountry: dest || null },
      {
        onSuccess: (r) => {
          toast({ text: r.refresh?.checked ? "Colis ajouté et suivi récupéré." : (r.refresh?.message ?? (r.refreshError ? `Colis ajouté ; suivi indisponible : ${r.refreshError}` : "Colis ajouté.")) });
          router.replace({ pathname: "/tools/tracking/[id]", params: { id: r.id } });
        },
        onError: (e) => setError(/duplicate|23505|unique/i.test(String((e as { message?: string }).message ?? e)) ? "Ce numéro est déjà suivi dans cette organisation." : userMessage(e)),
      },
    );
  }

  const invalid = validation && !validation.ok ? TRACKING_NUMBER_ERROR_LABEL[validation.error] : null;
  return (
    <Screen
      contentGap={space[2] + 2}
      header={<NightHeader back={{ label: "Colis", onPress: () => (router.canGoBack() ? router.back() : router.replace("/tools/tracking")) }} title="Suivre un colis" />}
      footer={<FooterActions secondary={{ label: "Options", onPress: () => setOptions(true), testID: "tracking-options" }} primary={{ label: "Suivre", onPress: submit, disabled: !validation?.ok, loading: add.isPending, testID: "tracking-submit" }} />}
    >
      {error ? <AlertBanner text={error} tone="dark" /> : null}
      <View style={{ minHeight: 76, borderRadius: 14, borderWidth: 2, borderColor: invalid ? color.danger : color.brand, justifyContent: "center", paddingHorizontal: space[4] }}>
        <TextInput
          testID="tracking-number"
          accessibilityLabel="Numéro de suivi"
          value={number}
          onChangeText={(v) => setNumber(v.slice(0, 60))}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="N° de suivi"
          placeholderTextColor={color.ink3}
          returnKeyType="done"
          onSubmitEditing={() => validation?.ok && submit()}
          style={{ fontFamily: "Manrope_800ExtraBold", fontSize: 24, lineHeight: 30, letterSpacing: -0.4, color: color.ink, paddingVertical: space[3] }}
        />
      </View>
      <Txt variant="label" color={invalid ? color.dangerInk : color.success} style={{ textAlign: "center", fontFamily: "Manrope_700Bold", minHeight: 18 }} accessibilityLiveRegion="polite">
        {invalid ?? detectedText ?? ""}
      </Txt>
      <View style={{ flexDirection: "row", gap: space[2] + 2 }}>
        <Pressable testID="tracking-paste" accessibilityRole="button" accessibilityLabel="Coller le numéro" onPress={() => void paste()} style={({ pressed }) => ({ flex: 1, minHeight: 96, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? color.line : color.surfaceSunken, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
          <Txt variant="body" color={color.brand} style={{ fontFamily: "Manrope_800ExtraBold", fontSize: 17 }}>
            Coller
          </Txt>
        </Pressable>
        <Pressable testID="tracking-scan" accessibilityRole="button" accessibilityLabel="Scanner le code-barres" onPress={() => void scan()} style={({ pressed }) => ({ flex: 1, minHeight: 96, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: color.brand, opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
          <Txt variant="body" color={color.inkOnDark} style={{ fontFamily: "Manrope_800ExtraBold", fontSize: 17 }}>
            Scanner
          </Txt>
        </Pressable>
      </View>
      {label || order || dest || carrierManual ? (
        <Txt variant="label" style={{ textAlign: "center" }}>
          {[label && `« ${label} »`, carrierManual && effectiveCarrier && CARRIER_LABEL[effectiveCarrier], dest, order?.label].filter(Boolean).join(" · ")}
        </Txt>
      ) : null}
      <Txt variant="micro" color={color.ink3} style={{ textAlign: "center" }}>
        Seul le numéro de suivi (et le pays) est transmis à l'API de suivi ; aucune donnée client.
      </Txt>

      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          {scanning ? (
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["code128", "code39", "code93", "ean13", "itf14", "datamatrix", "qr", "pdf417"] }}
              onBarcodeScanned={(r) => {
                const raw = r.data.replace(/\s+/g, "").toUpperCase();
                if (!raw) return;
                setScanning(false);
                setNumber(raw.slice(0, 60));
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              }}
            />
          ) : null}
          <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: space[5], paddingBottom: insets.bottom + space[5], gap: space[3], backgroundColor: "rgba(16,28,44,0.85)" }}>
            <Txt variant="body" color={color.inkOnDark} style={{ textAlign: "center" }}>
              Visez le code-barres de l'étiquette
            </Txt>
            <Button label="Annuler" variant="secondary" onPress={() => setScanning(false)} />
            {permission && !permission.granted && !permission.canAskAgain ? <Button label="Ouvrir les Réglages" variant="ghost" onPress={() => void Linking.openSettings()} /> : null}
          </View>
        </View>
      </Modal>

      <BottomSheet visible={options} title="Options" description="Facultatif : nom affiché, transporteur, pays de destination, commande." onClose={() => setOptions(false)}>
        <TextField label="Nom (facultatif)" value={label} onChangeText={(v) => setLabel(v.slice(0, 120))} placeholder="Ex. iPhone 13 · Lyon" />
        <Txt variant="label" color={color.ink}>
          Transporteur : {effectiveCarrier ? CARRIER_LABEL[effectiveCarrier] : "détection automatique"}
        </Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
          <FilterChip
            label="Automatique"
            selected={!carrierManual}
            onPress={() => {
              setCarrierManual(false);
              setCarrier(null);
            }}
          />
          {CARRIERS.map((c) => (
            <FilterChip
              key={c}
              label={CARRIER_LABEL[c]}
              selected={carrierManual && carrier === c}
              onPress={() => {
                setCarrierManual(true);
                setCarrier(c);
              }}
            />
          ))}
        </View>
        <TextField label="Pays de destination (facultatif)" value={dest} onChangeText={(v) => setDest(v.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))} autoCapitalize="characters" placeholder="FR" />
        {order ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
            <Txt variant="body" style={{ flex: 1 }}>
              Commande : {order.label}
            </Txt>
            <Button label="Retirer" variant="ghost" compact onPress={() => setOrder(null)} />
          </View>
        ) : (
          <>
            <TextField label="Commande associée (facultatif)" value={orderQuery} onChangeText={setOrderQuery} placeholder="N° de commande ou acheteur" autoCorrect={false} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
              {(orders.data ?? []).slice(0, 6).map((o) => (
                <FilterChip key={o.id} label={o.label} selected={false} onPress={() => setOrder(o)} />
              ))}
            </View>
          </>
        )}
        <Button label="Terminé" onPress={() => setOptions(false)} />
      </BottomSheet>
    </Screen>
  );
}
