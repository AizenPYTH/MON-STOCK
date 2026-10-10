import { useState } from "react";
import { Pressable, RefreshControl, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Library, Search, Truck } from "lucide-react-native";
import { useActiveSuppliers, useOfferGroups, useOfferSearch, useSourcingOverview } from "~/data/hooks";
import { SOURCE_STATUS_LABEL } from "~/data/sourcing-live";
import { OfferCard } from "~/components/offer-card";
import { fontFamily } from "~/theme/typography";
import { userMessage } from "~/lib/errors";
import { formatMoneyRounded, formatNumber } from "~/lib/format";
import { AlertBanner, Avatar, Button, Card, EmptyState, ErrorState, FilterChip, IconButton, ListRow, Screen, SectionHeader, Segmented, Skeleton, SkeletonList, TabHeader, Txt, initialsOf } from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";
import { useActiveOrg } from "~/org/org-provider";

type Segment = "search" | "offers" | "suppliers";

const EXAMPLES = ["iPhone 13 128 Go reconditionné grade B", "lot smartphones Samsung", "écran iPhone 13", "batterie iPhone 12"];

export default function SourcingScreen() {
  const params = useLocalSearchParams<{ q?: string; sku?: string }>();
  const [segment, setSegment] = useState<Segment>("search");
  const [draft, setDraft] = useState(params.q ?? "");
  const [submitted, setSubmitted] = useState(params.q ?? "");
  const [sku, setSku] = useState<string | undefined>(params.sku);
  // Arrivée depuis une fiche SKU alors que l'onglet est déjà monté : on applique les nouveaux paramètres.
  const paramsKey = `${params.q ?? ""}|${params.sku ?? ""}`;
  const [appliedParams, setAppliedParams] = useState(paramsKey);
  if (paramsKey !== appliedParams) {
    setAppliedParams(paramsKey);
    if (params.q) {
      setDraft(params.q);
      setSubmitted(params.q);
      setSku(params.sku);
      setSegment("search");
    }
  }
  const search = useOfferSearch(submitted, sku);
  const groups = useOfferGroups();
  const suppliers = useActiveSuppliers();
  const overview = useSourcingOverview();
  const { active } = useActiveOrg();
  const currency = active.organization.currency;
  const refreshing = groups.isRefetching || suppliers.isRefetching || search.isRefetching;
  const run = (q: string) => {
    const t = q.trim();
    setDraft(t);
    setSubmitted(t);
    setSegment("search");
  };

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            if (submitted) void search.refetch();
            void groups.refetch();
            void suppliers.refetch();
            void overview.refetch();
          }}
        />
      }
    >
      <TabHeader title="Sourcing" right={<IconButton icon={<Library size={18} color={color.ink} />} label="Sources fournisseurs" onPress={() => router.push("/sourcing-sources")} />} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 48, backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, paddingHorizontal: space[3] }}>
        <Search size={18} color={color.ink3} />
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => run(draft)}
          placeholder="Ex. iPhone 13 128 Go grade B"
          placeholderTextColor={color.ink3}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Rechercher une offre fournisseur"
          maxFontSizeMultiplier={1.6}
          style={{ flex: 1, fontFamily: fontFamily[600], fontSize: 16, color: color.ink, paddingVertical: 0 }}
          testID="sourcing-query"
        />
        <Button label="Chercher" compact disabled={draft.trim().length < 2} loading={search.isFetching} onPress={() => run(draft)} testID="sourcing-search" />
      </View>
      {sku ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
          <Txt variant="label" style={{ flex: 1 }}>Comparaison avec le coût actuel du SKU {sku}</Txt>
          <FilterChip label="Retirer" selected={false} onPress={() => setSku(undefined)} />
        </View>
      ) : null}
      <Segmented
        value={segment}
        onChange={setSegment}
        options={[
          { value: "search", label: "Recherche" },
          { value: "offers", label: groups.data ? `Offres · ${formatNumber(groups.data.offers)}` : "Offres" },
          { value: "suppliers", label: suppliers.data ? `Fournisseurs · ${formatNumber(suppliers.data.length)}` : "Fournisseurs" },
        ]}
      />
      {overview.data && overview.data.connectedSources === 0 ? (
        <AlertBanner text="Aucune source fournisseur activée : activez des sources vérifiées pour obtenir des offres en direct." onPress={() => router.push("/sourcing-sources")} />
      ) : null}

      {segment === "search" ? (
        <SearchResults query={submitted} search={search} currency={currency} onExample={run} />
      ) : segment === "offers" ? (
        groups.isPending ? (
          <SkeletonList rows={4} thumb={false} />
        ) : groups.isError ? (
          <ErrorState description={userMessage(groups.error)} onRetry={() => void groups.refetch()} />
        ) : groups.data.groups.length === 0 ? (
          <EmptyState icon={<Truck size={28} color={color.ink2} />} title="Aucune offre fournisseur" description="Les offres apparaissent quand une source est connectée (compte fournisseur, flux CSV/XML, site public autorisé). Aucune offre n'est inventée." />
        ) : (
          <>
            <SectionHeader title="À comparer" />
            <Card>
              {groups.data.groups.slice(0, 50).map((g, i, all) => {
                const n = g.offers.length;
                const range = g.min === null ? "prix non communiqué" : g.min === g.max ? formatMoneyRounded(g.min, currency) : `${formatMoneyRounded(g.min, currency)} à ${formatMoneyRounded(g.max, currency)}`;
                return (
                  <ListRow
                    key={g.key}
                    title={g.title}
                    subtitle={`${n} offre${n > 1 ? "s" : ""} · ${range}`}
                    right={<CompareButton label={n >= 2 ? "Comparer" : "Voir"} filled={n >= 2} />}
                    onPress={() => router.push({ pathname: "/compare/[key]", params: { key: g.key } })}
                    last={i === all.length - 1}
                  />
                );
              })}
            </Card>
            {groups.data.truncated ? <Txt variant="label">Seules les 500 offres les moins chères sont regroupées ici.</Txt> : null}
          </>
        )
      ) : suppliers.isPending ? (
        <SkeletonList rows={4} />
      ) : suppliers.isError ? (
        <ErrorState description={userMessage(suppliers.error)} onRetry={() => void suppliers.refetch()} />
      ) : suppliers.data.length === 0 ? (
        <EmptyState icon={<Truck size={28} color={color.ink2} />} title="Aucun fournisseur" description="Ajoutez vos fournisseurs depuis l'application web MON STOCK." />
      ) : (
        <>
          <SectionHeader title="Fournisseurs actifs" />
          <Card>
            {suppliers.data.map((s, i) => (
              <ListRow
                key={s.id}
                left={<Avatar initials={initialsOf(s.name)} size={40} dark={false} />}
                title={s.name}
                subtitle={`${s.country ?? "Pays non précisé"} · ${formatNumber(s.purchaseOrders)} commande${s.purchaseOrders > 1 ? "s" : ""}`}
                right={
                  s.averagePrice === null ? undefined : (
                    <Pressable accessible={false} style={{ alignItems: "flex-end" }}>
                      <Txt variant="body" num style={{ fontFamily: "Manrope_700Bold" }}>
                        {formatMoneyRounded(s.averagePrice, currency)}
                      </Txt>
                      <Txt variant="label" style={{ fontSize: 11 }}>
                        prix moyen
                      </Txt>
                    </Pressable>
                  )
                }
                last={i === suppliers.data.length - 1}
              />
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}

function SearchResults({ query, search, currency, onExample }: { query: string; search: ReturnType<typeof useOfferSearch>; currency: string; onExample: (q: string) => void }) {
  if (!query)
    return (
      <View style={{ gap: space[3] }}>
        <Txt variant="bodyRegular">Recherchez un produit, un lot ou une pièce : le serveur interroge en direct les sources activées (API officielles, catalogues publics vérifiés) et n'affiche que des offres réellement relevées.</Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
          {EXAMPLES.map((e) => (
            <FilterChip key={e} label={e} selected={false} onPress={() => onExample(e)} />
          ))}
        </View>
      </View>
    );
  if (search.isPending)
    return (
      <View style={{ gap: space[3] }}>
        <Txt variant="label">Interrogation des sources en direct… (jusqu'à 30 s)</Txt>
        <Skeleton w="100%" h={180} r={radius.xl} />
        <Skeleton w="100%" h={180} r={radius.xl} />
      </View>
    );
  if (search.isError) return <ErrorState description={userMessage(search.error)} onRetry={() => void search.refetch()} />;
  const r = search.data;
  const live = r.live;
  return (
    <View style={{ gap: space.blockGap }}>
      <Card padded style={{ gap: 6 }}>
        <Txt variant="body">
          {formatNumber(r.total)} offre{r.total > 1 ? "s" : ""} pour « {r.query} »
        </Txt>
        {live ? (
          <Txt variant="label">
            {formatNumber(live.queried)} source{live.queried > 1 ? "s" : ""} interrogée{live.queried > 1 ? "s" : ""} en direct · {formatNumber(live.found)} trouvée{live.found > 1 ? "s" : ""} · {Math.round(live.durationMs / 100) / 10} s
          </Txt>
        ) : (
          <Txt variant="label">Offres déjà enregistrées uniquement.</Txt>
        )}
        {live?.sources.map((s) => (
          <Txt key={`${s.supplierName}-${s.name}`} variant="label" color={s.status === "ok" || s.status === "cached" ? color.success : color.ink2}>
            • {s.supplierName} : {SOURCE_STATUS_LABEL[s.status] ?? s.status}
            {s.status === "ok" || s.status === "cached" ? ` (${s.found})` : s.message ? ` — ${s.message}` : ""}
          </Txt>
        ))}
        {r.connectedSources === 0 ? <Txt variant="label">Aucune source activée : ouvrez « Sources » pour en activer.</Txt> : null}
      </Card>
      {r.offers.length === 0 ? (
        <EmptyState icon={<Truck size={28} color={color.ink2} />} title="Aucune offre trouvée" description={r.rejected.count > 0 ? `${r.rejected.count} offre(s) écartée(s) car non pertinentes pour la recherche. Essayez une formulation plus générale.` : "Aucune source activée n'a renvoyé d'offre pour cette recherche. Rien n'est inventé : essayez une autre formulation ou activez d'autres sources."} />
      ) : (
        r.offers.map((o) => <OfferCard key={o.id} offer={o} orgCurrency={currency} />)
      )}
      {r.priceBasisNote ? <Txt variant="label">{r.priceBasisNote}</Txt> : null}
    </View>
  );
}

function CompareButton({ label, filled }: { label: string; filled: boolean }) {
  return (
    <Txt
      variant="label"
      color={filled ? color.inkOnDark : color.ink}
      style={{ fontFamily: "Manrope_700Bold", paddingVertical: 6, paddingHorizontal: space[3], borderRadius: radius.sm, overflow: "hidden", backgroundColor: filled ? color.ink : color.surface, borderWidth: filled ? 0 : 1, borderColor: color.lineStrong }}
    >
      {label}
    </Txt>
  );
}
