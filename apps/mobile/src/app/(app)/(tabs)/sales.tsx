import { useMemo, useState } from "react";
import { RefreshControl, SectionList, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Tag } from "lucide-react-native";
import { useActiveOrg } from "~/org/org-provider";
import { useListings, useOrders, useSalesKpis } from "~/data/hooks";
import { groupOrdersByDay, ORDER_CHIP, type OrderListItem } from "~/data/sales";
import { userMessage } from "~/lib/errors";
import { formatLongDate, formatMoneyRounded, formatNumber } from "~/lib/format";
import { EmptyState, ErrorState, KpiCard, KpiGrid, ListRow, RowFrame, Screen, Segmented, Skeleton, SkeletonList, StatusChip, TabHeader, Txt } from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";
import { useLayout } from "~/theme/layout";

type Segment = "orders" | "listings";

export default function SalesScreen() {
  const params = useLocalSearchParams<{ status?: string; segment?: string }>();
  const [segment, setSegment] = useState<Segment>(params.segment === "listings" ? "listings" : "orders");
  const [appliedSegment, setAppliedSegment] = useState(params.segment ?? "");
  if ((params.segment ?? "") !== appliedSegment) {
    setAppliedSegment(params.segment ?? "");
    if (params.segment === "listings") setSegment("listings");
  }
  const [toShipOnly, setToShipOnly] = useState(params.status === "paid");
  const { active } = useActiveOrg();
  const currency = active.organization.currency;
  const k = useSalesKpis();
  const orders = useOrders(toShipOnly ? "paid" : undefined);
  const listings = useListings(segment === "listings");
  const { screenX } = useLayout();

  const rows = useMemo(() => (orders.data?.pages.flatMap((p) => p.rows) ?? []) as OrderListItem[], [orders.data]);
  const sections = useMemo(() => groupOrdersByDay(rows, new Date(), formatLongDate), [rows]);
  const listingRows = useMemo(() => listings.data?.pages.flatMap((p) => p.rows) ?? [], [listings.data]);

  const header = (
    <View style={{ gap: space.blockGap, paddingBottom: space[2] }}>
      <TabHeader title="Ventes" />
      <Segmented
        value={segment}
        onChange={setSegment}
        options={[
          { value: "orders", label: "Commandes" },
          { value: "listings", label: k.data ? `Annonces eBay · ${formatNumber(k.data.listingsActive)}` : "Annonces eBay" },
        ]}
      />
      {segment === "orders" ? (
        k.isPending ? (
          <Skeleton w="100%" h={74} r={radius.lg} />
        ) : k.data ? (
          <KpiGrid>
            {[
              <KpiCard key="ship" dark={toShipOnly} selected={toShipOnly} label="À expédier" value={formatNumber(k.data.toShip)} onPress={() => setToShipOnly((v) => !v)} hint={toShipOnly ? "filtre actif" : undefined} />,
              <KpiCard key="7d" label="7 jours" value={formatMoneyRounded(k.data.revenue7d, currency)} />,
              <KpiCard key="ref" label="Remboursées · 30 j" value={formatNumber(k.data.refunded30d)} />,
            ]}
          </KpiGrid>
        ) : null
      ) : null}
    </View>
  );

  if (segment === "listings") {
    return (
      <Screen scroll={false} contentGap={0}>
        <SectionList
          sections={listingRows.length ? [{ key: "l", title: "", data: listingRows }] : []}
          keyExtractor={(l) => l.id}
          ListHeaderComponent={header}
          style={{ marginHorizontal: -screenX, paddingHorizontal: screenX }}
          refreshControl={<RefreshControl refreshing={listings.isRefetching} onRefresh={() => void listings.refetch()} />}
          onEndReached={() => listings.hasNextPage && !listings.isFetchingNextPage && void listings.fetchNextPage()}
          renderSectionHeader={() => null}
          ListEmptyComponent={
            listings.isPending ? (
              <SkeletonList rows={6} />
            ) : listings.isError ? (
              <ErrorState description={userMessage(listings.error)} onRetry={() => void listings.refetch()} />
            ) : (
              <EmptyState icon={<Tag size={28} color={color.ink2} />} title="Aucune annonce eBay" description="Les annonces apparaissent après la connexion et la synchronisation de votre compte eBay." actions={[{ label: "Connecter eBay", onPress: () => router.push("/ebay") }]} />
            )
          }
          renderItem={({ item: l, index }) => {
            const out = (l.quantity_available ?? 0) <= 0;
            const chip = l.status !== "active" ? { label: "Terminée", tone: "neutral" as const } : out ? { label: "Sans stock", tone: "danger" as const } : { label: "Active", tone: "success" as const };
            return (
              <RowFrame first={index === 0} last={index === listingRows.length - 1}>
                <ListRow
                  title={l.title ?? l.external_listing_id}
                  subtitle={`${formatNumber(l.quantity_available ?? 0)} en vente${l.sku_id ? "" : " · non associée à un SKU"}`}
                  right={
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Txt variant="body" num style={{ fontFamily: "Manrope_700Bold" }}>
                        {l.price === null ? "—" : formatMoneyRounded(l.price, l.currency ?? currency)}
                      </Txt>
                      <StatusChip label={chip.label} tone={chip.tone} />
                    </View>
                  }
                  onPress={() => router.push({ pathname: "/listing/[listingId]", params: { listingId: l.id } })}
                  last={index === listingRows.length - 1}
                />
              </RowFrame>
            );
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentGap={0}>
      <SectionList
        sections={sections}
        keyExtractor={(o) => o.id}
        ListHeaderComponent={header}
        stickySectionHeadersEnabled={false}
        style={{ marginHorizontal: -screenX, paddingHorizontal: screenX }}
        contentContainerStyle={{ paddingBottom: space[8] }}
        refreshControl={<RefreshControl refreshing={orders.isRefetching} onRefresh={() => void Promise.all([orders.refetch(), k.refetch()])} />}
        onEndReachedThreshold={0.5}
        onEndReached={() => orders.hasNextPage && !orders.isFetchingNextPage && void orders.fetchNextPage()}
        renderSectionHeader={({ section }) => (
          <Txt variant="overline" style={{ marginTop: space[4], marginBottom: space[2] }}>
            {section.title}
          </Txt>
        )}
        ListEmptyComponent={
          orders.isPending ? (
            <SkeletonList rows={6} thumb={false} />
          ) : orders.isError ? (
            <ErrorState description={userMessage(orders.error)} onRetry={() => void orders.refetch()} />
          ) : toShipOnly ? (
            <EmptyState title="Rien à expédier" description="Aucune commande payée en attente d'expédition." />
          ) : (
            <EmptyState
              icon={<Tag size={28} color={color.ink2} />}
              title="Aucune commande pour l'instant"
              description="Connectez votre compte eBay depuis l'application web pour synchroniser vos ventes. La saisie de ventes directes sur mobile arrive prochainement."
            />
          )
        }
        renderItem={({ item: o, index, section }) => {
          const chip = ORDER_CHIP[o.status] ?? ORDER_CHIP.unknown!;
          const title = o.items[0]?.title ? `${o.items[0].title}${o.items.length > 1 ? ` +${o.items.length - 1}` : ""}` : "Commande";
          const last = index === section.data.length - 1;
          return (
            <RowFrame first={index === 0} last={last}>
              <ListRow
                title={title}
                subtitle={`${o.order_number ?? o.external_order_id}${o.buyer_username ? ` · ${o.buyer_username}` : ""}`}
                right={
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Txt variant="body" num style={{ fontFamily: "Manrope_700Bold" }}>
                      {o.total === null ? "—" : formatMoneyRounded(o.total, o.currency ?? currency)}
                    </Txt>
                    <StatusChip label={chip.label} tone={chip.tone} />
                  </View>
                }
                onPress={() => router.push({ pathname: "/order/[orderId]", params: { orderId: o.id } })}
                last={last}
              />
            </RowFrame>
          );
        }}
      />
    </Screen>
  );
}
