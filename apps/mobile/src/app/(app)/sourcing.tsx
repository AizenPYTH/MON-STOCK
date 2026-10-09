import { Linking, RefreshControl, View } from "react-native";
import { useSourcingOverview } from "~/data/hooks";
import { appConfig } from "~/lib/config";
import { userMessage } from "~/lib/errors";
import { safeExternalUrl } from "~/lib/url";
import { Badge, Body, Card, ErrorState, LoadingState, Muted, Notice, Row, Screen, SectionTitle, Stat, Title } from "~/ui/components";
import { formatMoney, formatNumber, formatRelative } from "~/ui/format";
import { colors, spacing } from "~/ui/theme";

export default function SourcingScreen() {
  const q = useSourcingOverview();
  const apiAvailable = appConfig.ok && Boolean(appConfig.config.apiUrl);

  if (q.isPending) return <LoadingState />;
  if (q.isError)
    return (
      <Screen scroll={false}>
        <ErrorState message={userMessage(q.error)} onRetry={() => void q.refetch()} />
      </Screen>
    );
  const d = q.data;

  return (
    <Screen refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <Title subtitle="Offres fournisseurs réelles uniquement, avec leur source et leur fraîcheur.">Sourcing</Title>

      {!apiAvailable ? (
        <Notice tone="warning" title="Recherche en direct indisponible sur mobile">
          La recherche auprès des fournisseurs (robots.txt, limites de débit, comptes fournisseurs) s'exécute sur le serveur MON STOCK, qui n'est pas encore déployé pour l'application mobile. Seules les offres déjà enregistrées sont affichées.
        </Notice>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md }}>
        <Stat label="Sources documentées" value={formatNumber(d.documented)} hint="Catalogue MON STOCK" />
        <Stat label="Vérifiées (sites officiels)" value={formatNumber(d.verifiedFromOfficialSites)} hint="Documentation publique" />
        <Stat label="Connectées (votre organisation)" value={formatNumber(d.connectedSources)} tone={d.connectedSources === 0 ? "warning" : "success"} hint={`${formatNumber(d.sourcesTotal)} source(s) configurée(s)`} />
        <Stat label="Offres disponibles" value={formatNumber(d.activeOffers)} tone={d.activeOffers === 0 ? "warning" : undefined} />
      </View>

      {d.connectedSources === 0 ? (
        <Notice tone="info">Aucune source fournisseur n'est connectée : aucune offre ne peut être récupérée. Connectez une source (compte fournisseur, flux CSV/XML, site public autorisé) depuis l'application web.</Notice>
      ) : null}

      <SectionTitle>Dernières offres enregistrées</SectionTitle>
      {d.recentOffers.length === 0 ? (
        <Card>
          <Body>Aucune offre enregistrée. Rien n'est inventé pour remplir cet écran.</Body>
        </Card>
      ) : (
        d.recentOffers.map((o) => {
          const url = safeExternalUrl(o.sourceUrl);
          return (
            <Card key={o.id}>
              <Body style={{ fontWeight: "600" }}>{o.title}</Body>
              <Muted>
                {o.supplierName ?? "Fournisseur inconnu"} · {o.sourceType}
              </Muted>
              <Row style={{ justifyContent: "space-between", marginTop: spacing.sm }}>
                <Body style={{ fontWeight: "700" }}>{o.price !== null ? formatMoney(o.price, o.currency ?? "EUR") : "Prix non communiqué"}</Body>
                <Badge label={o.lastSeenAt ? `Vérifiée ${formatRelative(o.lastSeenAt)}` : "Date inconnue"} tone={o.lastSeenAt ? "neutral" : "warning"} />
              </Row>
              <Muted>
                {o.availableQuantity !== null ? `${formatNumber(o.availableQuantity)} en stock` : "Stock non communiqué"}
                {o.moq !== null ? ` · MOQ ${formatNumber(o.moq)}` : ""}
              </Muted>
              {url ? (
                <Body style={{ color: colors.primary, marginTop: spacing.xs }} accessibilityRole="link" onPress={() => void Linking.openURL(url)}>
                  Voir la source
                </Body>
              ) : null}
            </Card>
          );
        })
      )}
    </Screen>
  );
}
