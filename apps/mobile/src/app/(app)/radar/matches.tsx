import { View } from "react-native";
import { useActiveOrg } from "~/org/org-provider";
import { useDecideMatch, useMatchSuggestions } from "~/data/hooks";
import { userMessage } from "~/lib/errors";
import { formatMoney } from "~/lib/format";
import { Button, Card, DetailHeader, EmptyState, ErrorState, Screen, SkeletonList, StatusChip, Txt, useToast } from "~/components/ui";
import { space } from "~/theme/tokens";

/** Correspondances offre fournisseur ↔ SKU proposées automatiquement, à confirmer ou rejeter. */
export default function RadarMatchesScreen() {
  const matches = useMatchSuggestions();
  const decide = useDecideMatch();
  const { permissions } = useActiveOrg();
  const toast = useToast();

  if (matches.isPending)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Radar" />
        <SkeletonList rows={5} thumb={false} />
      </Screen>
    );
  if (matches.isError)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Radar" />
        <ErrorState description={userMessage(matches.error)} onRetry={() => void matches.refetch()} />
      </Screen>
    );

  const act = (matchId: string, decision: "confirm" | "reject") =>
    decide.mutate({ matchId, decision }, { onSuccess: () => toast({ text: decision === "confirm" ? "Offre rattachée au SKU." : "Suggestion rejetée." }), onError: (e) => toast({ text: userMessage(e), tone: "error" }) });

  return (
    <Screen>
      <DetailHeader parentLabel="Radar" />
      <Txt variant="title2" accessibilityRole="header">
        Offres à rapprocher
      </Txt>
      <Txt variant="label">Le rapprochement est proposé à partir des références, EAN et désignations. Seules les offres rattachées à un SKU sont évaluées par le radar.</Txt>
      {matches.data.length === 0 ? <EmptyState title="Aucune suggestion en attente" description="Les correspondances exactes (EAN, référence fabricant) sont rattachées automatiquement à l'import." /> : null}
      {matches.data.map((m) => (
        <Card key={m.matchId} padded style={{ gap: space[2] }}>
          <Txt variant="label">{m.offer.supplierName}</Txt>
          <Txt variant="body" numberOfLines={2}>
            {m.offer.title}
          </Txt>
          <Txt variant="label">→ {m.sku.name} ({m.sku.code})</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            <StatusChip label={`Confiance ${Math.round(m.confidence * 100)} %`} tone={m.confidence >= 0.8 ? "success" : "accent"} />
            {m.offer.price !== null && m.offer.currency ? <StatusChip label={formatMoney(m.offer.price, m.offer.currency)} tone="neutral" /> : null}
          </View>
          {m.reasons.length ? <Txt variant="label">{m.reasons.join(" · ")}</Txt> : null}
          {permissions.canWrite ? (
            <View style={{ flexDirection: "row", gap: space[2] }}>
              <Button label="Confirmer" compact onPress={() => act(m.matchId, "confirm")} disabled={decide.isPending} style={{ flex: 1 }} />
              <Button label="Rejeter" compact variant="secondary" onPress={() => act(m.matchId, "reject")} disabled={decide.isPending} style={{ flex: 1 }} />
            </View>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
