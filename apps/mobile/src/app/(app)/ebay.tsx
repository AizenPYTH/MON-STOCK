import { RefreshControl, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { CircleAlert, CircleCheck, RefreshCw } from "lucide-react-native";
import type { IntegrationDTO } from "@/features/mobile-api/contract";
import { useActiveOrg } from "~/org/org-provider";
import { useConnectEbay, useIntegrations, useSyncEbay } from "~/data/hooks";
import { userMessage } from "~/lib/errors";
import { formatDateTime, formatNumber } from "~/lib/format";
import { AlertBanner, Button, Card, DetailHeader, ErrorState, Screen, SectionHeader, Skeleton, StatusChip, Txt, useToast } from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";

const CONNECTION_STATUS: Record<string, { label: string; tone: "success" | "danger" | "accent" | "neutral" }> = {
  active: { label: "Connectée", tone: "success" },
  connected: { label: "Connectée", tone: "success" },
  expired: { label: "Expirée — reconnectez", tone: "danger" },
  error: { label: "Erreur", tone: "danger" },
  disconnected: { label: "Déconnectée", tone: "neutral" },
  pending: { label: "En cours", tone: "accent" },
};

const RUN_STATUS: Record<string, string> = { success: "réussie", partial: "partielle", failed: "échouée", running: "en cours" };

/**
 * eBay : connexion OAuth au compte vendeur (autorisation chez eBay, jamais de mot de passe ici),
 * synchronisation réelle (annonces, commandes, stock) par le serveur, état et erreurs affichés tels
 * qu'enregistrés. Rien n'est simulé : sans clés d'application sur le serveur, la connexion est
 * impossible et l'écran le dit.
 */
export default function EbayScreen() {
  const q = useIntegrations();
  const connect = useConnectEbay();
  const sync = useSyncEbay();
  const toast = useToast();
  const { permissions } = useActiveOrg();

  if (q.isPending)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Retour" />
        <Skeleton w="100%" h={160} r={radius.xl} />
      </Screen>
    );
  if (q.isError)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Retour" />
        <ErrorState description={userMessage(q.error)} onRetry={() => void q.refetch()} />
      </Screen>
    );

  const d = q.data;
  const ebayConnections = d.connections.filter((c) => c.provider === "ebay" && c.status !== "disconnected");

  function doConnect() {
    connect.mutate(undefined, {
      onSuccess: (r) => {
        if (!r) return; // fenêtre eBay fermée : rien n'a été créé
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        toast({ text: r.sync ? `eBay connecté (${r.username ?? "compte vendeur"}) — synchronisation ${RUN_STATUS[r.sync.status] ?? r.sync.status}` : `eBay connecté. Synchronisation : ${r.syncError ?? "à relancer"}` });
      },
      onError: (e) => toast({ text: userMessage(e), tone: "error" }),
    });
  }

  function doSync(c: IntegrationDTO) {
    sync.mutate(c.connectionId, {
      onSuccess: (r) => toast({ text: `Synchronisation ${RUN_STATUS[r.status] ?? r.status} : ${r.summary}` }),
      onError: (e) => toast({ text: userMessage(e), tone: "error" }),
    });
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <DetailHeader parentLabel="Retour" />
      <View style={{ gap: 4 }}>
        <Txt variant="title2" accessibilityRole="header">
          eBay
        </Txt>
        <Txt variant="label">Annonces, commandes et quantités synchronisées par le serveur MON STOCK. Les ventes déduisent le stock une seule fois (protection contre les doubles traitements).</Txt>
      </View>

      {!d.ebay.configured ? (
        <Card padded style={{ gap: space[2] }}>
          <View style={{ flexDirection: "row", gap: space[2], alignItems: "center" }}>
            <CircleAlert size={18} color={color.accent} />
            <Txt variant="body">Intégration eBay pas encore configurée sur le serveur</Txt>
          </View>
          <Txt variant="bodyRegular">
            Les clés de l'application eBay (App ID, Cert ID, RuName) doivent être enregistrées dans les secrets du serveur. Tant qu'elles manquent, aucune connexion n'est possible — rien n'est simulé.
          </Txt>
        </Card>
      ) : null}

      {ebayConnections.length === 0 ? (
        <Card padded style={{ gap: space[3] }}>
          <Txt variant="body">Aucun compte eBay connecté</Txt>
          <Txt variant="bodyRegular">La connexion ouvre la page officielle d'eBay : vous y saisissez vos identifiants et autorisez MON STOCK (lecture des annonces et commandes, mise à jour des quantités).</Txt>
          <Button
            label={permissions.isAdmin ? "Connecter mon compte eBay" : "Réservé aux administrateurs"}
            disabled={!d.ebay.configured || !permissions.isAdmin}
            loading={connect.isPending}
            onPress={doConnect}
            testID="ebay-connect"
          />
        </Card>
      ) : (
        <>
          <SectionHeader title="Compte connecté" />
          {ebayConnections.map((c) => {
            const st = CONNECTION_STATUS[c.status] ?? { label: c.status, tone: "neutral" as const };
            return (
              <Card key={c.connectionId} padded style={{ gap: space[3] }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space[3] }}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="body">{c.externalUsername ?? c.channelName}</Txt>
                    <Txt variant="label">{c.environment === "sandbox" ? "Environnement de test eBay (sandbox)" : "Production"}</Txt>
                  </View>
                  <StatusChip label={st.label} tone={st.tone} />
                </View>
                <View style={{ gap: 4 }}>
                  <Txt variant="label">Dernière synchronisation réussie : {c.lastSuccessfulSyncAt ? formatDateTime(c.lastSuccessfulSyncAt) : "jamais"}</Txt>
                  {c.lastRun ? (
                    <Txt variant="label">
                      Dernier passage : {formatDateTime(c.lastRun.startedAt)} · {RUN_STATUS[c.lastRun.status] ?? c.lastRun.status}
                      {c.lastRun.errorCount > 0 ? ` · ${formatNumber(c.lastRun.errorCount)} erreur(s)` : ""}
                    </Txt>
                  ) : null}
                  <Txt variant="label">Synchronisation automatique : {c.autoSync ? "activée (toutes les 15 min)" : "désactivée"}</Txt>
                </View>
                {c.lastError ? <AlertBanner text={`Dernière erreur : ${c.lastError}`} /> : (
                  <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                    <CircleCheck size={16} color={color.success} />
                    <Txt variant="label" color={color.success}>Aucune erreur enregistrée</Txt>
                  </View>
                )}
                <View style={{ flexDirection: "row", gap: space[2] }}>
                  <Button label="Synchroniser maintenant" loading={sync.isPending} disabled={!permissions.canWrite} onPress={() => doSync(c)} style={{ flex: 1 }} testID="ebay-sync" />
                  {c.status === "expired" && permissions.isAdmin ? <Button label="Reconnecter" variant="secondary" loading={connect.isPending} onPress={doConnect} style={{ flex: 1 }} /> : null}
                </View>
              </Card>
            );
          })}
          {d.unmappedCount > 0 ? (
            <AlertBanner
              text={`${formatNumber(d.unmappedCount)} annonce${d.unmappedCount > 1 ? "s" : ""} eBay non associée${d.unmappedCount > 1 ? "s" : ""} à un SKU : leurs ventes ne déduisent pas le stock. Associez-les dans Ventes → Annonces.`}
              onPress={() => router.push({ pathname: "/sales", params: { segment: "listings" } })}
            />
          ) : null}
        </>
      )}
      <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
        <RefreshCw size={14} color={color.ink3} />
        <Txt variant="label">Tirez vers le bas pour actualiser l'état.</Txt>
      </View>
      {d.comingSoon.length > 0 ? <Txt variant="label">Prochainement : {d.comingSoon.join(", ")} (non connectables pour l'instant).</Txt> : null}
    </Screen>
  );
}
