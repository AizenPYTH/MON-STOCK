import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, MailQuestion } from "lucide-react-native";
import { useUser } from "~/auth/session-provider";
import { signOutAndPurge } from "~/auth/sign-out";
import { createOrganization } from "~/org/org-service";
import { requireSupabase } from "~/lib/supabase";
import { securePreferences } from "~/lib/secure-store";
import { userMessage } from "~/lib/errors";
import { openLegalPage } from "~/lib/legal";
import { AlertBanner, Button, Card, IconBadge, NightHeader, Screen, TextField, Txt } from "~/components/ui";
import { space } from "~/theme/tokens";

/**
 * Aucune organisation pour CE compte (M-05) : l'adresse connectée est affichée en premier, avec
 * l'avertissement « déjà client sur le site ? » — cause probable des « deux comptes » (inscription
 * sur l'iPhone avec une autre adresse). Ensuite : créer son organisation, ou rejoindre celle d'un
 * collègue par le lien d'invitation, se déconnecter (purge locale) ou supprimer ce compte.
 */
export function OnboardingScreen({ onCreated }: { onCreated: () => Promise<void> }) {
  const user = useUser();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!user || busy) return;
    setBusy(true);
    setError(null);
    try {
      const orgId = await createOrganization(requireSupabase(), { name });
      await securePreferences.setItem(`monstock.activeOrg.${user.id}`, orgId);
      await queryClient.invalidateQueries({ queryKey: ["memberships"] });
      await onCreated();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen header={<NightHeader over="Bienvenue" title="Aucune organisation pour ce compte" sub={user?.email ?? undefined} />}>
        <Card padded style={{ gap: space[3] }}>
          <View style={{ flexDirection: "row", gap: space[3], alignItems: "center" }}>
            <IconBadge icon={MailQuestion} tone="warning" />
            <Txt variant="headline" style={{ flex: 1 }}>
              Déjà client sur le site web ?
            </Txt>
          </View>
          <Txt variant="bodyRegular">
            Vous êtes connecté avec <Txt variant="body">{user?.email ?? "cette adresse"}</Txt>. Si vos données sont sur le site avec une autre adresse, ne créez pas d'organisation ici : déconnectez-vous et reconnectez-vous avec la même adresse que sur le site.
          </Txt>
          <Button label="Me reconnecter avec une autre adresse" variant="secondary" onPress={() => void signOutAndPurge(queryClient, { userId: user?.id })} testID="onboarding-sign-out" />
        </Card>

        <Card padded style={{ gap: space[3] }}>
          <View style={{ flexDirection: "row", gap: space[3], alignItems: "center" }}>
            <IconBadge icon={Building2} tone="info" />
            <Txt variant="headline" style={{ flex: 1 }}>
              Invité par un collègue ?
            </Txt>
          </View>
          <Txt variant="bodyRegular">Ouvrez le lien d'invitation reçu par e-mail (il s'ouvre sur le site web), acceptez-le avec cette même adresse, puis revenez ici : l'organisation apparaîtra.</Txt>
          <Button label="J'ai accepté l'invitation : actualiser" variant="secondary" compact onPress={() => void onCreated()} />
        </Card>

        <Card padded style={{ gap: space[4] }}>
          <Txt variant="headline">Créer votre organisation</Txt>
          <Txt variant="bodyRegular">Votre entreprise, dont vous serez le propriétaire.</Txt>
          {error ? <AlertBanner text={error} /> : null}
          <TextField label="Nom de l'organisation" value={name} onChangeText={setName} autoCapitalize="words" returnKeyType="done" onSubmitEditing={submit} testID="onboarding-name" />
          <Button label="Créer l'organisation" onPress={submit} loading={busy} disabled={name.trim().length < 2} testID="onboarding-create" />
        </Card>

        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space[2] }}>
          <Button label="Confidentialité" variant="ghost" compact onPress={() => void openLegalPage("privacy")} />
          <Button label="Aide" variant="ghost" compact onPress={() => void openLegalPage("support")} />
          <Button label="Supprimer ce compte" variant="ghost" compact onPress={() => router.push("/account-delete")} testID="onboarding-delete-account" />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
