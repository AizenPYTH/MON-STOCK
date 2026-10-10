import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useSupplierDirectory } from "~/data/hooks";
import { ACCESS_MODE_LABEL, SEGMENT_LABEL, STAGE_LABEL, STAGE_TONE, type DirectoryEntryDTO } from "~/data/suppliers-pro";
import { userMessage } from "~/lib/errors";
import { formatDateTime } from "~/lib/format";
import { Card, DetailHeader, EmptyState, ErrorState, FilterChip, Screen, SearchField, SkeletonList, StatusChip, Txt } from "~/components/ui";
import { color, space } from "~/theme/tokens";

/**
 * Annuaire de fournisseurs qualifiés : ce que vend chaque fournisseur, comment obtenir ses prix
 * et son statut RÉEL (prouvé par le serveur ou par vos imports). Un fournisseur identifié n'est
 * jamais présenté comme connecté.
 */
type Segment = DirectoryEntryDTO["segment"] | "all";
type Access = "all" | "automated" | "file" | "account";

const ACCESS_FILTERS: { value: Access; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "automated", label: "API / flux" },
  { value: "file", label: "Fichier / portail" },
  { value: "account", label: "Compte pro requis" },
];

function matchesAccess(e: DirectoryEntryDTO, a: Access): boolean {
  if (a === "all") return true;
  if (a === "automated") return e.accessModes.some((m) => m === "api" || m.startsWith("feed_") || m === "edi") || e.integration.kind !== "file_import";
  if (a === "file") return e.accessModes.some((m) => m === "manual_download" || m === "pro_portal" || m === "pdf_price_list");
  return e.proAccountRequired === true;
}

export default function SupplierDirectoryScreen() {
  const directory = useSupplierDirectory();
  const [q, setQ] = useState("");
  const [segment, setSegment] = useState<Segment>("all");
  const [access, setAccess] = useState<Access>("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (directory.data?.entries ?? [])
      .filter((e) => segment === "all" || e.segment === segment)
      .filter((e) => matchesAccess(e, access))
      .filter((e) => !needle || [e.name, e.country ?? "", ...e.brands, ...e.categories].join(" ").toLowerCase().includes(needle));
  }, [directory.data, q, segment, access]);

  if (directory.isPending)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Sourcing" />
        <SkeletonList rows={6} thumb={false} />
      </Screen>
    );
  if (directory.isError)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Sourcing" />
        <ErrorState description={userMessage(directory.error)} onRetry={() => void directory.refetch()} />
      </Screen>
    );

  const segments: Segment[] = ["all", "A_refurb", "B_parts", "C_liquidation", "D_distributor", "E_specialist"];
  return (
    <Screen refreshControl={<RefreshControl refreshing={directory.isRefetching} onRefresh={() => void directory.refetch()} />}>
      <DetailHeader parentLabel="Sourcing" />
      <View style={{ gap: 4 }}>
        <Txt variant="title2" accessibilityRole="header">
          Fournisseurs professionnels
        </Txt>
        <Txt variant="label">
          {directory.data.entries.length} fournisseurs qualifiés (recherche du {directory.data.researchDate.split("-").reverse().join("/")}). Sites vérifiés depuis le serveur
          {directory.data.lastCheckAt ? ` le ${formatDateTime(directory.data.lastCheckAt)}` : " : pas encore"}.
        </Txt>
      </View>
      <SearchField value={q} onChangeText={setQ} placeholder="Nom, marque, pays…" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
        {segments.map((s) => (
          <FilterChip key={s} label={s === "all" ? "Toutes catégories" : SEGMENT_LABEL[s]} selected={segment === s} onPress={() => setSegment(s)} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
        {ACCESS_FILTERS.map((f) => (
          <FilterChip key={f.value} label={f.label} selected={access === f.value} onPress={() => setAccess(f.value)} />
        ))}
      </ScrollView>
      {filtered.length === 0 ? (
        <EmptyState title="Aucun fournisseur" description="Aucun fournisseur ne correspond à ces filtres." />
      ) : (
        filtered.map((e) => <DirectoryRow key={e.key} entry={e} />)
      )}
    </Screen>
  );
}

function DirectoryRow({ entry: e }: { entry: DirectoryEntryDTO }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${e.name}, ${STAGE_LABEL[e.primaryStage]}`} onPress={() => router.push({ pathname: "/supplier-directory/[key]", params: { key: e.key } })}>
      <Card padded style={{ gap: space[2] }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
          <Txt variant="headline" style={{ flex: 1 }} numberOfLines={1}>
            {e.name}
          </Txt>
          <Txt variant="label">{[e.country, SEGMENT_LABEL[e.segment]].filter(Boolean).join(" · ")}</Txt>
          <ChevronRight size={16} color={color.ink3} />
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <StatusChip label={STAGE_LABEL[e.primaryStage]} tone={STAGE_TONE[e.primaryStage]} />
          {e.activeInOrg ? <StatusChip label="Activé" tone="success" /> : null}
          {e.accessModes.slice(0, 3).map((m) => (
            <StatusChip key={m} label={ACCESS_MODE_LABEL[m] ?? m} tone="neutral" />
          ))}
        </View>
        {e.whyUseful ? (
          <Txt variant="label" numberOfLines={2}>
            {e.whyUseful}
          </Txt>
        ) : null}
      </Card>
    </Pressable>
  );
}
