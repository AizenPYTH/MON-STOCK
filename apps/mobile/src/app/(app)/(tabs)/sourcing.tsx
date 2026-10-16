import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronRight, FileStack, History, KeyRound, LayoutList, Library, Radar, Rows3, Search, SearchX, Upload, X } from "lucide-react-native";
import type { SourceOverviewDTO } from "@/features/mobile-api/contract";
import { useImportJobs, useSources, useSupplierDirectory, useSupplierSearch } from "~/data/hooks";
import { categoryOf, frenchTitle, OFFER_CATEGORIES, OFFER_CATEGORY_LABEL, queryTargetsDevice, shortSupplierName, type OfferCategory } from "@/domain/sourcing/offer-display";
import type { SimpleDealDTO, SimpleOfferDTO, SimpleRankedOfferDTO, SimpleSearchDTO, SimpleSupplierResultDTO } from "~/data/supplier-search";
import { fontFamily } from "~/theme/typography";
import { userMessage } from "~/lib/errors";
import { formatMoney, formatNumber, formatRelative } from "~/lib/format";
import { SupplierLogo } from "~/components/supplier-logo";
import { OfferCard, OfferLines, rulerCaption, rulerEmptyCaption, type OfferDensity } from "~/components/offer-result";
import { OfferAnalysisSheet, type AnalyzedOffer } from "~/components/offer-analysis";
import { AccountAvatar, ActionRow, Button, Card, ErrorState, FadeIn, FilterChip, IconBadge, MarketRuler, MonoTitle, NightHeader, Screen, Segmented, ShortcutGrid, ShortcutTile, Skeleton, StageFigure, Txt } from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";
import { useLayout } from "~/theme/layout";

export { DealLines } from "~/components/offer-result";

const EXAMPLES = ["iPhone 13", "iPhone 15 Pro", "Écran iPhone 12", "Batterie iPhone 11"];

const PAGE = 40;

/** Toutes les offres du moins cher au plus cher (serveur récent : `offers` ; sinon reconstitué). */
export function rankedOffers(data: Pick<SimpleSearchDTO, "suppliers"> & { offers?: SimpleRankedOfferDTO[] }): SimpleRankedOfferDTO[] {
  if (data.offers) return data.offers;
  const key = (o: SimpleOfferDTO) => o.priceConverted ?? o.price ?? Number.POSITIVE_INFINITY;
  return data.suppliers.flatMap((s) => s.offers.map((o) => ({ ...o, supplierId: s.supplierId, supplierName: s.supplierName, country: s.country }))).sort((a, b) => key(a) - key(b));
}

const DEAL_ORDER: Record<SimpleDealDTO["level"], number> = { very_good: 0, good: 1, average: 2, not_competitive: 3, insufficient_data: 4 };

/** « Meilleures opportunités » : niveau, puis score, puis marge ; offres sans analyse en dernier. Pur. */
export function bestDeals(offers: SimpleRankedOfferDTO[]): SimpleRankedOfferDTO[] {
  const lvl = (o: SimpleRankedOfferDTO) => (o.deal ? DEAL_ORDER[o.deal.level] : 5);
  return [...offers].sort((a, b) => lvl(a) - lvl(b) || (b.deal?.score ?? -1) - (a.deal?.score ?? -1) || (b.deal?.margin ?? -Infinity) - (a.deal?.margin ?? -Infinity));
}

/** Vos comptes fournisseurs d'abord (prix pro), puis sources publiques et places de marché ; ordre conservé dans chaque groupe. Pur. */
export function splitByAccess(offers: SimpleRankedOfferDTO[]): { account: SimpleRankedOfferDTO[]; other: SimpleRankedOfferDTO[] } {
  return { account: offers.filter((o) => o.access === "account"), other: offers.filter((o) => o.access !== "account") };
}

type Sort = "price" | "deals" | "supplier";

/** Offres rangées par catégorie (ordre de prix conservé). Pur. */
export function groupByCategory<T extends { title: string }>(offers: T[]): Map<OfferCategory, T[]> {
  const m = new Map<OfferCategory, T[]>();
  for (const o of offers) {
    const c = categoryOf(o.title);
    const list = m.get(c);
    if (list) list.push(o);
    else m.set(c, [o]);
  }
  return m;
}

/** Vue « par fournisseur » limitée à la catégorie choisie. Pur. */
function groupSuppliers(suppliers: SimpleSupplierResultDTO[], category: OfferCategory | "all"): SimpleSupplierResultDTO[] {
  if (category === "all") return suppliers;
  return suppliers
    .map((s) => {
      const offers = s.offers.filter((o) => categoryOf(o.title) === category);
      return { ...s, offers, total: offers.length };
    })
    .filter((s) => s.offers.length > 0);
}
type Origin = "all" | "account" | "public" | "marketplace";

/** Filtre d'origine des prix (vos comptes / sources publiques / places de marché). Pur. */
export function byOrigin<T extends { access?: "account" | "public" | "marketplace" }>(offers: T[], origin: Origin): T[] {
  return origin === "all" ? offers : offers.filter((o) => (o.access ?? "public") === origin);
}

/**
 * Sourcing : on cherche un produit ; MON STOCK compare les prix de vos comptes fournisseurs, des
 * catalogues publics autorisés et des places de marché, du moins cher au plus cher, et estime la
 * marge quand des produits équivalents existent. Les estimations sont signalées comme telles.
 */
export default function SourcingScreen() {
  const params = useLocalSearchParams<{ q?: string }>();
  const [draft, setDraft] = useState(params.q ?? "");
  const [submitted, setSubmitted] = useState(params.q ?? "");
  const [appliedParam, setAppliedParam] = useState(params.q ?? "");
  // arrivée depuis une fiche produit alors que l'onglet est déjà ouvert
  if ((params.q ?? "") !== appliedParam) {
    setAppliedParam(params.q ?? "");
    if (params.q) {
      setDraft(params.q);
      setSubmitted(params.q);
    }
  }
  const search = useSupplierSearch(submitted);
  const directory = useSupplierDirectory();
  const [sort, setSort] = useState<Sort>("price");
  const [origin] = useState<Origin>("all");
  // catégorie choisie ; null = automatique (les appareils d'abord quand on cherche un modèle)
  const [category, setCategory] = useState<OfferCategory | "all" | null>(null);
  const [density, setDensity] = useState<OfferDensity>("detailed");
  const [shown, setShown] = useState(PAGE);
  const [analyzed, setAnalyzed] = useState<AnalyzedOffer | null>(null);
  const run = (q: string) => {
    const t = q.trim();
    if (t.length < 2) return;
    setDraft(t);
    setSubmitted(t);
    setShown(PAGE);
    setCategory(null);
  };
  const clear = () => {
    setDraft("");
    setSubmitted("");
  };
  // fournisseur de l'organisation → fiche de la bibliothèque (raccourci « Fournisseur »)
  const keyBySupplier = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of directory.data?.entries ?? []) if (e.org?.supplierId) m.set(e.org.supplierId, e.key);
    return m;
  }, [directory.data]);

  const ranked = useMemo(() => (search.data ? rankedOffers(search.data) : []), [search.data]);
  const byCategory = useMemo(() => groupByCategory(ranked), [ranked]);
  const autoCategory: OfferCategory | "all" = search.data && queryTargetsDevice(search.data.query) && (byCategory.get("devices")?.length ?? 0) > 0 ? "devices" : "all";
  const activeCategory = category ?? autoCategory;
  const all = activeCategory === "all" ? ranked : (byCategory.get(activeCategory) ?? []);
  const counts = { account: all.filter((o) => o.access === "account").length };
  const withMargin = all.some((o) => o.deal && o.deal.margin !== null);
  const best = useMemo(() => bestDeals(all).find((o) => o.deal && (o.deal.level === "very_good" || o.deal.level === "good") && o.deal.margin !== null) ?? null, [all]);
  const results = Boolean(submitted && search.data && search.data.total > 0);
  const analyze = (o: AnalyzedOffer) => setAnalyzed(o);
  const keyOf = (o: { supplierId?: string }) => (o.supplierId ? (keyBySupplier.get(o.supplierId) ?? null) : null);

  const header = (
    <NightHeader
      over={submitted ? undefined : "Offres · fournisseurs · rentabilité"}
      right={<AccountAvatar />}
      title={submitted ? undefined : "Sourcing"}
      stage={
        <View style={{ gap: space[3], marginTop: submitted ? 0 : space[4] }}>
          <SearchField value={draft} onChange={setDraft} onSubmit={() => run(draft)} busy={search.isFetching && Boolean(submitted)} canClear={Boolean(submitted) && draft === submitted} onClear={clear} />
          {!submitted ? (
            <View style={{ gap: space[2] }}>
              <Txt variant="monoSm" color={color.inkOnDarkSubtle}>
                Essayez
              </Txt>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
                {EXAMPLES.map((e) => (
                  <Pressable key={e} accessibilityRole="button" accessibilityLabel={`Chercher ${e}`} onPress={() => run(e)} style={({ pressed }) => ({ minHeight: 34, paddingHorizontal: space[3], borderRadius: radius.pill, justifyContent: "center", backgroundColor: pressed ? color.surfaceDeep : color.nightRaised })}>
                    <Txt variant="chip" color={color.inkOnDark}>
                      {e}
                    </Txt>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : search.isPending ? (
            <Txt variant="label" color={color.inkOnDarkMuted} testID="supplier-loading-stage">
              Recherche chez vos fournisseurs · jusqu'à 40 s
            </Txt>
          ) : search.data && search.data.total > 0 ? (
            <>
              <Txt variant="mono" color={color.inkOnDarkMuted} numberOfLines={1} testID="supplier-summary" accessibilityLabel={`${search.data.total} offres chez ${search.data.suppliers.length} fournisseurs pour ${search.data.query}`}>
                {formatNumber(search.data.total)} offre{search.data.total > 1 ? "s" : ""} · {search.data.suppliers.length} fournisseur{search.data.suppliers.length > 1 ? "s" : ""}
                {ranked.filter((o) => o.deal?.comparable).length ? ` · ${ranked.filter((o) => o.deal?.comparable).length} comparées` : ""}
              </Txt>
              {best ? <BestOpportunity offer={best} orgCurrency={search.data.currency} onPress={() => analyze(best)} /> : null}
            </>
          ) : null}
        </View>
      }
    />
  );

  return (
    <Screen header={header} contentGap={space[3]} refreshControl={<RefreshControl refreshing={search.isRefetching} onRefresh={() => (submitted ? void search.refetch() : void directory.refetch())} />}>
      {!submitted ? (
        <Discover />
      ) : search.isPending ? (
        <View style={{ gap: 10 }} testID="supplier-loading">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} w="100%" h={176} r={radius.card} />
          ))}
        </View>
      ) : search.isError ? (
        <ErrorState title="Recherche interrompue" description={userMessage(search.error)} onRetry={() => void search.refetch()} />
      ) : search.data.total === 0 ? (
        <NoResult data={search.data} onExample={run} />
      ) : results ? (
        <>
          <Segmented<Sort>
            testID="sort-control"
            value={sort}
            onChange={(v) => {
              setSort(v);
              setShown(PAGE);
            }}
            options={[
              { value: "price", label: "Prix" },
              { value: "deals", label: "Opportunités" },
              { value: "supplier", label: "Fournisseurs" },
            ]}
          />
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 6 }} accessibilityLabel="Catégories" testID="offer-categories">
              <FilterChip label="Tout" count={ranked.length} selected={activeCategory === "all"} onPress={() => (setCategory("all"), setShown(PAGE))} />
              {OFFER_CATEGORIES.filter((c) => (byCategory.get(c)?.length ?? 0) > 0).map((c) => (
                <FilterChip key={c} label={OFFER_CATEGORY_LABEL[c]} count={byCategory.get(c)!.length} selected={activeCategory === c} onPress={() => (setCategory(c), setShown(PAGE))} />
              ))}
            </ScrollView>
            <DensityToggle value={density} onChange={setDensity} />
          </View>
          <Txt variant="note">{SORT_HINT[sort]}</Txt>
          {withMargin && search.data.missingCostSettings && search.data.missingCostSettings.length > 0 ? (
            <Pressable onPress={() => router.push("/radar/settings")} accessibilityRole="button" accessibilityLabel={`Marges provisoires : coûts à compléter (${search.data.missingCostSettings.join(", ")})`} hitSlop={6}>
              <Txt variant="note" color={color.accentInkOnSoft}>
                Marges provisoires ·{" "}
                <Txt variant="note" color={color.accentInkOnSoft} style={{ fontFamily: fontFamily[700], textDecorationLine: "underline" }}>
                  compléter mes coûts
                </Txt>
              </Txt>
            </Pressable>
          ) : null}
          {sort === "supplier" ? (
            groupSuppliers(search.data.suppliers, activeCategory).map((s) => <SupplierBlock key={s.supplierId} supplier={s} orgCurrency={search.data.currency} density={density} supplierKey={keyBySupplier.get(s.supplierId) ?? null} onAnalyze={(o) => analyze({ ...o, supplierName: s.supplierName, domain: s.domain ?? null, supplierId: s.supplierId } as AnalyzedOffer)} />)
          ) : sort === "deals" ? (
            <OfferList offers={byOrigin(bestDeals(all), origin)} orgCurrency={search.data.currency} density={density} shown={shown} onMore={() => setShown((n) => n + PAGE)} onAnalyze={analyze} />
          ) : counts.account > 0 ? (
            <AccessSections offers={all} orgCurrency={search.data.currency} density={density} shown={shown} onMore={() => setShown((n) => n + PAGE)} onAnalyze={analyze} />
          ) : (
            <OfferList offers={all} orgCurrency={search.data.currency} density={density} shown={shown} onMore={() => setShown((n) => n + PAGE)} onAnalyze={analyze} />
          )}
          {counts.account === 0 ? (
            <Card>
              <ActionRow icon={KeyRound} title="Voir vos prix pro" detail="Connectez vos comptes fournisseurs" onPress={() => router.push("/pro-accounts")} last testID="connect-accounts-row" />
            </Card>
          ) : null}
          <Checked data={search.data} />
        </>
      ) : null}
      <OfferAnalysisSheet offer={analyzed} orgCurrency={search.data?.currency ?? "EUR"} supplierKey={analyzed ? keyOf(analyzed as { supplierId?: string }) : null} onClose={() => setAnalyzed(null)} />
    </Screen>
  );
}

const SORT_HINT: Record<Sort, string> = {
  price: "Vos comptes d'abord, puis du moins cher au plus cher.",
  deals: "Meilleure rentabilité estimée d'abord.",
  supplier: "Regroupées par fournisseur.",
};

/** Champ de recherche de la scène : blanc, 56 pt ; « Chercher » menthe dès 2 caractères ; effacer pour revenir à l'accueil. */
function SearchField({ value, onChange, onSubmit, busy, canClear, onClear }: { value: string; onChange: (v: string) => void; onSubmit: () => void; busy: boolean; canClear: boolean; onClear: () => void }) {
  const { compact } = useLayout();
  const ready = value.trim().length >= 2;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], height: 56, backgroundColor: color.surface, borderRadius: 14, paddingLeft: 14, paddingRight: 6 }}>
      <Search size={19} color={color.ink} strokeWidth={2.2} style={{ flexShrink: 0 }} />
      <TextInput
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        placeholder="Ex. iPhone 13, écran, batterie…"
        placeholderTextColor={color.ink3}
        returnKeyType="search"
        autoCorrect={false}
        accessibilityLabel="Rechercher chez les fournisseurs"
        maxFontSizeMultiplier={1.4}
        style={{ flex: 1, fontFamily: fontFamily[600], fontSize: 16, color: color.ink, paddingVertical: 0 }}
        testID="supplier-query"
      />
      {busy ? (
        <ActivityIndicator color={color.ink} style={{ width: 32 }} accessibilityLabel="Recherche en cours" />
      ) : canClear ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Effacer la recherche" onPress={onClear} hitSlop={8} testID="supplier-clear" style={({ pressed }) => ({ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? color.surfacePressed : color.bg })}>
          <X size={16} color={color.ink} strokeWidth={2.4} />
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chercher"
          accessibilityHint="Lancer la recherche chez les fournisseurs"
          accessibilityState={{ disabled: !ready }}
          disabled={!ready}
          onPress={onSubmit}
          testID="supplier-search"
          style={({ pressed }) => ({ height: 42, minWidth: compact ? 56 : 92, paddingHorizontal: space[3], borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: ready ? (pressed ? color.mintPressed : color.mint) : color.track })}
        >
          <Txt variant="button" color={ready ? color.onMint : color.ink3} style={{ fontSize: 15 }}>
            {compact ? "OK" : "Chercher"}
          </Txt>
        </Pressable>
      )}
    </View>
  );
}

/** Meilleure opportunité (scène) : achat, marge estimée, règle de marché ; toucher → analyse. */
function BestOpportunity({ offer: o, orgCurrency, onPress }: { offer: SimpleRankedOfferDTO; orgCurrency: string; onPress: () => void }) {
  const d = o.deal!;
  const name = shortSupplierName(o.supplierName);
  const { compact } = useLayout();
  const discount = d.totalCost !== null && d.marketPrice ? Math.round((1 - d.totalCost / d.marketPrice) * 100) : null;
  return (
    <Pressable
      testID="best-opportunity"
      accessibilityRole="button"
      accessibilityLabel={`Meilleure opportunité : ${frenchTitle(o.title)}, ${name}, achat ${formatMoney(o.price, o.currency ?? orgCurrency)}, marge estimée ${formatMoney(d.margin, orgCurrency)} par unité. Ouvrir l'analyse`}
      onPress={onPress}
      style={({ pressed }) => ({ backgroundColor: color.surfaceDeep, borderWidth: 1, borderColor: color.nightLine, borderRadius: radius.card, padding: 14, gap: 12, opacity: pressed ? 0.85 : 1 })}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Txt variant="monoSm" color={color.mint}>
          Meilleure opportunité
        </Txt>
        {d.score !== null ? (
          <Txt variant="monoSm" color={color.inkOnDarkSubtle}>
            Score {d.score}/100
          </Txt>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <SupplierLogo domain={o.domain ?? null} name={name} size={36} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt variant="body" color={color.inkOnDark} numberOfLines={1} style={{ fontSize: 14, fontFamily: fontFamily[700] }}>
            {frenchTitle(o.title)}
          </Txt>
          <Txt variant="label" color={color.inkOnDarkMuted} numberOfLines={1} style={{ fontSize: 12 }}>
            {[name, o.access === "account" ? "votre compte" : null, o.quantity !== null ? `${formatNumber(o.quantity)} en stock` : null, o.seenAt ? formatRelative(o.seenAt) : null].filter(Boolean).join(" · ")}
          </Txt>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: space[5] }}>
        <View style={{ gap: 2, flexShrink: 1 }}>
          <Txt variant="monoSm" color={color.inkOnDarkSubtle}>
            Achat{o.taxType === "ht" ? " HT" : o.taxType === "ttc" ? " TTC" : ""}
          </Txt>
          <StageFigure value={formatMoney(o.price, o.currency ?? orgCurrency)} size="sm" />
        </View>
        <View style={{ gap: 2, flexShrink: 1 }}>
          <Txt variant="monoSm" color={color.inkOnDarkSubtle}>
            Marge / unité
          </Txt>
          <StageFigure value={`≈ ${d.margin! >= 0 ? "+" : "−"}${formatNumber(Math.abs(d.margin!))}`} size="sm" tone={d.margin! >= 0 ? color.mint : color.dangerOnDark} />
        </View>
      </View>
      <MarketRuler onDark cost={d.totalCost} market={d.marketPrice} caption={rulerCaption(d, orgCurrency)} emptyCaption={rulerEmptyCaption(d)} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
        <Txt variant="label" color={color.inkOnDarkMuted} style={{ flex: 1, fontSize: 12.5 }} numberOfLines={2}>
          {discount !== null && discount > 0 ? `${discount} % sous la médiane de ${d.marketCount} offre${d.marketCount > 1 ? "s" : ""} équivalente${d.marketCount > 1 ? "s" : ""}` : d.summary}
        </Txt>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Txt variant="label" color={color.mint} style={{ fontFamily: fontFamily[700] }}>
            {compact ? "" : "Analyse"}
          </Txt>
          <ChevronRight size={16} color={color.mint} strokeWidth={2.4} />
        </View>
      </View>
    </Pressable>
  );
}

function DensityToggle({ value, onChange }: { value: OfferDensity; onChange: (v: OfferDensity) => void }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", backgroundColor: color.track, borderRadius: radius.md, padding: 2 }}>
      {(
        [
          { v: "detailed", Icon: Rows3, label: "Vue détaillée" },
          { v: "compact", Icon: LayoutList, label: "Vue compacte" },
        ] as const
      ).map(({ v, Icon, label }) => (
        <Pressable key={v} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: value === v }} onPress={() => onChange(v)} hitSlop={4} style={{ width: 36, height: 32, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: value === v ? color.surface : "transparent" }}>
          <Icon size={16} color={value === v ? color.ink : color.ink3} strokeWidth={2.2} />
        </Pressable>
      ))}
    </View>
  );
}

const SOURCE_DOT: Record<SourceOverviewDTO["status"], string> = { connected: color.success, running: color.info, to_configure: color.accent, manual_import: color.ink3, error: color.danger, disabled: color.ink3 };
const SOURCE_FG: Record<SourceOverviewDTO["status"], string> = { connected: color.success, running: color.infoInk, to_configure: color.accentInkOnSoft, manual_import: color.ink2, error: color.dangerInk, disabled: color.ink3 };

/** Avant toute recherche : vos sources (état réel, daté), problèmes à corriger, exploration. */
function Discover() {
  const sources = useSources();
  const jobs = useImportJobs();
  const list = [...(sources.data ?? [])].sort((a, b) => Number(b.status === "error") - Number(a.status === "error") || b.activeOffers - a.activeOffers).slice(0, 5);
  const failedJob = (jobs.data ?? []).find((j) => j.status === "failed") ?? null;
  const failedImports = (jobs.data ?? []).filter((j) => j.status === "failed").length;
  return (
    <>
      <FadeIn index={0} style={{ gap: 10 }}>
        <MonoTitle
          title="Vos sources"
          count={sources.data ? sources.data.length : undefined}
          right={
            <Pressable accessibilityRole="button" accessibilityLabel="Gérer vos sources" hitSlop={10} onPress={() => router.push("/sourcing-connections")} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 2, opacity: pressed ? 0.6 : 1 })}>
              <Txt variant="label" color={color.ink} style={{ fontFamily: fontFamily[700] }}>
                Gérer
              </Txt>
              <ChevronRight size={14} color={color.ink} strokeWidth={2.4} />
            </Pressable>
          }
        />
        {sources.isPending ? (
          <Skeleton w="100%" h={180} r={radius.card} />
        ) : sources.isError ? (
          <ErrorState description={userMessage(sources.error)} onRetry={() => void sources.refetch()} />
        ) : list.length === 0 ? (
          <Card>
            <ActionRow icon={KeyRound} title="Aucune source pour l'instant" detail="Connectez un compte ou importez une liste de prix" onPress={() => router.push("/pro-accounts")} last />
          </Card>
        ) : (
          <Card testID="sources-list">
            {list.map((src, i) => (
              <Pressable
                key={src.id}
                accessibilityRole="button"
                accessibilityLabel={`${src.supplierName ?? src.name}, ${src.methodLabel}, ${src.statusLabel}${src.lastSuccessfulSyncAt ? `, mis à jour ${formatRelative(src.lastSuccessfulSyncAt)}` : ""}`}
                onPress={() => router.push("/sourcing-connections")}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 60, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: pressed ? color.surfacePressed : "transparent", borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: color.lineSoft })}
              >
                <SupplierLogo domain={null} name={src.supplierName ?? src.name} size={34} />
                <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                  <Txt variant="body" numberOfLines={1}>
                    {shortSupplierName(src.supplierName ?? src.name)}
                  </Txt>
                  <Txt variant="label" numberOfLines={1} style={{ fontSize: 12.5, lineHeight: 17 }} color={src.status === "error" ? color.dangerInk : color.ink3}>
                    {src.status === "error" && src.lastError ? src.lastError : src.methodLabel}
                  </Txt>
                </View>
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: SOURCE_DOT[src.status] }} />
                    <Txt variant="label" color={SOURCE_FG[src.status]} style={{ fontFamily: fontFamily[700], fontSize: 12.5 }} numberOfLines={1}>
                      {src.statusLabel}
                    </Txt>
                  </View>
                  <Txt variant="code" style={{ fontSize: 10.5 }}>
                    {src.status === "error" && src.consecutiveFailures > 0 ? `${src.consecutiveFailures} échec${src.consecutiveFailures > 1 ? "s" : ""}` : src.lastSuccessfulSyncAt ? formatRelative(src.lastSuccessfulSyncAt) : `${formatNumber(src.activeOffers)} offres`}
                  </Txt>
                </View>
              </Pressable>
            ))}
          </Card>
        )}
      </FadeIn>
      {failedImports > 0 ? (
        <Card>
          <ActionRow icon={FileStack} tone="danger" title={`${failedImports} import${failedImports > 1 ? "s" : ""} en échec${failedJob?.supplierName ? ` · ${failedJob.supplierName}` : ""}`} cta="Rapport" onPress={() => (failedJob && failedImports === 1 ? router.push({ pathname: "/sourcing-imports/[id]", params: { id: failedJob.id } }) : router.push("/sourcing-imports"))} last testID="hub-failed-imports" />
        </Card>
      ) : null}
      <ConnectAccountsCta />
      <View style={{ gap: 10 }}>
        <MonoTitle title="Explorer" />
        <ShortcutGrid>
          {[
            <ShortcutTile key="lib" icon={Library} label="Bibliothèque" onPress={() => router.push("/supplier-directory")} testID="hub-library" />,
            <ShortcutTile key="radar" icon={Radar} label="Radar d'achat" onPress={() => router.push("/radar")} />,
            <ShortcutTile key="import" icon={Upload} label="Importer" onPress={() => router.push("/sourcing-import")} />,
            <ShortcutTile key="imports" icon={History} label="Imports" onPress={() => router.push("/sourcing-imports")} testID="hub-imports" />,
          ]}
        </ShortcutGrid>
      </View>
    </>
  );
}

function ConnectAccountsCta() {
  return (
    <Pressable onPress={() => router.push("/pro-accounts")} accessibilityRole="button" accessibilityLabel="Connectez vos comptes fournisseurs" testID="connect-accounts-cta" style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space[3], padding: space[4], borderRadius: radius.card, backgroundColor: pressed ? color.nightRaised : color.brand })}>
      <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: color.mint, alignItems: "center", justifyContent: "center" }}>
        <KeyRound size={18} color={color.onMint} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="body" color={color.inkOnDark}>
          Connectez vos comptes fournisseurs
        </Txt>
        <Txt variant="label" color={color.inkOnDarkMuted}>
          Vos prix pro passent en premier.
        </Txt>
      </View>
      <ChevronRight size={18} color={color.inkOnDarkMuted} />
    </Pressable>
  );
}

/** Aucun résultat : pourquoi, quoi essayer, où chercher ailleurs (jamais confondu avec une panne). */
function NoResult({ data, onExample }: { data: SimpleSearchDTO; onExample: (q: string) => void }) {
  const words = data.query.split(/\s+/).filter(Boolean);
  const simpler = words.length > 2 ? words.slice(0, 2).join(" ") : null;
  const failed = data.checked.filter((c) => !c.ok).length;
  return (
    <>
      <Card padded style={{ gap: space[3], alignItems: "center" }}>
        <IconBadge icon={SearchX} size={48} />
        <Txt variant="headline" style={{ textAlign: "center" }}>
          Rien trouvé pour « {data.query} »
        </Txt>
        <Txt variant="bodyRegular" style={{ textAlign: "center" }}>
          Essayez un mot plus simple.{failed > 0 ? ` ${failed} fournisseur${failed > 1 ? "s n'ont" : " n'a"} pas répondu : réessayez dans un instant.` : ""}
        </Txt>
        {simpler ? <Button label={`Chercher « ${simpler} »`} compact onPress={() => onExample(simpler)} /> : null}
      </Card>
      <Card>
        <ActionRow icon={Library} tone="neutral" title="Explorer la bibliothèque" detail="Trouver un fournisseur qui vend ce produit" onPress={() => router.push({ pathname: "/supplier-directory", params: { q: words[0] ?? "" } })} />
        <ActionRow icon={KeyRound} tone="neutral" title="Connecter un compte fournisseur" detail="Vos prix pro deviennent cherchables" onPress={() => router.push("/pro-accounts")} />
        <ActionRow icon={Upload} tone="neutral" title="Importer une liste de prix" detail="CSV, Excel, XML ou JSON reçu d'un fournisseur" onPress={() => router.push("/sourcing-import")} last />
      </Card>
      <Checked data={data} />
    </>
  );
}

/** « Prix croissant » en deux blocs : vos comptes, puis sources publiques et places de marché. */
function AccessSections({ offers, orgCurrency, density, shown, onMore, onAnalyze }: { offers: SimpleRankedOfferDTO[]; orgCurrency: string; density: OfferDensity; shown: number; onMore: () => void; onAnalyze: (o: AnalyzedOffer) => void }) {
  const { account, other } = splitByAccess(offers);
  return (
    <>
      <MonoTitle title="Vos comptes" count={account.length} />
      <OfferList offers={account} orgCurrency={orgCurrency} density={density} shown={shown} onMore={onMore} testID="price-list-account" onAnalyze={onAnalyze} />
      <MonoTitle title="Publiques et marché" count={other.length} />
      {other.length > 0 ? <OfferList offers={other} orgCurrency={orgCurrency} density={density} shown={shown} onMore={onMore} testID="price-list-public" onAnalyze={onAnalyze} /> : <Txt variant="note">Aucune offre publique pour ce produit.</Txt>}
    </>
  );
}

function OfferList({ offers, orgCurrency, density, shown, onMore, testID, onAnalyze }: { offers: SimpleRankedOfferDTO[]; orgCurrency: string; density: OfferDensity; shown: number; onMore: () => void; testID?: string; onAnalyze: (o: AnalyzedOffer) => void }) {
  const visible = offers.slice(0, shown);
  return (
    <View style={{ gap: 10 }} testID={testID} accessibilityLabel={`${offers.length} résultats`}>
      {density === "compact" ? (
        <OfferLines offers={visible} orgCurrency={orgCurrency} />
      ) : (
        visible.map((o, i) => (
          <FadeIn key={o.id} index={i} step={30} offset={16}>
            <OfferCard offer={o} orgCurrency={orgCurrency} supplierName={o.supplierName} domain={o.domain ?? null} onAnalyze={() => onAnalyze(o)} />
          </FadeIn>
        ))
      )}
      {offers.length > shown ? <Button label={`Afficher ${Math.min(PAGE, offers.length - shown)} de plus (${offers.length - shown} restant${offers.length - shown > 1 ? "s" : ""})`} variant="secondary" compact onPress={onMore} testID={testID ? `${testID}-more` : "price-list-more"} /> : null}
    </View>
  );
}

function SupplierBlock({ supplier: s, orgCurrency, density, supplierKey, onAnalyze }: { supplier: SimpleSupplierResultDTO; orgCurrency: string; density: OfferDensity; supplierKey: string | null; onAnalyze: (o: SimpleOfferDTO) => void }) {
  return (
    <View style={{ gap: space[2] }} accessibilityLabel={`Chez ${s.supplierName}, ${s.total} résultat${s.total > 1 ? "s" : ""}`}>
      <Pressable disabled={!supplierKey} onPress={() => supplierKey && router.push({ pathname: "/supplier-directory/[key]", params: { key: supplierKey } })} style={{ flexDirection: "row", alignItems: "center", gap: space[2], marginTop: space[2] }}>
        <SupplierLogo domain={s.domain} name={s.supplierName} size={32} />
        <Txt variant="headline" style={{ flex: 1 }} numberOfLines={1}>
          {s.supplierName}
        </Txt>
        <Txt variant="label">
          {s.total} résultat{s.total > 1 ? "s" : ""}
          {s.country ? ` · ${s.country}` : ""}
        </Txt>
      </Pressable>
      {density === "compact" ? <OfferLines offers={s.offers} orgCurrency={orgCurrency} /> : s.offers.map((o) => <OfferCard key={o.id} offer={o} orgCurrency={orgCurrency} onAnalyze={() => onAnalyze(o)} />)}
      {s.total > s.offers.length ? <Txt variant="label">… et {s.total - s.offers.length} autre(s) : précisez la recherche.</Txt> : null}
    </View>
  );
}

function Checked({ data }: { data: { checked: { supplierName: string; ok: boolean; found: number; message: string | null }[] } }) {
  if (data.checked.length === 0) return null;
  return (
    <Txt variant="note" style={{ marginTop: space[2] }}>
      Consultés en direct : {data.checked.map((c) => `${c.supplierName}${c.ok ? "" : " (sans réponse)"}`).join(", ")}.
    </Txt>
  );
}
