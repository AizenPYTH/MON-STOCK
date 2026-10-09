import { Alert, View } from "react-native";
import Constants from "expo-constants";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "~/auth/session-provider";
import { signOut } from "~/auth/auth-service";
import { useActiveOrg } from "~/org/org-provider";
import { ROLE_LABEL } from "~/org/org-service";
import { appConfig } from "~/lib/config";
import { Badge, Body, Button, Card, Chip, Muted, Row, Screen, SectionTitle, Title } from "~/ui/components";
import { spacing } from "~/ui/theme";

export default function SettingsScreen() {
  const user = useUser();
  const { active, memberships, setActive, permissions } = useActiveOrg();
  const queryClient = useQueryClient();
  const host = appConfig.ok ? new URL(appConfig.config.supabaseUrl).host : "—";

  function confirmSignOut() {
    Alert.alert("Se déconnecter ?", "La session sera retirée de cet appareil.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Se déconnecter",
        style: "destructive",
        onPress: async () => {
          await signOut();
          queryClient.clear();
        },
      },
    ]);
  }

  return (
    <Screen>
      <Title>Réglages</Title>
      <SectionTitle>Compte</SectionTitle>
      <Card>
        <Body>{user?.email ?? "—"}</Body>
        <Muted>{user?.email_confirmed_at ? "Email confirmé" : "Email non confirmé"}</Muted>
      </Card>

      <SectionTitle>Organisation active</SectionTitle>
      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <Body style={{ fontWeight: "700", flex: 1 }}>{active.organization.name}</Body>
          <Badge label={ROLE_LABEL[active.role]} tone={permissions.canWrite ? "info" : "neutral"} />
        </Row>
        <Muted>Devise : {active.organization.currency}{active.organization.isDemo ? " · Organisation DÉMO (données fictives signalées)" : ""}</Muted>
        {memberships.length > 1 ? (
          <>
            <Muted style={{ marginTop: spacing.md }}>Changer d'organisation :</Muted>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
              {memberships.map((m) => (
                <Chip key={m.organization.id} label={m.organization.name} selected={m.organization.id === active.organization.id} onPress={() => void setActive(m.organization.id)} />
              ))}
            </View>
          </>
        ) : null}
      </Card>

      <SectionTitle>Intégrations</SectionTitle>
      <Card>
        <Body>eBay : connexion et synchronisation depuis l'application web (autorisation OAuth eBay). Amazon, Shopify, WooCommerce : disponible prochainement.</Body>
      </Card>

      <SectionTitle>Application</SectionTitle>
      <Card>
        <Muted>
          Version {Constants.expoConfig?.version ?? "—"} · Environnement {appConfig.ok ? appConfig.config.appEnv : "—"} · {host}
        </Muted>
        <Muted>Données protégées par la RLS Supabase : seules vos organisations sont accessibles.</Muted>
      </Card>

      <Button label="Se déconnecter" variant="danger" onPress={confirmSignOut} />
    </Screen>
  );
}
