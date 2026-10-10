import { useState } from "react";
import { Linking, RefreshControl, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { CARRIER_LABEL, FINAL_STATUSES, TRACKING_STATUS_LABEL, type CarrierCode } from "@/domain/tools/tracking";
import { CopyButton, ToolHeader } from "~/components/tools";
import { carrierText, frDateTime, ParcelStatusChip } from "~/components/tracking";
import { AlertBanner, BottomSheet, Button, Card, ErrorState, FilterChip, Screen, SectionHeader, SkeletonList, TextField, Timeline, Txt, useToast } from "~/components/ui";
import { useDeleteParcel, useParcel, useRefreshParcel, useUpdateParcel } from "~/data/hooks";
import { userMessage } from "~/lib/errors";
import { useActiveOrg } from "~/org/org-provider";
import { color, space } from "~/theme/tokens";

const CARRIERS = Object.keys(CARRIER_LABEL) as CarrierCode[];

/** Détail d'un colis : statut, date estimée (si fournie), historique des étapes. */
export default function ParcelDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const parcel = useParcel(id ?? "");
  const refresh = useRefreshParcel();
  const update = useUpdateParcel();
  const del = useDeleteParcel();
  const toast = useToast();
  const { permissions } = useActiveOrg();
  const [editing, setEditing] = useState(false);
  const [labelDraft, setLabelDraft] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (parcel.isPending)
    return (
      <Screen scroll={false}>
        <ToolHeader title="Colis" />
        <SkeletonList rows={6} thumb={false} />
      </Screen>
    );
  if (parcel.isError || !parcel.data)
    return (
      <Screen scroll={false}>
        <ToolHeader title="Colis" />
        <ErrorState description={parcel.isError ? userMessage(parcel.error) : "Colis introuvable."} onRetry={() => void parcel.refetch()} />
      </Screen>
    );
  const p = parcel.data;
  const canWrite = permissions.canWrite;
  const final = FINAL_STATUSES.has(p.status);

  return (
    <Screen refreshControl={<RefreshControl refreshing={parcel.isRefetching} onRefresh={() => void parcel.refetch()} />}>
      <ToolHeader title={p.label || p.trackingNumber} />
      <Card padded style={{ gap: space[2] }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[2] }}>
          <ParcelStatusChip status={p.status} />
          <CopyButton text={p.trackingNumber} label="Copier le n°" />
        </View>
        <Txt variant="headline">{TRACKING_STATUS_LABEL[p.status]}</Txt>
        {p.statusDetail ? <Txt variant="bodyRegular">{p.statusDetail}</Txt> : null}
        <Txt variant="label">
          {carrierText(p)} · {p.trackingNumber}
        </Txt>
        {p.status === "delivered" && p.deliveredAt ? <Txt variant="body">Livré le {frDateTime(p.deliveredAt)}</Txt> : null}
        {p.estimatedDelivery && p.status !== "delivered" ? <Txt variant="body">Livraison estimée par le transporteur : {frDateTime(p.estimatedDelivery)}</Txt> : null}
        {!p.estimatedDelivery && !final ? <Txt variant="label">Aucune date de livraison estimée fournie par le transporteur.</Txt> : null}
        <Txt variant="label">
          {p.lastCheckedAt ? `Dernière vérification : ${frDateTime(p.lastCheckedAt)} UTC` : "Jamais vérifié"}
          {p.provider ? ` · source ${p.provider === "laposte" ? "La Poste (officiel)" : "Ship24"}` : ""}
          {p.nextCheckAt && !final ? ` · prochaine : ${frDateTime(p.nextCheckAt)} UTC` : final ? " · suivi terminé" : ""}
        </Txt>
        {p.lastError ? <AlertBanner text={p.lastError} tone="dark" /> : null}
        {p.order ? <Txt variant="label">Commande associée : {p.order.orderNumber ?? "—"}{p.order.buyer ? ` · ${p.order.buyer}` : ""}</Txt> : null}
        {p.providerUrl ? <Button label="Ouvrir le suivi du transporteur" variant="ghost" compact onPress={() => void Linking.openURL(p.providerUrl!)} /> : null}
      </Card>
      {canWrite ? (
        <Button
          testID="parcel-refresh"
          label="Actualiser maintenant"
          variant="secondary"
          loading={refresh.isPending}
          onPress={() =>
            refresh.mutate(p.id, {
              onSuccess: (r) => toast({ text: r.checked ? "Suivi actualisé." : (r.message ?? "Suivi indisponible.") }),
              onError: (e) => toast({ text: userMessage(e), tone: "error" }),
            })
          }
        />
      ) : null}
      <SectionHeader title={`Historique (${p.events.length})`} />
      {p.events.length === 0 ? (
        <Card padded>
          <Txt variant="bodyRegular">Aucun événement transmis par le transporteur pour le moment.</Txt>
        </Card>
      ) : (
        <Card padded>
          <Timeline steps={p.events.map((e, i) => ({ label: e.label, meta: [frDateTime(e.at), e.location].filter(Boolean).join(" · ") || undefined, state: i === 0 ? "current" : "done" }))} />
        </Card>
      )}
      <Txt variant="label">Heures telles que communiquées par le transporteur.</Txt>
      {canWrite ? (
        <>
          <SectionHeader title="Réglages" />
          <Card padded style={{ gap: space[3] }}>
            <TextField label="Libellé" value={labelDraft ?? p.label} onChangeText={setLabelDraft} onEndEditing={() => labelDraft !== null && labelDraft !== p.label && update.mutate({ id: p.id, patch: { label: labelDraft } })} maxLength={120} />
            <Txt variant="label" color={color.ink}>
              Transporteur : {p.carrierCode ? CARRIER_LABEL[p.carrierCode] : "automatique"} {p.carrierSource === "manual" ? "(choisi)" : "(détecté)"}
            </Txt>
            {editing ? (
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
                            setEditing(false);
                            refresh.mutate(p.id);
                          },
                        },
                      )
                    }
                  />
                ))}
              </View>
            ) : (
              <Button label="Changer de transporteur" variant="ghost" compact onPress={() => setEditing(true)} />
            )}
            {p.orderId ? <Button label="Dissocier la commande" variant="ghost" compact onPress={() => update.mutate({ id: p.id, patch: { orderId: null } })} /> : null}
            <Button label={p.archivedAt ? "Désarchiver" : "Archiver"} variant="secondary" onPress={() => update.mutate({ id: p.id, patch: { archived: !p.archivedAt } }, { onSuccess: () => router.back() })} />
            <Button label="Supprimer" variant="ghost" onPress={() => setConfirmDelete(true)} />
          </Card>
        </>
      ) : null}
      <BottomSheet visible={confirmDelete} title="Supprimer ce suivi ?" description="Le colis et son historique seront supprimés de MON STOCK." onClose={() => setConfirmDelete(false)}>
        <Button label="Supprimer" loading={del.isPending} onPress={() => del.mutate(p.id, { onSuccess: () => router.back(), onError: (e) => toast({ text: userMessage(e), tone: "error" }) })} />
        <Button label="Annuler" variant="ghost" onPress={() => setConfirmDelete(false)} />
      </BottomSheet>
    </Screen>
  );
}
