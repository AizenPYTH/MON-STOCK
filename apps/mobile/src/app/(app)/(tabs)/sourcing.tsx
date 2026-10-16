import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { FileStack, History, KeyRound, LayoutList, Library, Radar, Rows3, Search, SearchX, Upload } from "lucide-react-native";
import { useImportJobs, useSupplierDirectory, useSupplierSearch } from "~/data/hooks";
import { useSupplierFavorites } from "~/data/supplier-favorites";
import { useActiveOrg } from "~/org/org-provider";
import type { SimpleDealDTO, SimpleOfferDTO, SimpleRankedOfferDTO, SimpleSearchDTO, SimpleSupplierResultDTO } from "~/data/supplier-search";
import { fontFamily } from "~/theme/typography";
import { userMessage } from "~/lib/errors";
import { formatNumber } from "~/lib/format";
import { SupplierLogo } from "~/components/supplier-logo";
import { OfferCard, OfferLines, type OfferDensity } from "~/components/offer-result";
import { ActionRow, AlertBanner, Button, Card, ErrorState, FadeIn, FilterChip, IconBadge, MetricStrip, Screen, SectionHeader, Segmented, ShortcutGrid, ShortcutTile, Skeleton, TabHeader, Txt } from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";

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
  const [origin, setOrigin] = useState<Origin>("all");
  const [density, setDensity] = useState<OfferDensity>("detailed");
  const [shown, setShown] = useState(PAGE);
  const run = (q: string) => {
    const t = q.trim();
    setDraft(t);
    setSubmitted(t);
    setShown(PAGE);
    setOrigin("all");
  };
  // fournisseur de l'organisation → fiche de la bibliothèque (raccourci « Fournisseur »)
  const keyBySupplier = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of directory.data?.entries ?? []) if (e.org?.supplierId) m.set(e.org.supplierId, e.key);
    return m;
  }, [directory.data]);

  const all = search.data ? rankedOffers(search.data) : [];
  const counts = { account: all.filter((o) => o.access === "account").length, public: all.filter((o) => (o.access ?? "public") === "public").length, marketplace: all.filter((o) => o.access === "marketplace").length };
  const analysed = all.filter((o) => o.deal && o.deal.level !== "insufficient_data").length;

  return (
    <Screen refreshControl={<RefreshControl refreshing={search.isRefetching} onRefresh={() => (submitted ? void search.refetch() : void directory.refetch())} />}>
      <TabHeader title="Sourcing" sub="Les prix de vos fournisseurs, comparés et analysés" />
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 54, backgroundColor: color.surface, borderRadius: radius.xl, borderWidth: 1.5, borderColor: color.ink, paddingLeft: space[3], paddingRight: 6 }}>
        <Search size={19} color={color.ink} strokeWidth={2.2} />
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => run(draft)}
          placeholder="Produit, modèle, pièce… ex. iPhone 13"
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

      {!submitted ? (
        <Discover onExample={run} />
      ) : search.isPending ? (
        <View style={{ gap: space[3] }} testID="supplier-loading">
          <Txt variant="label">Interrogation de vos fournisseurs… (jusqu'à 40 secondes)</Txt>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} w="100%" h={148} r={radius.xl} />
          ))}
        </View>
      ) : search.isError ? (
        <ErrorState title="La recherche n'a pas abouti" description={userMessage(search.error)} onRetry={() => void search.refetch()} />
      ) : search.data.total === 0 ? (
        <NoResult data={search.data} onExample={run} />
      ) : (
        <>
          <View style={{ gap: 2 }}>
            <Txt variant="headline" testID="supplier-summary">
              {formatNumber(search.data.total)} résultat{search.data.total > 1 ? "s" : ""} chez {search.data.suppliers.length} fournisseur{search.data.suppliers.length > 1 ? "s" : ""} pour « {search.data.query} »
            </Txt>
            <Txt variant="label">
              {analysed > 0 ? `${formatNumber(analysed)} offre${analysed > 1 ? "s" : ""} comparée${analysed > 1 ? "s" : ""} à des produits équivalents` : "Pas assez d'offres équivalentes pour estimer une marge"}
              {search.data.partial ? " · certains fournisseurs n'ont pas répondu à temps" : ""}
            </Txt>
          </View>
          <Segmented<Sort>
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
          {sort !== "supplier" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 6 }} accessibilityLabel="Origine des prix">
                <FilterChip label="Tout" selected={origin === "all"} onPress={() => setOrigin("all")} />
                {counts.account ? <FilterChip label="Vos comptes" count={counts.account} selected={origin === "account"} onPress={() => setOrigin("account")} /> : null}
                {counts.public ? <FilterChip label="Publiques" count={counts.public} selected={origin === "public"} onPress={() => setOrigin("public")} /> : null}
                {counts.marketplace ? <FilterChip label="Marché" count={counts.marketplace} selected={origin === "marketplace"} onPress={() => setOrigin("marketplace")} /> : null}
              </ScrollView>
              <DensityToggle value={density} onChange={setDensity} />
            </View>
          ) : null}
          {search.data.missingCostSettings && search.data.missingCostSettings.length > 0 ? (
            <AlertBanner text={`Marges provisoires : coûts à compléter (${search.data.missingCostSettings.slice(0, 3).join(", ")}${search.data.missingCostSettings.length > 3 ? "…" : ""}). Toucher pour les renseigner.`} onPress={() => router.push("/radar/settings")} />
          ) : null}
          {sort === "deals" ? <Txt variant="label">Classement par niveau, puis score et marge. Une offre n'est « intéressante » que comparée à des produits équivalents (même modèle, capacité, état, grade, type de pièce), avec une marge positive après les coûts connus.</Txt> : null}
          {sort === "supplier" ? (
            search.data.suppliers.map((s) => <SupplierBlock key={s.supplierId} supplier={s} orgCurrency={search.data.currency} density={density} supplierKey={keyBySupplier.get(s.supplierId) ?? null} />)
          ) : sort === "deals" ? (
            <OfferList offers={byOrigin(bestDeals(all), origin)} orgCurrency={search.data.currency} density={density} shown={shown} onMore={() => setShown((n) => n + PAGE)} keyOf={(o) => keyBySupplier.get(o.supplierId) ?? null} />
          ) : origin === "all" ? (
            <AccessSections offers={all} orgCurrency={search.data.currency} density={density} shown={shown} onMore={() => setShown((n) => n + PAGE)} keyOf={(o) => keyBySupplier.get(o.supplierId) ?? null} />
          ) : (
            <OfferList offers={byOrigin(all, origin)} orgCurrency={search.data.currency} density={density} shown={shown} onMore={() => setShown((n) => n + PAGE)} keyOf={(o) => keyBySupplier.get(o.supplierId) ?? null} />
          )}
          <Checked data={search.data} />
        </>
      )}
    </Screen>
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

/** Avant toute recherche : exemples, état des sources et accès aux fonctions du sourcing. */
function Discover({ onExample }: { onExample: (q: string) => void }) {
  const directory = useSupplierDirectory();
  const jobs = useImportJobs();
  const { active } = useActiveOrg();
  const { favorites } = useSupplierFavorites(active.organization.id);
  const entries = directory.data?.entries ?? [];
  const connected = entries.filter((e) => e.org?.status === "connected").length;
  const errors = entries.filter((e) => e.org?.status === "error").length;
  const failedImports = (jobs.data ?? []).filter((j) => j.status === "failed").length;
  return (
    <>
      <View style={{ gap: space[2] }}>
        <Txt variant="label">Essayez :</Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
          {EXAMPLES.map((e) => (
            <FilterChip key={e} label={e} selected={false} onPress={() => onExample(e)} />
          ))}
        </View>
      </View>
      <SectionHeader title="Vos sources" action={{ label: "Gérer", onPress: () => router.push("/sourcing-connections") }} />
      <MetricStrip
        metrics={[
          { label: "Bibliothèque", value: entries.length ? formatNumber(entries.length) : null, hint: "fiches", onPress: () => router.push("/supplier-directory"), testID: "hub-library" },
          { label: "Connectés", value: directory.data ? formatNumber(connected) : null, hint: "comptes et sources", tone: connected > 0 ? "success" : undefined, onPress: () => router.push({ pathname: "/supplier-directory", params: { view: "connected" } }), testID: "hub-connected" },
          { label: "Favoris", value: formatNumber(favorites.size), hint: "sur l'appareil", onPress: () => router.push({ pathname: "/supplier-directory", params: { view: "favorites" } }), testID: "hub-favorites" },
        ]}
      />
      {errors + failedImports > 0 ? (
        <Card>
          {errors > 0 ? <ActionRow icon={KeyRound} tone="danger" title={`${errors} connexion${errors > 1 ? "s" : ""} en erreur`} detail="Identifiants refusés ou source indisponible" cta="Corriger" onPress={() => router.push("/sourcing-connections")} last={failedImports === 0} testID="hub-errors" /> : null}
          {failedImports > 0 ? <ActionRow icon={FileStack} tone="danger" title={`${failedImports} import${failedImports > 1 ? "s" : ""} en échec`} detail="Rapport d'erreurs disponible" cta="Voir" onPress={() => router.push("/sourcing-imports")} last /> : null}
        </Card>
      ) : null}
      <ConnectAccountsCta />
      <SectionHeader title="Explorer" />
      <ShortcutGrid>
        {[
          <ShortcutTile key="lib" icon={Library} label="Bibliothèque" sub={entries.length ? `${entries.length} fournisseurs B2B` : "Fournisseurs B2B"} onPress={() => router.push("/supplier-directory")} />,
          <ShortcutTile key="radar" icon={Radar} label="Radar d'achat" sub="Offres vs vos ventes" onPress={() => router.push("/radar")} />,
          <ShortcutTile key="import" icon={Upload} label="Importer" sub="Liste de prix fournisseur" onPress={() => router.push("/sourcing-import")} />,
          <ShortcutTile key="imports" icon={History} label="Imports" sub="Historique et rapports" onPress={() => router.push("/sourcing-imports")} testID="hub-imports" />,
        ]}
      </ShortcutGrid>
    </>
  );
}

function ConnectAccountsCta() {
  return (
    <Pressable onPress={() => router.push("/pro-accounts")} accessibilityRole="button" accessibilityLabel="Connectez vos comptes fournisseurs" testID="connect-accounts-cta" style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space[3], padding: space[4], borderRadius: radius.xl, backgroundColor: pressed ? color.nightRaised : color.brand })}>
      <IconBadge icon={KeyRound} tone="brand" />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="body" color={color.inkOnDark}>
          Connectez vos comptes fournisseurs
        </Txt>
        <Txt variant="label" color={color.inkOnDarkMuted}>
          Foxway, Foneday, MobileSentrix… : vos prix pro passent en premier.
        </Txt>
      </View>
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
          Aucune offre active de vos fournisseurs ne contient tous ces mots. {failed > 0 ? `${failed} fournisseur${failed > 1 ? "s n'ont" : " n'a"} pas répondu : réessayez dans un instant. ` : ""}Les catalogues sont mis à jour à chaque import ou synchronisation, pas en temps réel.
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
function AccessSections({ offers, orgCurrency, density, shown, onMore, keyOf }: { offers: SimpleRankedOfferDTO[]; orgCurrency: string; density: OfferDensity; shown: number; onMore: () => void; keyOf: (o: SimpleRankedOfferDTO) => string | null }) {
  const { account, other } = splitByAccess(offers);
  return (
    <>
      <SectionHeader title={`Vos comptes fournisseurs (${account.length})`} />
      {account.length > 0 ? (
        <OfferList offers={account} orgCurrency={orgCurrency} density={density} shown={shown} onMore={onMore} testID="price-list-account" keyOf={keyOf} />
      ) : (
        <AlertBanner text="Aucun de vos comptes ne propose ce produit pour l'instant. Toucher pour connecter vos comptes et voir vos prix pro." onPress={() => router.push("/pro-accounts")} />
      )}
      <SectionHeader title={`Sources publiques et places de marché (${other.length})`} />
      {other.length > 0 ? <OfferList offers={other} orgCurrency={orgCurrency} density={density} shown={shown} onMore={onMore} testID="price-list-public" keyOf={keyOf} /> : <Txt variant="label">Aucune offre publique pour ce produit.</Txt>}
    </>
  );
}

function OfferList({ offers, orgCurrency, density, shown, onMore, testID, keyOf }: { offers: SimpleRankedOfferDTO[]; orgCurrency: string; density: OfferDensity; shown: number; onMore: () => void; testID?: string; keyOf: (o: SimpleRankedOfferDTO) => string | null }) {
  const visible = offers.slice(0, shown);
  return (
    <View style={{ gap: space[2] }} testID={testID} accessibilityLabel={`${offers.length} résultats`}>
      {density === "compact" ? (
        <OfferLines offers={visible} orgCurrency={orgCurrency} />
      ) : (
        visible.map((o, i) => (
          <FadeIn key={o.id} index={i}>
            <OfferCard offer={o} orgCurrency={orgCurrency} supplierName={o.supplierName} domain={o.domain ?? null} supplierKey={keyOf(o)} />
          </FadeIn>
        ))
      )}
      {offers.length > shown ? <Button label={`Afficher ${Math.min(PAGE, offers.length - shown)} de plus (${offers.length - shown} restant${offers.length - shown > 1 ? "s" : ""})`} variant="secondary" compact onPress={onMore} testID={testID ? `${testID}-more` : "price-list-more"} /> : null}
    </View>
  );
}

function SupplierBlock({ supplier: s, orgCurrency, density, supplierKey }: { supplier: SimpleSupplierResultDTO; orgCurrency: string; density: OfferDensity; supplierKey: string | null }) {
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
      {density === "compact" ? <OfferLines offers={s.offers} orgCurrency={orgCurrency} /> : s.offers.map((o) => <OfferCard key={o.id} offer={o} orgCurrency={orgCurrency} />)}
      {s.total > s.offers.length ? <Txt variant="label">… et {s.total - s.offers.length} autre(s) : précisez la recherche.</Txt> : null}
    </View>
  );
}

function Checked({ data }: { data: { checked: { supplierName: string; ok: boolean; found: number; message: string | null }[] } }) {
  if (data.checked.length === 0) return null;
  return (
    <Txt variant="label" style={{ marginTop: space[2] }}>
      Fournisseurs consultés en direct : {data.checked.map((c) => `${c.supplierName}${c.ok ? "" : " (n'a pas répondu)"}`).join(", ")}.
    </Txt>
  );
}
