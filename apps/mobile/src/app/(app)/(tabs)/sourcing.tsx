import { useState } from "react";
import { Pressable, RefreshControl } from "react-native";
import { router } from "expo-router";
import { Truck } from "lucide-react-native";
import { useActiveSuppliers, useOfferGroups, useSourcingOverview } from "~/data/hooks";
import { userMessage } from "~/lib/errors";
import { formatMoneyRounded, formatNumber } from "~/lib/format";
import { AlertBanner, Avatar, Card, EmptyState, ErrorState, ListRow, Screen, SectionHeader, Segmented, SkeletonList, TabHeader, Txt, initialsOf } from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";
import { useActiveOrg } from "~/org/org-provider";

type Segment = "offers" | "suppliers";

export default function SourcingScreen() {
  const [segment, setSegment] = useState<Segment>("offers");
  const groups = useOfferGroups();
  const suppliers = useActiveSuppliers();
  const overview = useSourcingOverview();
  const { active } = useActiveOrg();
  const currency = active.organization.currency;
  const refreshing = groups.isRefetching || suppliers.isRefetching;

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            void groups.refetch();
            void suppliers.refetch();
            void overview.refetch();
          }}
        />
      }
    >
      <TabHeader title="Sourcing" />
      <Segmented
        value={segment}
        onChange={setSegment}
        options={[
          { value: "offers", label: groups.data ? `Offres · ${formatNumber(groups.data.offers)}` : "Offres" },
          { value: "suppliers", label: suppliers.data ? `Fournisseurs · ${formatNumber(suppliers.data.length)}` : "Fournisseurs" },
        ]}
      />
      {overview.data && overview.data.connectedSources === 0 ? (
        <AlertBanner text={`Aucune source fournisseur connectée (${overview.data.documented} documentées). Les offres affichées sont celles déjà enregistrées ; la recherche en direct nécessite le serveur MON STOCK.`} />
      ) : null}

      {segment === "offers" ? (
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
