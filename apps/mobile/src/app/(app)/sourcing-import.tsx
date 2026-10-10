import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { FileSpreadsheet } from "lucide-react-native";
import type { CatalogImportDTO, CatalogMapping, CatalogPreviewDTO } from "@/features/mobile-api/contract";
import { useActiveOrg } from "~/org/org-provider";
import { useActiveSuppliers, useImportPreview, useRunImport } from "~/data/hooks";
import { MAPPABLE_FIELDS, mappingIssues, pickCatalogFile, taxTypeOf, withTaxType, type PickedFile } from "~/data/suppliers-pro";
import { userMessage } from "~/lib/errors";
import { formatMoney, formatNumber } from "~/lib/format";
import { AlertBanner, BottomSheet, Button, Card, DetailHeader, ErrorState, FilterChip, Screen, SectionHeader, StatusChip, StickyActions, TextField, Txt, useToast } from "~/components/ui";
import { color, space } from "~/theme/tokens";
import { fontFamily } from "~/theme/typography";

/**
 * Import du catalogue / de la grille tarifaire d'un fournisseur (fichier CSV, Excel .xlsx, XML
 * ou JSON reçu par e-mail ou téléchargé depuis son espace pro). Aperçu sans enregistrement,
 * association des colonnes, puis import confirmé : les prix sont enregistrés comme « prix
 * importés d'un catalogue » à la date de l'import.
 */
const TAX_OPTIONS = [
  { value: "ht" as const, label: "Prix HT" },
  { value: "ttc" as const, label: "Prix TTC" },
  { value: "unknown" as const, label: "Non précisé" },
];

export default function SourcingImportScreen() {
  const params = useLocalSearchParams<{ supplierName?: string }>();
  const { active, permissions } = useActiveOrg();
  const suppliers = useActiveSuppliers();
  const preview = useImportPreview();
  const run = useRunImport();
  const toast = useToast();

  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState(params.supplierName ?? "");
  const [file, setFile] = useState<PickedFile | null>(null);
  const [mapping, setMapping] = useState<CatalogMapping>({});
  const [currency, setCurrency] = useState(active.organization.currency);
  const [taxType, setTaxType] = useState<"ht" | "ttc" | "unknown">("unknown");
  const [data, setData] = useState<CatalogPreviewDTO | null>(null);
  const [result, setResult] = useState<CatalogImportDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [dirty, setDirty] = useState(false);

  if (!permissions.canWrite)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Sourcing" />
        <ErrorState title="Lecture seule" description="Votre rôle ne permet pas d'importer un catalogue dans cette organisation." />
      </Screen>
    );

  async function choose() {
    setError(null);
    setResult(null);
    try {
      const picked = await pickCatalogFile();
      if (!picked) return;
      setFile(picked);
      refresh(picked, undefined);
    } catch (e) {
      setError(userMessage(e));
    }
  }

  function refresh(f: PickedFile, m: CatalogMapping | undefined) {
    preview.mutate(
      { file: f, mapping: m, currency, taxType },
      {
        onSuccess: (p) => {
          setData(p);
          setMapping(p.mapping);
          setTaxType(taxTypeOf(p.mapping) !== "unknown" ? taxTypeOf(p.mapping) : taxType);
          setDirty(false);
        },
        onError: (e) => setError(userMessage(e)),
      },
    );
  }

  function setField(field: string, column: string | null) {
    setMapping((m) => {
      const next = { ...m };
      if (column) next[field] = column;
      else delete next[field];
      return next;
    });
    setDirty(true);
  }

  function submit() {
    if (!file) return;
    setConfirming(false);
    run.mutate(
      { file, mapping: withTaxType(mapping, taxType), currency, taxType, supplierId: supplierId ?? undefined, supplierName: supplierId ? undefined : supplierName },
      {
        onSuccess: (r) => {
          setResult(r);
          void Haptics.notificationAsync(r.result.status === "failed" ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success).catch(() => {});
          toast({ text: r.result.message, tone: r.result.status === "failed" ? "error" : undefined });
        },
        onError: (e) => setError(userMessage(e)),
      },
    );
  }

  const issues = mappingIssues(mapping);
  const supplierOk = Boolean(supplierId) || supplierName.trim().length >= 2;
  const canImport = Boolean(file && data && !dirty && issues.length === 0 && supplierOk && /^[A-Za-z]{3}$/.test(currency));

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        footer={
          data && !result ? (
            <StickyActions>
              {dirty ? (
                <Button label="Actualiser l'aperçu" variant="secondary" loading={preview.isPending} onPress={() => file && refresh(file, withTaxType(mapping, taxType))} style={{ flex: 1 }} />
              ) : (
                <Button label={`Importer ${formatNumber(data.validCount)} ligne${data.validCount > 1 ? "s" : ""}`} disabled={!canImport} loading={run.isPending} onPress={() => setConfirming(true)} style={{ flex: 1 }} testID="import-confirm" />
              )}
            </StickyActions>
          ) : undefined
        }
      >
        <DetailHeader parentLabel="Sourcing" />
        <View style={{ gap: 4 }}>
          <Txt variant="title2" accessibilityRole="header">
            Importer un catalogue fournisseur
          </Txt>
          <Txt variant="label">CSV, Excel (.xlsx), XML ou JSON — 15 Mo maximum. Rien n'est enregistré avant votre confirmation.</Txt>
        </View>
        {error ? <AlertBanner text={error} tone="dark" /> : null}

        <SectionHeader title="1. Fournisseur" />
        <Card padded style={{ gap: space[3] }}>
          {(suppliers.data ?? []).length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }} keyboardShouldPersistTaps="handled">
              {(suppliers.data ?? []).slice(0, 30).map((s) => (
                <FilterChip key={s.id} label={s.name} selected={supplierId === s.id} onPress={() => setSupplierId(supplierId === s.id ? null : s.id)} />
              ))}
            </ScrollView>
          ) : null}
          {!supplierId ? <TextField label="Nouveau fournisseur" value={supplierName} onChangeText={setSupplierName} placeholder="Nom du fournisseur" maxLength={160} testID="import-supplier-name" /> : null}
        </Card>

        <SectionHeader title="2. Fichier" />
        <Card padded style={{ gap: space[3] }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
            <FileSpreadsheet size={18} color={color.ink2} />
            <Txt variant="body" style={{ flex: 1 }} numberOfLines={1}>
              {file ? file.name : "Aucun fichier choisi"}
            </Txt>
          </View>
          <Button label={file ? "Choisir un autre fichier" : "Choisir un fichier"} variant="secondary" loading={preview.isPending && !data} onPress={() => void choose()} testID="import-pick" />
        </Card>

        {data ? (
          <>
            <SectionHeader title="3. Colonnes du fichier" />
            <Card padded style={{ gap: space[3] }}>
              <Txt variant="label">
                {formatNumber(data.total)} lignes · {formatNumber(data.validCount)} exploitables · {formatNumber(data.invalidCount)} incomplètes (non importées)
              </Txt>
              {data.warnings.map((w) => (
                <Txt key={w} variant="label" color={color.ink2}>
                  {w}
                </Txt>
              ))}
              {MAPPABLE_FIELDS.map((f) => (
                <View key={f.field} style={{ gap: 6 }}>
                  <Txt variant="label" color={color.ink} style={{ fontFamily: fontFamily[700] }}>
                    {f.label}
                    {f.required ? " *" : ""}
                  </Txt>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }} keyboardShouldPersistTaps="handled">
                    <FilterChip label="—" selected={!mapping[f.field]} onPress={() => setField(f.field, null)} />
                    {data.columns.map((c) => (
                      <FilterChip key={c} label={c} selected={mapping[f.field] === c} onPress={() => setField(f.field, c)} />
                    ))}
                  </ScrollView>
                </View>
              ))}
              <View style={{ gap: 6 }}>
                <Txt variant="label" color={color.ink} style={{ fontFamily: fontFamily[700] }}>
                  Type de prix
                </Txt>
                <View style={{ flexDirection: "row", gap: space[2] }}>
                  {TAX_OPTIONS.map((o) => (
                    <FilterChip
                      key={o.value}
                      label={o.label}
                      selected={taxType === o.value}
                      onPress={() => {
                        setTaxType(o.value);
                        setDirty(true);
                      }}
                    />
                  ))}
                </View>
              </View>
              <TextField
                label="Devise des prix (si absente du fichier)"
                value={currency}
                onChangeText={(v) => {
                  setCurrency(v.toUpperCase().slice(0, 3));
                  setDirty(true);
                }}
                autoCapitalize="characters"
                maxLength={3}
              />
              {issues.map((i) => (
                <Txt key={i} variant="label" color={color.danger}>
                  {i}
                </Txt>
              ))}
            </Card>

            <SectionHeader title={`Aperçu (${data.sample.length} premières lignes)`} />
            {data.sample.map((s) => (
              <Card key={s.line} padded style={{ gap: 4 }}>
                <View style={{ flexDirection: "row", gap: space[2], alignItems: "center" }}>
                  <Txt variant="label">L{s.line}</Txt>
                  <Txt variant="body" style={{ flex: 1 }} numberOfLines={2}>
                    {s.title ?? "—"}
                  </Txt>
                </View>
                {s.errors.length ? (
                  <Txt variant="label" color={color.danger}>
                    {s.errors.join(" ")}
                  </Txt>
                ) : (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    <StatusChip label={s.price !== null && s.currency ? `${formatMoney(s.price, s.currency)}${s.taxType === "ht" ? " HT" : s.taxType === "ttc" ? " TTC" : ""}` : "prix ?"} tone="dark" />
                    {s.quantity !== null ? <StatusChip label={`stock ${formatNumber(s.quantity)}`} tone="neutral" /> : <StatusChip label="stock non indiqué" tone="neutral" />}
                    {s.reference ? <StatusChip label={s.reference} tone="neutral" /> : null}
                    {s.ean ? <StatusChip label={`EAN ${s.ean}`} tone="neutral" /> : null}
                  </View>
                )}
              </Card>
            ))}
          </>
        ) : null}

        {result ? (
          <Card padded style={{ gap: space[2] }}>
            <StatusChip label={result.result.status === "success" ? "Import réussi" : result.result.status === "partial" ? "Import partiel" : "Import en échec"} tone={result.result.status === "failed" ? "danger" : "success"} />
            <Txt variant="body">{result.result.message}</Txt>
            <Txt variant="label">Les offres apparaissent dans Sourcing → Catalogue et dans le radar d'opportunités. Réimportez le fichier mis à jour pour actualiser les prix (les offres absentes du nouveau fichier expirent).</Txt>
            <Button label="Voir les offres" onPress={() => router.replace("/sourcing")} />
          </Card>
        ) : null}
      </Screen>
      <BottomSheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        title="Importer ce catalogue ?"
        description={`${data ? formatNumber(data.validCount) : 0} offres de ${supplierId ? (suppliers.data ?? []).find((s) => s.id === supplierId)?.name ?? "ce fournisseur" : supplierName.trim()} seront enregistrées (${taxType === "ht" ? "prix HT" : taxType === "ttc" ? "prix TTC" : "type de prix non précisé"}, ${currency}). Les lignes incomplètes sont ignorées.`}
      >
        <Button label="Confirmer l'import" loading={run.isPending} onPress={submit} />
        <Button label="Annuler" variant="ghost" onPress={() => setConfirming(false)} />
      </BottomSheet>
    </KeyboardAvoidingView>
  );
}
