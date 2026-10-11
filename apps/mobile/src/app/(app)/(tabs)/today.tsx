import { useState } from "react";
import { ActionSheetIOS, Alert, Platform, Pressable, RefreshControl, View } from "react-native";
import { router } from "expo-router";
import { ChevronDown, Mic, Sparkles } from "lucide-react-native";
import { useUser } from "~/auth/session-provider";
import { useActiveOrg } from "~/org/org-provider";
import { useAnalysis, useCatalog, useToday } from "~/data/hooks";
import { PERIODS, type Period } from "~/data/intelligence";
import { PROVIDER_LABEL } from "~/data/sales";
import { userMessage } from "~/lib/errors";
import { formatClock, formatCompactMoney, formatLongDate, formatMoneyRounded, formatNumber, formatSignedPercent } from "~/lib/format";
import {
  AlertBanner,
  BarChart,
  Card,
  Dot,
  EmptyState,
  ErrorState,
  KpiCard,
  KpiGrid,
  ListRow,
  Screen,
  SectionHeader,
  Segmented,
  Skeleton,
  SkeletonList,
  TabHeader,
  Tile,
  Thumb,
  Txt,
} from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";

type Segment = "today" | "analysis";

export default function TodayScreen() {
  const [segment, setSegment] = useState<Segment>("today");
  const [period, setPeriod] = useState<Period>(30);
  const user = useUser();
  const { active } = useActiveOrg();

  const fullName = (user?.user_metadata as { full_name?: string } | undefined)?.full_name?.trim();
  const greeting = fullName ? `Bonjour ${fullName.split(/\s+/)[0]}` : "Aujourd'hui";

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
    <Today header={<TabHeader overline={formatLongDate(new Date())} title={greeting} />} segment={<Segmented value={segment} onChange={setSegment} options={SEGMENTS} />} currency={active.organization.currency} />
  ) : (
    <Analysis header={<TabHeader overline={`Analyse · ${period} j`} title={greeting} right={periodPicker} />} segment={<Segmented value={segment} onChange={setSegment} options={SEGMENTS} />} period={period} currency={active.organization.currency} />
  );
}

/** Accès au conseiller IA : conversation écrite ou vocale sur l'activité (ventes, marges, stock, expéditions). */
function AssistantEntry() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Parler à votre conseiller"
      onPress={() => router.push("/advisor")}
      testID="assistant-entry"
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space[3], padding: space[4], borderRadius: radius.xxl, backgroundColor: color.surfaceDark, opacity: pressed ? 0.9 : 1 })}
    >
      <Sparkles size={20} color={color.accent} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="label" color={color.inkOnDark} style={{ fontFamily: "Manrope_700Bold" }}>
          Parlez à votre conseiller
        </Txt>
        <Txt variant="label" color={color.inkOnDarkMuted}>
          « Qu'est-ce que tu me conseilles de faire aujourd'hui ? »
        </Txt>
      </View>
      <View style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: color.accent, alignItems: "center", justifyContent: "center" }}>
        <Mic size={20} color={color.inkOnDark} />
      </View>
    </Pressable>
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
      <AssistantEntry />
      {today.isPending ? (
        <>
          <Skeleton w="100%" h={208} r={radius.xxl} />
          <SkeletonList rows={3} thumb={false} />
        </>
      ) : today.isError ? (
        <ErrorState description={`${userMessage(today.error)}${today.dataUpdatedAt ? ` Dernières données : ${formatClock(new Date(today.dataUpdatedAt).toISOString())}.` : ""}`} onRetry={() => void today.refetch()} />
      ) : (
        <>
          {todo[0] ? <AlertBanner text={`À faire : ${todo[0].text}`} onPress={todo[0].go} /> : null}
          <KpiGrid columns={2}>
            {[
              <Tile
                key="ca"
                tone="dark"
                label="CA du jour"
                value={formatMoneyRounded(today.data.revenueToday, currency)}
                reason={`${today.data.vsYesterdayPercent === null ? "pas de comparaison" : `${formatSignedPercent(today.data.vsYesterdayPercent)} vs hier`} · ${formatNumber(today.data.ordersToday)} vente${today.data.ordersToday > 1 ? "s" : ""}`}
                reasonTone={today.data.vsYesterdayPercent === null ? undefined : today.data.vsYesterdayPercent >= 0 ? "success" : "danger"}
              />,
              <Tile
                key="margin"
                tone="success"
                label="Marge du jour"
                value={today.data.marginTodayPercent === null ? null : `≈ ${Math.round(today.data.marginTodayPercent)} %`}
                reason={today.data.marginTodayPercent === null ? "coûts d'achat inconnus" : "estimée sur les coûts connus"}
              />,
              <Tile key="out" tone={catalog.data && catalog.data.counts.out > 0 ? "danger" : "neutral"} label="Rupture" value={catalog.data ? formatNumber(catalog.data.counts.out) : null} reason={catalog.data ? "produits à 0" : "stock indisponible"} onPress={() => router.push({ pathname: "/stock", params: { filter: "out" } })} />,
              <Tile key="low" tone={catalog.data && catalog.data.counts.low > 0 ? "accent" : "neutral"} label="Faible" value={catalog.data ? formatNumber(catalog.data.counts.low) : null} reason={catalog.data ? "sous le seuil" : "stock indisponible"} onPress={() => router.push({ pathname: "/stock", params: { filter: "low" } })} />,
            ]}
          </KpiGrid>
          {todo.length > 1 ? (
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
      <AssistantEntry />
      {analysis.isPending || catalog.isPending ? (
        <>
          <Skeleton w="100%" h={208} r={radius.xxl} />
          <Skeleton w="100%" h={120} r={radius.xxl} />
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
              <KpiCard key="profit" label="Marge nette" value={d.netProfit === null ? "—" : `≈ ${formatMoneyRounded(d.netProfit, currency)}`} hint={d.netProfitShare === null ? "Coûts d'achat inconnus" : `${Math.round(d.netProfitShare)} % du CA${d.skusWithoutMargin > 0 ? ` · ${d.skusWithoutMargin} SKU exclus` : ""}`} />,
              <KpiCard key="sales" label="Ventes" value={formatNumber(d.orders)} hint={d.averageBasket === null ? "—" : `panier moyen ${formatMoneyRounded(d.averageBasket, currency)}`} />,
              <KpiCard key="cover" label="Couverture stock" value={d.coverDays === null ? "—" : `${formatNumber(d.coverDays)} j`} hint={`valeur ≈ ${formatCompactMoney(d.stockValue, currency)}`} />,
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
