import { useState } from "react";
import { ActionSheetIOS, Alert, Platform, Pressable, RefreshControl, View } from "react-native";
import { router } from "expo-router";
import { ChevronDown } from "lucide-react-native";
import { useUser } from "~/auth/session-provider";
import { useActiveOrg } from "~/org/org-provider";
import { useAnalysis, useCatalog, useToday } from "~/data/hooks";
import { PERIODS, type Period } from "~/data/intelligence";
import { PROVIDER_LABEL } from "~/data/sales";
import { userMessage } from "~/lib/errors";
import { formatClock, formatCompactMoney, formatLongDate, formatMoneyRounded, formatNumber, formatSignedPercent } from "~/lib/format";
import {
  AlertBanner,
  Avatar,
  BarChart,
  Card,
  Dot,
  EmptyState,
  ErrorState,
  HeroCard,
  KpiCard,
  KpiGrid,
  ListRow,
  Screen,
  SectionHeader,
  Segmented,
  Skeleton,
  SkeletonList,
  TabHeader,
  Thumb,
  Txt,
  initialsOf,
} from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";

type Segment = "today" | "analysis";

export default function IntelligenceScreen() {
  const [segment, setSegment] = useState<Segment>("today");
  const [period, setPeriod] = useState<Period>(30);
  const user = useUser();
  const { active } = useActiveOrg();

  const avatar = <Avatar initials={initialsOf((user?.user_metadata as { full_name?: string } | undefined)?.full_name ?? user?.email)} label="Compte et réglages" onPress={() => router.push("/settings")} />;

  const periodPicker = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Période : ${period} jours. Modifier`}
      onPress={() => {
        const labels = PERIODS.map((p) => `${p} jours`);
        if (Platform.OS === "ios") {
          ActionSheetIOS.showActionSheetWithOptions({ options: [...labels, "Annuler"], cancelButtonIndex: labels.length, title: "Période d'analyse" }, (i) => {
            const p = PERIODS[i];
            if (p) setPeriod(p);
          });
        } else {
          Alert.alert("Période d'analyse", undefined, PERIODS.map((p) => ({ text: `${p} jours`, onPress: () => setPeriod(p) })));
        }
      }}
      style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: color.surface, borderWidth: 1, borderColor: color.line }}
    >
      <Txt variant="label" color={color.ink} style={{ fontFamily: "Manrope_700Bold" }}>
        {period} jours
      </Txt>
      <ChevronDown size={14} color={color.ink} strokeWidth={2.4} />
    </Pressable>
  );

  return segment === "today" ? (
    <Today header={<TabHeader overline={formatLongDate(new Date())} title="Aujourd'hui" right={avatar} />} segment={<Segmented value={segment} onChange={setSegment} options={SEGMENTS} />} currency={active.organization.currency} />
  ) : (
    <Analysis header={<TabHeader title="Intelligence" right={periodPicker} />} segment={<Segmented value={segment} onChange={setSegment} options={SEGMENTS} />} period={period} currency={active.organization.currency} />
  );
}

const SEGMENTS: { value: Segment; label: string }[] = [
  { value: "today", label: "Aujourd'hui" },
  { value: "analysis", label: "Analyse" },
];

function Today({ header, segment, currency }: { header: React.ReactNode; segment: React.ReactNode; currency: string }) {
  const today = useToday();
  const catalog = useCatalog();
  const refreshing = today.isRefetching || catalog.isRefetching;

  const todo: { key: string; text: string; target: string; tone: "accent" | "danger" | "neutral"; go: () => void }[] = [];
  if (today.data && today.data.toShip > 0) todo.push({ key: "ship", text: `${today.data.toShip} commande${today.data.toShip > 1 ? "s" : ""} à expédier`, target: "Ventes", tone: "accent", go: () => router.push({ pathname: "/sales", params: { status: "paid" } }) });
  if (catalog.data && catalog.data.counts.out > 0) todo.push({ key: "out", text: `${catalog.data.counts.out} produit${catalog.data.counts.out > 1 ? "s" : ""} en rupture`, target: "Stock", tone: "danger", go: () => router.push({ pathname: "/stock", params: { filter: "out" } }) });
  if (catalog.data && catalog.data.counts.low > 0) todo.push({ key: "low", text: `${catalog.data.counts.low} produit${catalog.data.counts.low > 1 ? "s" : ""} en stock faible`, target: "Stock", tone: "accent", go: () => router.push({ pathname: "/stock", params: { filter: "low" } }) });
  if (today.data && today.data.pendingSales > 0) todo.push({ key: "pending", text: `${today.data.pendingSales} vente${today.data.pendingSales > 1 ? "s" : ""} non déduite${today.data.pendingSales > 1 ? "s" : ""} du stock`, target: "Ventes", tone: "neutral", go: () => router.push("/sales") });
  if (today.data && today.data.openAlerts > 0) todo.push({ key: "alerts", text: `${today.data.openAlerts} alerte${today.data.openAlerts > 1 ? "s" : ""} à traiter`, target: "Analyse", tone: "neutral", go: () => {} });

  return (
    <Screen
      contentGap={16}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            void today.refetch();
            void catalog.refetch();
          }}
        />
      }
    >
      {header}
      {segment}
      {today.isPending ? (
        <>
          <Skeleton w="100%" h={130} r={radius.xxl} />
          <SkeletonList rows={3} thumb={false} />
        </>
      ) : today.isError ? (
        <ErrorState description={`${userMessage(today.error)}${today.dataUpdatedAt ? ` Dernières données : ${formatClock(new Date(today.dataUpdatedAt).toISOString())}.` : ""}`} onRetry={() => void today.refetch()} />
      ) : (
        <>
          <HeroCard
            label="Chiffre d'affaires du jour"
            value={formatMoneyRounded(today.data.revenueToday, currency)}
            stats={[
              { label: "Ventes", value: formatNumber(today.data.ordersToday) },
              { label: "Marge", value: today.data.marginTodayPercent === null ? "—" : `${Math.round(today.data.marginTodayPercent)} %` },
              { label: "vs hier", value: formatSignedPercent(today.data.vsYesterdayPercent), tone: (today.data.vsYesterdayPercent ?? 0) >= 0 ? "success" : "danger" },
            ]}
          />
          {todo.length > 0 ? (
            <>
              <SectionHeader title="À faire" />
              <Card>
                {todo.map((t, i) => (
                  <ListRow key={t.key} left={<Dot tone={t.tone} />} title={t.text} right={<Txt variant="label">{t.target}</Txt>} chevron onPress={t.go} last={i === todo.length - 1} />
                ))}
              </Card>
            </>
          ) : null}
          <SectionHeader title="Dernières ventes" action={today.data.recentSales.length > 0 ? { label: "Tout voir", onPress: () => router.push("/sales") } : undefined} />
          {today.data.recentSales.length === 0 ? (
            <Card padded>
              <Txt variant="bodyRegular">Aucune vente enregistrée. Les commandes eBay apparaissent ici après la synchronisation.</Txt>
            </Card>
          ) : (
            <Card>
              {today.data.recentSales.map((s, i) => (
                <ListRow
                  key={s.orderId}
                  left={<Thumb size={40} />}
                  title={s.title}
                  subtitle={`${PROVIDER_LABEL[s.provider] ?? s.provider} · ${formatClock(s.placedAt)}`}
                  right={
                    <Txt variant="body" num style={{ fontFamily: "Manrope_700Bold" }}>
                      {s.amount === null ? "—" : formatMoneyRounded(s.amount, s.currency ?? currency)}
                    </Txt>
                  }
                  onPress={() => router.push({ pathname: "/order/[orderId]", params: { orderId: s.orderId } })}
                  last={i === today.data.recentSales.length - 1}
                />
              ))}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

function Analysis({ header, segment, period, currency }: { header: React.ReactNode; segment: React.ReactNode; period: Period; currency: string }) {
  const analysis = useAnalysis(period);
  const catalog = useCatalog();
  const d = analysis.data;

  return (
    <Screen contentGap={16} refreshControl={<RefreshControl refreshing={analysis.isRefetching} onRefresh={() => void Promise.all([catalog.refetch(), analysis.refetch()])} />}>
      {header}
      {segment}
      {analysis.isPending || catalog.isPending ? (
        <>
          <Skeleton w="100%" h={170} r={radius.lg} />
          <Skeleton w="100%" h={120} r={radius.xl} />
        </>
      ) : analysis.isError || catalog.isError ? (
        <ErrorState description={userMessage(analysis.error ?? catalog.error)} onRetry={() => void Promise.all([catalog.refetch(), analysis.refetch()])} />
      ) : !d ? null : d.revenue === 0 && d.orders === 0 && catalog.data!.counts.all === 0 ? (
        <EmptyState title="Pas encore de données à analyser" description="L'analyse se calcule sur vos ventes et votre stock réels. Rien n'est estimé à partir de données fictives." />
      ) : (
        <>
          <KpiGrid columns={2}>
            {[
              <KpiCard key="ca" dark label="Chiffre d'affaires" value={formatMoneyRounded(d.revenue, currency)} hint={d.revenueChangePercent === null ? "Pas de période précédente" : `${formatSignedPercent(d.revenueChangePercent)} vs période préc.`} hintTone={d.revenueChangePercent !== null && d.revenueChangePercent >= 0 ? "success" : d.revenueChangePercent === null ? undefined : "danger"} />,
              <KpiCard key="profit" label="Marge nette (est.)" value={d.netProfit === null ? "—" : formatMoneyRounded(d.netProfit, currency)} hint={d.netProfitShare === null ? "Coûts d'achat inconnus" : `${Math.round(d.netProfitShare)} % du CA${d.skusWithoutMargin > 0 ? ` · ${d.skusWithoutMargin} SKU exclus` : ""}`} />,
              <KpiCard key="sales" label="Ventes" value={formatNumber(d.orders)} hint={d.averageBasket === null ? "—" : `panier moyen ${formatMoneyRounded(d.averageBasket, currency)}`} />,
              <KpiCard key="cover" label="Couverture stock" value={d.coverDays === null ? "—" : `${formatNumber(d.coverDays)} j`} hint={`valeur stock ${formatCompactMoney(d.stockValue, currency)}`} />,
            ]}
          </KpiGrid>
          <Card padded>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: space[3] }}>
              <Txt variant="body" style={{ fontFamily: "Manrope_700Bold" }}>
                CA par semaine
              </Txt>
              <Txt variant="label" num>
                {d.weekly[0]?.label} → {d.weekly[d.weekly.length - 1]?.label}
              </Txt>
            </View>
            <BarChart data={d.weekly} />
          </Card>
          {d.topProducts.length > 0 ? (
            <>
              <SectionHeader title={`Top produits · marge (${period} j)`} />
              <Card>
                {d.topProducts.map((p, i) => (
                  <ListRow
                    key={p.skuId}
                    left={
                      <Txt variant="label" num style={{ width: 16 }}>
                        {i + 1}
                      </Txt>
                    }
                    title={p.label}
                    subtitle={`${formatNumber(p.units)} vendu${p.units > 1 ? "s" : ""}`}
                    right={
                      <Txt variant="body" num color={color.success} style={{ fontFamily: "Manrope_700Bold" }}>
                        {formatMoneyRounded(p.profit, currency)}
                      </Txt>
                    }
                    onPress={() => router.push({ pathname: "/sku/[skuId]", params: { skuId: p.skuId } })}
                    last={i === d.topProducts.length - 1}
                  />
                ))}
              </Card>
            </>
          ) : null}
          {d.topAlert ? <AlertBanner text={`${d.topAlert.title} : ${d.topAlert.message}`} /> : null}
        </>
      )}
    </Screen>
  );
}
