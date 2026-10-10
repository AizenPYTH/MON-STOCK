import { useState } from "react";
import { RefreshControl, View } from "react-native";
import { router } from "expo-router";
import { PackageSearch } from "lucide-react-native";
import { ToolHeader } from "~/components/tools";
import { carrierText, frDateTime, ParcelStatusChip } from "~/components/tracking";
import { AlertBanner, Button, Card, EmptyState, ErrorState, ListRow, Screen, Segmented, SkeletonList, Txt } from "~/components/ui";
import { useParcels, useToolsStatus } from "~/data/hooks";
import { userMessage } from "~/lib/errors";
import { useActiveOrg } from "~/org/org-provider";
import { color, space } from "~/theme/tokens";

/** Suivi de colis : liste des colis suivis et leur dernier statut connu (renvoyé par l'API). */
export default function TrackingListScreen() {
  const [archived, setArchived] = useState(false);
  const parcels = useParcels(archived);
  const status = useToolsStatus();
  const { permissions } = useActiveOrg();
  const noApi = status.data ? !status.data.tracking.laposte && !status.data.tracking.ship24 : false;

  return (
    <Screen refreshControl={<RefreshControl refreshing={parcels.isRefetching} onRefresh={() => void parcels.refetch()} />}>
      <ToolHeader title="Suivi de colis" description="Statut, étapes et livraison estimée de vos envois, actualisés automatiquement." />
      {noApi ? <AlertBanner text="Aucune API de suivi n'est encore configurée sur le serveur : les colis sont enregistrés mais leur statut ne peut pas être récupéré. Aucun statut n'est inventé." tone="dark" /> : null}
      {permissions.canWrite ? <Button testID="tracking-add" label="Suivre un colis" onPress={() => router.push("/tools/tracking/new")} /> : null}
      <Segmented
        options={[
          { value: "active", label: "En cours" },
          { value: "archived", label: "Archivés" },
        ]}
        value={archived ? "archived" : "active"}
        onChange={(v) => setArchived(v === "archived")}
      />
      {parcels.isPending ? (
        <SkeletonList rows={5} thumb={false} />
      ) : parcels.isError ? (
        <ErrorState description={userMessage(parcels.error)} onRetry={() => void parcels.refetch()} />
      ) : parcels.data.length === 0 ? (
        <EmptyState icon={<PackageSearch size={28} color={color.ink2} />} title={archived ? "Aucun colis archivé" : "Aucun colis suivi"} description="Ajoutez un numéro de suivi : le transporteur est détecté quand c'est possible." />
      ) : (
        <Card>
          {parcels.data.map((p, i) => (
            <ListRow
              key={p.id}
              testID={`parcel-${p.trackingNumber}`}
              title={p.label || p.trackingNumber}
              subtitle={`${carrierText(p)}${p.label ? ` · ${p.trackingNumber}` : ""}${p.estimatedDelivery && p.status !== "delivered" ? ` · prévu ${frDateTime(p.estimatedDelivery)?.slice(0, 10)}` : ""}`}
              right={<ParcelStatusChip status={p.status} />}
              chevron
              last={i === parcels.data.length - 1}
              onPress={() => router.push({ pathname: "/tools/tracking/[id]", params: { id: p.id } })}
            />
          ))}
        </Card>
      )}
      <View style={{ gap: space[1] }}>
        <Txt variant="label">Actualisation automatique : toutes les 2 à 12 h selon l'étape, arrêtée une fois le colis livré. Tirez vers le bas pour relire.</Txt>
      </View>
    </Screen>
  );
}
