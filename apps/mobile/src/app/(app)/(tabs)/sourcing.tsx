import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ChevronRight, ExternalLink, KeyRound, Search, Truck } from "lucide-react-native";
import { useSupplierDirectory, useSupplierSearch } from "~/data/hooks";
import { useSupplierFavorites } from "~/data/supplier-favorites";
import { useActiveOrg } from "~/org/org-provider";
import { STOCK_TEXT, type SimpleDealDTO, type SimpleOfferDTO, type SimpleRankedOfferDTO, type SimpleSearchDTO, type SimpleSupplierResultDTO } from "~/data/supplier-search";
import { fontFamily } from "~/theme/typography";
import { userMessage } from "~/lib/errors";
import { formatMoney, formatNumber } from "~/lib/format";
import { safeExternalUrl } from "~/lib/url";
import { SupplierLogo } from "~/components/supplier-logo";
import { AlertBanner, Button, Card, EmptyState, ErrorState, FilterChip, Screen, SectionHeader, Skeleton, StatusChip, TabHeader, Txt, type ChipTone } from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";

const EXAMPLES = ["iPhone 13", "iPhone 15 Pro", "Écran iPhone 12", "Batterie iPhone 11"];

const PAGE = 60;

/** Toutes les offres du moins cher au plus cher (serveur récent : `offers` ; sinon reconstitué). */
export function rankedOffers(data: Pick<SimpleSearchDTO, "suppliers"> & { offers?: SimpleRankedOfferDTO[] }): SimpleRankedOfferDTO[] {
  if (data.offers) return data.offers;
  const key = (o: SimpleOfferDTO) => o.priceConverted ?? o.price ?? Number.POSITIVE_INFINITY;
  return data.suppliers.flatMap((s) => s.offers.map((o) => ({ ...o, supplierId: s.supplierId, supplierName: s.supplierName, country: s.country }))).sort((a, b) => key(a) - key(b));
}

const DEAL_ORDER: Record<SimpleDealDTO["level"], number> = { very_good: 0, good: 1, average: 2, not_competitive: 3, insufficient_data: 4 };
const DEAL_TONE: Record<SimpleDealDTO["level"], ChipTone> = { very_good: "success", good: "success", average: "accent", not_competitive: "danger", insufficient_data: "neutral" };

/** « Meilleures affaires » : niveau, puis score, puis marge ; offres sans analyse en dernier. Pur. */
export function bestDeals(offers: SimpleRankedOfferDTO[]): SimpleRankedOfferDTO[] {
  const lvl = (o: SimpleRankedOfferDTO) => (o.deal ? DEAL_ORDER[o.deal.level] : 5);
  return [...offers].sort((a, b) => lvl(a) - lvl(b) || (b.deal?.score ?? -1) - (a.deal?.score ?? -1) || (b.deal?.margin ?? -Infinity) - (a.deal?.margin ?? -Infinity));
}

/** Vos comptes fournisseurs d'abord (prix pro), puis sources publiques et places de marché ; ordre conservé dans chaque groupe. Pur. */
export function splitByAccess(offers: SimpleRankedOfferDTO[]): { account: SimpleRankedOfferDTO[]; other: SimpleRankedOfferDTO[] } {
  return { account: offers.filter((o) => o.access === "account"), other: offers.filter((o) => o.access !== "account") };
}

/**
 * Fournisseurs : on tape ce qu'on cherche ; tous les résultats s'affichent du moins cher au plus
 * cher (tous fournisseurs confondus), et un appui ouvre la page du produit chez le fournisseur.
 * Vue « par fournisseur » disponible.
 */
export default function SuppliersScreen() {
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
  const [view, setView] = useState<"price" | "deals" | "supplier">("price");
  const [shown, setShown] = useState(PAGE);
  const run = (q: string) => {
    const t = q.trim();
    setDraft(t);
    setSubmitted(t);
    setShown(PAGE);
  };

  return (
    <Screen refreshControl={<RefreshControl refreshing={search.isRefetching} onRefresh={() => (submitted ? void search.refetch() : undefined)} />}>
      <TabHeader title="Fournisseurs" />
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 52, backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, paddingHorizontal: space[3] }}>
        <Search size={18} color={color.ink3} />
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => run(draft)}
          placeholder="Que cherchez-vous ? Ex. iPhone 13"
          placeholderTextColor={color.ink3}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Rechercher chez les fournisseurs"
          maxFontSizeMultiplier={1.6}
          style={{ flex: 1, fontFamily: fontFamily[600], fontSize: 16, color: color.ink, paddingVertical: 0 }}
          testID="supplier-query"
        />
        <Button label="Chercher" compact disabled={draft.trim().length < 2} loading={search.isFetching} onPress={() => run(draft)} testID="supplier-search" />
      </View>

      <ConnectAccountsCta />
      <SourcingHub />

      {!submitted ? (
        <View style={{ gap: space[3] }}>
          <Txt variant="bodyRegular">Tapez un produit : on regarde chez vos fournisseurs et on affiche ce qu'ils ont, avec leurs prix.</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
            {EXAMPLES.map((e) => (
              <FilterChip key={e} label={e} selected={false} onPress={() => run(e)} />
            ))}
          </View>
        </View>
      ) : search.isPending ? (
        <View style={{ gap: space[3] }} testID="supplier-loading">
          <Txt variant="label">Recherche chez vos fournisseurs… (jusqu'à 40 secondes)</Txt>
          <Skeleton w="100%" h={140} r={radius.xl} />
          <Skeleton w="100%" h={140} r={radius.xl} />
        </View>
      ) : search.isError ? (
        <ErrorState title="La recherche n'a pas abouti" description={userMessage(search.error)} onRetry={() => void search.refetch()} />
      ) : search.data.total === 0 ? (
        <>
          <EmptyState icon={<Truck size={28} color={color.ink2} />} title={`Rien trouvé pour « ${search.data.query} »`} description="Aucun de vos fournisseurs ne propose ce produit pour l'instant. Essayez un mot plus simple (ex. « iPhone 12 » au lieu de « iPhone 12 128 Go noir »)." />
          <Checked data={search.data} />
        </>
      ) : (
        <>
          <Txt variant="body" testID="supplier-summary">
            {formatNumber(search.data.total)} résultat{search.data.total > 1 ? "s" : ""} chez {search.data.suppliers.length} fournisseur{search.data.suppliers.length > 1 ? "s" : ""} pour « {search.data.query} »
          </Txt>
          {search.data.partial ? <Txt variant="label">Certains fournisseurs ont mis trop de temps à répondre : les résultats déjà connus sont affichés.</Txt> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
            <FilterChip label="Du moins cher au plus cher" selected={view === "price"} onPress={() => setView("price")} />
            <FilterChip label="Meilleures affaires" selected={view === "deals"} onPress={() => setView("deals")} />
            <FilterChip label="Par fournisseur" selected={view === "supplier"} onPress={() => setView("supplier")} />
          </View>
          {search.data.missingCostSettings && search.data.missingCostSettings.length > 0 ? (
            <AlertBanner text={`Marges provisoires : coûts à compléter (${search.data.missingCostSettings.slice(0, 3).join(", ")}${search.data.missingCostSettings.length > 3 ? "…" : ""}). Toucher pour les renseigner.`} onPress={() => router.push("/radar/settings")} />
          ) : null}
          {view === "deals" ? (
            <Txt variant="label">Une offre n'est « intéressante » que si elle est comparée à des produits équivalents (même modèle, capacité, état, grade, type de pièce) et que la marge reste positive après les coûts.</Txt>
          ) : null}
          {view === "price" || view === "deals" ? (
            view === "deals" ? (
              <PriceList offers={bestDeals(rankedOffers(search.data))} orgCurrency={search.data.currency} shown={shown} onMore={() => setShown((n) => n + PAGE)} />
            ) : (
              <AccessSections offers={rankedOffers(search.data)} orgCurrency={search.data.currency} shown={shown} onMore={() => setShown((n) => n + PAGE)} />
            )
          ) : (
            search.data.suppliers.map((s) => <SupplierBlock key={s.supplierId} supplier={s} orgCurrency={search.data.currency} />)
          )}
          <Checked data={search.data} />
        </>
      )}

      <Button label="Gérer mes fournisseurs" variant="ghost" compact onPress={() => router.push("/sourcing-connections")} testID="manage-suppliers" />
    </Screen>
  );
}

/** Accès rapides : bibliothèque, comptes, favoris, imports et erreurs à résoudre (compteurs réels). */
function SourcingHub() {
  const directory = useSupplierDirectory();
  const { active } = useActiveOrg();
  const { favorites } = useSupplierFavorites(active.organization.id);
  const entries = directory.data?.entries ?? [];
  const connected = entries.filter((e) => e.org?.status === "connected").length;
  const errors = entries.filter((e) => e.org?.lastError).length;
  const tiles: { label: string; value: string; onPress: () => void; tone?: "danger"; testID: string }[] = [
    { label: "Bibliothèque", value: entries.length ? String(entries.length) : "—", onPress: () => router.push("/supplier-directory"), testID: "hub-library" },
    { label: "Connectés", value: String(connected), onPress: () => router.push({ pathname: "/supplier-directory", params: { view: "connected" } }), testID: "hub-connected" },
    { label: "Favoris", value: String(favorites.size), onPress: () => router.push({ pathname: "/supplier-directory", params: { view: "favorites" } }), testID: "hub-favorites" },
    { label: "Imports", value: "↻", onPress: () => router.push("/sourcing-imports"), testID: "hub-imports" },
    ...(errors ? [{ label: "À résoudre", value: String(errors), onPress: () => router.push("/sourcing-connections"), tone: "danger" as const, testID: "hub-errors" }] : []),
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
      {tiles.map((t) => (
        <Pressable key={t.label} onPress={t.onPress} accessibilityRole="button" accessibilityLabel={`${t.label} : ${t.value}`} testID={t.testID} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
          <View style={{ minWidth: 96, paddingVertical: space[2], paddingHorizontal: space[3], borderRadius: radius.lg, borderWidth: 1, borderColor: t.tone ? color.danger : color.line, backgroundColor: t.tone ? color.dangerSoft : color.surface, gap: 2 }}>
            <Txt variant="headline" num color={t.tone ? color.dangerInk : color.ink}>
              {t.value}
            </Txt>
            <Txt variant="label" color={t.tone ? color.dangerInk : color.ink2}>
              {t.label}
            </Txt>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function ConnectAccountsCta() {
  return (
    <Pressable onPress={() => router.push("/pro-accounts")} accessibilityRole="button" accessibilityLabel="Connectez vos comptes fournisseurs" testID="connect-accounts-cta" style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <Card padded style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
        <View style={{ width: 36, height: 36, borderRadius: radius.md, backgroundColor: color.brandSoft, alignItems: "center", justifyContent: "center" }}>
          <KeyRound size={18} color={color.ink} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="body" style={{ fontFamily: fontFamily[700] }}>
            Connectez vos comptes fournisseurs
          </Txt>
          <Txt variant="label">Foxway, Foneday, MobileSentrix… : vos prix pro passent en premier.</Txt>
        </View>
        <ChevronRight size={18} color={color.ink3} />
      </Card>
    </Pressable>
  );
}

/** Liste « du moins cher au plus cher » en deux blocs : vos comptes, puis sources publiques et places de marché. */
function AccessSections({ offers, orgCurrency, shown, onMore }: { offers: SimpleRankedOfferDTO[]; orgCurrency: string; shown: number; onMore: () => void }) {
  const { account, other } = splitByAccess(offers);
  return (
    <>
      <SectionHeader title={`Vos comptes fournisseurs (${account.length})`} />
      {account.length > 0 ? (
        <PriceList offers={account} orgCurrency={orgCurrency} shown={shown} onMore={onMore} testID="price-list-account" />
      ) : (
        <AlertBanner text="Aucun de vos comptes ne propose ce produit pour l'instant. Toucher pour connecter vos comptes et voir vos prix pro." onPress={() => router.push("/pro-accounts")} />
      )}
      <SectionHeader title={`Sources publiques et places de marché (${other.length})`} />
      {other.length > 0 ? <PriceList offers={other} orgCurrency={orgCurrency} shown={shown} onMore={onMore} testID="price-list-public" /> : <Txt variant="label">Aucune offre publique pour ce produit.</Txt>}
    </>
  );
}

function PriceList({ offers, orgCurrency, shown, onMore, testID }: { offers: SimpleRankedOfferDTO[]; orgCurrency: string; shown: number; onMore: () => void; testID?: string }) {
  return (
    <Card padded style={{ gap: space[2] }} accessibilityLabel={`${offers.length} résultats du moins cher au plus cher`}>
      {offers.slice(0, shown).map((o, i) => (
        <OfferRow key={o.id} offer={o} orgCurrency={orgCurrency} first={i === 0} supplierName={o.supplierName} domain={o.domain ?? null} />
      ))}
      {offers.length > shown ? <Button label={`Afficher ${Math.min(PAGE, offers.length - shown)} de plus (${offers.length - shown} restant${offers.length - shown > 1 ? "s" : ""})`} variant="ghost" compact onPress={onMore} testID={testID ? `${testID}-more` : "price-list-more"} /> : null}
    </Card>
  );
}

function SupplierBlock({ supplier: s, orgCurrency }: { supplier: SimpleSupplierResultDTO; orgCurrency: string }) {
  return (
    <Card padded style={{ gap: space[2] }} accessibilityLabel={`Chez ${s.supplierName}, ${s.total} résultat${s.total > 1 ? "s" : ""}`}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[2] }}>
        <SupplierLogo domain={s.domain} name={s.supplierName} size={32} />
        <Txt variant="headline" style={{ flex: 1 }} numberOfLines={2}>
          Chez {s.supplierName}
        </Txt>
        <Txt variant="label">
          {s.total} résultat{s.total > 1 ? "s" : ""}
          {s.country ? ` · ${s.country}` : ""}
        </Txt>
      </View>
      {s.offers.map((o, i) => (
        <OfferRow key={o.id} offer={o} orgCurrency={orgCurrency} first={i === 0} />
      ))}
      {s.total > s.offers.length ? <Txt variant="label">… et {s.total - s.offers.length} autre(s) : précisez la recherche.</Txt> : null}
    </Card>
  );
}

function OfferRow({ offer: o, orgCurrency, first, supplierName, domain }: { offer: SimpleOfferDTO; orgCurrency: string; first: boolean; supplierName?: string; domain?: string | null }) {
  const link = safeExternalUrl(o.url);
  const price = o.price !== null && o.currency ? formatMoney(o.price, o.currency) : "Prix non indiqué";
  const converted = o.currency && o.currency !== orgCurrency && o.priceConverted !== null ? `≈ ${formatMoney(o.priceConverted, orgCurrency)}` : null;
  const tax = o.taxType === "ht" ? " HT" : o.taxType === "ttc" ? " TTC" : "";
  return (
    <Pressable
      disabled={!link}
      onPress={() => link && void WebBrowser.openBrowserAsync(link).catch(() => {})}
      accessibilityRole={link ? "link" : undefined}
      accessibilityLabel={`${o.title}, ${price}${supplierName ? `, chez ${supplierName}` : ""}`}
      style={{ flexDirection: "row", gap: space[3], paddingTop: first ? 0 : space[2], borderTopWidth: first ? 0 : 1, borderTopColor: color.line }}
    >
      {supplierName ? <SupplierLogo domain={domain} name={supplierName} size={32} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="body" numberOfLines={2}>
          {o.title}
        </Txt>
        {supplierName ? (
          <Txt variant="label" numberOfLines={1} style={{ fontFamily: fontFamily[700] }}>
            Chez {supplierName}
            {o.access === "account" ? "  ·  Votre compte" : o.access === "marketplace" ? "  ·  Place de marché" : ""}
          </Txt>
        ) : null}
        <Txt variant="label" color={o.stock === "out_of_stock" ? color.dangerInk : o.stock === "in_stock" ? color.success : color.ink2}>
          {o.quantity !== null && o.stock !== "out_of_stock" ? `${formatNumber(o.quantity)} en stock` : STOCK_TEXT[o.stock]}
          {link ? "  ·  Voir chez le fournisseur" : ""}
        </Txt>
        {o.deal ? <DealLines deal={o.deal} orgCurrency={orgCurrency} /> : null}
      </View>
      <View style={{ alignItems: "flex-end", justifyContent: "center", gap: 2 }}>
        <Txt variant="body" num style={{ fontFamily: fontFamily[700] }}>
          {price}
          {o.price !== null ? tax : ""}
        </Txt>
        {converted ? <Txt variant="label">{converted}</Txt> : null}
        {link ? <ExternalLink size={14} color={color.ink3} /> : null}
      </View>
    </Pressable>
  );
}

const money = (v: number | null, cur: string) => (v === null ? "—" : formatMoney(v, cur));

/** Prix fournisseur, marché, coût total, revente, marge et niveau de l'offre (montants en devise de l'organisation). */
export function DealLines({ deal: d, orgCurrency }: { deal: SimpleDealDTO; orgCurrency: string }) {
  const basis = d.marketBasis === "marketplace" ? `${d.marketCount} annonce${d.marketCount > 1 ? "s" : ""} équivalente${d.marketCount > 1 ? "s" : ""}` : d.marketBasis === "suppliers" ? `${d.marketCount} autres fournisseurs` : null;
  const resale = d.resaleBasis === "own_sales" ? "vos ventes" : d.resaleBasis === "own_price" ? "votre prix" : d.resaleBasis === "marketplace_low" ? "bas du marché" : null;
  return (
    <View style={{ gap: 2, marginTop: 4 }} accessibilityLabel={`Analyse : ${d.label}. ${d.summary}`}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], flexWrap: "wrap" }}>
        <StatusChip label={d.label} tone={DEAL_TONE[d.level]} />
        {d.score !== null ? <Txt variant="label">Score {d.score}/100</Txt> : null}
      </View>
      {d.comparable || d.marketPrice !== null ? (
        <>
          <Txt variant="label" num>
            Prix fournisseur {money(d.supplierPrice, orgCurrency)} · Marché ≈ {money(d.marketPrice, orgCurrency)}
            {basis ? ` (${basis})` : ""}
          </Txt>
          <Txt variant="label" num>
            Coût total ≈ {money(d.totalCost, orgCurrency)} · Revente ≈ {money(d.resalePrice, orgCurrency)}
            {resale ? ` (${resale})` : ""}
          </Txt>
          {d.margin !== null ? (
            <Txt variant="label" num color={d.margin > 0 ? color.success : color.dangerInk} style={{ fontFamily: fontFamily[700] }}>
              Marge ≈ {money(d.margin, orgCurrency)}
              {d.marginPercent !== null ? ` (${formatNumber(d.marginPercent)} %)` : ""}
              {d.provisional ? " · provisoire" : ""}
            </Txt>
          ) : null}
        </>
      ) : null}
      <Txt variant="label" numberOfLines={2}>
        {d.summary}
      </Txt>
      {d.uncertainties.length > 0 ? (
        <Txt variant="label" color={color.accentInkOnSoft} numberOfLines={3}>
          À vérifier : {d.uncertainties.slice(0, 3).join(" · ")}
          {d.uncertainties.length > 3 ? ` (+${d.uncertainties.length - 3})` : ""}
        </Txt>
      ) : null}
    </View>
  );
}

function Checked({ data }: { data: { checked: { supplierName: string; ok: boolean; found: number; message: string | null }[] } }) {
  if (data.checked.length === 0) return null;
  return (
    <Txt variant="label">
      Fournisseurs consultés : {data.checked.map((c) => `${c.supplierName}${c.ok ? "" : " (n'a pas répondu)"}`).join(", ")}.
    </Txt>
  );
}
