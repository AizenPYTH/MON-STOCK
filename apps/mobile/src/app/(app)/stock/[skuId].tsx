import { RefreshControl, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { skuLabel } from "@/features/stock/model";
import { UNKNOWN_COST_LABEL } from "@/domain/pricing/margin";
import { useSkuDetail } from "~/data/hooks";
import { useActiveOrg } from "~/org/org-provider";
import { userMessage } from "~/lib/errors";
import { Badge, Body, Button, Card, EmptyState, ErrorState, LoadingState, Muted, Notice, Row, Screen, SectionTitle, Stat } from "~/ui/components";
import { formatDateTime, formatDays, formatMoney, formatNumber, formatPercent, MOVEMENT_TYPE_LABEL, NOT_PROVIDED, STOCK_LEVEL_LABEL, STOCK_LEVEL_TONE } from "~/ui/format";
import { colors, spacing } from "~/ui/theme";

export default function SkuDetailScreen() {
  const { skuId } = useLocalSearchParams<{ skuId: string }>();
  const { permissions } = useActiveOrg();
  const q = useSkuDetail(skuId ?? "");

  if (q.isPending) return <LoadingState />;
  if (q.isError)
    return (
      <Screen scroll={false} edges={[]}>
        <ErrorState message={userMessage(q.error)} onRetry={() => void q.refetch()} />
      </Screen>
    );
  if (!q.data)
    return (
      <Screen scroll={false} edges={[]}>
        <EmptyState title="SKU introuvable" message="Il a peut-être été archivé, ou n'appartient pas à l'organisation active." />
      </Screen>
    );

  const { view: v, movements, pendingSalesCount, onOrder } = q.data;
  const r = v.row;
  const currency = r.currency ?? "EUR";

  return (
    <Screen edges={[]} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <Stack.Screen options={{ title: r.code ?? "Fiche SKU" }} />
      <Body style={{ fontSize: 20, fontWeight: "700" }}>{skuLabel(r)}</Body>
      <Muted style={{ marginBottom: spacing.md }}>
        {r.code}
        {r.brand ? ` · ${r.brand}` : ""}
        {r.grade ? ` · Grade ${r.grade}` : ""}
        {r.location ? ` · Emplacement ${r.location}` : ""}
      </Muted>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md }}>
        <Stat label="Disponible" value={formatNumber(r.quantity_available ?? 0)} tone={(r.quantity_available ?? 0) < 0 ? "danger" : undefined} hint={`${formatNumber(r.quantity_on_hand ?? 0)} en main · ${formatNumber(r.quantity_reserved ?? 0)} réservé(s)`} />
        <Stat label="Statut" value={STOCK_LEVEL_LABEL[v.classification.level]} tone={STOCK_LEVEL_TONE[v.classification.level]} hint={v.daysOfCover !== null ? `Couverture ${formatDays(v.daysOfCover)}` : "Couverture inconnue"} />
        <Stat label="Ventes 30 j" value={formatNumber(r.units_30d ?? 0)} hint={v.velocity.dailyVelocity !== null ? `${v.velocity.dailyVelocity.toFixed(2)} / jour` : "Vitesse inconnue"} />
        <Stat label="En commande" value={formatNumber(onOrder)} hint="Commandes fournisseurs ouvertes" />
      </View>
      <Muted style={{ marginBottom: spacing.md }}>{v.classification.reason}</Muted>
      {pendingSalesCount > 0 ? <Notice tone="warning">{pendingSalesCount} vente(s) rattachée(s) à ce SKU ne sont pas encore déduites du stock.</Notice> : null}

      {permissions.canWrite ? (
        <Button label="Enregistrer un mouvement" onPress={() => router.push({ pathname: "/stock/movement", params: { skuId: r.sku_id ?? "", code: r.code ?? "", available: String(r.quantity_available ?? 0) } })} />
      ) : (
        <Notice tone="info">Rôle lecture seule : les mouvements de stock ne sont pas autorisés.</Notice>
      )}

      <SectionTitle>Prix et marge</SectionTitle>
      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <Body>Prix de vente</Body>
          <Body>{r.sale_price !== null ? formatMoney(r.sale_price, currency) : NOT_PROVIDED}</Body>
        </Row>
        <Row style={{ justifyContent: "space-between", marginTop: spacing.xs }}>
          <Body>Coût d'achat</Body>
          <Body>{r.cost_price !== null ? formatMoney(r.cost_price, currency) : NOT_PROVIDED}</Body>
        </Row>
        <Row style={{ justifyContent: "space-between", marginTop: spacing.xs }}>
          <Body>Bénéfice net estimé</Body>
          <Body style={{ fontWeight: "700" }}>
            {v.margin.netProfit !== null ? `${formatMoney(v.margin.netProfit, currency)}${v.margin.netMarginPercent !== null ? ` (${formatPercent(v.margin.netMarginPercent)})` : ""}` : "Non calculable"}
          </Body>
        </Row>
        {v.margin.unknownCosts.length > 0 ? (
          <Muted style={{ marginTop: spacing.sm }}>Non déduit car inconnu : {v.margin.unknownCosts.map((u) => UNKNOWN_COST_LABEL[u]).join(", ")}.</Muted>
        ) : null}
      </Card>

      <SectionTitle>Derniers mouvements</SectionTitle>
      <Card>
        {movements.length === 0 ? (
          <Body>Aucun mouvement enregistré.</Body>
        ) : (
          movements.map((m) => (
            <View key={m.id} style={{ paddingVertical: spacing.sm, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Body>{MOVEMENT_TYPE_LABEL[m.type] ?? m.type}</Body>
                <Body style={{ fontWeight: "700", color: m.quantity < 0 ? colors.danger : colors.success }}>
                  {m.quantity > 0 ? "+" : ""}
                  {formatNumber(m.quantity)}
                </Body>
              </Row>
              <Muted>
                {formatDateTime(m.occurred_at)} · stock après : {formatNumber(m.quantity_after)}
                {m.channel && m.channel !== "manual" ? ` · ${m.channel}` : ""}
              </Muted>
              {m.note ? <Muted>« {m.note} »</Muted> : null}
            </View>
          ))
        )}
      </Card>
      <Badge label={r.is_active ? "Actif" : "Archivé"} tone={r.is_active ? "success" : "neutral"} />
    </Screen>
  );
}
