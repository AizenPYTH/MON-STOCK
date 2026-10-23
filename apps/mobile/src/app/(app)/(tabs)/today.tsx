import { useMemo, useState } from "react";
import { ActionSheetIOS, Alert, Platform, Pressable, RefreshControl, View } from "react-native";
import { router } from "expo-router";
import { ChevronDown } from "lucide-react-native";
import { useActiveOrg } from "~/org/org-provider";
import { useAnalysis, useCatalog, useImportJobs, useIntegrations, useOpenAlerts, useProAccounts, useRadar, useToday } from "~/data/hooks";
import { stockSummary } from "~/data/catalog";
import { AdvisorEntry, buildTasks, LastImportRow, PriorityCard, RadarOpportunities, SearchShortcut, SetupChecklist, Shortcuts, TaskList, TodayNavLeft, TodayStage } from "~/components/dashboard";
import { PERIODS, type Period } from "~/data/intelligence";
import { PROVIDER_LABEL } from "~/data/sales";
import { userMessage } from "~/lib/errors";
import { formatClock, formatCompactMoney, formatMoneyRounded, formatNumber, formatSignedPercent } from "~/lib/format";
import {
  AccountAvatar,
  AlertBanner,
  BarChart,
  Card,
  EmptyState,
  ErrorState,
  FadeIn,
  KpiCard,
  KpiGrid,
  ListRow,
  MonoTitle,
  NightHeader,
  Screen,
  SectionHeader,
  Skeleton,
  SkeletonList,
  Thumb,
  Txt,
} from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";

type Segment = "today" | "analysis";

export default function TodayScreen() {
  const [segment, setSegment] = useState<Segment>("today");
  const [period, setPeriod] = useState<Period>(30);
  const { active } = useActiveOrg();

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

  return segment === "today" ? (
    <Today currency={active.organization.currency} orgName={active.organization.name} isDemo={Boolean(active.organization.isDemo)} onAnalysis={() => setSegment("analysis")} />
  ) : (
    <Analysis header={<NightHeader back={{ label: "Aujourd'hui", onPress: () => setSegment("today") }} right={periodPicker} over={`${period} derniers jours`} title="Analyse" />} period={period} currency={active.organization.currency} />
  );
}

function Today({ currency, orgName, isDemo, onAnalysis }: { currency: string; orgName: string; isDemo: boolean; onAnalysis: () => void }) {
  const today = useToday();
  const catalog = useCatalog();
  // M-13 : les appels au serveur (Edge, démarrage à froid possible) ne partent qu'une fois les
  // chiffres du jour chargés : l'essentiel s'affiche d'abord, la liste « À faire » se complète ensuite.
  const secondary = !today.isPending;
  const jobs = useImportJobs(undefined, secondary);
  const accounts = useProAccounts(secondary);
  const radar = useRadar("score", secondary);
  const alerts = useOpenAlerts();
  const integrations = useIntegrations(secondary);
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

  const header = (
    <NightHeader
      left={<TodayNavLeft orgName={orgName} isDemo={isDemo} />}
      right={
        <>
          <SearchShortcut />
          <AccountAvatar />
        </>
      }
      stage={<TodayStage today={today.data} catalog={catalog.data} summary={summary} currency={currency} onAnalysis={onAnalysis} />}
    />
  );

  return (
    <Screen
      header={header}
      contentGap={26}
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
          <Skeleton w="100%" h={220} r={radius.card} />
          <SkeletonList rows={4} thumb={false} />
        </>
      ) : today.isError ? (
        <ErrorState description={`${userMessage(today.error)}${today.dataUpdatedAt ? ` Dernières données : ${formatClock(new Date(today.dataUpdatedAt).toISOString())}.` : ""}`} onRetry={() => void today.refetch()} />
      ) : (
        <>
          {emptyShop ? checklist : null}
          <FadeIn index={0}>
            <PriorityCard radar={radar.data} currency={currency} />
          </FadeIn>
          <FadeIn index={1} style={{ gap: 10 }}>
            <MonoTitle title="À traiter" count={tasks.length || undefined} aside={tasks.length > 1 ? "par gravité" : undefined} />
            <TaskList tasks={tasks} />
          </FadeIn>
          <FadeIn index={2}>
            <Shortcuts />
          </FadeIn>
          <FadeIn index={3}>
            <RadarOpportunities radar={radar.data} currency={currency} />
          </FadeIn>
          <AdvisorEntry />
          <View style={{ gap: 10 }}>
            <MonoTitle
              title="Activité"
              right={
                <Pressable accessibilityRole="button" accessibilityLabel="Voir l'analyse des ventes" hitSlop={10} onPress={onAnalysis}>
                  <Txt variant="label" color={color.ink} style={{ fontFamily: "Manrope_700Bold" }}>
                    Analyse ›
                  </Txt>
                </Pressable>
              }
            />
            {today.data.recentSales.length === 0 && !lastJob ? (
              <Card padded>
                <Txt variant="bodyRegular">Aucune activité pour l'instant.</Txt>
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
          </View>
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
