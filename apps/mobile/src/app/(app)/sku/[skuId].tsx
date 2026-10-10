import { RefreshControl, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { UNKNOWN_COST_LABEL } from "@/domain/pricing/margin";
import { useActiveOrg } from "~/org/org-provider";
import { useSkuDetail } from "~/data/hooks";
import { userMessage } from "~/lib/errors";
import { formatDateTime, formatDays, formatMoneyRounded, formatNumber, MOVEMENT_TYPE_LABEL, STOCK_LEVEL_LABEL } from "~/lib/format";
import { Pencil } from "lucide-react-native";
import { AlertBanner, Button, Card, DetailHeader, IconButton, EmptyState, ErrorState, KpiCard, KpiGrid, ListRow, Screen, SectionHeader, Skeleton, StatusChip, StickyActions, Txt } from "~/components/ui";
import { QuantityCard, variantTitle } from "~/components/stock";
import { color, radius } from "~/theme/tokens";

const LEVEL_TONE = { out_of_stock: "danger", at_risk: "accent", low: "accent", normal: "success" } as const;

/** Fiche variante (SKU) : quantité avec stepper, prix / coût / marge, couverture, historique des mouvements. */
export default function SkuScreen() {
  const { skuId } = useLocalSearchParams<{ skuId: string }>();
  const { permissions } = useActiveOrg();
  const q = useSkuDetail(skuId ?? "");

  if (q.isPending)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Produit" />
        <Skeleton w="70%" h={26} />
        <Skeleton w="100%" h={74} r={radius.lg} />
        <Skeleton w="100%" h={80} r={radius.xl} />
      </Screen>
    );
  if (q.isError)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Produit" />
        <ErrorState description={userMessage(q.error)} onRetry={() => void q.refetch()} />
      </Screen>
    );
  if (!q.data)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Produit" />
        <EmptyState title="Variante introuvable" description="Elle a peut-être été archivée, ou n'appartient pas à l'organisation active." />
      </Screen>
    );

  const { view: v, movements, pendingSalesCount, onOrder } = q.data;
  const r = v.row;
  const currency = r.currency ?? "EUR";

  return (
    <Screen
      footer={
        <StickyActions>
          <Button
            label="Trouver un fournisseur"
            variant="secondary"
            onPress={() => router.push({ pathname: "/sourcing", params: { q: [r.brand && !(r.product_name ?? "").toLowerCase().startsWith(r.brand.toLowerCase()) ? r.brand : null, r.product_name, r.variant_name && r.variant_name !== "Standard" ? r.variant_name.replace(/ \/ /g, " ") : null].filter(Boolean).join(" "), sku: r.code ?? "" } })}
            style={{ flex: 1 }}
          />
          <Button label="Ajuster le stock" disabled={!permissions.canWrite} onPress={() => router.push({ pathname: "/adjust", params: { skuId: r.sku_id ?? "" } })} style={{ flex: 1 }} />
        </StickyActions>
      }
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
    >
      <DetailHeader
        parentLabel={r.product_name ?? "Produit"}
        right={permissions.canWrite ? <IconButton icon={<Pencil size={18} color={color.ink} />} label="Modifier la variante" onPress={() => router.push({ pathname: "/sku/edit/[skuId]", params: { skuId: r.sku_id ?? "" } })} /> : undefined}
      />
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <Txt variant="title2" style={{ flex: 1 }} accessibilityRole="header">
            {variantTitle(v)}
          </Txt>
          <StatusChip label={STOCK_LEVEL_LABEL[v.classification.level]} tone={LEVEL_TONE[v.classification.level]} />
        </View>
        <Txt variant="label">
          SKU {r.code}
          {r.location ? ` · Emplacement ${r.location}` : ""}
          {r.barcode ? ` · ${r.barcode}` : ""}
        </Txt>
      </View>
      <KpiGrid>
        {[
          <KpiCard key="price" label="Prix" value={r.sale_price === null ? "—" : formatMoneyRounded(r.sale_price, currency)} />,
          <KpiCard key="cost" label="Coût" value={r.cost_price === null ? "—" : formatMoneyRounded(r.cost_price, currency)} />,
          <KpiCard key="margin" label="Marge nette" value={v.margin.netMarginPercent === null ? "—" : `${Math.round(v.margin.netMarginPercent)} %`} hint={v.margin.netProfit === null ? "non calculable" : formatMoneyRounded(v.margin.netProfit, currency)} hintTone={v.margin.netProfit !== null && v.margin.netProfit >= 0 ? "success" : undefined} />,
        ]}
      </KpiGrid>
      {v.margin.unknownCosts.length > 0 ? <Txt variant="label">Non déduit car inconnu : {v.margin.unknownCosts.map((u) => UNKNOWN_COST_LABEL[u]).join(", ")}.</Txt> : null}
      <QuantityCard view={v} canWrite={permissions.canWrite} />
      <KpiGrid>
        {[
          <KpiCard key="cover" label="Couverture" value={v.daysOfCover === null ? "—" : formatDays(v.daysOfCover)} hint={v.velocity.dailyVelocity === null ? "vitesse inconnue" : `${v.velocity.dailyVelocity.toFixed(2)} / jour`} />,
          <KpiCard key="sold" label="Vendus 30 j" value={formatNumber(r.units_30d ?? 0)} />,
          <KpiCard key="order" label="En commande" value={formatNumber(onOrder)} />,
        ]}
      </KpiGrid>
      <Txt variant="label">{v.classification.reason}</Txt>
      {pendingSalesCount > 0 ? <AlertBanner text={`${pendingSalesCount} vente${pendingSalesCount > 1 ? "s" : ""} rattachée${pendingSalesCount > 1 ? "s" : ""} pas encore déduite${pendingSalesCount > 1 ? "s" : ""} du stock.`} /> : null}
      <SectionHeader title="Mouvements" />
      {movements.length === 0 ? (
        <Card padded>
          <Txt variant="bodyRegular">Aucun mouvement enregistré.</Txt>
        </Card>
      ) : (
        <Card>
          {movements.map((m, i) => (
            <ListRow
              key={m.id}
              title={MOVEMENT_TYPE_LABEL[m.type] ?? m.type}
              subtitle={`${formatDateTime(m.occurred_at)} · stock après : ${formatNumber(m.quantity_after)}${m.note ? ` · ${m.note}` : ""}`}
              right={
                <Txt variant="body" num color={m.quantity < 0 ? color.danger : color.success} style={{ fontFamily: "Manrope_800ExtraBold" }}>
                  {m.quantity > 0 ? "+" : ""}
                  {formatNumber(m.quantity)}
                </Txt>
              }
              last={i === movements.length - 1}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
