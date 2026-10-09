import { RefreshControl, View } from "react-native";
import { router } from "expo-router";
import { useActiveOrg } from "~/org/org-provider";
import { useDashboard } from "~/data/hooks";
import { userMessage } from "~/lib/errors";
import { Badge, Body, Button, Card, EmptyState, ErrorState, LoadingState, Muted, Notice, Row, Screen, SectionTitle, Stat, Title } from "~/ui/components";
import { formatMoney, formatNumber, formatRelative, STOCK_LEVEL_LABEL } from "~/ui/format";
import { spacing } from "~/ui/theme";
import { PROVIDER_LABEL } from "~/data/sales";

const TODO_ROUTE: Record<string, string> = {
  negativeStock: "/stock?filter=negative",
  lowStock: "/stock?sort=low_stock",
};

export default function DashboardScreen() {
  const { active } = useActiveOrg();
  const currency = active.organization.currency;
  const q = useDashboard();

  if (q.isPending) return <LoadingState label="Calcul du tableau de bord…" />;
  if (q.isError)
    return (
      <Screen scroll={false}>
        <ErrorState message={userMessage(q.error)} onRetry={() => void q.refetch()} />
      </Screen>
    );
  const d = q.data;

  return (
    <Screen refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <Title subtitle={`Mis à jour ${formatRelative(d.generatedAt)}${active.organization.isDemo ? " · DÉMO" : ""}`}>{active.organization.name}</Title>

      {d.isEmpty ? (
        <EmptyState
          title="Aucune donnée pour l'instant"
          message="Ajoutez vos produits depuis l'application web, connectez eBay ou ajoutez un fournisseur. Rien n'est simulé : ce tableau de bord se remplira avec vos vraies données."
          action={<Button label="Voir le stock" variant="secondary" onPress={() => router.push("/stock")} />}
        />
      ) : null}

      {d.todo.length > 0 ? (
        <>
          <SectionTitle>À traiter</SectionTitle>
          <Card>
            {d.todo.map((t) => (
              <Row key={t.key} style={{ paddingVertical: spacing.sm, justifyContent: "space-between" }}>
                <Body style={{ flex: 1 }}>{t.label}</Body>
                {TODO_ROUTE[t.key] ? (
                  <Button label="Voir" variant="ghost" onPress={() => router.push(TODO_ROUTE[t.key] as never)} />
                ) : (
                  <Badge label={t.tone === "danger" ? "Urgent" : "À voir"} tone={t.tone === "danger" ? "danger" : "warning"} />
                )}
              </Row>
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle>Ventes</SectionTitle>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md }}>
        <Stat label="Aujourd'hui" value={formatMoney(d.sales.today.revenue, currency)} hint={`${formatNumber(d.sales.today.orders)} commande(s)`} />
        <Stat label="7 derniers jours" value={formatMoney(d.sales.last7d.revenue, currency)} hint={`${formatNumber(d.sales.last7d.units)} unité(s)`} />
        <Stat label="30 derniers jours" value={formatMoney(d.sales.last30d.revenue, currency)} hint={`${formatNumber(d.sales.last30d.orders)} commande(s)`} />
        <Stat label="Commandes (total)" value={formatNumber(d.counts.ordersTotal)} />
      </View>
      {d.sales.otherCurrencies.length > 0 ? (
        <Muted style={{ marginBottom: spacing.md }}>
          Ventes dans d'autres devises (non converties, exclues des montants) :{" "}
          {d.sales.otherCurrencies.map((c) => `${formatMoney(c.revenue, c.currency)} (${c.orders})`).join(", ")}
        </Muted>
      ) : null}

      <SectionTitle>Stock</SectionTitle>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm }}>
        <Stat label="SKU actifs" value={formatNumber(d.stock.totals.skus)} hint={`${formatNumber(d.stock.totals.unitsOnHand)} unité(s) en main`} />
        <Stat
          label="Valeur du stock"
          value={formatMoney(d.stock.totals.stockValueKnown, currency)}
          hint={d.stock.totals.skusUnknownCostWithStock > 0 ? `${d.stock.totals.skusUnknownCostWithStock} SKU sans coût exclus` : "Coûts connus"}
        />
        <Stat label={STOCK_LEVEL_LABEL.out_of_stock} value={formatNumber(d.stock.counts.out_of_stock)} tone={d.stock.counts.out_of_stock > 0 ? "danger" : undefined} />
        <Stat label={STOCK_LEVEL_LABEL.at_risk} value={formatNumber(d.stock.counts.at_risk)} tone={d.stock.counts.at_risk > 0 ? "warning" : undefined} />
        <Stat label={STOCK_LEVEL_LABEL.low} value={formatNumber(d.stock.counts.low)} tone={d.stock.counts.low > 0 ? "warning" : undefined} />
        <Stat label="Stock négatif" value={formatNumber(d.stock.negativeStock)} tone={d.stock.negativeStock > 0 ? "danger" : undefined} />
      </View>
      {d.stock.truncated ? <Notice tone="warning">Plus de 5 000 SKU : les compteurs ci-dessus sont des minima.</Notice> : null}

      <SectionTitle>Canaux de vente</SectionTitle>
      <Card>
        {d.channels.length === 0 ? (
          <Body>Aucun canal connecté. La connexion eBay se fait depuis l'application web (autorisation OAuth eBay).</Body>
        ) : (
          d.channels.map((c, i) => (
            <Row key={`${c.provider}-${i}`} style={{ justifyContent: "space-between", paddingVertical: spacing.xs }}>
              <Body>
                {PROVIDER_LABEL[c.provider] ?? c.provider}
                {c.externalUsername ? ` · ${c.externalUsername}` : ""}
              </Body>
              <Badge label={c.status === "connected" ? "Connecté" : c.status === "expired" ? "Expirée" : c.status === "error" ? "Erreur" : c.status} tone={c.status === "connected" ? "success" : "danger"} />
            </Row>
          ))
        )}
        <Muted style={{ marginTop: spacing.sm }}>
          {d.counts.openAlerts} alerte(s) ouverte(s) · {d.counts.syncFailed24h} synchronisation(s) en échec (24 h) · {d.counts.suppliers} fournisseur(s)
        </Muted>
      </Card>
    </Screen>
  );
}
