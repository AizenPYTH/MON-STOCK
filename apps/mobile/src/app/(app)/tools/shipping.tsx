import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { formatDec } from "@/domain/tools/decimal";
import { PORT_DEFAULT_CARRIERS, PORT_WEIGHTS, portRows, setBandPrice, toEntry } from "@/domain/tools/quick-calc";
import type { RateCard } from "@/domain/tools/shipping";
import { HeaderAction, showEntry } from "~/components/calc-screen";
import { applyKey, ErrorState, Keypad, NightHeader, Screen, SkeletonList, Txt, useToast, ValueField, type KeypadKey } from "~/components/ui";
import { useRateCards, useSaveRateCard } from "~/data/hooks";
import type { RateCardInput } from "~/data/shipping";
import { userMessage } from "~/lib/errors";
import { useLayout } from "~/theme/layout";
import { color, space } from "~/theme/tokens";

const today = () => new Date().toISOString().slice(0, 10);

function inputOf(card: RateCard, bands: RateCard["bands"]): RateCardInput {
  return { carrier: card.carrier, service: card.service, fromCountries: card.fromCountries, toCountries: card.toCountries, bands, currency: card.currency, maxLengthCm: card.maxLengthCm, maxDimensionsSumCm: card.maxDimensionsSumCm, volumetricDivisor: card.volumetricDivisor, transitDaysMin: card.transitDaysMin, transitDaysMax: card.transitDaysMax, tracking: card.tracking, deliveryMode: card.deliveryMode, notes: card.notes, verifiedAt: today() };
}

/**
 * Port (maquette v3 « version simple ») : onglets de poids, une case par transporteur avec VOTRE
 * prix (grilles enregistrées), le moins cher marqué. Toucher un prix permet de le modifier au
 * clavier ; « OK » l'enregistre dans la grille. Aucun tarif inventé : sans prix, « — ».
 * Devis réels des plateformes connectées (Sendcloud…) : bouton « Devis ».
 */
export default function PortToolScreen() {
  const cards = useRateCards();
  const save = useSaveRateCard();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { compact, screenX } = useLayout();
  const [tab, setTab] = useState(String(PORT_WEIGHTS[1]!.kg));
  const [active, setActive] = useState<string | null>(null);
  const [entry, setEntry] = useState("");
  const weight = Number(tab);

  const header = (
    <NightHeader
      back={{ label: "Outils", onPress: () => (router.canGoBack() ? router.back() : router.replace("/tools")) }}
      right={
        <>
          <Txt variant="body" color={color.inkOnDarkMuted} accessibilityRole="header" style={{ fontFamily: "Manrope_800ExtraBold" }}>
            Port
          </Txt>
          <HeaderAction label="Devis" href="/tools/shipping-quotes" testID="port-quotes" />
        </>
      }
      tabs={{ value: tab, onChange: (v) => {
          setTab(v);
          setActive(null);
          setEntry("");
        }, size: "lg", options: PORT_WEIGHTS.map((w) => ({ value: String(w.kg), label: w.label, a11y: `colis de ${w.label}` })) }}
    />
  );
  if (cards.isPending)
    return (
      <Screen scroll={false} header={header}>
        <SkeletonList rows={3} thumb={false} />
      </Screen>
    );
  if (cards.isError)
    return (
      <Screen scroll={false} header={header}>
        <ErrorState description={`Grilles indisponibles : ${userMessage(cards.error)}`} onRetry={() => void cards.refetch()} />
      </Screen>
    );

  const list = cards.data;
  const rows = list.length ? portRows(list, weight) : PORT_DEFAULT_CARRIERS.map((c) => ({ id: `new:${c}`, label: c, price: null, cheapest: false }));

  function focus(id: string) {
    if (id === active) return;
    const row = rows.find((r) => r.id === id);
    setActive(id);
    setEntry(toEntry(row?.price ?? null));
  }
  function onKey(k: KeypadKey) {
    if (!active) return;
    setEntry((e) => applyKey(e, k));
  }
  function commit() {
    if (!active) return;
    const id = active;
    const card = list.find((c) => c.id === id);
    const carrier = id.startsWith("new:") ? id.slice(4) : null;
    const input: RateCardInput | null = card
      ? inputOf(card, setBandPrice(card.bands, weight, entry))
      : carrier && entry
        ? { carrier, service: "", fromCountries: ["FR"], toCountries: ["FR"], bands: setBandPrice([], weight, entry), currency: "EUR", maxLengthCm: null, maxDimensionsSumCm: null, volumetricDivisor: null, transitDaysMin: null, transitDaysMax: null, tracking: null, deliveryMode: null, notes: null, verifiedAt: today() }
        : null;
    if (!input) {
      setActive(null);
      return;
    }
    if (input.bands.length === 0) {
      toast({ text: "Une grille garde au moins un prix : gérez-la depuis « Devis » → « Gérer mes grilles ».", tone: "error" });
      return;
    }
    save.mutate(
      { id: card ? card.id : null, input },
      {
        onSuccess: () => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          toast({ text: "Prix enregistré", tone: "success" });
          setActive(null);
          setEntry("");
        },
        onError: (e) => toast({ text: userMessage(e), tone: "error" }),
      },
    );
  }

  return (
    <Screen
      contentGap={space[2] + 2}
      header={header}
      footer={
        <View style={{ paddingHorizontal: screenX, paddingTop: space[2], paddingBottom: Math.max(insets.bottom, space[3]) + space[2], backgroundColor: color.surface }}>
          <Keypad onKey={onKey} keyHeight={compact ? 42 : 56} action={{ label: save.isPending ? "…" : "OK", onPress: commit, disabled: !active || save.isPending }} />
        </View>
      }
    >
      {rows.map((r) => {
        const on = r.id === active;
        return (
          <ValueField
            key={r.id}
            testID={`port-${r.label}`}
            label={r.label}
            unit="€"
            value={on ? showEntry(entry) : r.price ? formatDec(r.price) : "—"}
            active={on}
            caret={on}
            badge={!on && r.cheapest ? "moins cher" : undefined}
            onPress={() => focus(r.id)}
          />
        );
      })}
      <Txt variant="micro" color={color.ink3} style={{ textAlign: "center", fontFamily: "Manrope_600SemiBold" }}>
        {list.length ? "Vos tarifs · touchez un prix pour le modifier" : "Saisissez vos tarifs : touchez un transporteur, tapez le prix, OK"}
      </Txt>
    </Screen>
  );
}
