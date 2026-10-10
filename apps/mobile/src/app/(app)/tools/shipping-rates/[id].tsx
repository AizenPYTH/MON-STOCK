import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Plus, Trash2 } from "lucide-react-native";
import { parseBands, parseCountryList, type RateCard } from "@/domain/tools/shipping";
import { AmountField, ChoiceChips, ToolHeader } from "~/components/tools";
import { AlertBanner, BottomSheet, Button, Card, ErrorState, Screen, SectionHeader, SkeletonList, StickyActions, TextField, Txt, useToast } from "~/components/ui";
import { useDeleteRateCard, useRateCards, useSaveRateCard } from "~/data/hooks";
import { userMessage } from "~/lib/errors";
import { useActiveOrg } from "~/org/org-provider";
import { color, radius, space } from "~/theme/tokens";

const t = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));
const today = () => new Date().toISOString().slice(0, 10);

/** Création / modification d'une grille tarifaire. */
export default function RateCardEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const cards = useRateCards();
  if (id !== "new" && cards.isPending)
    return (
      <Screen scroll={false}>
        <ToolHeader title="Grille tarifaire" />
        <SkeletonList rows={4} thumb={false} />
      </Screen>
    );
  if (id !== "new" && cards.isError)
    return (
      <Screen scroll={false}>
        <ToolHeader title="Grille tarifaire" />
        <ErrorState description={userMessage(cards.error)} onRetry={() => void cards.refetch()} />
      </Screen>
    );
  const card = id === "new" ? null : (cards.data?.find((c) => c.id === id) ?? null);
  if (id !== "new" && !card)
    return (
      <Screen scroll={false}>
        <ToolHeader title="Grille tarifaire" />
        <ErrorState title="Grille introuvable" description="Elle a peut-être été supprimée." onRetry={() => router.back()} />
      </Screen>
    );
  return <RateCardForm key={id} card={card} />;
}

function RateCardForm({ card }: { card: RateCard | null }) {
  const save = useSaveRateCard();
  const del = useDeleteRateCard();
  const toast = useToast();
  const { permissions } = useActiveOrg();
  const readOnly = !permissions.canWrite;
  const [carrier, setCarrier] = useState(card?.carrier ?? "");
  const [service, setService] = useState(card?.service ?? "");
  const [fromText, setFromText] = useState(card?.fromCountries.join(", ") ?? "FR");
  const [toText, setToText] = useState(card?.toCountries.join(", ") ?? "FR");
  const [bands, setBands] = useState<{ maxWeightKg: string; price: string }[]>(card?.bands.map((b) => ({ maxWeightKg: t(b.maxWeightKg), price: b.price.replace(".", ",") })) ?? [{ maxWeightKg: "", price: "" }]);
  const [currency, setCurrency] = useState(card?.currency ?? "EUR");
  const [maxLength, setMaxLength] = useState(t(card?.maxLengthCm ?? null));
  const [maxSum, setMaxSum] = useState(t(card?.maxDimensionsSumCm ?? null));
  const [divisor, setDivisor] = useState(card?.volumetricDivisor ? String(card.volumetricDivisor) : "");
  const [dMin, setDMin] = useState(card?.transitDaysMin === null || card?.transitDaysMin === undefined ? "" : String(card.transitDaysMin));
  const [dMax, setDMax] = useState(card?.transitDaysMax === null || card?.transitDaysMax === undefined ? "" : String(card.transitDaysMax));
  const [tracking, setTracking] = useState<boolean | null>(card?.tracking ?? null);
  const [deliveryMode, setDeliveryMode] = useState(card?.deliveryMode ?? "");
  const [notes, setNotes] = useState(card?.notes ?? "");
  const [verifiedToday, setVerifiedToday] = useState(card === null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const intOrNull = (s: string, min: number, max: number, label: string): number | null | "invalid" => {
    if (s.trim() === "") return null;
    const n = Number(s.replace(",", "."));
    if (!Number.isFinite(n) || n < min || n > max) {
      setError(`${label} : valeur entre ${min} et ${max}.`);
      return "invalid";
    }
    return n;
  };

  function submit() {
    setError(null);
    if (!carrier.trim()) return setError("Indiquez le transporteur.");
    const from = parseCountryList(fromText);
    const to = parseCountryList(toText);
    if (from.invalid.length || to.invalid.length) return setError(`Codes pays invalides : ${[...from.invalid, ...to.invalid].join(", ")} (2 lettres, ex. FR, BE).`);
    const b = parseBands(bands);
    if (b.errors.length) return setError(b.errors[0]!);
    const ml = intOrNull(maxLength, 1, 600, "Plus grand côté");
    const ms = intOrNull(maxSum, 1, 1000, "Somme des dimensions");
    const dv = intOrNull(divisor, 1000, 10000, "Diviseur volumétrique");
    const mn = intOrNull(dMin, 0, 90, "Délai minimal");
    const mx = intOrNull(dMax, 0, 90, "Délai maximal");
    if ([ml, ms, dv, mn, mx].includes("invalid")) return;
    if (typeof mn === "number" && typeof mx === "number" && mn > mx) return setError("Le délai minimal dépasse le délai maximal.");
    if (!/^[A-Z]{3}$/.test(currency)) return setError("Devise : code ISO à 3 lettres (ex. EUR).");
    save.mutate(
      {
        id: card?.id ?? null,
        input: {
          carrier,
          service,
          fromCountries: from.countries,
          toCountries: to.countries,
          bands: b.bands,
          currency,
          maxLengthCm: ml as number | null,
          maxDimensionsSumCm: ms as number | null,
          volumetricDivisor: dv as number | null,
          transitDaysMin: mn as number | null,
          transitDaysMax: mx as number | null,
          tracking,
          deliveryMode,
          notes,
          verifiedAt: verifiedToday ? today() : (card?.verifiedAt ?? null),
        },
      },
      {
        onSuccess: () => {
          toast({ text: "Grille enregistrée." });
          router.back();
        },
        onError: (e) => setError(userMessage(e)),
      },
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen footer={readOnly ? undefined : <StickyActions><Button label="Enregistrer" loading={save.isPending} onPress={submit} style={{ flex: 1 }} /></StickyActions>}>
        <ToolHeader title={card ? "Modifier la grille" : "Nouvelle grille"} description="Saisissez vos tarifs réels (contrat ou grille publique du transporteur)." />
        {error ? <AlertBanner text={error} tone="dark" /> : null}
        <Card padded style={{ gap: space[3] }}>
          <TextField label="Transporteur" value={carrier} onChangeText={setCarrier} placeholder="Ex. Colissimo" editable={!readOnly} maxLength={80} />
          <TextField label="Service" value={service} onChangeText={setService} placeholder="Ex. Domicile sans signature" editable={!readOnly} maxLength={80} />
          <TextField label="Pays de départ (codes ISO)" value={fromText} onChangeText={setFromText} placeholder="FR — vide = tous" autoCapitalize="characters" editable={!readOnly} />
          <TextField label="Pays de destination (codes ISO)" value={toText} onChangeText={setToText} placeholder="FR, BE — vide = tous" autoCapitalize="characters" editable={!readOnly} />
          <TextField label="Devise" value={currency} onChangeText={(v) => setCurrency(v.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))} autoCapitalize="characters" editable={!readOnly} />
        </Card>
        <SectionHeader title="Tranches de poids" />
        <Card padded style={{ gap: space[3] }}>
          {bands.map((b, i) => (
            <View key={i} style={{ flexDirection: "row", gap: space[2], alignItems: "flex-end" }}>
              <View style={{ flex: 1 }}>
                <AmountField label={`Jusqu'à (kg)`} value={b.maxWeightKg} onChangeText={(v) => setBands((bs) => bs.map((x, j) => (j === i ? { ...x, maxWeightKg: v } : x)))} placeholder="1" />
              </View>
              <View style={{ flex: 1 }}>
                <AmountField label="Prix" value={b.price} onChangeText={(v) => setBands((bs) => bs.map((x, j) => (j === i ? { ...x, price: v } : x)))} suffix={currency} />
              </View>
              {bands.length > 1 && !readOnly ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`Supprimer la tranche ${i + 1}`} onPress={() => setBands((bs) => bs.filter((_, j) => j !== i))} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: color.lineSoft }}>
                  <Trash2 size={18} color={color.ink2} />
                </Pressable>
              ) : null}
            </View>
          ))}
          {!readOnly && bands.length < 40 ? (
            <Pressable accessibilityRole="button" onPress={() => setBands((bs) => [...bs, { maxWeightKg: "", price: "" }])} style={{ flexDirection: "row", gap: space[2], alignItems: "center", minHeight: 44 }}>
              <Plus size={18} color={color.ink} />
              <Txt variant="body">Ajouter une tranche</Txt>
            </Pressable>
          ) : null}
        </Card>
        <SectionHeader title="Limites et service" />
        <Card padded style={{ gap: space[3] }}>
          <View style={{ flexDirection: "row", gap: space[2] }}>
            <View style={{ flex: 1 }}>
              <AmountField label="Plus grand côté max" value={maxLength} onChangeText={setMaxLength} suffix="cm" placeholder="—" />
            </View>
            <View style={{ flex: 1 }}>
              <AmountField label="L + l + h max" value={maxSum} onChangeText={setMaxSum} suffix="cm" placeholder="—" />
            </View>
          </View>
          <AmountField label="Diviseur du poids volumétrique" value={divisor} onChangeText={setDivisor} placeholder="Ex. 5000 (vide = poids réel seul)" hint="L × l × h (cm) ÷ diviseur = poids volumétrique (kg), si votre transporteur l'applique." />
          <View style={{ flexDirection: "row", gap: space[2] }}>
            <View style={{ flex: 1 }}>
              <AmountField label="Délai min" value={dMin} onChangeText={setDMin} suffix="j" placeholder="—" />
            </View>
            <View style={{ flex: 1 }}>
              <AmountField label="Délai max" value={dMax} onChangeText={setDMax} suffix="j" placeholder="—" />
            </View>
          </View>
          <ChoiceChips
            label="Suivi inclus"
            options={[
              { value: true, label: "Oui" },
              { value: false, label: "Non" },
              { value: null, label: "Non précisé" },
            ]}
            value={tracking}
            onChange={setTracking}
          />
          <TextField label="Mode de remise / livraison" value={deliveryMode} onChangeText={setDeliveryMode} placeholder="Ex. dépôt bureau de poste, livraison domicile" editable={!readOnly} maxLength={80} />
          <TextField label="Restrictions / remarques" value={notes} onChangeText={setNotes} placeholder="Ex. pas de batteries lithium seules" editable={!readOnly} maxLength={300} multiline />
          <ChoiceChips
            label="Tarifs vérifiés"
            options={[
              { value: true, label: "Aujourd'hui" },
              { value: false, label: card?.verifiedAt ? `Le ${card.verifiedAt.split("-").reverse().join("/")}` : "Date inconnue" },
            ]}
            value={verifiedToday}
            onChange={setVerifiedToday}
          />
        </Card>
        {card && !readOnly ? <Button label="Supprimer la grille" variant="ghost" onPress={() => setConfirmDelete(true)} /> : null}
        <BottomSheet visible={confirmDelete} title="Supprimer cette grille ?" description="Les tarifs saisis seront définitivement supprimés." onClose={() => setConfirmDelete(false)}>
          <Button
            label="Supprimer"
            loading={del.isPending}
            onPress={() =>
              card &&
              del.mutate(card.id, {
                onSuccess: () => {
                  setConfirmDelete(false);
                  router.back();
                },
                onError: (e) => setError(userMessage(e)),
              })
            }
          />
          <Button label="Annuler" variant="ghost" onPress={() => setConfirmDelete(false)} />
        </BottomSheet>
      </Screen>
    </KeyboardAvoidingView>
  );
}
