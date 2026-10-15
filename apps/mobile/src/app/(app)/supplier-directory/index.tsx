import { useMemo, useState } from "react";
import { FlatList, LayoutAnimation, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronRight, SlidersHorizontal } from "lucide-react-native";
import type { DirectoryEntryDTO } from "@/features/mobile-api/contract";
import { useSupplierDirectory } from "~/data/hooks";
import { useSupplierFavorites } from "~/data/supplier-favorites";
import { useActiveOrg } from "~/org/org-provider";
import { SupplierLogo } from "~/components/supplier-logo";
import { ACCESS_METHOD_LABEL, countryLabel, FadeIn, FavoriteButton, INTEGRATION_STATUS_LABEL, INTEGRATION_TONE, MethodChips, ORG_STATUS_LABEL, ORG_STATUS_TONE, segmentLabel, useReduceMotion, useSupplierAction } from "~/components/supplier-library";
import { userMessage } from "~/lib/errors";
import { formatDateTime, formatNumber } from "~/lib/format";
import { BottomSheet, Button, Card, DetailHeader, EmptyState, ErrorState, FilterChip, Screen, SearchField, SkeletonList, StatusChip, Txt, useTabBarClearance } from "~/components/ui";
import { useLayout } from "~/theme/layout";
import { color, radius, space } from "~/theme/tokens";

type Entry = DirectoryEntryDTO;
type QuickView = "all" | "connected" | "connectable" | "favorites" | "pro";
type Method = Entry["registry"]["accessMethods"][number];
type Sort = "priority" | "name" | "country" | "recent";

const QUICK: { value: QuickView; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "connected", label: "Connectés" },
  { value: "connectable", label: "Connectables" },
  { value: "favorites", label: "Favoris" },
  { value: "pro", label: "Compte pro" },
];
const SEGMENTS = ["all", "A_refurb", "B_parts", "D_distributor", "C_liquidation", "E_specialist"] as const;
const METHOD_FILTERS: Method[] = ["official_api", "catalog_feed", "portal_export", "manual_import", "public_integrated", "custom_development", "not_automatable"];
const SORTS: { value: Sort; label: string }[] = [
  { value: "priority", label: "Pertinence" },
  { value: "name", label: "Nom" },
  { value: "country", label: "Pays" },
  { value: "recent", label: "Dernière synchro" },
];
const CONNECTABLE: Method[] = ["official_api", "catalog_feed", "portal_export", "manual_import", "public_integrated"];

/** Filtrage et tri de la bibliothèque. Pur. */
export function filterLibrary(entries: Entry[], f: { q: string; view: QuickView; segment: string; countries: string[]; methods: Method[]; sort: Sort; favorites: ReadonlySet<string> }): Entry[] {
  const needle = f.q.trim().toLowerCase();
  const out = entries.filter((e) => {
    if (f.view === "connected" && e.org.status !== "connected") return false;
    if (f.view === "connectable" && !e.registry.accessMethods.some((m) => CONNECTABLE.includes(m))) return false;
    if (f.view === "favorites" && !f.favorites.has(e.key)) return false;
    if (f.view === "pro" && e.proAccountRequired !== true) return false;
    if (f.segment !== "all" && e.segment !== f.segment) return false;
    if (f.countries.length && !f.countries.includes(e.country ?? "")) return false;
    if (f.methods.length && !f.methods.some((m) => e.registry.accessMethods.includes(m))) return false;
    if (needle && ![e.name, e.country ?? "", e.registry.domain ?? "", ...e.brands, ...e.categories].join(" ").toLowerCase().includes(needle)) return false;
    return true;
  });
  const statusRank = (e: Entry) => (e.org.status === "connected" ? 0 : e.org.status === "pending" || e.org.status === "error" ? 1 : 2);
  return out.sort((a, b) => {
    if (f.sort === "name") return a.name.localeCompare(b.name);
    if (f.sort === "country") return (a.country ?? "ZZ").localeCompare(b.country ?? "ZZ") || a.name.localeCompare(b.name);
    if (f.sort === "recent") return (b.org.lastSyncAt ?? "").localeCompare(a.org.lastSyncAt ?? "") || a.name.localeCompare(b.name);
    return statusRank(a) - statusRank(b) || b.registry.priority.score - a.registry.priority.score || a.name.localeCompare(b.name);
  });
}

/**
 * Bibliothèque des fournisseurs : tous les fournisseurs étudiés, leur logo, leurs méthodes d'accès
 * RÉELLES et leur état dans votre organisation. Une carte = une action cohérente (configurer l'API,
 * importer un catalogue, obtenir l'accès pro…), jamais une fausse connexion.
 */
export default function SupplierLibraryScreen() {
  const params = useLocalSearchParams<{ view?: QuickView }>();
  const directory = useSupplierDirectory();
  const { active, permissions } = useActiveOrg();
  const { favorites, toggle } = useSupplierFavorites(active.organization.id);
  const { screenX, maxWidth } = useLayout();
  const clearance = useTabBarClearance();
  const reduce = useReduceMotion();
  const [q, setQ] = useState("");
  const [view, setView] = useState<QuickView>(params.view && QUICK.some((x) => x.value === params.view) ? params.view : "all");
  const [segment, setSegment] = useState<string>("all");
  const [countries, setCountries] = useState<string[]>([]);
  const [methods, setMethods] = useState<Method[]>([]);
  const [sort, setSort] = useState<Sort>("priority");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const entries = useMemo(() => directory.data?.entries ?? [], [directory.data]);
  const filtered = useMemo(() => filterLibrary(entries, { q, view, segment, countries, methods, sort, favorites }), [entries, q, view, segment, countries, methods, sort, favorites]);
  const animate = (fn: () => void) => {
    if (!reduce) LayoutAnimation.configureNext(LayoutAnimation.create(180, "easeInEaseOut", "opacity"));
    fn();
  };
  const activeFilters = countries.length + methods.length + (sort !== "priority" ? 1 : 0);
  const header = <DetailHeader parentLabel="Fournisseurs" title="Bibliothèque des fournisseurs" sub={directory.data ? `${entries.length} fournisseurs · ${entries.filter((e) => e.org.status === "connected").length} connectés` : undefined} />;

  if (directory.isPending)
    return (
      <Screen scroll={false}>
        {header}
        <SkeletonList rows={6} />
      </Screen>
    );
  if (directory.isError)
    return (
      <Screen scroll={false}>
        {header}
        <ErrorState description={userMessage(directory.error)} onRetry={() => void directory.refetch()} />
      </Screen>
    );

  const allCountries = [...new Set(entries.map((e) => e.country).filter((c): c is string => Boolean(c)))].sort();
  const listHeader = (
    <View style={{ gap: space[3], paddingBottom: space[3] }}>
      <SearchField value={q} onChangeText={setQ} placeholder="Nom, marque, pays, catégorie…" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
        {QUICK.map((v) => (
          <FilterChip key={v.value} label={v.label} count={v.value === "favorites" ? favorites.size : v.value === "connected" ? entries.filter((e) => e.org.status === "connected").length : undefined} selected={view === v.value} onPress={() => animate(() => setView(v.value))} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
        {SEGMENTS.map((s) => (
          <FilterChip key={s} label={s === "all" ? "Toutes catégories" : segmentLabel(s)} selected={segment === s} onPress={() => animate(() => setSegment(s))} />
        ))}
      </ScrollView>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Txt variant="label" testID="library-count">
          {filtered.length} fournisseur{filtered.length > 1 ? "s" : ""}
        </Txt>
        <Pressable onPress={() => setFiltersOpen(true)} accessibilityRole="button" accessibilityLabel={`Filtres et tri${activeFilters ? `, ${activeFilters} actifs` : ""}`} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.md, backgroundColor: activeFilters ? color.brandSoft : "transparent" }} testID="library-filters">
          <SlidersHorizontal size={16} color={color.ink} />
          <Txt variant="label" color={color.ink}>
            Filtres{activeFilters ? ` (${activeFilters})` : ""}
          </Txt>
        </Pressable>
      </View>
    </View>
  );

  return (
    <Screen scroll={false} contentGap={0}>
      {header}
      <FlatList
        data={filtered}
        keyExtractor={(e) => e.key}
        ListHeaderComponent={listHeader}
        initialNumToRender={8}
        windowSize={7}
        refreshControl={<RefreshControl refreshing={directory.isRefetching} onRefresh={() => void directory.refetch()} />}
        contentContainerStyle={{ paddingBottom: space[8] + clearance, gap: space[3] }}
        style={{ marginHorizontal: -screenX, paddingHorizontal: screenX, maxWidth }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <EmptyState
            title={view === "favorites" ? "Aucun favori pour l'instant" : view === "connected" ? "Aucun fournisseur connecté" : "Aucun fournisseur ne correspond"}
            description={
              view === "favorites"
                ? "Touchez l'étoile d'un fournisseur pour le retrouver ici."
                : view === "connected"
                  ? "Connectez un compte pro (API, flux ou liste de stock) ou activez un catalogue public pour voir vos prix ici."
                  : "Élargissez la recherche ou retirez des filtres."
            }
            actions={[{ label: "Tout afficher", onPress: () => animate(() => (setView("all"), setSegment("all"), setCountries([]), setMethods([]), setQ(""))) }]}
          />
        }
        renderItem={({ item, index }) => (
          <FadeIn index={index}>
            <SupplierCard entry={item} favorite={favorites.has(item.key)} onToggleFavorite={() => void toggle(item.key)} canWrite={permissions.canWrite} />
          </FadeIn>
        )}
      />
      <BottomSheet visible={filtersOpen} title="Filtres et tri" onClose={() => setFiltersOpen(false)}>
        <View style={{ gap: space[3] }}>
          <Txt variant="overline">Trier par</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
            {SORTS.map((s) => (
              <FilterChip key={s.value} label={s.label} selected={sort === s.value} onPress={() => animate(() => setSort(s.value))} />
            ))}
          </View>
          <Txt variant="overline">Méthode d'accès</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
            {METHOD_FILTERS.map((m) => (
              <FilterChip key={m} label={ACCESS_METHOD_LABEL[m]} selected={methods.includes(m)} onPress={() => animate(() => setMethods((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m])))} />
            ))}
          </View>
          <Txt variant="overline">Pays</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
            {allCountries.map((c) => (
              <FilterChip key={c} label={countryLabel(c)} selected={countries.includes(c)} onPress={() => animate(() => setCountries((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c])))} />
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: space[2] }}>
            <Button label="Réinitialiser" variant="ghost" onPress={() => animate(() => (setCountries([]), setMethods([]), setSort("priority")))} style={{ flex: 1 }} />
            <Button label={`Voir ${filtered.length} résultat${filtered.length > 1 ? "s" : ""}`} onPress={() => setFiltersOpen(false)} style={{ flex: 1 }} testID="library-filters-apply" />
          </View>
        </View>
      </BottomSheet>
    </Screen>
  );
}

function SupplierCard({ entry: e, favorite, onToggleFavorite, canWrite }: { entry: Entry; favorite: boolean; onToggleFavorite: () => void; canWrite: boolean }) {
  const action = useSupplierAction(e, canWrite);
  const open = () => router.push({ pathname: "/supplier-directory/[key]", params: { key: e.key } });
  const showStatus = e.org.status !== "not_connected";
  return (
    <Card padded style={{ gap: space[2] }} accessibilityLabel={`${e.name}, ${showStatus ? ORG_STATUS_LABEL[e.org.status] : INTEGRATION_STATUS_LABEL[e.registry.integrationStatus]}`}>
      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`Ouvrir la fiche ${e.name}`} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, gap: space[2] })} testID={`library-card-${e.key}`}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
          <SupplierLogo domain={e.registry.domain} name={e.name} size={44} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="headline" numberOfLines={1}>
              {e.name.replace(/\s*\(.*\)\s*$/, "")}
            </Txt>
            <Txt variant="label" numberOfLines={1}>
              {[countryLabel(e.country), segmentLabel(e.segment)].filter(Boolean).join(" · ")}
            </Txt>
          </View>
          <FavoriteButton active={favorite} onPress={onToggleFavorite} name={e.name} />
          <ChevronRight size={16} color={color.ink3} />
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <StatusChip label={showStatus ? ORG_STATUS_LABEL[e.org.status] : INTEGRATION_STATUS_LABEL[e.registry.integrationStatus]} tone={showStatus ? ORG_STATUS_TONE[e.org.status] : INTEGRATION_TONE[e.registry.integrationStatus]} />
        </View>
        <MethodChips methods={e.registry.accessMethods} max={2} />
        {e.org.status !== "not_connected" ? (
          <Txt variant="label" numberOfLines={1}>
            {formatNumber(e.org.accountOffers + e.org.publicOffers)} offre{e.org.accountOffers + e.org.publicOffers > 1 ? "s" : ""}
            {e.org.lastSyncAt ? ` · mise à jour ${formatDateTime(e.org.lastSyncAt)}` : ""}
          </Txt>
        ) : e.whyUseful ? (
          <Txt variant="label" numberOfLines={2}>
            {e.whyUseful}
          </Txt>
        ) : null}
        {e.org.lastError ? (
          <Txt variant="label" color={color.dangerInk} numberOfLines={2}>
            {e.org.lastError}
          </Txt>
        ) : null}
      </Pressable>
      {e.registry.primaryAction.kind !== "none" ? <Button label={e.registry.primaryAction.label} compact variant={e.registry.primaryAction.kind === "open_site" ? "ghost" : "secondary"} loading={action.busy} onPress={() => action.run()} testID={`library-action-${e.key}`} /> : null}
      {action.sheet}
    </Card>
  );
}
