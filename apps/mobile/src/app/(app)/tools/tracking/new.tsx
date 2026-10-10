import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { router } from "expo-router";
import { CARRIER_LABEL, detectCarriers, TRACKING_NUMBER_ERROR_LABEL, validateTrackingNumber, type CarrierCode } from "@/domain/tools/tracking";
import { ToolHeader } from "~/components/tools";
import { AlertBanner, Button, Card, FilterChip, Screen, SectionHeader, TextField, Txt, useToast } from "~/components/ui";
import { useAddParcel, useOrdersForLink } from "~/data/hooks";
import { userMessage } from "~/lib/errors";
import { space } from "~/theme/tokens";

const CARRIERS = Object.keys(CARRIER_LABEL) as CarrierCode[];

/** Ajout d'un colis : numéro, transporteur détecté ou choisi, commande associée (facultatif). */
export default function NewParcelScreen() {
  const add = useAddParcel();
  const toast = useToast();
  const [number, setNumber] = useState("");
  const [carrier, setCarrier] = useState<CarrierCode | null>(null);
  const [carrierManual, setCarrierManual] = useState(false);
  const [label, setLabel] = useState("");
  const [dest, setDest] = useState("");
  const [orderQuery, setOrderQuery] = useState("");
  const [order, setOrder] = useState<{ id: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const orders = useOrdersForLink(orderQuery);
  const validation = number.trim() ? validateTrackingNumber(number) : null;
  const candidates = validation?.ok ? detectCarriers(validation.number) : [];
  const suggested = candidates[0]?.carrier ?? null;
  const effectiveCarrier = carrierManual ? carrier : (suggested && candidates[0]?.confidence !== "low" ? suggested : carrier);

  function submit() {
    setError(null);
    const v = validateTrackingNumber(number);
    if (!v.ok) return setError(TRACKING_NUMBER_ERROR_LABEL[v.error]);
    if (dest && !/^[A-Z]{2}$/.test(dest)) return setError("Pays de destination : code à 2 lettres (ex. FR).");
    add.mutate(
      { trackingNumber: v.number, carrierCode: effectiveCarrier, carrierSource: carrierManual ? "manual" : "auto", label, orderId: order?.id ?? null, destinationCountry: dest || null },
      {
        onSuccess: (r) => {
          toast({ text: r.refresh?.checked ? "Colis ajouté et suivi récupéré." : r.refresh?.message ?? (r.refreshError ? `Colis ajouté ; suivi indisponible : ${r.refreshError}` : "Colis ajouté.") });
          router.replace({ pathname: "/tools/tracking/[id]", params: { id: r.id } });
        },
        onError: (e) => setError(/duplicate|23505|unique/i.test(String((e as { message?: string }).message ?? e)) ? "Ce numéro est déjà suivi dans cette organisation." : userMessage(e)),
      },
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <ToolHeader title="Suivre un colis" />
        {error ? <AlertBanner text={error} tone="dark" /> : null}
        <Card padded style={{ gap: space[3] }}>
          <TextField
            testID="tracking-number"
            label="Numéro de suivi"
            value={number}
            onChangeText={(v) => setNumber(v.slice(0, 60))}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="Ex. 6A18987970674"
            error={validation && !validation.ok ? TRACKING_NUMBER_ERROR_LABEL[validation.error] : undefined}
          />
          {validation?.ok ? (
            candidates.length ? (
              <View style={{ gap: 4 }}>
                {candidates.slice(0, 3).map((c) => (
                  <Txt key={c.carrier + c.reason} variant="label">
                    {c.confidence === "high" ? "Détecté" : c.confidence === "medium" ? "Probable" : "Possible"} : {CARRIER_LABEL[c.carrier]} — {c.reason}
                  </Txt>
                ))}
              </View>
            ) : (
              <Txt variant="label">Format non reconnu : choisissez le transporteur, ou laissez l'API de suivi le détecter.</Txt>
            )
          ) : null}
          <TextField label="Libellé (facultatif)" value={label} onChangeText={(v) => setLabel(v.slice(0, 120))} placeholder="Ex. iPhone 13 — commande eBay" />
          <TextField label="Pays de destination (facultatif)" value={dest} onChangeText={(v) => setDest(v.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))} autoCapitalize="characters" placeholder="FR" hint="Aide l'API à identifier le transporteur à l'international." />
        </Card>
        <SectionHeader title={`Transporteur : ${effectiveCarrier ? CARRIER_LABEL[effectiveCarrier] : "détection par l'API"}`} />
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
        <SectionHeader title="Commande associée (facultatif)" />
        <Card padded style={{ gap: space[2] }}>
          {order ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
              <Txt variant="body" style={{ flex: 1 }}>
                {order.label}
              </Txt>
              <Button label="Retirer" variant="ghost" compact onPress={() => setOrder(null)} />
            </View>
          ) : (
            <>
              <TextField label="Rechercher une commande" value={orderQuery} onChangeText={setOrderQuery} placeholder="N° de commande ou acheteur" autoCorrect={false} />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
                {(orders.data ?? []).slice(0, 8).map((o) => (
                  <FilterChip key={o.id} label={o.label} selected={false} onPress={() => setOrder(o)} />
                ))}
              </View>
              {orders.data && orders.data.length === 0 ? <Txt variant="label">Aucune commande trouvée.</Txt> : null}
            </>
          )}
        </Card>
        <Button testID="tracking-submit" label="Suivre ce colis" loading={add.isPending} onPress={submit} disabled={!validation?.ok} />
        <Txt variant="label">Seul le numéro de suivi (et le pays de destination) est transmis à l'API de suivi ; aucune donnée client.</Txt>
      </Screen>
    </KeyboardAvoidingView>
  );
}
