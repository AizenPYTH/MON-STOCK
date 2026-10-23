import { useState } from "react";
import { Pressable, RefreshControl, View } from "react-native";
import { router } from "expo-router";
import { PackageSearch } from "lucide-react-native";
import { parcelDisplay, relativeFr } from "@/domain/tools/tracking";
import { FooterActions } from "~/components/calc-screen";
import { carrierText, PARCEL_TONE } from "~/components/tracking";
import { AlertBanner, cardStyle, EmptyState, ErrorState, NightHeader, Screen, SkeletonList, Txt } from "~/components/ui";
import { useParcels, useToolsStatus } from "~/data/hooks";
import { PARCELS_LIMIT } from "~/data/tracking";
import { userMessage } from "~/lib/errors";
import { useActiveOrg } from "~/org/org-provider";
import { color, radius, size, space } from "~/theme/tokens";

/**
 * Colis (maquette v3 « version simple ») : un point de couleur, le nom, le transporteur et
 * l'heure, le statut renvoyé par l'API de suivi (« Non vérifié » tant qu'aucune API n'a répondu).
 */
export default function TrackingListScreen() {
  const [archived, setArchived] = useState(false);
  const parcels = useParcels(archived);
  const status = useToolsStatus();
  const { permissions } = useActiveOrg();
  const noApi = status.data ? !status.data.tracking.laposte && !status.data.tracking.ship24 && !status.data.tracking.dhl : false;
  const add = () => router.push("/tools/tracking/new");

  return (
    <Screen
      refreshControl={<RefreshControl refreshing={parcels.isRefetching} onRefresh={() => void parcels.refetch()} />}
      header={
        <NightHeader
          back={{ label: archived ? "Colis" : "Outils", onPress: () => (archived ? setArchived(false) : router.canGoBack() ? router.back() : router.replace("/tools")) }}
          title={archived ? "Colis archivés" : "Colis"}
          right={
            permissions.canWrite && !archived ? (
              <Pressable testID="tracking-plus" accessibilityRole="button" accessibilityLabel="Suivre un colis" hitSlop={6} onPress={add} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? color.mintPressed : color.mint })}>
                <Txt variant="title2" color={color.onMint} style={{ fontSize: 22, lineHeight: 26 }}>
                  +
                </Txt>
              </Pressable>
            ) : undefined
          }
        />
      }
      footer={permissions.canWrite && !archived ? <FooterActions primary={{ label: "Suivre un colis", onPress: add, testID: "tracking-add" }} /> : undefined}
    >
      {noApi ? <AlertBanner text="Suivi automatique pas encore activé sur le serveur : les statuts restent « Non vérifié ». Ouvrez un colis pour le suivre gratuitement sur le site du transporteur." tone="dark" /> : null}
      {parcels.isPending ? (
        <SkeletonList rows={5} thumb={false} />
      ) : parcels.isError ? (
        <ErrorState description={userMessage(parcels.error)} onRetry={() => void parcels.refetch()} />
      ) : parcels.data.length === 0 ? (
        <EmptyState icon={<PackageSearch size={28} color={color.ink2} />} title={archived ? "Aucun colis archivé" : "Aucun colis suivi"} description="Ajoutez un numéro de suivi : le transporteur est détecté quand c'est possible." />
      ) : (
        <View style={[cardStyle, { overflow: "hidden" }]}>
          {parcels.data.map((p, i) => {
            const d = parcelDisplay(p);
            const tone = PARCEL_TONE[d.tone];
            const when = relativeFr(p.lastCheckedAt ?? p.createdAt) ?? "";
            return (
              <Pressable
                key={p.id}
                testID={`parcel-${p.trackingNumber}`}
                accessibilityRole="button"
                accessibilityLabel={`${p.label || p.trackingNumber}, ${carrierText(p)}, ${d.label}`}
                onPress={() => router.push({ pathname: "/tools/tracking/[id]", params: { id: p.id } })}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 68, paddingHorizontal: space[4], paddingVertical: space[2], backgroundColor: pressed ? color.surfacePressed : "transparent", borderBottomWidth: i === parcels.data.length - 1 ? 0 : 2, borderBottomColor: color.surface })}
              >
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tone.dot }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="body" numberOfLines={1} style={{ fontFamily: "Manrope_700Bold", fontSize: 16, lineHeight: 20 }}>
                    {p.label || p.trackingNumber}
                  </Txt>
                  <Txt variant="label" numberOfLines={1}>
                    {carrierText(p)}
                    {when ? ` · ${when}` : ""}
                  </Txt>
                </View>
                <Txt variant="label" color={tone.text} numberOfLines={1} style={{ fontFamily: "Manrope_800ExtraBold", fontSize: 14 }}>
                  {d.label}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      )}
      {parcels.data && parcels.data.length >= PARCELS_LIMIT ? <Txt variant="label">Les {PARCELS_LIMIT} colis les plus récents sont affichés : archivez les colis livrés pour voir les autres.</Txt> : null}
      {!archived ? (
        <Pressable accessibilityRole="button" testID="tracking-archived" onPress={() => setArchived(true)} style={{ alignSelf: "center", minHeight: size.touchMin, justifyContent: "center", paddingHorizontal: space[3], borderRadius: radius.md }}>
          <Txt variant="label" color={color.ink2} style={{ fontFamily: "Manrope_700Bold" }}>
            Voir les colis archivés
          </Txt>
        </Pressable>
      ) : null}
    </Screen>
  );
}
