import { useMemo, useState } from "react";
import { ActionSheetIOS, Alert, Platform, Pressable, RefreshControl, View } from "react-native";
import { router } from "expo-router";
import { ChevronDown } from "lucide-react-native";
import { useUser } from "~/auth/session-provider";
import { useActiveOrg } from "~/org/org-provider";
import { useAnalysis, useCatalog, useImportJobs, useIntegrations, useOpenAlerts, useProAccounts, useRadar, useToday } from "~/data/hooks";
import { stockSummary } from "~/data/catalog";
import { AdvisorEntry, buildTasks, LastImportRow, SetupChecklist, Shortcuts, SourcingPanel, StockPulse, TaskList } from "~/components/dashboard";
import { PERIODS, type Period } from "~/data/intelligence";
import { PROVIDER_LABEL } from "~/data/sales";
import { userMessage } from "~/lib/errors";
import { formatClock, formatCompactMoney, formatLongDate, formatMoneyRounded, formatNumber, formatSignedPercent } from "~/lib/format";
import {
  AlertBanner,
  BarChart,
  Card,
  EmptyState,
  ErrorState,
  FadeIn,
  KpiCard,
  KpiGrid,
  ListRow,
  Screen,
  SectionHeader,
  Skeleton,
  SkeletonList,
  TabHeader,
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
      style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.lg, backgroundColor: color.nightRaised }}
    >
      <Txt variant="label" color={color.inkOnDark} style={{ fontFamily: "Manrope_700Bold" }}>
        {period} jours
      </Txt>
      <ChevronDown size={14} color={color.inkOnDark} strokeWidth={2.4} />
    </Pressable>
  );

  const tabs = { value: segment, onChange: setSegment, options: SEGMENTS };
  return segment === "today" ? (
    <Today header={(hero) => <TabHeader overline={formatLongDate(new Date())} title={greeting} hero={hero} tabs={tabs} />} currency={active.organization.currency} />
  ) : (
    <Analysis header={<TabHeader overline={`Analyse · ${period} jours`} title={greeting} right={periodPicker} tabs={tabs} />} period={period} currency={active.organization.currency} />
  );
}

const SEGMENTS: { value: Segment; label: string }[] = [
  { value: "today", label: "Aujourd'hui" },
  { value: "analysis", label: "Analyse" },
];

type Hero = { value: string; label?: string; stats?: { label: string; value: string; tone?: "positive" | "warning" | "negative" }[] };

function Today({ header, currency }: { header: (hero?: Hero) => React.ReactElement; currency: string }) {
  const today = useToday();
  const catalog = useCatalog();
  const jobs = useImportJobs();
  const accounts = useProAccounts();
  const radar = useRadar("score");
  const alerts = useOpenAlerts();
  const integrations = useIntegrations();
  const refreshing = today.isRefetching || catalog.isRefetching;
  const summary = useMemo(() => (catalog.data ? stockSummary(catalog.data) : null), [catalog.data]);
  const tasks = useMemo(
    () => buildTasks({ today: today.data, catalog: catalog.data, jobs: jobs.data, accounts: accounts.data, alerts: alerts.data }),
    [today.data, catalog.data, jobs.data, accounts.data, alerts.data],
  );
  const lastJob = jobs.data?.[0] ?? null;
  const hasSupplier = Boolean(accounts.data && (accounts.data.totals.account + accounts.data.totals.public > 0 || accounts.data.accounts.some((x) => x.status === "connected")));
  const hasChannel = integrations.data ? integrations.data.connections.some((c) => c.status === "connected") : null;
  const hasCosts = radar.data ? radar.data.missingSettings.length === 0 : null;
  const emptyShop = Boolean(catalog.data && catalog.data.counts.all === 0);
  const checklist = catalog.data ? <SetupChecklist hasProducts={!emptyShop} hasChannel={hasChannel} hasSupplier={hasSupplier} hasCosts={hasCosts} /> : null;

  return (
    <Screen
      header={header(
        today.data
          ? {
              label: "Chiffre d'affaires du jour",
              value: formatMoneyRounded(today.data.revenueToday, currency),
              stats: [
                { label: "Ventes", value: formatNumber(today.data.ordersToday) },
                { label: "Marge (estimée)", value: today.data.marginTodayPercent === null ? "—" : `≈ ${Math.round(today.data.marginTodayPercent)} %` },
                { label: "vs hier", value: formatSignedPercent(today.data.vsYesterdayPercent), tone: today.data.vsYesterdayPercent === null ? undefined : today.data.vsYesterdayPercent >= 0 ? "positive" : "negative" },
              ],
            }
          : undefined,
      )}
      contentGap={space[3]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            void Promise.all([today.refetch(), catalog.refetch(), jobs.refetch(), accounts.refetch(), radar.refetch(), alerts.refetch()]);
          }}
        />
      }
    >
      {today.isPending || catalog.isPending ? (
        <>
          <Skeleton w="100%" h={78} r={radius.xl} />
          <SkeletonList rows={4} thumb={false} />
        </>
      ) : today.isError ? (
        <ErrorState description={`${userMessage(today.error)}${today.dataUpdatedAt ? ` Dernières données : ${formatClock(new Date(today.dataUpdatedAt).toISOString())}.` : ""}`} onRetry={() => void today.refetch()} />
      ) : (
        <>
          <FadeIn>
            <StockPulse catalog={catalog.data} summary={summary} currency={currency} />
          </FadeIn>
          {emptyShop ? checklist : null}
          <SectionHeader title="À traiter" count={tasks.length || undefined} />
          <TaskList tasks={tasks} />
          <SectionHeader title="Raccourcis" />
          <Shortcuts />
          <AdvisorEntry />
          <SectionHeader title="Sourcing et opportunités" action={{ label: "Radar", onPress: () => router.push("/radar") }} />
          <SourcingPanel accounts={accounts.data} radar={radar.data} currency={currency} />
          <SectionHeader title="Activité récente" action={today.data.recentSales.length > 0 ? { label: "Ventes", onPress: () => router.push("/sales") } : undefined} />
          {today.data.recentSales.length === 0 && !lastJob ? (
            <Card padded>
              <Txt variant="bodyRegular">Aucune activité pour l'instant. Les commandes eBay et vos imports de catalogue apparaîtront ici.</Txt>
            </Card>
          ) : (
            <Card>
              {lastJob ? <LastImportRow job={lastJob} last={today.data.recentSales.length === 0} /> : null}
              {today.data.recentSales.map((s, i) => (
                <ListRow
                  key={s.orderId}
                  left={<Thumb size={40} />}
                  title={s.title}
                  subtitle={`${PROVIDER_LABEL[s.provider] ?? s.provider} · ${formatClock(s.placedAt)}`}
                  right={
                    <Txt variant="price" num style={{ fontSize: 16 }}>
                      {s.amount === null ? "—" : formatMoneyRounded(s.amount, s.currency ?? currency)}
                    </Txt>
                  }
                  onPress={() => router.push({ pathname: "/order/[orderId]", params: { orderId: s.orderId } })}
                  last={i === today.data.recentSales.length - 1}
                />
              ))}
            </Card>
          )}
          {emptyShop ? null : checklist}
        </>
      )}
    </Screen>
  );
}

function Analysis({ header, period, currency }: { header: React.ReactElement; period: Period; currency: string }) {
  const analysis = useAnalysis(period);
  const catalog = useCatalog();
  const d = analysis.data;

  return (
    <Screen header={header} contentGap={16} refreshControl={<RefreshControl refreshing={analysis.isRefetching} onRefresh={() => void Promise.all([catalog.refetch(), analysis.refetch()])} />}>
      <AdvisorEntry />
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
