import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useOrders } from "~/data/hooks";
import { ORDER_STATUS_LABEL, PROVIDER_LABEL } from "~/data/sales";
import { userMessage } from "~/lib/errors";
import { useDebounced } from "~/lib/use-debounced";
import { Badge, EmptyState, ErrorState, LoadingState, Muted, TextField, styles as ui } from "~/ui/components";
import { formatDateTime, formatMoney, formatNumber } from "~/ui/format";
import { colors, font, spacing } from "~/ui/theme";

export default function SalesScreen() {
  const [search, setSearch] = useState("");
  const q = useDebounced(search, 350);
  const list = useOrders(q);
  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.rows) ?? [], [list.data]);
  const total = list.data?.pages[0]?.total ?? 0;

  return (
    <SafeAreaView style={ui.screen} edges={["top"]}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
        <Text style={ui.title} accessibilityRole="header">
          Ventes
        </Text>
        <View style={{ marginTop: spacing.md }}>
          <TextField label="Rechercher" placeholder="N° de commande, acheteur…" value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} returnKeyType="search" />
        </View>
        {list.isSuccess ? <Muted>{formatNumber(total)} commande(s) importée(s) ou saisie(s)</Muted> : null}
      </View>
      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState message={userMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm }}
          refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} />}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          ListFooterComponent={list.isFetchingNextPage ? <LoadingState label="Chargement de la suite…" /> : null}
          ListEmptyComponent={
            <EmptyState
              title={q ? "Aucune commande ne correspond" : "Aucune commande"}
              message={q ? "Modifiez la recherche." : "Les commandes apparaissent ici après la synchronisation eBay (connexion depuis l'application web). Aucune commande n'est inventée."}
            />
          }
          renderItem={({ item: o }) => {
            const units = o.items.reduce((s, i) => s + i.quantity, 0);
            const pending = o.items.filter((i) => i.sku_id && !i.inventory_applied).length;
            const unmapped = o.items.filter((i) => !i.sku_id).length;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Commande ${o.order_number ?? o.external_order_id}, ${ORDER_STATUS_LABEL[o.status] ?? o.status}`}
                onPress={() => router.push({ pathname: "/sales/[orderId]", params: { orderId: o.id } })}
                style={({ pressed }) => [ui.card, { opacity: pressed ? 0.85 : 1, marginBottom: spacing.sm }]}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: font.body, fontWeight: "600", color: colors.text }}>{o.order_number ?? o.external_order_id}</Text>
                    <Muted>
                      {PROVIDER_LABEL[o.provider] ?? o.provider} · {formatDateTime(o.placed_at)}
                      {o.buyer_username ? ` · ${o.buyer_username}` : ""}
                    </Muted>
                  </View>
                  <Text style={{ fontSize: font.bodyLarge, fontWeight: "700", color: colors.text }}>{o.total !== null ? formatMoney(o.total, o.currency ?? "EUR") : "—"}</Text>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm, alignItems: "center" }}>
                  <Badge label={ORDER_STATUS_LABEL[o.status] ?? o.status} tone={o.status === "cancelled" || o.status === "refunded" ? "neutral" : "info"} />
                  <Muted>{formatNumber(units)} unité(s)</Muted>
                  {unmapped > 0 ? <Badge label={`${unmapped} ligne(s) sans SKU`} tone="warning" /> : null}
                  {pending > 0 ? <Badge label={`${pending} non déduite(s)`} tone="warning" /> : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
