import { useMemo } from "react";
import { Image, RefreshControl, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useActiveOrg } from "~/org/org-provider";
import { useCatalog, useMarginContext } from "~/data/hooks";
import { summarizeProduct } from "~/data/catalog";
import { userMessage } from "~/lib/errors";
import { formatMoneyRounded, formatNumber } from "~/lib/format";
import { Pencil } from "lucide-react-native";
import { Button, Card, DetailHeader, IconButton, EmptyState, ErrorState, KpiCard, KpiGrid, ListRow, Screen, SectionHeader, Skeleton, StatusChip, StickyActions, Txt } from "~/components/ui";
import { QuantityCard, variantTitle } from "~/components/stock";
import { color, radius, space } from "~/theme/tokens";

export default function ProductScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const catalog = useCatalog();
  const margin = useMarginContext();
  const { active, permissions } = useActiveOrg();
  const product = useMemo(() => catalog.data?.products.find((p) => p.productId === productId) ?? null, [catalog.data, productId]);

  if (catalog.isPending || margin.isPending)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Stock" />
        <Skeleton w="100%" h={170} r={radius.xxl} />
        <Skeleton w="70%" h={26} />
        <Skeleton w="100%" h={74} r={radius.lg} />
      </Screen>
    );
  if (catalog.isError)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Stock" />
        <ErrorState description={userMessage(catalog.error)} onRetry={() => void catalog.refetch()} />
      </Screen>
    );
  if (!product)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Stock" />
        <EmptyState title="Produit introuvable" description="Il a peut-être été archivé, ou n'appartient pas à l'organisation active." />
      </Screen>
    );

  const summary = summarizeProduct(product, margin.data!, active.organization.currency);
  const single = product.skus.length === 1 ? product.skus[0]! : null;
  const price =
    summary.price.min === null ? "—" : summary.price.min === summary.price.max ? formatMoneyRounded(summary.price.min, summary.currency) : `dès ${formatMoneyRounded(summary.price.min, summary.currency)}`;
  const threshold = product.skus.reduce((s, v) => s + (v.row.reorder_point ?? 0), 0);
  const levelChip = product.level === "out" ? <StatusChip label="Rupture" tone="danger" /> : product.level === "low" ? <StatusChip label="Stock faible" tone="accent" /> : <StatusChip label="En stock" tone="success" />;

  return (
    <Screen
      footer={
        <StickyActions>
          <Button
            label="Ajuster"
            variant="secondary"
            disabled={!permissions.canWrite}
            onPress={() => (single ? router.push({ pathname: "/adjust", params: { skuId: single.row.sku_id ?? "" } }) : router.push({ pathname: "/sku/[skuId]", params: { skuId: product.skus[0]!.row.sku_id ?? "" } }))}
            style={{ flex: 1 }}
          />
          <Button label="Mise en vente eBay · bientôt" disabled onPress={() => {}} style={{ flex: 2 }} accessibilityHint="La création d'annonces eBay depuis l'application n'est pas encore disponible." />
        </StickyActions>
      }
      refreshControl={<RefreshControl refreshing={catalog.isRefetching} onRefresh={() => void catalog.refetch()} />}
    >
      <DetailHeader
        parentLabel="Stock"
        right={permissions.canWrite ? <IconButton icon={<Pencil size={18} color={color.ink} />} label="Modifier le produit" onPress={() => router.push({ pathname: "/product/edit/[productId]", params: { productId: product.productId } })} /> : undefined}
      />
      {product.imageUrl && /^https:\/\//.test(product.imageUrl) ? (
        <Image source={{ uri: product.imageUrl }} accessibilityLabel={`Photo : ${product.name}`} style={{ width: "100%", height: 170, borderRadius: radius.xxl, backgroundColor: color.skeleton }} resizeMode="cover" />
      ) : null}
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: space[3] }}>
          <Txt variant="title2" style={{ flex: 1 }} accessibilityRole="header">
            {product.name}
          </Txt>
          {levelChip}
        </View>
        <Txt variant="label">
          SKU {product.code}
          {product.activeListings > 0 ? ` · ${product.activeListings} annonce${product.activeListings > 1 ? "s" : ""} eBay active${product.activeListings > 1 ? "s" : ""}` : " · aucune annonce active"}
        </Txt>
      </View>
      <KpiGrid>
        {[
          <KpiCard key="price" label="Prix" value={price} />,
          <KpiCard key="cost" label="Coût moy." value={summary.averageCost === null ? "—" : formatMoneyRounded(summary.averageCost, summary.currency)} />,
          <KpiCard key="margin" label="Marge" value={summary.netMarginPercent === null ? "—" : `${Math.round(summary.netMarginPercent)} %`} hintTone="success" hint={summary.netMarginPercent === null ? "coûts inconnus" : undefined} />,
        ]}
      </KpiGrid>
      {single ? <QuantityCard view={single} canWrite={permissions.canWrite} /> : (
        <Card padded>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <Txt variant="body" style={{ fontFamily: "Manrope_700Bold" }}>
                Quantité totale
              </Txt>
              <Txt variant="label">Seuil d'alerte : {formatNumber(threshold)}</Txt>
            </View>
            <Txt variant="title2" num style={{ fontSize: 24 }}>
              {formatNumber(product.totalAvailable)}
            </Txt>
          </View>
        </Card>
      )}
      <SectionHeader
        title="Variantes"
        action={permissions.canWrite ? { label: "Ajouter", onPress: () => router.push({ pathname: "/product/add-variant/[productId]", params: { productId: product.productId } }) } : undefined}
      />
      <Card>
        {product.skus.map((v, i) => (
          <ListRow
            key={v.row.sku_id ?? i}
            title={variantTitle(v)}
            subtitle={v.row.code ?? ""}
            right={
              <Txt variant="kpiSm" num style={{ fontSize: 17 }} color={(v.row.quantity_available ?? 0) <= 0 ? color.danger : color.ink}>
                {formatNumber(v.row.quantity_available ?? 0)}
              </Txt>
            }
            chevron
            onPress={() => router.push({ pathname: "/sku/[skuId]", params: { skuId: v.row.sku_id ?? "" } })}
            last={i === product.skus.length - 1}
          />
        ))}
      </Card>
    </Screen>
  );
}
