import { router } from "expo-router";
import { Truck } from "lucide-react-native";
import { formatMoneyDec, parseDecimal } from "@/domain/tools/decimal";
import { EstimateNote, ToolHeader } from "~/components/tools";
import { Button, Card, EmptyState, ErrorState, ListRow, Screen, SkeletonList } from "~/components/ui";
import { useRateCards } from "~/data/hooks";
import { userMessage } from "~/lib/errors";
import { useActiveOrg } from "~/org/org-provider";
import { color } from "~/theme/tokens";

/** Grilles tarifaires saisies par l'organisation (ses tarifs négociés ou publics). */
export default function RateCardsScreen() {
  const cards = useRateCards();
  const { permissions } = useActiveOrg();
  if (cards.isPending)
    return (
      <Screen scroll={false}>
        <ToolHeader title="Mes grilles tarifaires" />
        <SkeletonList rows={4} thumb={false} />
      </Screen>
    );
  if (cards.isError)
    return (
      <Screen scroll={false}>
        <ToolHeader title="Mes grilles tarifaires" />
        <ErrorState description={userMessage(cards.error)} onRetry={() => void cards.refetch()} />
      </Screen>
    );
  return (
    <Screen>
      <ToolHeader title="Mes grilles tarifaires" description="Vos tarifs par transporteur et par tranche de poids, utilisés quand aucune plateforme n'est connectée (ou en complément)." />
      {cards.data.length === 0 ? (
        <EmptyState icon={<Truck size={28} color={color.ink2} />} title="Aucune grille" description="Saisissez les tarifs de vos transporteurs (contrat ou grille publique) : MON STOCK n'en fournit aucun." />
      ) : (
        <Card>
          {cards.data.map((c, i) => {
            const first = c.bands[0];
            const p = first ? parseDecimal(first.price) : null;
            return (
              <ListRow
                key={c.id}
                title={`${c.carrier}${c.service ? ` · ${c.service}` : ""}`}
                subtitle={`${c.bands.length} tranche${c.bands.length > 1 ? "s" : ""}${p?.ok ? ` · dès ${formatMoneyDec(p.value, c.currency)}` : ""} · ${c.toCountries.length ? c.toCountries.join(", ") : "toutes destinations"}`}
                chevron
                last={i === cards.data.length - 1}
                onPress={() => router.push({ pathname: "/tools/shipping-rates/[id]", params: { id: c.id } })}
              />
            );
          })}
        </Card>
      )}
      {permissions.canWrite ? <Button label="Ajouter une grille" onPress={() => router.push({ pathname: "/tools/shipping-rates/[id]", params: { id: "new" } })} /> : null}
      <EstimateNote text="Indiquez la date de vérification de chaque grille : elle est affichée avec chaque prix." />
    </Screen>
  );
}
