import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import {
  AlertTriangle,
  BellRing,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileWarning,
  Library,
  Link2Off,
  Mic,
  PackageMinus,
  PackageX,
  Plus,
  ScanSearch,
  Search,
  Sparkles,
  TrendingDown,
  Truck,
  Upload,
  WalletCards,
} from "lucide-react-native";
import type { ImportJobDTO, ProAccountsHubDTO, RadarDTO, RadarItemDTO, RadarRestockDTO } from "@/features/mobile-api/contract";
import { barcodeItems, outOfStockSalesShare, type Catalog, type StockSummary } from "~/data/catalog";
import type { OpenAlert, TodayData } from "~/data/intelligence";
import { formatMoney, formatMoneyRounded, formatNumber, formatRelative, formatShortDate } from "~/lib/format";
import {
  ActionRow,
  Card,
  Chevron,
  CountingFigure,
  DayBars,
  DealBadge,
  DemoBadge,
  FadeIn,
  IconButton,
  LegendKey,
  MonoTitle,
  ProgressBar,
  ShortcutGrid,
  ShortcutTile,
  StageStats,
  StockBarcode,
  Txt,
  Wordmark,
  type BlockTone,
  type DealLevel,
} from "~/components/ui";
import { SupplierLogo } from "~/components/supplier-logo";
import { color, radius, space } from "~/theme/tokens";
import { useLayout } from "~/theme/layout";

/**
 * Accueil v5 « Instrument » : voir en 3 secondes l'argent du jour, l'état du stock et LA chose à
 * faire. Uniquement des chiffres calculés sur les données réelles de l'organisation (ventes, stock,
 * imports, connexions, radar) ; une donnée absente est masquée ou affichée « — », jamais supposée.
 */

const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n > 1 ? many : one}`;

// ---------------------------------------------------------------------------------------------
// Scène : mot-symbole, CA du jour, 14 jours, relevés, code-barres du stock
// ---------------------------------------------------------------------------------------------

/** Rangée de navigation de l'accueil : mot-symbole, organisation (+ DÉMO), recherche. */
export function TodayNavLeft({ orgName, isDemo }: { orgName: string; isDemo: boolean }) {
  const { compact } = useLayout();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 }}>
      <Wordmark small={compact} />
      <View style={{ width: 1, height: 14, backgroundColor: "rgba(247,248,250,0.16)" }} />
      <Txt variant="label" color={color.inkOnDarkMuted} numberOfLines={1} style={{ flexShrink: 1 }} maxFontSizeMultiplier={1.2}>
        {orgName}
      </Txt>
      {isDemo ? <DemoBadge /> : null}
    </View>
  );
}

export function SearchShortcut() {
  return <IconButton onDark icon={<Search size={18} color={color.inkOnDark} strokeWidth={2.2} />} label="Chercher une offre" onPress={() => router.push("/sourcing")} />;
}

/** Contenu de la scène de l'accueil (sous la rangée de navigation). */
export function TodayStage({ today, catalog, summary, currency, onAnalysis, now = new Date() }: { today: TodayData | undefined; catalog: Catalog | undefined; summary: StockSummary | null; currency: string; onAnalysis: () => void; now?: Date }) {
  const { compact } = useLayout();
  const yesterday = today ? formatMoneyRounded(today.revenueYesterday, currency) : null;
  return (
    <View style={{ gap: 0 }}>
      <Txt variant="mono" color={color.inkOnDarkMuted} numberOfLines={1} style={{ marginTop: space[3] }}>
        {formatShortDate(now)} · {compact ? "CA du jour" : "Chiffre d'affaires du jour"}
      </Txt>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 6, gap: space[3] }}>
        <View style={{ flexShrink: 1 }}>
          <CountingFigure amount={today ? Math.round(today.revenueToday) : null} format={(n) => formatMoneyRounded(n, currency)} size={compact ? "md" : "xl"} />
        </View>
        {today ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Chiffre d'affaires des 14 derniers jours (maximum ${formatMoneyRounded(Math.max(...today.last14Days.map((d) => d.amount), 0), currency)}, aujourd'hui en cours). Ouvrir l'analyse`} testID="day-bars" onPress={onAnalysis} style={({ pressed }) => ({ width: compact ? 112 : 164, paddingBottom: 6, opacity: pressed ? 0.7 : 1 })}>
            <DayBars days={today.last14Days} height={compact ? 34 : 44} accessibilityLabel="" />
          </Pressable>
        ) : null}
      </View>
      {today ? (
        <StageStats
          style={{ marginTop: 18 }}
          stats={[
            { label: "Ventes", value: formatNumber(today.ordersToday), note: today.toShip > 0 ? "à expédier" : undefined, onPress: today.toShip > 0 ? () => router.push({ pathname: "/sales", params: { status: "paid" } }) : undefined, a11y: `Ventes du jour : ${today.ordersToday}${today.toShip > 0 ? `, ${today.toShip} à expédier` : ""}` },
            { label: compact ? "Marge" : "Marge estimée", value: today.marginTodayPercent === null ? null : `≈ ${Math.round(today.marginTodayPercent)} %` },
            { label: compact ? "Hier" : "Hier, journée", value: yesterday },
          ]}
        />
      ) : null}
      {catalog && summary && summary.skus > 0 ? <StockBlock catalog={catalog} summary={summary} currency={currency} /> : null}
    </View>
  );
}

function StockBlock({ catalog, summary, currency }: { catalog: Catalog; summary: StockSummary; currency: string }) {
  const { compact } = useLayout();
  const share = outOfStockSalesShare(catalog);
  const partial = summary.skusWithoutCost > 0;
  const value = `${partial ? "≈ " : ""}${formatMoneyRounded(summary.value, currency)}`;
  const a11y = `Stock : ${plural(summary.skus, "référence", "références")}, ${catalog.counts.out} en rupture${share ? ` représentant ${share} % des ventes sur 30 jours` : ""}, ${catalog.counts.low} faible${catalog.counts.low > 1 ? "s" : ""}`;
  return (
    <View style={{ marginTop: 22, paddingTop: space[4], borderTopWidth: 1, borderTopColor: color.nightLine }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space[2] }}>
        <Txt variant="mono" color={color.inkOnDarkMuted} numberOfLines={1} style={{ flexShrink: 1 }}>
          Stock · {formatNumber(summary.skus)} réf. · {formatNumber(summary.units)} u.
        </Txt>
        <Pressable accessibilityRole="button" accessibilityLabel={`Valeur du stock au coût : ${value}${partial ? `, ${summary.skusWithoutCost} sans coût` : ""}`} onPress={() => router.push("/stock")} testID="pulse-value" style={{ flexDirection: "row", alignItems: "baseline", gap: 5 }}>
          <Txt variant="body" num color={color.inkOnDark} style={{ fontFamily: "Manrope_700Bold" }}>
            {value}
          </Txt>
          <Txt variant="monoSm" color={color.inkOnDarkSubtle}>
            au coût
          </Txt>
        </Pressable>
      </View>
      <View style={{ marginTop: 10 }}>
        <StockBarcode items={barcodeItems(catalog)} height={compact ? 34 : 42} onPress={() => router.push("/stock")} accessibilityLabel={a11y} testID="stock-barcode" />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, gap: 14 }}>
        <Pressable testID="pulse-out" accessibilityRole="button" accessibilityLabel={`${plural(catalog.counts.out, "rupture", "ruptures")} : voir`} hitSlop={10} onPress={() => router.push({ pathname: "/stock", params: { filter: "out" } })}>
          <LegendKey fill={color.dangerOnDark} label={plural(catalog.counts.out, "rupture", "ruptures")} />
        </Pressable>
        <Pressable testID="pulse-low" accessibilityRole="button" accessibilityLabel={`${plural(catalog.counts.low, "faible", "faibles")} : voir`} hitSlop={10} onPress={() => router.push({ pathname: "/stock", params: { filter: "low" } })}>
          <LegendKey fill={color.accent} label={plural(catalog.counts.low, "faible", "faibles")} />
        </Pressable>
        <View style={{ flex: 1 }} />
        {compact ? null : (
          <Txt variant="monoSm" color={color.inkOnDarkSubtle} numberOfLines={1}>
            Largeur = ventes 30 j
          </Txt>
        )}
      </View>
      {share ? (
        <View style={{ flexDirection: "row", gap: 8, marginTop: space[3], alignItems: "flex-start" }}>
          <TrendingDown size={16} color={color.dangerOnDark} strokeWidth={2.2} style={{ marginTop: 2 }} />
          <Txt variant="body" color={color.inkOnDark} style={{ flex: 1, fontSize: 13.5, lineHeight: 19 }}>
            {share} % de vos ventes sur 30 jours portent sur des produits en rupture.
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// À faire maintenant : une rupture et sa meilleure offre rapprochée
// ---------------------------------------------------------------------------------------------

/** Premier réapprovisionnement avec une offre rapprochée, classé par CA 30 j perdu. */
export function pickPriority(radar: RadarDTO | undefined): { restock: RadarRestockDTO; item: RadarItemDTO | null } | null {
  const candidates = (radar?.restock ?? []).filter((r) => r.bestOfferId && r.quantityAvailable <= 0);
  const pool = candidates.length ? candidates : (radar?.restock ?? []).filter((r) => r.bestOfferId);
  const best = [...pool].sort((a, b) => b.units30d * (b.bestPrice ?? 0) - a.units30d * (a.bestPrice ?? 0))[0];
  if (!best) return null;
  return { restock: best, item: radar?.items.find((i) => i.offer.offerId === best.bestOfferId) ?? null };
}

const RADAR_LEVEL: Record<string, { level: DealLevel; label: string }> = {
  profitable: { level: "good", label: "Rentable" },
  estimated: { level: "average", label: "Estimée" },
  unprofitable: { level: "not_competitive", label: "Non rentable" },
  insufficient: { level: "insufficient_data", label: "Données insuffisantes" },
};

export function PriorityCard({ radar, currency }: { radar: RadarDTO | undefined; currency: string }) {
  const { compact } = useLayout();
  const [why, setWhy] = useState(false);
  const pick = pickPriority(radar);
  if (!pick) return null;
  const { restock: r, item } = pick;
  const out = r.quantityAvailable <= 0;
  const e = item?.evaluation;
  const o = item?.offer;
  const moq = Math.max(1, o?.moq ?? 1);
  const deal = e ? (RADAR_LEVEL[e.status] ?? RADAR_LEVEL.insufficient!) : null;
  const tax = o?.taxType === "ht" ? "HT" : o?.taxType === "ttc" ? "TTC" : "HT/TTC ?";
  return (
    <View style={{ gap: 10 }}>
      <MonoTitle title="À faire maintenant" aside={o?.lastSeenAt ? `prix ${formatRelative(o.lastSeenAt)}` : undefined} />
      <View testID="priority-card" style={{ backgroundColor: color.card, borderRadius: radius.card, borderWidth: 1, borderColor: color.line, overflow: "hidden" }}>
        <View style={{ paddingTop: space[4], paddingHorizontal: space[4], paddingBottom: 14, gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", backgroundColor: out ? color.dangerSoft : color.accentSoft, borderRadius: radius.xs, paddingHorizontal: 7, paddingVertical: 3 }}>
            {out ? <PackageX size={13} color={color.dangerInk} strokeWidth={2.2} /> : <PackageMinus size={13} color={color.accentInkOnSoft} strokeWidth={2.2} />}
            <Txt variant="code" color={out ? color.dangerInk : color.accentInkOnSoft} style={{ fontFamily: "GeistMono_600SemiBold", fontSize: 10.5, letterSpacing: 0.6 }}>
              {out ? "RUPTURE" : "STOCK FAIBLE"}
            </Txt>
          </View>
          <Txt variant="cardTitle" numberOfLines={2}>
            {r.name}
          </Txt>
          <Txt variant="body" color={color.ink2} style={{ fontSize: 13.5, lineHeight: 19 }}>
            {plural(r.units30d, "vente", "ventes")} sur 30 jours, {out ? "plus aucune unité disponible." : `${plural(r.quantityAvailable, "unité restante", "unités restantes")}${r.daysOfCover !== null ? ` (≈ ${r.daysOfCover} j)` : ""}.`}
          </Txt>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Meilleure offre rapprochée : ${r.bestSupplier ?? "fournisseur"}, ${formatMoney(r.bestPrice, currency)} ${tax}. Ouvrir l'analyse`}
          onPress={() => router.push({ pathname: "/radar/[offerId]", params: { offerId: r.bestOfferId! } })}
          style={({ pressed }) => ({ marginHorizontal: space[3], padding: space[3], borderRadius: radius.lg, backgroundColor: pressed ? color.surfacePressed : color.bg, gap: 10 })}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <SupplierLogo domain={null} name={r.bestSupplier ?? "?"} size={38} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Txt variant="monoSm" numberOfLines={1}>
                Meilleure offre rapprochée
              </Txt>
              <Txt variant="body" numberOfLines={1} style={{ fontFamily: "Manrope_700Bold" }}>
                {r.bestSupplier ?? "Fournisseur"}
              </Txt>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Txt variant="price" num>
                {formatMoney(r.bestPrice, currency)}
              </Txt>
              <Txt variant="code" style={{ fontSize: 10.5 }}>
                {tax}
                {o?.moq ? ` · MOQ ${o.moq}` : ""}
              </Txt>
            </View>
          </View>
          {deal ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <DealBadge level={deal.level} label={deal.label} size="sm" provisional={e?.status === "estimated"} />
              {e?.estimatedProfit !== null && e?.estimatedProfit !== undefined ? (
                <Txt variant="label" num color={e.estimatedProfit >= 0 ? color.success : color.dangerInk} style={{ fontFamily: "Manrope_700Bold" }}>
                  ≈ {e.estimatedProfit >= 0 ? "+" : "−"}
                  {formatMoney(Math.abs(e.estimatedProfit), currency)} / u
                </Txt>
              ) : null}
              <View style={{ flex: 1 }} />
              <Txt variant="code" style={{ fontSize: 10.5 }} numberOfLines={1}>
                {o?.availableQuantity !== null && o?.availableQuantity !== undefined ? `${formatNumber(o.availableQuantity)} dispo` : "stock ?"}
              </Txt>
            </View>
          ) : null}
        </Pressable>
        {why && e ? (
          <View style={{ marginHorizontal: space[4], marginTop: space[2], gap: 0 }} testID="priority-calc">
            {e.breakdown.map((l, i) => (
              <View key={`${l.label}-${i}`} style={{ flexDirection: "row", justifyContent: "space-between", gap: space[2], paddingVertical: 7, borderTopWidth: i ? 1 : 0, borderTopColor: color.lineSoft }}>
                <Txt variant="label" color={color.ink2} style={{ flex: 1 }} numberOfLines={1}>
                  {l.label}
                </Txt>
                <Txt variant="label" num color={color.ink} style={{ fontFamily: "Manrope_700Bold" }}>
                  {l.amount === null ? "—" : formatMoney(l.amount, currency)}
                </Txt>
              </View>
            ))}
            <Txt variant="note" style={{ marginTop: 6 }}>
              Rien n'est envoyé au fournisseur sans votre confirmation.
            </Txt>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", gap: 8, padding: space[3] }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Préparer un brouillon de commande : ${moq} unité${moq > 1 ? "s" : ""}`}
            testID="priority-draft"
            onPress={() => router.push({ pathname: "/radar/[offerId]", params: { offerId: r.bestOfferId!, order: "1" } })}
            style={({ pressed }) => ({ flex: 1, minHeight: 52, borderRadius: radius.lg, backgroundColor: pressed ? color.mintPressed : color.mint, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: space[3] })}
          >
            <ClipboardList size={18} color={color.onMint} strokeWidth={2.2} />
            <Txt variant="button" color={color.onMint} numberOfLines={1} adjustsFontSizeToFit style={{ flexShrink: 1 }}>
              {compact ? "Brouillon" : `Brouillon · ${moq} u.`}
            </Txt>
          </Pressable>
          {e && e.breakdown.length ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: why }}
              accessibilityLabel={why ? "Masquer le calcul" : "Voir le calcul"}
              onPress={() => setWhy(!why)}
              style={({ pressed }) => ({ minHeight: 52, borderRadius: radius.lg, borderWidth: 1, borderColor: color.lineStrong, backgroundColor: pressed ? color.surfacePressed : color.card, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space[4] })}
            >
              <Txt variant="button">Calcul</Txt>
              <Chevron open={why}>
                <ChevronDown size={16} color={color.ink} strokeWidth={2.4} />
              </Chevron>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// À traiter
// ---------------------------------------------------------------------------------------------

type Task = { key: string; icon: typeof AlertTriangle; tone: BlockTone; title: string; detail?: string | null; cta: string; go: () => void; rank: number };

/** Tâches actionnables, des plus graves aux moins graves ; chacune mène à sa résolution. */
export function buildTasks(input: { today?: TodayData; catalog?: Catalog; jobs?: ImportJobDTO[]; accounts?: ProAccountsHubDTO; alerts?: OpenAlert[]; now?: Date }): Task[] {
  const { today, catalog, jobs, accounts, alerts } = input;
  const now = input.now ?? new Date();
  const tasks: Task[] = [];
  const recentJobs = (jobs ?? []).filter((j) => now.getTime() - new Date(j.startedAt).getTime() < 14 * 86_400_000);
  // seul le DERNIER import de chaque fournisseur compte (un échec corrigé depuis n'est plus à traiter)
  const latest = new Map<string, ImportJobDTO>();
  for (const j of recentJobs) {
    const k = j.supplierId ?? j.id;
    const cur = latest.get(k);
    if (!cur || cur.startedAt < j.startedAt) latest.set(k, j);
  }
  for (const j of latest.values()) {
    const who = j.supplierName ?? "Import";
    if (j.status === "failed" || j.status === "quarantined")
      tasks.push({ key: `job-${j.id}`, icon: FileWarning, tone: "danger", title: `Import échoué · ${who}`, detail: j.message ?? j.fileName, cta: "Rapport", go: () => router.push({ pathname: "/sourcing-imports/[id]", params: { id: j.id } }), rank: 0 });
    else if (j.status === "partial" && j.counts.invalid + j.counts.unrecognized > 0)
      tasks.push({ key: `job-${j.id}`, icon: FileWarning, tone: "warning", title: `Import partiel · ${who}`, detail: `${plural(j.counts.invalid + j.counts.unrecognized, "ligne ignorée", "lignes ignorées")} sur ${formatNumber(j.counts.read)}`, cta: "Rapport", go: () => router.push({ pathname: "/sourcing-imports/[id]", params: { id: j.id } }), rank: 3 });
  }
  for (const a of accounts?.accounts ?? [])
    if (a.status === "error")
      tasks.push({ key: `acc-${a.key}`, icon: Link2Off, tone: "danger", title: `Connexion ${a.name} en erreur`, detail: a.lastError, cta: "Corriger", go: () => router.push({ pathname: "/supplier-directory/[key]", params: { key: a.key } }), rank: 0 });
  if (catalog && catalog.counts.out > 0) tasks.push({ key: "out", icon: PackageX, tone: "danger", title: plural(catalog.counts.out, "produit en rupture", "produits en rupture"), cta: "Voir", go: () => router.push({ pathname: "/stock", params: { filter: "out" } }), rank: 1 });
  if (today && today.toShip > 0) tasks.push({ key: "ship", icon: Truck, tone: "warning", title: plural(today.toShip, "commande à expédier", "commandes à expédier"), cta: "Expédier", go: () => router.push({ pathname: "/sales", params: { status: "paid" } }), rank: 2 });
  if (catalog && catalog.counts.low > 0) tasks.push({ key: "low", icon: PackageMinus, tone: "warning", title: plural(catalog.counts.low, "produit en stock faible", "produits en stock faible"), cta: "Voir", go: () => router.push({ pathname: "/stock", params: { filter: "low" } }), rank: 3 });
  if (today && today.pendingSales > 0) tasks.push({ key: "pending", icon: Boxes, tone: "neutral", title: plural(today.pendingSales, "vente non déduite du stock", "ventes non déduites du stock"), cta: "Traiter", go: () => router.push("/sales"), rank: 4 });
  // alertes ouvertes liées à un produit, hors ruptures / stock faible (déjà résumés ci-dessus)
  for (const al of (alerts ?? []).filter((x) => x.entityType === "sku" && x.entityId && !/stock|out_of|low/i.test(x.type)).slice(0, 2)) {
    tasks.push({ key: `alert-${al.id}`, icon: BellRing, tone: al.severity === "critical" ? "danger" : "info", title: al.title, detail: al.message, cta: "Ouvrir", go: () => router.push({ pathname: "/sku/[skuId]", params: { skuId: al.entityId! } }), rank: al.severity === "critical" ? 1 : 4 });
  }
  return tasks.sort((a, b) => a.rank - b.rank);
}

const VISIBLE_TASKS = 5;

export function TaskList({ tasks }: { tasks: Task[] }) {
  const [all, setAll] = useState(false);
  if (tasks.length === 0)
    return (
      <Card>
        <ActionRow icon={CheckCircle2} tone="success" title="Tout est à jour" last />
      </Card>
    );
  const extra = tasks.length - VISIBLE_TASKS;
  const shown = all || extra <= 0 ? tasks : tasks.slice(0, VISIBLE_TASKS);
  return (
    <Card testID="task-list">
      {shown.map((t, i) => (
        <FadeIn key={t.key} index={i} step={30}>
          <ActionRow icon={t.icon} tone={t.tone} title={t.title} detail={t.detail} cta={t.cta} onPress={t.go} last={i === shown.length - 1 && extra <= 0} testID={`task-${t.key}`} detailLines={1} />
        </FadeIn>
      ))}
      {extra > 0 ? (
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: all }} onPress={() => setAll(!all)} style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderTopWidth: 1, borderTopColor: color.lineSoft, backgroundColor: pressed ? color.surfacePressed : "transparent" })}>
          <Txt variant="label" color={color.ink} style={{ fontFamily: "Manrope_700Bold" }}>
            {all ? "Réduire" : plural(extra, "autre point", "autres points")}
          </Txt>
          <Chevron open={all}>
            <ChevronDown size={15} color={color.ink} strokeWidth={2.4} />
          </Chevron>
        </Pressable>
      ) : null}
    </Card>
  );
}

/** Raccourcis vers les opérations fréquentes (toutes réelles) : une rangée de 4 (2 × 2 sur petit écran). */
export function Shortcuts() {
  const { compact } = useLayout();
  return (
    <ShortcutGrid columns={compact ? 2 : 4}>
      {[
        <ShortcutTile key="search" accent icon={Search} label="Chercher une offre" onPress={() => router.push("/sourcing")} testID="shortcut-search" />,
        <ShortcutTile key="add" icon={Plus} label="Ajouter un produit" onPress={() => router.push("/product/new")} testID="shortcut-add" />,
        <ShortcutTile key="import" icon={Upload} label="Importer un catalogue" onPress={() => router.push("/sourcing-import")} testID="shortcut-import" />,
        <ShortcutTile key="library" icon={Library} label="Fournisseurs" onPress={() => router.push("/supplier-directory")} testID="shortcut-library" />,
      ]}
    </ShortcutGrid>
  );
}

/** Accès au conseiller IA (texte ou voix). */
export function AdvisorEntry() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Parler à votre conseiller"
      onPress={() => router.push("/advisor")}
      testID="assistant-entry"
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space[3], padding: space[3], paddingLeft: space[4], borderRadius: radius.card, backgroundColor: pressed ? color.nightRaised : color.brand })}
    >
      <Sparkles size={18} color={color.mint} />
      <View style={{ flex: 1, gap: 1 }}>
        <Txt variant="body" color={color.inkOnDark}>
          Votre conseiller
        </Txt>
        <Txt variant="label" color={color.inkOnDarkMuted} numberOfLines={1}>
          « Que dois-je racheter cette semaine ? »
        </Txt>
      </View>
      <View style={{ width: 40, height: 40, borderRadius: radius.lg, backgroundColor: color.mint, alignItems: "center", justifyContent: "center" }}>
        <Mic size={18} color={color.onMint} />
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------------------------
// Opportunités du radar
// ---------------------------------------------------------------------------------------------

export function radarOpportunities(radar: RadarDTO | undefined): RadarItemDTO[] {
  return (radar?.items ?? []).filter((i) => (i.evaluation.status === "profitable" || i.evaluation.status === "estimated") && (i.evaluation.estimatedProfit ?? 0) > 0).slice(0, 3);
}

export function RadarOpportunities({ radar, currency }: { radar: RadarDTO | undefined; currency: string }) {
  const items = radarOpportunities(radar);
  return (
    <View style={{ gap: 10 }}>
      <MonoTitle
        title="Opportunités du radar"
        count={items.length || undefined}
        right={
          <Pressable accessibilityRole="button" accessibilityLabel="Comparer : ouvrir le radar" hitSlop={10} onPress={() => router.push("/radar")} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 2, opacity: pressed ? 0.6 : 1 })}>
            <Txt variant="label" color={color.ink} style={{ fontFamily: "Manrope_700Bold" }}>
              Comparer
            </Txt>
            <ChevronRight size={14} color={color.ink} strokeWidth={2.4} />
          </Pressable>
        }
      />
      {items.length === 0 ? (
        <Card>
          <ActionRow icon={ScanSearch} tone="neutral" title="Aucune opportunité pour l'instant" cta="Radar" onPress={() => router.push("/radar")} last />
        </Card>
      ) : (
        <Card testID="opportunities">
          {items.map((i, k) => {
            const e = i.evaluation;
            const o = i.offer;
            const provisional = e.status === "estimated";
            const tax = o.taxType === "ht" ? " HT" : o.taxType === "ttc" ? " TTC" : "";
            return (
              <Pressable
                key={o.offerId}
                accessibilityRole="button"
                accessibilityLabel={`${i.sku.name}, ${o.supplierName}, achat ${formatMoney(o.price, o.currency ?? currency)}${tax}, marge ${provisional ? "estimée " : ""}${formatMoney(e.estimatedProfit, currency)} par unité`}
                onPress={() => router.push({ pathname: "/radar/[offerId]", params: { offerId: o.offerId } })}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 62, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: pressed ? color.surfacePressed : "transparent", borderBottomWidth: k === items.length - 1 ? 0 : 1, borderBottomColor: color.lineSoft })}
              >
                <SupplierLogo domain={null} name={o.supplierName} size={34} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Txt variant="body" numberOfLines={1}>
                    {i.sku.name}
                  </Txt>
                  <Txt variant="code" numberOfLines={1}>
                    {formatMoney(o.price, o.currency ?? currency)}
                    {tax}
                    {o.availableQuantity !== null ? ` · ${formatNumber(o.availableQuantity)} dispo` : ""}
                    {o.lastSeenAt ? ` · ${formatRelative(o.lastSeenAt)}` : ""}
                  </Txt>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Txt variant="price" num color={color.success} style={{ fontSize: 16 }}>
                    {provisional ? "≈ " : ""}+{formatMoney(e.estimatedProfit, currency)}
                  </Txt>
                  <Txt variant="code" style={{ fontSize: 10.5 }}>
                    /u{e.marginPercent !== null ? ` · ${String(e.marginPercent).replace(".", ",")} %` : ""}
                  </Txt>
                </View>
              </Pressable>
            );
          })}
        </Card>
      )}
      {radar && radar.missingSettings.length > 0 && items.length > 0 ? (
        <Txt variant="note" color={color.accentInkOnSoft}>
          Marges provisoires ·{" "}
          <Txt variant="note" color={color.accentInkOnSoft} style={{ fontFamily: "Manrope_700Bold", textDecorationLine: "underline" }} onPress={() => router.push("/radar/settings")} accessibilityRole="link">
            compléter mes coûts
          </Txt>
        </Txt>
      ) : null}
    </View>
  );
}

/** Dernier import (activité utile) avec son résultat réel. */
export function LastImportRow({ job, last }: { job: ImportJobDTO; last?: boolean }) {
  const ok = job.status === "completed";
  return (
    <ActionRow
      icon={ok ? CheckCircle2 : job.status === "failed" ? AlertTriangle : FileWarning}
      tone={ok ? "success" : job.status === "failed" ? "danger" : "warning"}
      title={`Import ${job.supplierName ?? ""}`.trim()}
      detail={`${formatRelative(job.startedAt)} · ${formatNumber(job.counts.created + job.counts.updated)} offres à jour${job.counts.invalid ? ` · ${formatNumber(job.counts.invalid)} ignorées` : ""}`}
      onPress={() => router.push({ pathname: "/sourcing-imports/[id]", params: { id: job.id } })}
      last={last}
      detailLines={1}
    />
  );
}

/** « Bien démarrer » : étapes réelles de configuration, affichées tant qu'il en reste. */
export function SetupChecklist({ hasProducts, hasChannel, hasSupplier, hasCosts }: { hasProducts: boolean; hasChannel: boolean | null; hasSupplier: boolean; hasCosts: boolean | null }) {
  const steps = [
    { key: "product", done: hasProducts, icon: Plus, title: "Ajouter vos produits", detail: "Saisie, voix ou code-barres", go: () => router.push("/product/new") },
    { key: "channel", done: hasChannel === true, icon: WalletCards, title: "Connecter eBay", detail: "Ventes et stock synchronisés", go: () => router.push("/ebay") },
    { key: "supplier", done: hasSupplier, icon: Library, title: "Brancher un fournisseur", detail: "Compte pro, catalogue ou source publique", go: () => router.push("/pro-accounts") },
    { key: "costs", done: hasCosts === true, icon: ScanSearch, title: "Régler vos coûts", detail: "Pour des marges complètes", go: () => router.push("/radar/settings") },
  ].filter((s) => !(s.key === "channel" && hasChannel === null) && !(s.key === "costs" && hasCosts === null));
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const todo = steps.filter((s) => !s.done);
  return (
    <View style={{ gap: 10 }}>
      <MonoTitle title="Bien démarrer" aside={`${done} / ${steps.length}`} />
      <Card testID="setup-checklist">
        <View style={{ padding: space[4], paddingBottom: space[3] }}>
          <ProgressBar value={done} max={steps.length} tone="success" label={`Configuration : ${done} étapes sur ${steps.length}`} />
        </View>
        {todo.map((s, i) => (
          <ActionRow key={s.key} icon={s.icon} tone="neutral" title={s.title} detail={s.detail} onPress={s.go} last={i === todo.length - 1} detailLines={1} />
        ))}
      </Card>
    </View>
  );
}
