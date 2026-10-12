import { useState } from "react";
import { Linking, RefreshControl, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { CARRIER_LABEL, carrierTrackingUrl, FINAL_STATUSES, parcelDisplay, universalTrackingUrl, type CarrierCode } from "@/domain/tools/tracking";
import { FooterActions, HeaderAction } from "~/components/calc-screen";
import { CopyButton, ToolHeader } from "~/components/tools";
import { carrierText, frDateTime, PARCEL_TONE, trackingSourceText } from "~/components/tracking";
import { AlertBanner, BottomSheet, Button, ErrorState, FilterChip, NightHeader, Screen, SkeletonList, TextField, Txt, useToast } from "~/components/ui";
import { useDeleteParcel, useParcel, useRefreshParcel, useUpdateParcel } from "~/data/hooks";
import { userMessage } from "~/lib/errors";
import { useActiveOrg } from "~/org/org-provider";
import { color, space } from "~/theme/tokens";

const CARRIERS = Object.keys(CARRIER_LABEL) as CarrierCode[];

/**
 * Détail d'un colis (maquette v3) : le statut en grand dans le bandeau, les étapes renvoyées par
 * le transporteur, « Actualiser ». Sans API (« Non vérifié ») : « Site du transporteur ».
 * Nom, transporteur, archivage et suppression : bouton « Modifier ».
 */
export default function ParcelDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const parcel = useParcel(id ?? "");
  const refresh = useRefreshParcel();
  const update = useUpdateParcel();
  const del = useDeleteParcel();
  const toast = useToast();
  const { permissions } = useActiveOrg();
  const [editing, setEditing] = useState(false);
  const [carrierPick, setCarrierPick] = useState(false);
  const [labelDraft, setLabelDraft] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (parcel.isPending)
    return (
      <Screen scroll={false}>
        <ToolHeader parentLabel="Colis" title="Colis" />
        <SkeletonList rows={4} thumb={false} />
      </Screen>
    );
  if (parcel.isError || !parcel.data)
    return (
      <Screen scroll={false}>
        <ToolHeader parentLabel="Colis" title="Colis" />
        <ErrorState description={parcel.isError ? userMessage(parcel.error) : "Colis introuvable."} onRetry={() => void parcel.refetch()} />
      </Screen>
    );
  const p = parcel.data;
  const canWrite = permissions.canWrite;
  const final = FINAL_STATUSES.has(p.status);
  const d = parcelDisplay(p);
  const tone = PARCEL_TONE[d.tone];
  const site = carrierTrackingUrl(p.carrierCode, p.trackingNumber);
  const siteUrl = p.providerUrl ?? site.url;
  const openSite = () => void Linking.openURL(siteUrl);
  const doRefresh = () =>
    refresh.mutate(p.id, {
      onSuccess: (r) => toast({ text: r.checked ? "À jour · il y a quelques secondes" : (r.message ?? "Suivi indisponible.") }),
      onError: (e) => toast({ text: userMessage(e), tone: "error" }),
    });
  const meta = [p.lastCheckedAt ? `vérifié ${frDateTime(p.lastCheckedAt)} UTC` : null, p.provider ? `source ${trackingSourceText(p.provider)}` : null, !final && p.nextCheckAt ? `prochaine ${frDateTime(p.nextCheckAt)} UTC` : null].filter(Boolean).join(" · ");

  return (
    <Screen
      contentGap={space[4]}
      refreshControl={<RefreshControl refreshing={parcel.isRefetching} onRefresh={() => void parcel.refetch()} />}
      header={
        <NightHeader
          back={{ label: "Colis", onPress: () => (router.canGoBack() ? router.back() : router.replace("/tools/tracking")) }}
          right={canWrite ? <HeaderAction label="Modifier" onPress={() => setEditing(true)} testID="parcel-edit" /> : undefined}
          hero={{ value: d.label, color: tone.onDark, sub: `${p.label || p.trackingNumber} · ${carrierText(p)}` }}
        />
      }
      footer={
        d.verified ? (
          <FooterActions secondary={{ label: "Site", onPress: openSite, testID: "parcel-carrier-site" }} primary={{ label: "Actualiser", tone: "soft", onPress: doRefresh, loading: refresh.isPending, disabled: !canWrite, testID: "parcel-refresh" }} />
        ) : (
          <FooterActions secondary={canWrite ? { label: "Actualiser", onPress: doRefresh, testID: "parcel-refresh" } : undefined} primary={{ label: "Site du transporteur", onPress: openSite, testID: "parcel-carrier-site" }} />
        )
      }
    >
      <View style={{ gap: space[4], paddingHorizontal: space[1], paddingTop: space[2] }}>
        {!d.verified ? (
          <Step dot={{ border: color.accent }} title="Statut non vérifié" sub={p.lastError ? "Pas de suivi automatique pour ce colis pour le moment" : "Pas de suivi automatique pour ce transporteur"} />
        ) : p.events.length === 0 ? (
          <Step dot={{ fill: tone.dot }} title={d.label} sub="Aucune étape transmise par le transporteur pour le moment" />
        ) : (
          p.events.map((e, i) => <Step key={`${e.at}-${i}`} dot={{ fill: i === 0 ? tone.dot : color.brand }} title={e.label} sub={[frDateTime(e.at), e.location].filter(Boolean).join(" · ") || undefined} />)
        )}
      </View>
      {p.estimatedDelivery && p.status !== "delivered" ? <Txt variant="body">Livraison estimée par le transporteur : {frDateTime(p.estimatedDelivery)}</Txt> : null}
      {p.status === "delivered" && p.deliveredAt ? <Txt variant="body">Livré le {frDateTime(p.deliveredAt)}</Txt> : null}
      {p.lastError && d.verified ? <AlertBanner text={p.lastError} tone="dark" /> : null}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[2] }}>
        <Txt variant="label" style={{ flex: 1 }} selectable>
          N° {p.trackingNumber}
        </Txt>
        <CopyButton text={p.trackingNumber} label="Copier" />
      </View>
      {meta ? <Txt variant="micro" color={color.ink3}>{meta}</Txt> : null}
      {!site.universal ? <Button testID="parcel-17track" label="Vérifier aussi sur 17TRACK" variant="ghost" compact onPress={() => void Linking.openURL(universalTrackingUrl(p.trackingNumber))} /> : null}
      <Txt variant="micro" color={color.ink3}>
        Heures telles que communiquées par le transporteur. Sites publics et gratuits ouverts dans le navigateur ; MON STOCK n'est affilié à aucun transporteur.
      </Txt>

      <BottomSheet visible={editing} title="Modifier le colis" onClose={() => setEditing(false)}>
        <TextField label="Nom" value={labelDraft ?? p.label} onChangeText={setLabelDraft} onEndEditing={() => labelDraft !== null && labelDraft !== p.label && update.mutate({ id: p.id, patch: { label: labelDraft } })} maxLength={120} />
        <Txt variant="label" color={color.ink}>
          Transporteur : {p.carrierCode ? CARRIER_LABEL[p.carrierCode] : "automatique"} {p.carrierSource === "manual" ? "(choisi)" : "(détecté)"}
        </Txt>
        {carrierPick ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
            {CARRIERS.map((c) => (
              <FilterChip
                key={c}
                label={CARRIER_LABEL[c]}
                selected={p.carrierCode === c}
                onPress={() =>
                  update.mutate(
                    { id: p.id, patch: { carrierCode: c } },
                    {
                      onSuccess: () => {
                        setCarrierPick(false);
                        refresh.mutate(p.id);
                      },
                    },
                  )
                }
              />
            ))}
          </View>
        ) : (
          <Button label="Changer de transporteur" variant="ghost" compact onPress={() => setCarrierPick(true)} />
        )}
        {p.order ? <Txt variant="label">Commande associée : {p.order.orderNumber ?? "—"}{p.order.buyer ? ` · ${p.order.buyer}` : ""}</Txt> : null}
        {p.orderId ? <Button label="Dissocier la commande" variant="ghost" compact onPress={() => update.mutate({ id: p.id, patch: { orderId: null } })} /> : null}
        <Button label={p.archivedAt ? "Désarchiver" : "Archiver"} variant="secondary" onPress={() => update.mutate({ id: p.id, patch: { archived: !p.archivedAt } }, { onSuccess: () => (setEditing(false), router.back()) })} />
        <Button label="Supprimer" variant="ghost" onPress={() => (setEditing(false), setConfirmDelete(true))} />
      </BottomSheet>
      <BottomSheet visible={confirmDelete} title="Supprimer ce suivi ?" description="Le colis et son historique seront supprimés de MON STOCK." onClose={() => setConfirmDelete(false)}>
        <Button label="Supprimer" loading={del.isPending} onPress={() => del.mutate(p.id, { onSuccess: () => router.back(), onError: (e) => toast({ text: userMessage(e), tone: "error" }) })} />
        <Button label="Annuler" variant="ghost" onPress={() => setConfirmDelete(false)} />
      </BottomSheet>
    </Screen>
  );
}

function Step({ dot, title, sub }: { dot: { fill?: string; border?: string }; title: string; sub?: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 14, alignItems: "flex-start" }} accessible accessibilityLabel={`${title}${sub ? `, ${sub}` : ""}`}>
      <View style={{ width: 20, height: 20, borderRadius: 10, marginTop: 1, backgroundColor: dot.fill ?? "transparent", borderWidth: dot.border ? 2 : 0, borderColor: dot.border }} />
      <View style={{ flex: 1 }}>
        <Txt variant="body" style={{ fontFamily: "Manrope_700Bold", fontSize: 16, lineHeight: 20 }}>
          {title}
        </Txt>
        {sub ? <Txt variant="label">{sub}</Txt> : null}
      </View>
    </View>
  );
}
