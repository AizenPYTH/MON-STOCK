import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { router } from "expo-router";
import { formatMoneyDec } from "@/domain/tools/decimal";
import { compareManualCards, highlights, optionFromQuote, parseParcel, sortOptions, type Parcel, type ShippingOption, type ShippingSort } from "@/domain/tools/shipping";
import type { ShippingQuotesDTO } from "@/features/mobile-api/contract";
import { AmountField, EstimateNote, ToolHeader } from "~/components/tools";
import { AlertBanner, Button, Card, EmptyState, Screen, SectionHeader, Segmented, StatusChip, TextField, Txt } from "~/components/ui";
import { useRateCards, useShippingQuotes, useToolsStatus } from "~/data/hooks";
import { userMessage } from "~/lib/errors";
import { color, space } from "~/theme/tokens";

const frDate = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : null);

/**
 * Comparateur de frais de port : devis réels des plateformes connectées côté serveur (Packlink
 * PRO, Boxtal) + vos grilles saisies. Aucun tarif inventé : sans source, aucun prix.
 */
export default function ShippingToolScreen() {
  const [form, setForm] = useState({ weightKg: "", lengthCm: "", widthCm: "", heightCm: "", fromCountry: "FR", fromPostcode: "", toCountry: "FR", toPostcode: "", fromCity: "", toCity: "" });
  const [sort, setSort] = useState<ShippingSort>("price");
  const [submitted, setSubmitted] = useState<Parcel | null>(null);
  const [apiResult, setApiResult] = useState<ShippingQuotesDTO | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const status = useToolsStatus();
  const cards = useRateCards();
  const quotes = useShippingQuotes();
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const parsed = parseParcel(form);
  const [showErrors, setShowErrors] = useState(false);
  const errors = showErrors ? parsed.errors : {};
  const apiProviders = status.data?.shipping.filter((p) => p.configured) ?? [];

  function compare() {
    setShowErrors(true);
    if (!parsed.parcel) return;
    const parcel = parsed.parcel;
    setSubmitted(parcel);
    setApiResult(null);
    setApiError(null);
    if (apiProviders.length > 0) {
      if (!form.fromPostcode.trim() || !form.toPostcode.trim()) {
        setApiError("Codes postaux de départ et d'arrivée requis pour interroger les plateformes.");
        return;
      }
      quotes.mutate(
        { weightKg: parcel.weightKg, lengthCm: parcel.lengthCm, widthCm: parcel.widthCm, heightCm: parcel.heightCm, fromCountry: parcel.fromCountry, toCountry: parcel.toCountry, fromPostcode: form.fromPostcode.trim(), toPostcode: form.toPostcode.trim(), fromCity: form.fromCity.trim() || undefined, toCity: form.toCity.trim() || undefined },
        { onSuccess: setApiResult, onError: (e) => setApiError(userMessage(e)) },
      );
    }
  }

  let options: ShippingOption[] = [];
  let excluded: { key: string; carrier: string; service: string; reason: string }[] = [];
  if (submitted) {
    const manual = compareManualCards(cards.data ?? [], submitted, sort);
    excluded = manual.excluded;
    const api = (apiResult?.quotes ?? []).map((q) => optionFromQuote(q, submitted)).filter((o): o is ShippingOption => o !== null);
    options = sortOptions([...api, ...manual.options], sort);
  }
  const hl = highlights(options);
  const noSource = apiProviders.length === 0 && (cards.data?.length ?? 0) === 0;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <ToolHeader title="Comparateur de frais de port" description="Comparez les transporteurs pour un colis : prix, délai et services." />
        <Card padded style={{ gap: space[2] }}>
          <Txt variant="label">Sources de tarifs</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
            {(status.data?.shipping ?? []).map((p) => (
              <StatusChip key={p.id} label={`${p.label} : ${p.configured ? "connecté" : "non configuré"}`} tone={p.configured ? "success" : "neutral"} />
            ))}
            <StatusChip label={`Vos grilles : ${cards.data?.length ?? 0}`} tone={(cards.data?.length ?? 0) > 0 ? "success" : "neutral"} />
          </View>
          {status.isError ? <Txt variant="label">État des plateformes indisponible (hors ligne ?). Vos grilles restent utilisables.</Txt> : null}
          <Button label="Gérer mes grilles tarifaires" variant="ghost" compact onPress={() => router.push("/tools/shipping-rates")} />
        </Card>
        {noSource && !status.isPending && !cards.isPending ? (
          <AlertBanner text="Aucun tarif réel disponible : aucune plateforme d'expédition n'est connectée et vous n'avez saisi aucune grille. MON STOCK n'invente aucun prix." tone="dark" onPress={() => router.push("/tools/shipping-rates")} />
        ) : null}
        <SectionHeader title="Colis" />
        <Card padded style={{ gap: space[3] }}>
          <AmountField testID="ship-weight" label="Poids" value={form.weightKg} onChangeText={(v) => set("weightKg", v)} suffix="kg" placeholder="0,5" error={errors.weightKg} />
          <View style={{ flexDirection: "row", gap: space[2] }}>
            <View style={{ flex: 1 }}>
              <AmountField label="Longueur" value={form.lengthCm} onChangeText={(v) => set("lengthCm", v)} suffix="cm" placeholder="—" error={errors.lengthCm} />
            </View>
            <View style={{ flex: 1 }}>
              <AmountField label="Largeur" value={form.widthCm} onChangeText={(v) => set("widthCm", v)} suffix="cm" placeholder="—" error={errors.widthCm} />
            </View>
            <View style={{ flex: 1 }}>
              <AmountField label="Hauteur" value={form.heightCm} onChangeText={(v) => set("heightCm", v)} suffix="cm" placeholder="—" error={errors.heightCm} />
            </View>
          </View>
        </Card>
        <SectionHeader title="Trajet" />
        <Card padded style={{ gap: space[3] }}>
          <View style={{ flexDirection: "row", gap: space[2] }}>
            <View style={{ width: 90 }}>
              <TextField label="Départ" value={form.fromCountry} onChangeText={(v) => set("fromCountry", v.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))} autoCapitalize="characters" error={errors.fromCountry} placeholder="FR" />
            </View>
            <View style={{ flex: 1 }}>
              <TextField label="Code postal" value={form.fromPostcode} onChangeText={(v) => set("fromPostcode", v.slice(0, 12))} placeholder="75001" keyboardType="numbers-and-punctuation" />
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: space[2] }}>
            <View style={{ width: 90 }}>
              <TextField label="Arrivée" value={form.toCountry} onChangeText={(v) => set("toCountry", v.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))} autoCapitalize="characters" error={errors.toCountry} placeholder="DE" />
            </View>
            <View style={{ flex: 1 }}>
              <TextField label="Code postal" value={form.toPostcode} onChangeText={(v) => set("toPostcode", v.slice(0, 12))} placeholder="10115" keyboardType="numbers-and-punctuation" />
            </View>
          </View>
          {apiProviders.some((p) => p.id === "boxtal") ? (
            <View style={{ flexDirection: "row", gap: space[2] }}>
              <View style={{ flex: 1 }}>
                <TextField label="Ville de départ" value={form.fromCity} onChangeText={(v) => set("fromCity", v.slice(0, 80))} placeholder="Facultatif" />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label="Ville d'arrivée" value={form.toCity} onChangeText={(v) => set("toCity", v.slice(0, 80))} placeholder="Facultatif" />
              </View>
            </View>
          ) : null}
        </Card>
        <Button testID="ship-compare" label="Comparer" onPress={compare} loading={quotes.isPending} />
        {submitted ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[2] }}>
              <SectionHeader title={`${options.length} option${options.length > 1 ? "s" : ""}`} />
              <View style={{ width: 200 }}>
                <Segmented
                  options={[
                    { value: "price" as ShippingSort, label: "Prix" },
                    { value: "speed" as ShippingSort, label: "Rapidité" },
                  ]}
                  value={sort}
                  onChange={setSort}
                />
              </View>
            </View>
            {apiError ? <AlertBanner text={apiError} tone="dark" /> : null}
            {(apiResult?.providers ?? [])
              .filter((p) => p.state !== "ok" && p.state !== "not_configured")
              .map((p) => (
                <Txt key={p.id} variant="label">
                  {p.label} : {p.message}
                </Txt>
              ))}
            {options.length === 0 && !quotes.isPending ? (
              <EmptyState
                title="Aucun tarif pour ce colis"
                description={noSource ? "Connectez une plateforme d'expédition (administrateur) ou saisissez vos grilles tarifaires." : "Aucune grille ni plateforme ne couvre ce poids, ces dimensions ou ce trajet."}
                actions={[{ label: "Saisir une grille", onPress: () => router.push("/tools/shipping-rates/new") }]}
              />
            ) : null}
            {options.map((o) => (
              <OptionCard key={o.key} option={o} cheapest={hl.cheapest === o.key} fastest={hl.fastest === o.key} />
            ))}
            {excluded.length ? (
              <Card padded style={{ gap: 4 }}>
                <Txt variant="label" color={color.ink}>
                  Grilles non applicables
                </Txt>
                {excluded.map((x) => (
                  <Txt key={x.key} variant="label">
                    {x.carrier} {x.service} : {x.reason}
                  </Txt>
                ))}
              </Card>
            ) : null}
          </>
        ) : null}
        <EstimateNote text="Devis des plateformes : prix de votre compte au moment de la demande. Grilles : vos tarifs saisis, à jour selon la date de vérification indiquée. Le prix final dépend de l'étiquette achetée." />
      </Screen>
    </KeyboardAvoidingView>
  );
}

function OptionCard({ option: o, cheapest, fastest }: { option: ShippingOption; cheapest: boolean; fastest: boolean }) {
  const transit = o.transitDaysMin !== null || o.transitDaysMax !== null ? (o.transitDaysMin === o.transitDaysMax || o.transitDaysMax === null ? `${o.transitDaysMin ?? o.transitDaysMax} j` : `${o.transitDaysMin ?? "?"}–${o.transitDaysMax} j`) : "Délai non communiqué";
  return (
    <Card padded style={{ gap: space[2] }} accessibilityLabel={`${o.carrier} ${o.service}, ${formatMoneyDec(o.price, o.currency)}, ${transit}`}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space[2] }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="body">{o.carrier}</Txt>
          <Txt variant="label">{o.service}</Txt>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Txt variant="kpiSm" num>
            {formatMoneyDec(o.price, o.currency)}
          </Txt>
          <Txt variant="label">{o.priceTax === "incl" ? "TTC" : o.priceTax === "excl" ? "HT" : "selon votre grille"}</Txt>
        </View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
        {cheapest ? <StatusChip label="Le moins cher" tone="success" /> : null}
        {fastest ? <StatusChip label="Le plus rapide" tone="dark" /> : null}
        <StatusChip label={transit} tone="neutral" />
        <StatusChip label={o.tracking === true ? "Suivi inclus" : o.tracking === false ? "Sans suivi" : "Suivi : non précisé"} tone="neutral" />
        <StatusChip label={o.origin === "api" ? `Devis ${o.provider}` : "Votre grille"} tone={o.origin === "api" ? "accent" : "neutral"} />
      </View>
      {o.deliveryMode ? <Txt variant="label">{o.deliveryMode}</Txt> : null}
      {o.restrictions.map((r) => (
        <Txt key={r} variant="label">
          – {r}
        </Txt>
      ))}
      <Txt variant="label">{o.origin === "api" ? `Devis du ${frDate(o.quotedAt)} ${o.quotedAt?.slice(11, 16) ?? ""} UTC` : o.quotedAt ? `Grille vérifiée le ${frDate(o.quotedAt)}` : "Grille : date de vérification non renseignée"}</Txt>
    </Card>
  );
}
