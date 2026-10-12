import { useRef, useState } from "react";
import { Linking, Modal, Pressable, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { CameraView, useCameraPermissions } from "expo-camera";
import { canonicalTrackingNumber, CARRIER_LABEL, detectCarriers, extractTrackingFromScan, TRACKING_NUMBER_ERROR_LABEL, validateTrackingNumber, type CarrierCode, type ScannedTracking } from "@/domain/tools/tracking";
import { FooterActions } from "~/components/calc-screen";
import { AlertBanner, BottomSheet, Button, FilterChip, NightHeader, Screen, TextField, Txt, useToast } from "~/components/ui";
import { useAddParcel, useOrdersForLink } from "~/data/hooks";
import { userMessage } from "~/lib/errors";
import { color, space } from "~/theme/tokens";

const CARRIERS = Object.keys(CARRIER_LABEL) as CarrierCode[];

type Queued = Pick<ScannedTracking, "number" | "carrier">;

const SCAN_TYPES = ["code128", "code39", "code93", "ean13", "itf14", "codabar", "datamatrix", "aztec", "qr", "pdf417"] as const;

const queuedText = (q: Queued) => `${q.number}${q.carrier ? ` · ${CARRIER_LABEL[q.carrier]}` : ""}`;

/**
 * Suivre un colis (maquette v3) : une case N° de suivi, deux grandes touches Coller et Scanner,
 * transporteur détecté automatiquement, bouton « Suivre ». Libellé, transporteur, pays et
 * commande associée restent disponibles dans « Options ».
 * Scan en série (gros volume) : après chaque code lu, « Scanner un autre » ou « Suivre (n) » ;
 * le numéro est extrait du code-barres (étiquettes La Poste / Colissimo enrichies « % » comprises).
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
  const [queue, setQueue] = useState<Queued[]>([]);
  const [pending, setPending] = useState<Queued | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const lastRaw = useRef<{ raw: string; at: number } | null>(null);
  const orders = useOrdersForLink(orderQuery);
  const validation = number.trim() ? validateTrackingNumber(number) : null;
  const candidates = validation?.ok ? detectCarriers(validation.number) : [];
  const suggested = candidates[0]?.carrier ?? null;
  const effectiveCarrier = carrierManual ? carrier : suggested && candidates[0]?.confidence !== "low" ? suggested : carrier;
  const detectedText = validation?.ok ? (effectiveCarrier ? `${CARRIER_LABEL[effectiveCarrier]} ${carrierManual ? "choisi" : "détecté"}` : "Transporteur détecté au premier suivi") : null;

  async function paste() {
    const text = (await Clipboard.getStringAsync().catch(() => "")).trim();
    if (!text) return toast({ text: "Presse-papiers vide.", tone: "error" });
    setNumber((extractTrackingFromScan(text)?.number ?? text.replace(/\s+/g, "")).slice(0, 60));
    void Haptics.selectionAsync().catch(() => {});
  }
  async function scan() {
    const p = permission?.granted ? permission : await requestPermission();
    if (!p.granted) {
      if (!p.canAskAgain) toast({ text: "Accès à l'appareil photo refusé : autorisez-le dans les Réglages iOS.", tone: "error" });
      return;
    }
    setPending(null);
    setScanNote(null);
    setScanning(true);
  }

  function onScanned(raw: string) {
    const now = Date.now();
    if (lastRaw.current && lastRaw.current.raw === raw && now - lastRaw.current.at < 2500) return;
    lastRaw.current = { raw, at: now };
    const found = extractTrackingFromScan(raw);
    if (!found) {
      setScanNote("Code non reconnu comme numéro de suivi : visez le code-barres du suivi.");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    if (queue.some((q) => q.number === found.number)) {
      setScanNote(`${found.number} : déjà scanné.`);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    setScanNote(null);
    setPending({ number: found.number, carrier: found.carrier });
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }
  function scanAnother() {
    if (pending) setQueue((q) => [...q, pending]);
    setPending(null);
    lastRaw.current = null;
  }
  function closeScanner() {
    if (pending) setQueue((q) => [...q, pending]);
    setPending(null);
    setScanning(false);
  }

  /** Ajout en série : chaque numéro est ajouté puis suivi ; les doublons sont signalés, pas bloquants. */
  async function submitBatch(items: Queued[]) {
    setBatchBusy(true);
    let added = 0;
    let duplicates = 0;
    const failed: string[] = [];
    for (const it of items) {
      try {
        await add.mutateAsync({ trackingNumber: it.number, carrierCode: it.carrier, carrierSource: "auto", label: "", orderId: null, destinationCountry: null });
        added++;
      } catch (e) {
        if (/duplicate|23505|unique/i.test(String((e as { message?: string }).message ?? e))) duplicates++;
        else failed.push(it.number);
      }
    }
    setBatchBusy(false);
    setQueue(failed.map((n) => items.find((i) => i.number === n)!));
    const parts = [`${added} colis ajouté${added > 1 ? "s" : ""}`, duplicates ? `${duplicates} déjà suivi${duplicates > 1 ? "s" : ""}` : null, failed.length ? `${failed.length} en échec (gardé${failed.length > 1 ? "s" : ""} dans la liste)` : null].filter(Boolean);
    toast({ text: parts.join(" · "), tone: failed.length ? "error" : "success" });
    if (!failed.length) router.replace("/tools/tracking");
  }

  function submit() {
    setError(null);
    if (queue.length > 0) {
      const typed = validation?.ok ? canonicalTrackingNumber(validation.number) : null;
      const items = typed && !queue.some((q) => q.number === typed) ? [...queue, { number: typed, carrier: effectiveCarrier }] : queue;
      void submitBatch(items);
      return;
    }
    const v = validateTrackingNumber(number);
    if (!v.ok) return setError(TRACKING_NUMBER_ERROR_LABEL[v.error]);
    const trackingNumber = canonicalTrackingNumber(v.number);
    if (dest && !/^[A-Z]{2}$/.test(dest)) return setError("Pays de destination : code à 2 lettres (ex. FR).");
    add.mutate(
      { trackingNumber, carrierCode: effectiveCarrier, carrierSource: carrierManual ? "manual" : "auto", label, orderId: order?.id ?? null, destinationCountry: dest || null },
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
      footer={<FooterActions secondary={{ label: "Options", onPress: () => setOptions(true), testID: "tracking-options" }} primary={{ label: queue.length ? `Suivre ${queue.length + (validation?.ok && !queue.some((q) => q.number === canonicalTrackingNumber(validation.number)) ? 1 : 0)} colis` : "Suivre", onPress: submit, disabled: !validation?.ok && queue.length === 0, loading: add.isPending || batchBusy, testID: "tracking-submit" }} />}
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
      {queue.length ? (
        <View style={{ backgroundColor: color.bg, borderRadius: 16, overflow: "hidden" }} testID="tracking-queue">
          <Txt variant="label" style={{ paddingHorizontal: space[4], paddingTop: space[3] }}>
            {queue.length} colis prêt{queue.length > 1 ? "s" : ""} à suivre
          </Txt>
          {queue.map((q, i) => (
            <View key={q.number} style={{ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 52, paddingHorizontal: space[4], borderBottomWidth: i === queue.length - 1 ? 0 : 2, borderBottomColor: color.surface }}>
              <Txt variant="body" numberOfLines={1} style={{ flex: 1, fontFamily: "Manrope_700Bold" }}>
                {queuedText(q)}
              </Txt>
              <Pressable accessibilityRole="button" accessibilityLabel={`Retirer ${q.number}`} hitSlop={8} onPress={() => setQueue((all) => all.filter((x) => x.number !== q.number))} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}>
                <Txt variant="body" color={color.ink3}>
                  ✕
                </Txt>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      {label || order || dest || carrierManual ? (
        <Txt variant="label" style={{ textAlign: "center" }}>
          {[label && `« ${label} »`, carrierManual && effectiveCarrier && CARRIER_LABEL[effectiveCarrier], dest, order?.label].filter(Boolean).join(" · ")}
        </Txt>
      ) : null}
      <Txt variant="micro" color={color.ink3} style={{ textAlign: "center" }}>
        Seul le numéro de suivi (et le pays) est transmis à l'API de suivi ; aucune donnée client.
      </Txt>

      <Modal visible={scanning} animationType="slide" onRequestClose={closeScanner}>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          {scanning ? (
            <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: [...SCAN_TYPES] }} onBarcodeScanned={pending ? undefined : (r) => onScanned(r.data)} />
          ) : null}
          <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: space[5], paddingBottom: insets.bottom + space[5], gap: space[3], backgroundColor: "rgba(16,28,44,0.92)" }}>
            {pending ? (
              <>
                <Txt variant="label" color={color.mint} style={{ textAlign: "center", fontFamily: "Manrope_800ExtraBold" }} accessibilityLiveRegion="polite">
                  ✓ Colis lu{queue.length ? ` · ${queue.length + 1} au total` : ""}
                </Txt>
                <Txt variant="title2" color={color.inkOnDark} style={{ textAlign: "center" }} testID="scan-pending">
                  {queuedText(pending)}
                </Txt>
                <View style={{ flexDirection: "row", gap: space[2] + 2 }}>
                  <Pressable testID="scan-another" accessibilityRole="button" onPress={scanAnother} style={({ pressed }) => ({ flex: 1, minHeight: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: color.nightRaised, opacity: pressed ? 0.8 : 1 })}>
                    <Txt variant="body" color={color.inkOnDark} style={{ fontFamily: "Manrope_800ExtraBold" }}>
                      Scanner un autre
                    </Txt>
                  </Pressable>
                  <Pressable
                    testID="scan-follow"
                    accessibilityRole="button"
                    onPress={() => {
                      const items = [...queue, pending];
                      setPending(null);
                      setScanning(false);
                      setQueue(items);
                      void submitBatch(items);
                    }}
                    style={({ pressed }) => ({ flex: 1, minHeight: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? color.mintPressed : color.mint })}
                  >
                    <Txt variant="body" color={color.onMint} style={{ fontFamily: "Manrope_800ExtraBold" }}>
                      Suivre {queue.length + 1 > 1 ? `${queue.length + 1} colis` : "ce colis"}
                    </Txt>
                  </Pressable>
                </View>
                <Button label="Terminer sans suivre (garder la liste)" variant="ghost" onPress={closeScanner} />
              </>
            ) : (
              <>
                <Txt variant="body" color={color.inkOnDark} style={{ textAlign: "center" }}>
                  {queue.length ? `${queue.length} colis scanné${queue.length > 1 ? "s" : ""} · visez le suivant` : "Visez le code-barres de l'étiquette"}
                </Txt>
                {scanNote ? (
                  <Txt variant="label" color={color.accent} style={{ textAlign: "center" }} accessibilityLiveRegion="polite">
                    {scanNote}
                  </Txt>
                ) : null}
                <Button label={queue.length ? "Terminer" : "Annuler"} variant="secondary" onPress={closeScanner} />
                {permission && !permission.granted && !permission.canAskAgain ? <Button label="Ouvrir les Réglages" variant="ghost" onPress={() => void Linking.openSettings()} /> : null}
              </>
            )}
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
