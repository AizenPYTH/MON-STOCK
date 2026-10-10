import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Bookmark, ChevronRight, Settings2 } from "lucide-react-native";
import { useActiveOrg } from "~/org/org-provider";
import { useMatchSuggestions, useRadar } from "~/data/hooks";
import { FRESHNESS_LABEL, PRICE_ORIGIN_LABEL, SORT_OPTIONS, STATUS_LABEL, STATUS_TONE, type RadarItemDTO, type RadarSort } from "~/data/radar";
import { userMessage } from "~/lib/errors";
import { formatMoney, formatNumber } from "~/lib/format";
import { AlertBanner, Card, DetailHeader, EmptyState, ErrorState, FilterChip, IconButton, Screen, SectionHeader, SkeletonList, StatusChip, Txt } from "~/components/ui";
import { color, space } from "~/theme/tokens";

/**
 * Radar d'opportunités d'achat : vos offres fournisseurs réelles comparées à vos ventes réelles,
 * coût complet et qualité des données à l'appui. Une estimation incomplète n'est jamais affichée
 * comme un bénéfice certain ; aucune commande n'est passée sans votre confirmation.
 */
type Filter = "all" | "profitable" | "estimated" | "saved";

export default function RadarScreen() {
  const [sort, setSort] = useState<RadarSort>("score");
  const [filter, setFilter] = useState<Filter>("all");
  const radar = useRadar(sort);
  const matches = useMatchSuggestions();
  const { active } = useActiveOrg();
  const currency = active.organization.currency;

  const items = useMemo(() => {
    const all = radar.data?.items ?? [];
    if (filter === "profitable") return all.filter((i) => i.evaluation.status === "profitable");
    if (filter === "estimated") return all.filter((i) => i.evaluation.status === "estimated");
    if (filter === "saved") return all.filter((i) => i.savedAt);
    return all;
  }, [radar.data, filter]);

  if (radar.isPending)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Sourcing" />
        <SkeletonList rows={6} thumb={false} />
      </Screen>
    );
  if (radar.isError)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Sourcing" />
        <ErrorState description={userMessage(radar.error)} onRetry={() => void radar.refetch()} />
      </Screen>
    );
  const d = radar.data;

  return (
    <Screen refreshControl={<RefreshControl refreshing={radar.isRefetching} onRefresh={() => void Promise.all([radar.refetch(), matches.refetch()])} />}>
      <DetailHeader parentLabel="Sourcing" right={<IconButton icon={<Settings2 size={18} color={color.ink} />} label="Paramètres de coûts" onPress={() => router.push("/radar/settings")} />} />
      <View style={{ gap: 4 }}>
        <Txt variant="title2" accessibilityRole="header">
          Radar d'opportunités
        </Txt>
        <Txt variant="label">
          {formatNumber(d.counts.profitable)} rentables · {formatNumber(d.counts.estimated)} estimées · {formatNumber(d.counts.unprofitable)} non rentables · {formatNumber(d.counts.insufficient)} incomplètes
        </Txt>
      </View>
      {d.missingSettings.length ? <AlertBanner text={`Paramètres de coûts manquants (${d.missingSettings.join(", ")}) : les bénéfices restent des estimations partielles. Compléter →`} onPress={() => router.push("/radar/settings")} /> : null}
      {(matches.data?.length ?? 0) > 0 ? <AlertBanner text={`${matches.data!.length} offre(s) à rapprocher de vos SKU : confirmez les correspondances proposées →`} tone="dark" onPress={() => router.push("/radar/matches")} /> : null}
      {d.counts.unlinkedOffers > 0 && !(matches.data?.length ?? 0) ? (
        <Txt variant="label">{formatNumber(d.counts.unlinkedOffers)} offre(s) fournisseur ne correspondent encore à aucun de vos SKU (référence ou EAN différents) : elles n'apparaissent pas dans le radar.</Txt>
      ) : null}

      {d.restock.length ? (
        <>
          <SectionHeader title={`À réapprovisionner (${d.restock.length})`} />
          <Card>
            {d.restock.slice(0, 8).map((r, i) => (
              <Pressable key={r.skuId} accessibilityRole="button" onPress={() => router.push({ pathname: "/sku/[skuId]", params: { skuId: r.skuId } })} style={{ padding: space[3], borderTopWidth: i ? 1 : 0, borderTopColor: color.lineSoft, gap: 2 }}>
                <Txt variant="body" numberOfLines={1}>
                  {r.name}
                </Txt>
                <Txt variant="label">
                  Stock {formatNumber(r.quantityAvailable)} · {formatNumber(r.units30d)} ventes / 30 j{r.daysOfCover !== null ? ` · ~${r.daysOfCover} j de stock` : ""}
                  {r.bestPrice !== null ? ` · meilleure offre ${formatMoney(r.bestPrice, currency)} (${r.bestSupplier})` : " · aucune offre fournisseur liée"}
                </Txt>
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}

      <SectionHeader title="Offres évaluées" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
        {(
          [
            ["all", "Toutes"],
            ["profitable", "Rentables"],
            ["estimated", "Estimations"],
            ["saved", "Enregistrées"],
          ] as [Filter, string][]
        ).map(([v, l]) => (
          <FilterChip key={v} label={l} selected={filter === v} onPress={() => setFilter(v)} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
        {SORT_OPTIONS.map((o) => (
          <FilterChip key={o.value} label={`Tri : ${o.label}`} selected={sort === o.value} onPress={() => setSort(o.value)} />
        ))}
      </ScrollView>
      {items.length === 0 ? (
        <EmptyState
          title="Aucune offre à évaluer"
          description={
            d.counts.skus === 0
              ? "Ajoutez vos produits au stock : le radar compare les offres fournisseurs à ce que vous vendez."
              : "Importez le catalogue d'un fournisseur ou activez une source : les offres rapprochées de vos SKU apparaîtront ici."
          }
          actions={[
            { label: "Importer un catalogue", onPress: () => router.push("/sourcing-import") },
            { label: "Fournisseurs", onPress: () => router.push("/supplier-directory"), variant: "secondary" },
          ]}
        />
      ) : (
        items.map((i) => <RadarRow key={i.offer.offerId} item={i} />)
      )}
    </Screen>
  );
}

function RadarRow({ item: i }: { item: RadarItemDTO }) {
  const e = i.evaluation;
  const cur = i.sku.currency;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${i.sku.name}, ${STATUS_LABEL[e.status]}`} onPress={() => router.push({ pathname: "/radar/[offerId]", params: { offerId: i.offer.offerId } })}>
      <Card padded style={{ gap: space[2] }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
          <Txt variant="headline" style={{ flex: 1 }} numberOfLines={1}>
            {i.sku.name}
          </Txt>
          {i.savedAt ? <Bookmark size={16} color={color.accent} fill={color.accent} /> : null}
          <ChevronRight size={16} color={color.ink3} />
        </View>
        <Txt variant="label" numberOfLines={1}>
          {i.offer.supplierName} · {i.offer.price !== null && i.offer.currency ? formatMoney(i.offer.price, i.offer.currency) : "prix ?"}
          {i.offer.taxType === "ht" ? " HT" : i.offer.taxType === "ttc" ? " TTC" : ""} · {PRICE_ORIGIN_LABEL[i.offer.priceOrigin]}
        </Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <StatusChip label={STATUS_LABEL[e.status]} tone={STATUS_TONE[e.status]} />
          {e.estimatedProfit !== null ? <StatusChip label={`${e.status === "profitable" ? "" : "≈ "}${formatMoney(e.estimatedProfit, cur)} / unité${e.marginPercent !== null ? ` (${e.marginPercent} %)` : ""}`} tone="dark" /> : null}
          <StatusChip label={FRESHNESS_LABEL[e.freshness]} tone={e.freshness === "stale" || e.freshness === "unknown" ? "danger" : "neutral"} />
          {e.missing.length ? <StatusChip label={`${e.missing.length} coût(s) inconnu(s)`} tone="accent" /> : null}
        </View>
        {e.reasons[0] ? (
          <Txt variant="label" color={color.ink2} numberOfLines={2}>
            {e.reasons.slice(0, 2).join(" ")}
          </Txt>
        ) : null}
      </Card>
    </Pressable>
  );
}
