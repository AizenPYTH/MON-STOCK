import { Alert, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "~/auth/session-provider";
import { signOut } from "~/auth/auth-service";
import { useActiveOrg } from "~/org/org-provider";
import { ROLE_LABEL } from "~/org/org-service";
import { appConfig } from "~/lib/config";
import { Avatar, Button, Card, DetailHeader, ListRow, Screen, SectionHeader, StatusChip, Txt, initialsOf, useToast } from "~/components/ui";
import { space } from "~/theme/tokens";

/** Compte, organisation active (changement par appareil), intégrations, déconnexion. */
export default function SettingsScreen() {
  const user = useUser();
  const { active, memberships, setActive, permissions } = useActiveOrg();
  const queryClient = useQueryClient();
  const toast = useToast();
  const host = appConfig.ok ? new URL(appConfig.config.supabaseUrl).host : "—";
  const fullName = (user?.user_metadata as { full_name?: string } | undefined)?.full_name ?? null;

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
      <DetailHeader parentLabel="Intelligence" />
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
        <Avatar initials={initialsOf(fullName ?? user?.email)} size={48} />
        <View style={{ flex: 1 }}>
          <Txt variant="title2">{fullName ?? "Mon compte"}</Txt>
          <Txt variant="label">
            {user?.email ?? "—"} · {user?.email_confirmed_at ? "email confirmé" : "email non confirmé"}
          </Txt>
        </View>
      </View>

      <SectionHeader title="Organisation" />
      <Card>
        {memberships.map((m, i) => {
          const selected = m.organization.id === active.organization.id;
          return (
            <ListRow
              key={m.organization.id}
              title={m.organization.name}
              subtitle={`${ROLE_LABEL[m.role]} · ${m.organization.currency}${m.organization.isDemo ? " · démo" : ""}`}
              right={selected ? <StatusChip label="Active" tone="dark" /> : undefined}
              onPress={
                selected
                  ? undefined
                  : () =>
                      void setActive(m.organization.id).then(() => toast({ text: `Organisation active : ${m.organization.name}` }))
              }
              last={i === memberships.length - 1}
            />
          );
        })}
      </Card>
      {!permissions.canWrite ? <Txt variant="label">Rôle lecture seule : consultation uniquement.</Txt> : null}

      <SectionHeader title="Intégrations" />
      <Card>
        <ListRow title="eBay" subtitle="Connexion du compte vendeur, synchronisation, erreurs" chevron onPress={() => router.push("/ebay")} />
        <ListRow title="Sources fournisseurs" subtitle="Sources vérifiées pour la recherche d'offres" chevron onPress={() => router.push("/sourcing-sources")} last />
      </Card>
      <Txt variant="label">Amazon, Shopify et WooCommerce : disponibles prochainement (non connectables pour l'instant).</Txt>

      <SectionHeader title="Application" />
      <Card padded>
        <Txt variant="label">
          Version {Constants.expoConfig?.version ?? "—"} · environnement {appConfig.ok ? appConfig.config.appEnv : "—"} · {host}
        </Txt>
        <Txt variant="label">Vos données sont protégées par les règles d'accès de la base (RLS) : seules vos organisations sont lisibles.</Txt>
      </Card>

      <Button label="Se déconnecter" variant="secondary" onPress={confirmSignOut} />
    </Screen>
  );
}
