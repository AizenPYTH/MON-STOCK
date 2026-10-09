import { useMemo, useState } from "react";
import { FlatList, RefreshControl, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Package, Plus } from "lucide-react-native";
import { useActiveOrg } from "~/org/org-provider";
import { useCatalog } from "~/data/hooks";
import { filterCatalog, type CatalogFilter, type ProductGroup } from "~/data/catalog";
import { useDebounced } from "~/lib/use-debounced";
import { userMessage } from "~/lib/errors";
import { AlertBanner, EmptyState, ErrorState, FilterChip, IconButton, ListRow, QtyBadge, RowFrame, Screen, SearchField, Skeleton, SkeletonList, TabHeader, Thumb } from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";
import { useLayout } from "~/theme/layout";

const FILTERS: CatalogFilter[] = ["all", "out", "low", "unlisted"];

export default function StockScreen() {
  const params = useLocalSearchParams<{ filter?: string }>();
  const [filter, setFilter] = useState<CatalogFilter>(FILTERS.includes(params.filter as CatalogFilter) ? (params.filter as CatalogFilter) : "all");
  const [search, setSearch] = useState("");
  const query = useDebounced(search, 200);
  const catalog = useCatalog();
  const { screenX, maxWidth } = useLayout();
  const products = useMemo(() => (catalog.data ? filterCatalog(catalog.data.products, filter, query) : []), [catalog.data, filter, query]);
  const counts = catalog.data?.counts;
  const { permissions } = useActiveOrg();
  const addButton = permissions.canWrite ? <IconButton icon={<Plus size={20} color={color.inkOnDark} strokeWidth={2.4} />} label="Nouveau produit" filled onPress={() => router.push("/product/new")} /> : undefined;

  const header = (
    <View style={{ gap: space.blockGap, paddingBottom: space[3] }}>
      <TabHeader title="Stock" right={addButton} />
      <SearchField value={search} onChangeText={setSearch} placeholder="Nom, SKU, code-barres…" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
        <FilterChip label="Tous" count={counts?.all} selected={filter === "all"} onPress={() => setFilter("all")} />
        <FilterChip label="Rupture" count={counts?.out} tone="danger" selected={filter === "out"} onPress={() => setFilter("out")} />
        <FilterChip label="Faible" count={counts?.low} tone="accent" selected={filter === "low"} onPress={() => setFilter("low")} />
        <FilterChip label="Sans annonce" count={counts?.unlisted} selected={filter === "unlisted"} onPress={() => setFilter("unlisted")} />
      </ScrollView>
      {catalog.data?.truncated ? <AlertBanner text="Plus de 5 000 SKU : seuls les 5 000 premiers sont affichés et comptés." /> : null}
    </View>
  );

  if (catalog.isPending)
    return (
      <Screen scroll={false}>
        <TabHeader title="Stock" />
        <Skeleton w="100%" h={44} r={radius.lg} />
        <View style={{ flexDirection: "row", gap: space[2] }}>
          <Skeleton w={84} h={32} r={radius.pill} />
          <Skeleton w={96} h={32} r={radius.pill} />
          <Skeleton w={88} h={32} r={radius.pill} />
        </View>
        <SkeletonList />
      </Screen>
    );
  if (catalog.isError)
    return (
      <Screen scroll={false}>
        <TabHeader title="Stock" />
        <ErrorState description={userMessage(catalog.error)} onRetry={() => void catalog.refetch()} />
      </Screen>
    );

  return (
    <Screen scroll={false} contentGap={0}>
      <FlatList
        data={products}
        keyExtractor={(p) => p.productId}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={catalog.isRefetching} onRefresh={() => void catalog.refetch()} />}
        contentContainerStyle={{ paddingBottom: space[8] }}
        style={{ marginHorizontal: -screenX, paddingHorizontal: screenX, maxWidth }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          catalog.data.counts.all === 0 ? (
            <EmptyState
              icon={<Package size={28} color={color.ink2} />}
              title="Aucun produit pour l'instant"
              description={permissions.canWrite ? "Créez votre premier produit : marque, modèle, variantes (capacité, couleur, grade), prix et stock initial." : "Aucun produit dans cette organisation. Votre rôle (lecture seule) ne permet pas d'en créer."}
              actions={permissions.canWrite ? [{ label: "Créer un produit", onPress: () => router.push("/product/new") }] : []}
            />
          ) : (
            <EmptyState title="Aucun produit ne correspond" description="Modifiez la recherche ou le filtre." />
          )
        }
        renderItem={({ item, index }) => <ProductRow product={item} first={index === 0} last={index === products.length - 1} />}
      />
    </Screen>
  );
}

function ProductRow({ product: p, first, last }: { product: ProductGroup; first: boolean; last: boolean }) {
  return (
    <RowFrame first={first} last={last}>
      <ListRow
        left={<Thumb uri={p.imageUrl} />}
        title={p.name}
        subtitle={`${p.code} · ${p.skus.length} variante${p.skus.length > 1 ? "s" : ""}`}
        right={<QtyBadge qty={p.totalAvailable} level={p.level} />}
        onPress={() => router.push({ pathname: "/product/[productId]", params: { productId: p.productId } })}
        last={last}
      />
    </RowFrame>
  );
}
