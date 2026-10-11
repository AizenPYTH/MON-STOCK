import { useMemo, useState } from "react";
import { RefreshControl, SectionList, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Tag } from "lucide-react-native";
import { useActiveOrg } from "~/org/org-provider";
import { useListings, useOrders, useSalesKpis } from "~/data/hooks";
import { groupOrdersByDay, ORDER_CHIP, type OrderListItem } from "~/data/sales";
import { userMessage } from "~/lib/errors";
import { formatLongDate, formatMoneyRounded, formatNumber } from "~/lib/format";
import { BRANDS } from "~/brands/registry";
import { BrandMark, EmptyState, ErrorState, ListRow, RowFrame, Screen, Skeleton, SkeletonList, StatusChip, TabHeader, Txt, useTabBarClearance } from "~/components/ui";
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
  const clearance = useTabBarClearance();

  const rows = useMemo(() => (orders.data?.pages.flatMap((p) => p.rows) ?? []) as OrderListItem[], [orders.data]);
  const sections = useMemo(() => groupOrdersByDay(rows, new Date(), formatLongDate), [rows]);
  const listingRows = useMemo(() => listings.data?.pages.flatMap((p) => p.rows) ?? [], [listings.data]);

  type Tab = "toship" | "all" | "listings";
  const tab: Tab = segment === "listings" ? "listings" : toShipOnly ? "toship" : "all";
  const setTab = (t: Tab) => {
    if (t === "listings") setSegment("listings");
    else {
      setSegment("orders");
      setToShipOnly(t === "toship");
    }
  };
  const nightHeader = (
    <TabHeader
      title="Ventes"
      hero={
        k.data
          ? {
              value: formatMoneyRounded(k.data.revenue7d, currency),
              label: "Chiffre d'affaires · 7 jours",
              stats: [
                { label: "À expédier", value: formatNumber(k.data.toShip), tone: k.data.toShip > 0 ? "warning" : undefined },
                { label: "Remboursées · 30 j", value: formatNumber(k.data.refunded30d) },
                { label: "Annonces actives", value: formatNumber(k.data.listingsActive) },
              ],
            }
          : undefined
      }
      tabs={{
        value: tab,
        onChange: setTab,
        options: [
          { value: "toship", label: "À expédier" },
          { value: "all", label: "Toutes" },
          { value: "listings", label: "Annonces" },
        ],
      }}
    />
  );
  const header = k.isPending && segment === "orders" ? (
    <View style={{ paddingBottom: space[2] }}>
      <Skeleton w="100%" h={18} r={radius.xs} />
    </View>
  ) : null;

  if (segment === "listings") {
    return (
      <Screen scroll={false} contentGap={0} header={nightHeader}>
        <SectionList
          sections={listingRows.length ? [{ key: "l", title: "", data: listingRows }] : []}
          keyExtractor={(l) => l.id}
          ListHeaderComponent={header}
          style={{ marginHorizontal: -screenX, paddingHorizontal: screenX }}
          contentContainerStyle={{ paddingBottom: space[8] + clearance }}
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
                  left={<BrandMark brand={BRANDS.ebay} withName={false} />}
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
    <Screen scroll={false} contentGap={0} header={nightHeader}>
      <SectionList
        sections={sections}
        keyExtractor={(o) => o.id}
        ListHeaderComponent={header}
        stickySectionHeadersEnabled={false}
        style={{ marginHorizontal: -screenX, paddingHorizontal: screenX }}
        contentContainerStyle={{ paddingBottom: space[8] + clearance }}
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
