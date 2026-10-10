import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { router } from "expo-router";
import { useActiveOrg } from "~/org/org-provider";
import { useRadar, useSaveRadarSettings } from "~/data/hooks";
import { parseSetting, type RadarCostSettings } from "~/data/radar";
import { userMessage } from "~/lib/errors";
import { AlertBanner, Button, Card, DetailHeader, ErrorState, FilterChip, Screen, SkeletonList, StickyActions, TextField, Txt, useToast } from "~/components/ui";
import { space } from "~/theme/tokens";

/**
 * Paramètres de coûts du radar (administrateur). Un champ vide signifie « inconnu » : le coût
 * n'est jamais compté pour 0, il est signalé comme manquant dans chaque calcul.
 */
const NUMERIC: { key: keyof RadarCostSettings; label: string; hint: string }[] = [
  { key: "vatRate", label: "Taux de TVA (%)", hint: "20 en France métropolitaine." },
  { key: "marketplaceFeePercent", label: "Commission marketplace (%)", hint: "Frais de vente eBay de votre catégorie." },
  { key: "paymentFeePercent", label: "Frais de paiement (%)", hint: "Inclus dans les frais eBay : 0 si c'est votre cas." },
  { key: "paymentFeeFixed", label: "Frais fixes par commande", hint: "Ex. 0,35." },
  { key: "shippingToCustomer", label: "Expédition au client (par unité)", hint: "Coût moyen réel de vos envois." },
  { key: "packagingCost", label: "Emballage (par unité)", hint: "Carton, protection, étiquette." },
  { key: "returnProvisionPercent", label: "Provision retours / garantie (%)", hint: "Part du prix de vente mise de côté pour retours et SAV." },
  { key: "importDutyPercent", label: "Douane / import hors UE (%)", hint: "Appliqué uniquement aux fournisseurs hors UE." },
];

export default function RadarSettingsScreen() {
  const radar = useRadar("score");
  const saveSettings = useSaveRadarSettings();
  const { permissions } = useActiveOrg();
  const toast = useToast();
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [regime, setRegime] = useState<RadarCostSettings["vatRegime"] | undefined>(undefined);
  const [recoverable, setRecoverable] = useState<boolean | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  if (radar.isPending)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Radar" />
        <SkeletonList rows={6} thumb={false} />
      </Screen>
    );
  if (radar.isError)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Radar" />
        <ErrorState description={userMessage(radar.error)} onRetry={() => void radar.refetch()} />
      </Screen>
    );
  const current = radar.data.settings;
  const values = draft ?? Object.fromEntries(NUMERIC.map((f) => [f.key, current[f.key] === null ? "" : String(current[f.key]).replace(".", ",")]));
  const vatRegime = regime === undefined ? current.vatRegime : regime;
  const vatRecoverable = recoverable === undefined ? current.vatRecoverable : recoverable;

  function submit() {
    setError(null);
    const next: Record<string, unknown> = { vatRegime, vatRecoverable };
    for (const f of NUMERIC) {
      const v = parseSetting(values[f.key] ?? "");
      if (v === "invalid") {
        setError(`${f.label} : nombre positif attendu.`);
        return;
      }
      next[f.key] = v;
    }
    saveSettings.mutate(next as unknown as RadarCostSettings, {
      onSuccess: () => {
        toast({ text: "Paramètres de coûts enregistrés." });
        router.back();
      },
      onError: (e) => setError(userMessage(e)),
    });
  }

  const readOnly = !permissions.isAdmin;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen footer={readOnly ? undefined : <StickyActions><Button label="Enregistrer" loading={saveSettings.isPending} onPress={submit} style={{ flex: 1 }} /></StickyActions>}>
        <DetailHeader parentLabel="Radar" />
        <Txt variant="title2" accessibilityRole="header">
          Paramètres de coûts
        </Txt>
        <Txt variant="label">Champ vide = coût inconnu : il reste signalé comme manquant, jamais compté pour 0.{readOnly ? " Lecture seule : seul un administrateur peut les modifier." : ""}</Txt>
        {radar.data.settingsFromChannel.length ? <AlertBanner text={`Repris de votre canal eBay faute de réglage : ${radar.data.settingsFromChannel.join(", ")}.`} /> : null}
        {error ? <AlertBanner text={error} tone="dark" /> : null}
        <Card padded style={{ gap: space[3] }}>
          <Txt variant="label">Régime de TVA</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
            {(
              [
                ["normal", "Normal"],
                ["margin", "Marge (occasion)"],
                ["franchise", "Franchise"],
              ] as const
            ).map(([v, l]) => (
              <FilterChip key={v} label={l} selected={vatRegime === v} onPress={() => !readOnly && setRegime(vatRegime === v ? null : v)} />
            ))}
          </View>
          <Txt variant="label">TVA payée aux fournisseurs récupérable ?</Txt>
          <View style={{ flexDirection: "row", gap: space[2] }}>
            {(
              [
                [true, "Oui"],
                [false, "Non"],
                [null, "Je ne sais pas"],
              ] as const
            ).map(([v, l]) => (
              <FilterChip key={String(v)} label={l} selected={vatRecoverable === v} onPress={() => !readOnly && setRecoverable(v)} />
            ))}
          </View>
        </Card>
        <Card padded style={{ gap: space[3] }}>
          {NUMERIC.map((f) => (
            <TextField
              key={f.key}
              label={f.label}
              hint={f.hint}
              value={values[f.key] ?? ""}
              editable={!readOnly}
              keyboardType="decimal-pad"
              onChangeText={(t) => setDraft({ ...values, [f.key]: t })}
              placeholder="Inconnu"
            />
          ))}
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}
