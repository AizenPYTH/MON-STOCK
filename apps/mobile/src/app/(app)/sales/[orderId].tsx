import { View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { skuLabel } from "@/features/stock/model";
import { useOrder } from "~/data/hooks";
import { ORDER_STATUS_LABEL, PROVIDER_LABEL } from "~/data/sales";
import { userMessage } from "~/lib/errors";
import { Badge, Body, Card, EmptyState, ErrorState, LoadingState, Muted, Row, Screen, SectionTitle } from "~/ui/components";
import { formatDateTime, formatMoney, formatNumber, NOT_PROVIDED } from "~/ui/format";
import { colors, spacing } from "~/ui/theme";

export default function OrderDetailScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const q = useOrder(orderId ?? "");
  if (q.isPending) return <LoadingState />;
  if (q.isError)
    return (
      <Screen scroll={false} edges={[]}>
        <ErrorState message={userMessage(q.error)} onRetry={() => void q.refetch()} />
      </Screen>
    );
  const o = q.data;
  if (!o)
    return (
      <Screen scroll={false} edges={[]}>
        <EmptyState title="Commande introuvable" message="Elle n'appartient pas à l'organisation active, ou a été supprimée." />
      </Screen>
    );
  const currency = o.currency ?? "EUR";
  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: o.order_number ?? o.external_order_id }} />
      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <Body style={{ fontWeight: "700" }}>{PROVIDER_LABEL[o.provider] ?? o.provider}</Body>
          <Badge label={ORDER_STATUS_LABEL[o.status] ?? o.status} tone="info" />
        </Row>
        <Muted>Passée le {formatDateTime(o.placed_at)}</Muted>
        {o.buyer_username ? <Muted>Acheteur : {o.buyer_username}</Muted> : null}
        <Row style={{ justifyContent: "space-between", marginTop: spacing.md }}>
          <Body>Total</Body>
          <Body style={{ fontWeight: "700" }}>{o.total !== null ? formatMoney(o.total, currency) : NOT_PROVIDED}</Body>
        </Row>
        <Row style={{ justifyContent: "space-between" }}>
          <Body>Frais de port</Body>
          <Body>{o.shipping_total !== null ? formatMoney(o.shipping_total, currency) : NOT_PROVIDED}</Body>
        </Row>
        <Row style={{ justifyContent: "space-between" }}>
          <Body>Frais de la plateforme</Body>
          <Body>{o.fee_total !== null ? formatMoney(o.fee_total, currency) : NOT_PROVIDED}</Body>
        </Row>
      </Card>
      <SectionTitle>Articles</SectionTitle>
      <Card>
        {o.items.map((i) => (
          <View key={i.id} style={{ paddingVertical: spacing.sm, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
            <Body>{i.title ?? "Article"}</Body>
            <Muted>
              {formatNumber(i.quantity)} × {i.unit_price !== null ? formatMoney(i.unit_price, i.currency ?? currency) : NOT_PROVIDED}
            </Muted>
            {i.sku ? (
              <Body style={{ color: colors.primary, marginTop: 2 }} onPress={() => router.push({ pathname: "/stock/[skuId]", params: { skuId: i.sku!.id } })} accessibilityRole="link">
                {i.sku.code} · {skuLabel({ product_name: i.sku.product?.name ?? "", variant_name: i.sku.variant?.name ?? null })}
              </Body>
            ) : (
              <Badge label="Non rattachée à un SKU" tone="warning" />
            )}
            {i.sku && !i.inventory_applied && o.status !== "cancelled" && o.status !== "refunded" ? <Muted>Pas encore déduite du stock.</Muted> : null}
          </View>
        ))}
      </Card>
    </Screen>
  );
}
