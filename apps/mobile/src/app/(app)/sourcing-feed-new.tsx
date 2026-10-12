import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Switch, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import type { CatalogMapping, CatalogPreviewDTO, SourceOverviewDTO } from "@/features/mobile-api/contract";
import { useActiveOrg } from "~/org/org-provider";
import { useActiveSuppliers, useCreateRemoteFeed, useRemoteFeedPreview } from "~/data/hooks";
import { remoteFeedIssues, type FeedAuthInput } from "~/data/sourcing-b2b";
import { ESSENTIAL_FIELDS, IMPORT_MODE_HELP, IMPORT_MODE_LABEL, MAPPABLE_FIELDS, mappingIssues, taxTypeOf, withTaxType, type ImportMode } from "~/data/suppliers-pro";
import { userMessage } from "~/lib/errors";
import { formatMoney, formatNumber } from "~/lib/format";
import { AlertBanner, Button, Card, DetailHeader, ErrorState, FilterChip, Screen, SectionHeader, Segmented, StatusChip, StickyActions, TextField, Txt, useToast } from "~/components/ui";
import { color, space } from "~/theme/tokens";
import { fontFamily } from "~/theme/typography";

const FORMATS = [
  { value: "csv" as const, label: "CSV" },
  { value: "xml" as const, label: "XML" },
  { value: "json" as const, label: "JSON" },
];
const AUTH_KINDS = [
  { value: "none" as const, label: "Aucune" },
  { value: "header" as const, label: "Clé / jeton" },
  { value: "basic" as const, label: "Identifiant" },
];
const TAX_OPTIONS = [
  { value: "ht" as const, label: "Prix HT" },
  { value: "ttc" as const, label: "Prix TTC" },
  { value: "unknown" as const, label: "Non précisé" },
];
const FREQUENCIES: { value: SourceOverviewDTO["frequency"]; label: string }[] = [
  { value: "daily", label: "1 fois / jour" },
  { value: "every_6_hours", label: "Toutes les 6 h" },
  { value: "hourly", label: "Toutes les heures" },
  { value: "manual", label: "Manuelle" },
];

/**
 * Flux distant AUTORISÉ : lien CSV / XML / JSON fourni par le grossiste (lien partenaire, flux
 * acheteur, export d'un tableur partagé avec son accord). Aperçu sans enregistrement, association
 * des colonnes, attestation obligatoire, puis création. Les identifiants sont chiffrés par le
 * serveur et ne sont plus jamais renvoyés à l'application.
 */
export default function SourcingFeedNewScreen() {
  const { active, permissions } = useActiveOrg();
  const suppliers = useActiveSuppliers();
  const preview = useRemoteFeedPreview();
  const create = useCreateRemoteFeed();
  const toast = useToast();

  const [url, setUrl] = useState("");
  const [format, setFormat] = useState<"csv" | "xml" | "json">("csv");
  const [authKind, setAuthKind] = useState<FeedAuthInput["kind"]>("none");
  const [headerName, setHeaderName] = useState("Authorization");
  const [headerValue, setHeaderValue] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [mapping, setMapping] = useState<CatalogMapping>({});
  const [currency, setCurrency] = useState(active.organization.currency);
  const [taxType, setTaxType] = useState<"ht" | "ttc" | "unknown">("unknown");
  const [mode, setMode] = useState<ImportMode>("snapshot");
  const [frequency, setFrequency] = useState<SourceOverviewDTO["frequency"]>("daily");
  const [attest, setAttest] = useState(false);
  const [allFields, setAllFields] = useState(false);
  const [data, setData] = useState<CatalogPreviewDTO | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!permissions.canWrite)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Mes sources" />
        <ErrorState title="Lecture seule" description="Votre rôle ne permet pas d'ajouter une source dans cette organisation." />
      </Screen>
    );

  const auth: FeedAuthInput = authKind === "header" ? { kind: "header", name: headerName.trim(), value: headerValue } : authKind === "basic" ? { kind: "basic", username: username.trim(), password } : { kind: "none" };
  const draft = { url, format, auth };
  const localIssues = url.trim() ? remoteFeedIssues(draft) : [];

  function resetPreview() {
    setData(null);
    setMapping({});
    setDirty(false);
  }

  function runPreview(m?: CatalogMapping) {
    setError(null);
    preview.mutate(
      { ...draft, mapping: m, currency, taxType },
      {
        onSuccess: (p) => {
          setData(p);
          setMapping(p.mapping);
          if (taxTypeOf(p.mapping) !== "unknown") setTaxType(taxTypeOf(p.mapping));
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
    setError(null);
    create.mutate(
      { ...draft, mapping: withTaxType(mapping, taxType), currency, taxType, supplierId: supplierId ?? undefined, supplierName: supplierId ? undefined : supplierName, mode, frequency },
      {
        onSuccess: () => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          toast({ text: "Flux ajouté. Lancez la première synchronisation depuis « Mes sources ».", tone: "success" });
          router.replace("/sourcing-connections");
        },
        onError: (e) => setError(userMessage(e)),
      },
    );
  }

  const issues = mappingIssues(mapping);
  const supplierOk = Boolean(supplierId) || supplierName.trim().length >= 2;
  const canCreate = Boolean(data && !dirty && issues.length === 0 && supplierOk && attest && /^[A-Za-z]{3}$/.test(currency));

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        footer={
          <StickyActions>
            {!data || dirty ? (
              <Button
                label={data ? "Actualiser l'aperçu" : "Tester le lien"}
                variant={data ? "secondary" : "primary"}
                disabled={!url.trim() || localIssues.length > 0}
                loading={preview.isPending}
                onPress={() => runPreview(data ? withTaxType(mapping, taxType) : undefined)}
                style={{ flex: 1 }}
                testID="feed-preview"
              />
            ) : (
              <Button label="Ajouter ce flux" disabled={!canCreate} loading={create.isPending} onPress={submit} style={{ flex: 1 }} testID="feed-create" />
            )}
          </StickyActions>
        }
      >
        <DetailHeader parentLabel="Mes sources" />
        <View style={{ gap: 4 }}>
          <Txt variant="title2" accessibilityRole="header">
            Ajouter un flux autorisé
          </Txt>
          <Txt variant="label">Lien CSV, XML ou JSON fourni par votre grossiste. Rien n'est enregistré avant votre confirmation, et MON STOCK ne lit que ce lien : aucune page web n'est parcourue.</Txt>
        </View>
        {error ? <AlertBanner text={error} tone="dark" /> : null}

        <SectionHeader title="1. Lien du flux" />
        <Card padded style={{ gap: space[3] }}>
          <TextField
            label="Adresse (https://…)"
            value={url}
            onChangeText={(v) => {
              setUrl(v);
              resetPreview();
            }}
            placeholder="https://fournisseur.example/stock.csv"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            maxLength={2000}
            testID="feed-url"
          />
          <Segmented
            value={format}
            onChange={(v) => {
              setFormat(v);
              resetPreview();
            }}
            options={FORMATS}
          />
          {localIssues.map((i) => (
            <Txt key={i} variant="label" color={color.dangerInk}>
              {i}
            </Txt>
          ))}
        </Card>

        <SectionHeader title="2. Authentification" />
        <Card padded style={{ gap: space[3] }}>
          <Segmented
            value={authKind}
            onChange={(v) => {
              setAuthKind(v);
              resetPreview();
            }}
            options={AUTH_KINDS}
          />
          {authKind === "header" ? (
            <>
              <TextField label="Nom de l'en-tête" value={headerName} onChangeText={setHeaderName} autoCapitalize="none" autoCorrect={false} maxLength={64} testID="feed-header-name" />
              <TextField label="Valeur (clé, jeton…)" value={headerValue} onChangeText={setHeaderValue} autoCapitalize="none" autoCorrect={false} secureTextEntry maxLength={4000} testID="feed-header-value" />
            </>
          ) : null}
          {authKind === "basic" ? (
            <>
              <TextField label="Identifiant" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} maxLength={200} testID="feed-username" />
              <TextField label="Mot de passe" value={password} onChangeText={setPassword} autoCapitalize="none" autoCorrect={false} secureTextEntry maxLength={400} testID="feed-password" />
            </>
          ) : null}
          <Txt variant="label">
            {authKind === "none" ? "Lien public ou contenant déjà un jeton fourni par le grossiste." : "Chiffré par le serveur à l'enregistrement, jamais réaffiché ni envoyé ailleurs qu'au fournisseur."}
          </Txt>
        </Card>

        {data ? (
          <>
            <SectionHeader title="3. Fournisseur" />
            <Card padded style={{ gap: space[3] }}>
              {(suppliers.data ?? []).length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }} keyboardShouldPersistTaps="handled">
                  {(suppliers.data ?? []).slice(0, 30).map((s) => (
                    <FilterChip key={s.id} label={s.name} selected={supplierId === s.id} onPress={() => setSupplierId(supplierId === s.id ? null : s.id)} />
                  ))}
                </ScrollView>
              ) : null}
              {!supplierId ? <TextField label="Nouveau fournisseur" value={supplierName} onChangeText={setSupplierName} placeholder="Nom du fournisseur" maxLength={160} testID="feed-supplier-name" /> : null}
            </Card>

            <SectionHeader title="4. Colonnes du flux" />
            <Card padded style={{ gap: space[3] }}>
              <Txt variant="label">
                {formatNumber(data.total)} lignes · {formatNumber(data.validCount)} exploitables · {formatNumber(data.invalidCount)} incomplètes
              </Txt>
              {data.warnings.map((w) => (
                <Txt key={w} variant="label" color={color.ink2}>
                  {w}
                </Txt>
              ))}
              {MAPPABLE_FIELDS.filter((f) => allFields || ESSENTIAL_FIELDS.has(f.field) || mapping[f.field]).map((f) => (
                <View key={f.field} style={{ gap: 6 }}>
                  <Txt variant="label" color={color.ink} style={{ fontFamily: fontFamily[700] }}>
                    {f.label}
                    {f.required ? " *" : ""}
                    {mapping[f.field] && data.mappingSource === "suggested" && data.mappingConfidence?.[f.field] === "medium" ? " · proposé, à vérifier" : ""}
                  </Txt>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }} keyboardShouldPersistTaps="handled">
                    <FilterChip label="—" selected={!mapping[f.field]} onPress={() => setField(f.field, null)} />
                    {data.columns.map((c) => (
                      <FilterChip key={c} label={c} selected={mapping[f.field] === c} onPress={() => setField(f.field, c)} />
                    ))}
                  </ScrollView>
                </View>
              ))}
              <Button label={allFields ? "Moins de champs" : `Plus de champs (${MAPPABLE_FIELDS.length - ESSENTIAL_FIELDS.size})`} variant="ghost" compact onPress={() => setAllFields((v) => !v)} />
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
              <TextField
                label="Devise des prix (si absente du flux)"
                value={currency}
                onChangeText={(v) => {
                  setCurrency(v.toUpperCase().slice(0, 3));
                  setDirty(true);
                }}
                autoCapitalize="characters"
                maxLength={3}
              />
              {issues.map((i) => (
                <Txt key={i} variant="label" color={color.dangerInk}>
                  {i}
                </Txt>
              ))}
            </Card>

            <SectionHeader title={`Aperçu (${data.sample.length} premières lignes)`} />
            {data.sample.slice(0, 5).map((s) => (
              <Card key={s.line} padded style={{ gap: 4 }}>
                <Txt variant="body" numberOfLines={2}>
                  {s.title ?? "—"}
                </Txt>
                {s.errors.length ? (
                  <Txt variant="label" color={color.dangerInk}>
                    {s.errors.join(" ")}
                  </Txt>
                ) : (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    <StatusChip label={s.price !== null && s.currency ? formatMoney(s.price, s.currency) : "prix ?"} tone="dark" />
                    <StatusChip label={s.quantity !== null ? `stock ${formatNumber(s.quantity)}` : "stock non indiqué"} tone="neutral" />
                    {s.ean ? <StatusChip label={`EAN ${s.ean}`} tone="neutral" /> : null}
                  </View>
                )}
                {s.warnings?.length ? (
                  <Txt variant="label" color={color.accentInkOnSoft}>
                    {s.warnings!.join(" ")}
                  </Txt>
                ) : null}
              </Card>
            ))}

            <SectionHeader title="5. Synchronisation" />
            <Card padded style={{ gap: space[3] }}>
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: "snapshot", label: IMPORT_MODE_LABEL.snapshot },
                  { value: "partial", label: IMPORT_MODE_LABEL.partial },
                ]}
              />
              <Txt variant="label">{IMPORT_MODE_HELP[mode]}</Txt>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
                {FREQUENCIES.map((f) => (
                  <FilterChip key={f.value} label={f.label} selected={frequency === f.value} onPress={() => setFrequency(f.value)} />
                ))}
              </View>
              <Txt variant="label">En cas de panne du fournisseur, les offres déjà enregistrées sont conservées et un nouvel essai est programmé.</Txt>
            </Card>

            <SectionHeader title="6. Autorisation" />
            <Card padded style={{ gap: space[2] }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
                <Txt variant="bodyRegular" style={{ flex: 1 }}>
                  J'atteste que ce fournisseur m'a fourni ce lien ou m'autorise à le lire automatiquement.
                </Txt>
                <Switch value={attest} onValueChange={setAttest} accessibilityLabel="Attester l'accord du fournisseur" trackColor={{ true: color.accent, false: color.line }} testID="feed-attest" />
              </View>
              <Txt variant="label">Votre attestation est enregistrée avec la date. Aucune commande n'est passée : MON STOCK lit seulement le stock et les prix.</Txt>
            </Card>
          </>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
