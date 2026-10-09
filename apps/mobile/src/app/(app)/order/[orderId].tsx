import { RefreshControl, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { skuLabel } from "@/features/stock/model";
import { useOrder } from "~/data/hooks";
import { ORDER_CHIP, PROVIDER_LABEL } from "~/data/sales";
import { userMessage } from "~/lib/errors";
import { formatClock, formatDate, formatMoney, formatNumber } from "~/lib/format";
import { Button, Card, DetailHeader, Divider, EmptyState, ErrorState, ListRow, Screen, Skeleton, StatusChip, StickyActions, Thumb, Timeline, Txt, type TimelineStep } from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";

/**
 * Détail de commande (données importées d'eBay ou saisies). La marge n'est affichée que si
 * chaque ligne a un coût d'achat connu ; les frais inconnus ne sont jamais supposés nuls.
 * Expédition / étiquette : nécessitent l'API eBay Fulfillment côté serveur → « bientôt ».
 */
export default function OrderScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const q = useOrder(orderId ?? "");

  if (q.isPending)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Ventes" />
        <Skeleton w="70%" h={26} />
        <Skeleton w="100%" h={180} r={radius.xl} />
      </Screen>
    );
  if (q.isError)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Ventes" />
        <ErrorState description={userMessage(q.error)} onRetry={() => void q.refetch()} />
      </Screen>
    );
  const o = q.data;
  if (!o)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Ventes" />
        <EmptyState title="Commande introuvable" description="Elle n'appartient pas à l'organisation active, ou a été supprimée." />
      </Screen>
    );

  const currency = o.currency ?? "EUR";
  const chip = ORDER_CHIP[o.status] ?? ORDER_CHIP.unknown!;
  const itemsTotal = o.items.reduce((s, i) => s + (i.unit_price ?? 0) * i.quantity, 0);
  const costKnown = o.items.length > 0 && o.items.every((i) => i.sku && typeof (i.sku as { cost_price?: number | null }).cost_price === "number");
  const cost = costKnown ? o.items.reduce((s, i) => s + ((i.sku as { cost_price: number }).cost_price ?? 0) * i.quantity, 0) : null;
  const fees = o.fee_total;
  const margin = cost !== null && fees !== null ? Math.round((itemsTotal - fees - cost) * 100) / 100 : null;

  const placed = o.placed_at ? `${formatDate(o.placed_at)} à ${formatClock(o.placed_at)}` : "date inconnue";
  const steps: TimelineStep[] =
    o.status === "cancelled" || o.status === "refunded"
      ? [
          { label: "Payée", meta: formatClock(o.placed_at), state: "done" },
          { label: o.status === "cancelled" ? "Annulée" : "Remboursée", state: "current" },
        ]
      : [
          { label: "Payée", meta: o.status === "pending" ? undefined : formatClock(o.placed_at), state: o.status === "pending" ? "current" : "done" },
          { label: "Expédiée", state: o.status === "paid" ? "current" : o.status === "shipped" || o.status === "delivered" ? "done" : "todo", meta: o.status === "paid" ? "à expédier" : undefined, metaTone: o.status === "paid" ? "accent" : undefined },
          { label: "Livrée", state: o.status === "delivered" ? "done" : "todo" },
        ];

  return (
    <Screen
      footer={
        o.status === "paid" ? (
          <StickyActions>
            <Button label="Étiquette · bientôt" variant="secondary" disabled onPress={() => {}} style={{ flex: 1 }} />
            <Button label="Expédition · bientôt" disabled onPress={() => {}} style={{ flex: 2 }} accessibilityHint="Le marquage « expédiée » sur eBay depuis l'application n'est pas encore disponible." />
          </StickyActions>
        ) : undefined
      }
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
    >
      <DetailHeader parentLabel="Ventes" />
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space[3] }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt variant="title2" accessibilityRole="header">
            Commande {o.order_number ?? o.external_order_id}
          </Txt>
          <Txt variant="label">
            {PROVIDER_LABEL[o.provider] ?? o.provider} · passée le {placed}
          </Txt>
        </View>
        <StatusChip label={chip.label} tone={chip.tone} />
      </View>

      <Card>
        {o.items.map((i, idx) => {
          const sku = i.sku as { id: string; code: string; product: { name: string } | null; variant: { name: string } | null } | null;
          return (
            <ListRow
              key={i.id}
              left={<Thumb size={48} />}
              title={i.title ?? "Article"}
              subtitle={sku ? `${skuLabel({ product_name: sku.product?.name ?? "", variant_name: sku.variant?.name ?? null })} · ${sku.code}` : "Non associé à un SKU"}
              right={
                <Txt variant="body" num style={{ fontFamily: "Manrope_700Bold" }}>
                  {i.quantity > 1 ? `${formatNumber(i.quantity)} × ` : ""}
                  {i.unit_price === null ? "—" : formatMoney(i.unit_price, i.currency ?? currency)}
                </Txt>
              }
              onPress={sku ? () => router.push({ pathname: "/sku/[skuId]", params: { skuId: sku.id } }) : undefined}
              last={idx === o.items.length - 1}
            />
          );
        })}
        <Divider />
        <View style={{ paddingVertical: space[3], paddingHorizontal: space[4], gap: 6 }}>
          <Line label="Articles" value={formatMoney(itemsTotal, currency)} />
          <Line label="Frais eBay" value={fees === null ? "non communiqués" : `−${formatMoney(fees, currency)}`} />
          <Line label="Coût d'achat" value={cost === null ? "inconnu" : `−${formatMoney(cost, currency)}`} />
          {o.shipping_total !== null ? <Line label="Livraison facturée à l'acheteur" value={formatMoney(o.shipping_total, currency)} muted /> : null}
          <View style={{ height: 1, backgroundColor: color.lineSoft, marginVertical: 4 }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Txt variant="body" style={{ fontFamily: "Manrope_800ExtraBold" }}>
              Marge nette
            </Txt>
            <Txt variant="body" num color={margin !== null && margin >= 0 ? color.success : margin !== null ? color.danger : color.ink3} style={{ fontFamily: "Manrope_800ExtraBold" }}>
              {margin === null ? "non calculable" : formatMoney(margin, currency)}
            </Txt>
          </View>
          {margin !== null ? <Txt variant="label">Hors frais d'expédition à votre charge (non importés).</Txt> : null}
        </View>
      </Card>

      {o.buyer_username ? (
        <Card padded>
          <Txt variant="body" style={{ fontFamily: "Manrope_700Bold" }}>
            {o.buyer_username}
          </Txt>
          <Txt variant="bodyRegular">Adresse de livraison : consultable sur eBay (non importée dans MON STOCK).</Txt>
        </Card>
      ) : null}

      <Card padded>
        <Timeline steps={steps} />
      </Card>
    </Screen>
  );
}

function Line({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space[3] }}>
      <Txt variant="bodyRegular" color={muted ? color.ink3 : color.ink2}>
        {label}
      </Txt>
      <Txt variant="bodyRegular" num color={muted ? color.ink3 : color.ink}>
        {value}
      </Txt>
    </View>
  );
}
