import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { skuLabel } from "@/features/stock/model";
import { useStockList } from "~/data/hooks";
import { STOCK_FILTERS, STOCK_FILTER_LABEL, STOCK_SORTS, STOCK_SORT_LABEL, type StockFilter, type StockSort } from "~/data/stock";
import { userMessage } from "~/lib/errors";
import { useDebounced } from "~/lib/use-debounced";
import { Badge, Chip, EmptyState, ErrorState, LoadingState, Muted, TextField, styles as ui } from "~/ui/components";
import { formatDays, formatMoney, formatNumber, STOCK_LEVEL_LABEL, STOCK_LEVEL_TONE } from "~/ui/format";
import { colors, font, spacing } from "~/ui/theme";

export default function StockListScreen() {
  const params = useLocalSearchParams<{ filter?: string; sort?: string }>();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StockFilter>(STOCK_FILTERS.includes(params.filter as StockFilter) ? (params.filter as StockFilter) : "all");
  const [sort, setSort] = useState<StockSort>(STOCK_SORTS.includes(params.sort as StockSort) ? (params.sort as StockSort) : "best_sellers");
  const q = useDebounced(search, 350);
  const list = useStockList({ q, filter, sort });
  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.rows) ?? [], [list.data]);
  const total = list.data?.pages[0]?.total ?? 0;

  return (
    <SafeAreaView style={ui.screen} edges={["top"]}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
        <Text style={ui.title} accessibilityRole="header">
          Stock
        </Text>
        <View style={{ marginTop: spacing.md }}>
          <TextField label="Rechercher" placeholder="Nom, code SKU, code-barres, marque…" value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} clearButtonMode="while-editing" returnKeyType="search" />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.sm }}>
          {STOCK_FILTERS.map((f) => (
            <Chip key={f} label={STOCK_FILTER_LABEL[f]} selected={filter === f} onPress={() => setFilter(f)} />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.sm }}>
          {STOCK_SORTS.map((s) => (
            <Chip key={s} label={STOCK_SORT_LABEL[s]} selected={sort === s} onPress={() => setSort(s)} />
          ))}
        </ScrollView>
        {list.isSuccess ? <Muted>{formatNumber(total)} SKU</Muted> : null}
      </View>

      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState message={userMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(v) => v.row.sku_id ?? v.row.code ?? ""}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm }}
          refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} />}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          ListFooterComponent={list.isFetchingNextPage ? <LoadingState label="Chargement de la suite…" /> : null}
          ListEmptyComponent={
            <EmptyState
              title={q || filter !== "all" ? "Aucun SKU ne correspond" : "Aucun produit en stock"}
              message={q || filter !== "all" ? "Modifiez la recherche ou le filtre." : "Créez vos produits depuis l'application web MON STOCK, ou importez vos annonces eBay."}
            />
          }
          renderItem={({ item: v }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${skuLabel(v.row)}, code ${v.row.code}, ${v.row.quantity_available ?? 0} disponible(s), ${STOCK_LEVEL_LABEL[v.classification.level]}`}
              onPress={() => router.push({ pathname: "/stock/[skuId]", params: { skuId: v.row.sku_id ?? "" } })}
              style={({ pressed }) => [ui.card, { opacity: pressed ? 0.85 : 1, marginBottom: spacing.sm }]}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font.body, fontWeight: "600", color: colors.text }} numberOfLines={2}>
                    {skuLabel(v.row)}
                  </Text>
                  <Muted>
                    {v.row.code}
                    {v.row.brand ? ` · ${v.row.brand}` : ""}
                  </Muted>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontSize: 22, fontWeight: "700", color: (v.row.quantity_available ?? 0) < 0 ? colors.danger : colors.text }}>{formatNumber(v.row.quantity_available ?? 0)}</Text>
                  <Muted>disponible(s)</Muted>
                </View>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm, alignItems: "center" }}>
                <Badge label={STOCK_LEVEL_LABEL[v.classification.level]} tone={STOCK_LEVEL_TONE[v.classification.level]} />
                <Muted>{v.daysOfCover !== null ? `Couverture ${formatDays(v.daysOfCover)}` : "Couverture inconnue"}</Muted>
                <Muted>· {formatNumber(v.row.units_30d ?? 0)} vendu(s) / 30 j</Muted>
                {v.row.sale_price !== null ? <Muted>· {formatMoney(v.row.sale_price, v.row.currency ?? "EUR")}</Muted> : null}
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}
