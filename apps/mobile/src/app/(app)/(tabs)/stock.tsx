import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { BatteryMedium, Headphones, Laptop, Package, PackagePlus, Plus, PlugZap, Smartphone, Tablet } from "lucide-react-native";
import type { RadarRestockDTO } from "@/features/mobile-api/contract";
import { useActiveOrg } from "~/org/org-provider";
import { useCatalog, useRadar } from "~/data/hooks";
import { barcodeItems, coverDays, filterCatalog, stockSummary, type CatalogFilter, type ProductGroup } from "~/data/catalog";
import { formatMoney, formatMoneyRounded, formatNumber } from "~/lib/format";
import { useDebounced } from "~/lib/use-debounced";
import { userMessage } from "~/lib/errors";
import { AccountAvatar, AlertBanner, EmptyState, RowFrame, ErrorState, FilterChip, NightHeader, Screen, SearchField, Skeleton, SkeletonList, StageFigure, StockBarcode, Thumb, Txt, useTabBarClearance } from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";
import { useLayout } from "~/theme/layout";

const FILTERS: CatalogFilter[] = ["all", "out", "low", "unlisted"];

export default function StockScreen() {
  const params = useLocalSearchParams<{ filter?: string }>();
  const [filter, setFilter] = useState<CatalogFilter>(FILTERS.includes(params.filter as CatalogFilter) ? (params.filter as CatalogFilter) : "all");
  const [appliedParam, setAppliedParam] = useState(params.filter ?? "");
  // arrivée depuis l'accueil (ruptures, faibles) alors que l'onglet est déjà ouvert
  if ((params.filter ?? "") !== appliedParam) {
    setAppliedParam(params.filter ?? "");
    if (FILTERS.includes(params.filter as CatalogFilter)) setFilter(params.filter as CatalogFilter);
  }
  const [search, setSearch] = useState("");
  const query = useDebounced(search, 200);
  const catalog = useCatalog();
  const radar = useRadar("score");
  const { screenX, maxWidth, compact } = useLayout();
  const products = useMemo(() => (catalog.data ? filterCatalog(catalog.data.products, filter, query) : []), [catalog.data, filter, query]);
  const counts = catalog.data?.counts;
  const summary = useMemo(() => (catalog.data ? stockSummary(catalog.data) : null), [catalog.data]);
  const restockBySku = useMemo(() => new Map((radar.data?.restock ?? []).filter((r) => r.bestOfferId && r.bestPrice !== null).map((r) => [r.skuId, r])), [radar.data]);
  const { active, permissions } = useActiveOrg();
  const currency = active.organization.currency;
  const clearance = useTabBarClearance();

  const addButton = permissions.canWrite ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Nouveau produit"
      accessibilityHint="Créer un nouveau produit"
      onPress={() => router.push("/product/new")}
      testID="stock-new-product"
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: space[3], borderRadius: radius.md, backgroundColor: pressed ? color.mintPressed : color.mint })}
    >
      <Plus size={16} color={color.onMint} strokeWidth={2.6} />
      <Txt variant="button" color={color.onMint} style={{ fontSize: 14 }}>
        Produit
      </Txt>
    </Pressable>
  ) : null;

  const stage =
    catalog.data && summary && summary.skus > 0 ? (
      <View style={{ marginTop: space[3] }}>
        <Txt variant="monoSm" color={color.inkOnDarkMuted}>
          Valeur au coût · {formatNumber(summary.skus)} référence{summary.skus > 1 ? "s" : ""}
        </Txt>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 4 }}>
          <StageFigure value={`${summary.skusWithoutCost > 0 ? "≈ " : ""}${formatMoneyRounded(summary.value, currency)}`} size="md" />
          <View style={{ alignItems: "flex-end", paddingBottom: 6, gap: 2 }}>
            <Txt variant="label" color={color.inkOnDarkMuted} num>
              <Txt variant="body" color={color.inkOnDark} num style={{ fontFamily: "Manrope_700Bold" }}>{formatNumber(summary.units)}</Txt> unités
            </Txt>
            <Txt variant="label" color={color.inkOnDarkMuted} num>
              <Txt variant="body" color={color.inkOnDark} num style={{ fontFamily: "Manrope_700Bold" }}>{formatNumber(catalog.data.counts.all)}</Txt> produit{catalog.data.counts.all > 1 ? "s" : ""}
            </Txt>
          </View>
        </View>
        <View style={{ marginTop: space[3] }}>
          <StockBarcode
            items={barcodeItems(catalog.data)}
            height={30}
            onPressLevel={(level) => setFilter(level === "ok" ? "all" : level)}
            accessibilityLabel={`Stock : ${summary.skus} références, ${catalog.data.counts.out} en rupture, ${catalog.data.counts.low} faibles`}
          />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
          <Txt variant="monoSm" color={color.inkOnDarkSubtle}>
            Chaque barre = une référence
          </Txt>
          {compact ? null : (
            <Txt variant="monoSm" color={color.inkOnDarkSubtle}>
              Largeur = ventes 30 j
            </Txt>
          )}
        </View>
      </View>
    ) : null;

  const header = <NightHeader left={<Txt variant="title1" color={color.inkOnDark} accessibilityRole="header">Stock</Txt>} right={<>{addButton}<AccountAvatar /></>} stage={stage} />;

  const listHeader = (
    <View style={{ gap: space.blockGap, paddingBottom: space[3] }}>
      <SearchField value={search} onChangeText={setSearch} placeholder="Nom, SKU, code-barres…" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
        <FilterChip label="Tous" count={counts?.all} selected={filter === "all"} onPress={() => setFilter("all")} />
        <FilterChip label="Rupture" count={counts?.out} tone="danger" selected={filter === "out"} onPress={() => setFilter("out")} />
        <FilterChip label="Faible" count={counts?.low} tone="accent" selected={filter === "low"} onPress={() => setFilter("low")} />
        <FilterChip label="Sans annonce" count={counts?.unlisted} selected={filter === "unlisted"} onPress={() => setFilter("unlisted")} />
      </ScrollView>
      {catalog.data?.truncated ? <AlertBanner text="Plus de 5 000 SKU : seuls les 5 000 premiers sont affichés et comptés." /> : null}
      {products.length > 0 ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: space[1] }}>
          <Txt variant="monoSm">Alertes d'abord, puis A → Z</Txt>
          <Txt variant="monoSm">Qté · couverture</Txt>
        </View>
      ) : null}
    </View>
  );

  if (catalog.isPending)
    return (
      <Screen scroll={false} header={header}>
        <Skeleton w="100%" h={52} r={radius.pill} />
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
      <Screen scroll={false} header={header}>
        <ErrorState description={userMessage(catalog.error)} onRetry={() => void catalog.refetch()} />
      </Screen>
    );

  return (
    <Screen scroll={false} contentGap={0} header={header}>
      <FlatList
        data={products}
        keyExtractor={(p) => p.productId}
        ListHeaderComponent={listHeader}
        refreshControl={<RefreshControl refreshing={catalog.isRefetching} onRefresh={() => void Promise.all([catalog.refetch(), radar.refetch()])} />}
        contentContainerStyle={{ paddingBottom: space[8] + clearance }}
        style={{ marginHorizontal: -screenX, paddingHorizontal: screenX, maxWidth }}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={products.length > 0 ? <Txt variant="note" style={{ marginTop: space[3] }}>Couverture : stock disponible ÷ ventes quotidiennes des 30 derniers jours.</Txt> : null}
        ListEmptyComponent={
          catalog.data.counts.all === 0 ? (
            <EmptyState
              icon={<Package size={28} color={color.ink2} />}
              title="Aucun produit"
              description={permissions.canWrite ? "Ajoutez votre premier produit et ses variantes." : "Lecture seule : votre rôle ne permet pas d'en créer."}
              actions={permissions.canWrite ? [{ label: "Créer un produit", onPress: () => router.push("/product/new") }] : []}
            />
          ) : (
            <EmptyState
              title="Aucun résultat"
              description={search ? `Rien pour « ${search} »${filter !== "all" ? " avec ce filtre" : ""}.` : "Aucun produit dans ce filtre."}
              actions={[
                ...(filter !== "all" || search ? [{ label: "Effacer la recherche et les filtres", onPress: () => { setSearch(""); setFilter("all"); } }] : []),
                ...(search ? [{ label: `Chercher « ${search} » chez les fournisseurs`, variant: "secondary" as const, onPress: () => router.push({ pathname: "/sourcing", params: { q: search } }) }] : []),
              ]}
            />
          )
        }
        renderItem={({ item, index }) => <ProductRow product={item} first={index === 0} last={index === products.length - 1} restock={item.level !== "ok" ? (item.skus.map((v) => restockBySku.get(v.row.sku_id ?? "")).find(Boolean) ?? null) : null} currency={currency} />}
      />
    </Screen>
  );
}

/** Pictogramme de catégorie (jamais une fausse photo). */
function CategoryGlyph({ product: p }: { product: ProductGroup }) {
  const t = `${p.category ?? ""} ${p.name}`.toLowerCase();
  const props = { size: 19, color: color.ink2, strokeWidth: 1.7 };
  if (/batter|akku/.test(t)) return <BatteryMedium {...props} />;
  if (/airpods|casque|écouteur|headphone/.test(t)) return <Headphones {...props} />;
  if (/chargeur|câble|cable|adaptateur|charger/.test(t)) return <PlugZap {...props} />;
  if (/ipad|tablette|tablet/.test(t)) return <Tablet {...props} />;
  if (/macbook|laptop|ordinateur/.test(t)) return <Laptop {...props} />;
  if (/écran|ecran|vitre|coque|pièce|piece/.test(t)) return <Package {...props} />;
  return <Smartphone {...props} />;
}

/** Ligne v5 : une carte continue ; vignette, nom, codes, rachat possible, quantité et couverture. */
function ProductRow({ product: p, first, last, restock, currency }: { product: ProductGroup; first: boolean; last: boolean; restock: RadarRestockDTO | null; currency: string }) {
  const units30 = p.skus.reduce((s, v) => s + Math.max(0, v.row.units_30d ?? 0), 0);
  const cover = coverDays(p.totalAvailable, units30);
  const safe = typeof p.imageUrl === "string" && /^https:\/\//i.test(p.imageUrl) ? p.imageUrl : null;
  const coverText = p.level === "out" ? "rupture" : cover === null ? "—" : `≈ ${formatNumber(cover)} j`;
  const coverFg = p.level === "out" ? color.dangerInk : p.level === "low" ? color.accentInkOnSoft : color.ink3;
  const meta = [p.code, `${p.skus.length} var.`, units30 > 0 ? `${formatNumber(units30)} v./30 j` : null, p.activeListings === 0 ? "sans annonce" : null].filter(Boolean).join(" · ");
  const restockLabel = restock?.bestOfferId ? `Racheter dès ${formatMoney(restock.bestPrice, currency)} chez ${restock.bestSupplier ?? "le fournisseur"}` : null;
  const openRestock = () => restock?.bestOfferId && router.push({ pathname: "/radar/[offerId]", params: { offerId: restock.bestOfferId } });
  return (
    <RowFrame first={first} last={last}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${p.name}, ${formatNumber(p.totalAvailable)} en stock${p.level === "out" ? ", rupture" : p.level === "low" ? ", stock faible" : ""}${cover !== null && p.level !== "out" ? `, environ ${cover} jours de ventes` : ""}${restockLabel ? `. ${restockLabel}` : ""}`}
        accessibilityHint={restockLabel ? "Balayez vers le haut ou le bas pour l'action « Racheter »." : undefined}
        // M-11 : un Pressable masque ses enfants à VoiceOver → l'action « Racheter » est exposée
        // comme action personnalisée de la ligne (le bouton visible reste pour le toucher).
        accessibilityActions={restockLabel ? [{ name: "restock", label: restockLabel }] : undefined}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "restock") openRestock();
        }}
        onPress={() => router.push({ pathname: "/product/[productId]", params: { productId: p.productId } })}
        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 68, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: pressed ? color.surfacePressed : "transparent", borderBottomWidth: last ? 0 : 1, borderBottomColor: color.lineSoft })}
      >
        {safe ? (
          <Thumb uri={safe} />
        ) : (
          <View style={{ width: 44, height: 44, borderRadius: radius.lg, backgroundColor: color.bg, borderWidth: 1, borderColor: color.lineSoft, alignItems: "center", justifyContent: "center" }}>
            <CategoryGlyph product={p} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Txt variant="body" numberOfLines={1}>
            {p.name}
          </Txt>
          <Txt variant="code" numberOfLines={1} style={{ fontSize: 10.5 }}>
            {meta}
          </Txt>
          {restock && restockLabel ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={restockLabel}
              onPress={openRestock}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", maxWidth: "100%", marginTop: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.xs, backgroundColor: pressed ? color.mintSoft : color.successSoft })}
            >
              <PackagePlus size={13} color={color.success} strokeWidth={2.2} />
              <Txt variant="label" color={color.success} numberOfLines={1} style={{ fontFamily: "Manrope_700Bold", fontSize: 12, flexShrink: 1 }}>
                Racheter dès {formatMoney(restock.bestPrice, currency)}
                {restock.bestSupplier ? ` · ${restock.bestSupplier}` : ""}
              </Txt>
            </Pressable>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          <Txt variant="title2" num style={{ fontSize: 20, lineHeight: 24, fontFamily: "Manrope_700Bold" }}>
            {formatNumber(p.totalAvailable)}
          </Txt>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            {p.level !== "ok" ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: p.level === "out" ? color.danger : color.accent }} /> : null}
            <Txt variant="code" color={coverFg} style={{ fontSize: 10.5 }}>
              {coverText}
            </Txt>
          </View>
        </View>
      </Pressable>
    </RowFrame>
  );
}
