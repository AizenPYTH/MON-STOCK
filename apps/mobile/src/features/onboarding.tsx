import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "~/auth/session-provider";
import { signOut } from "~/auth/auth-service";
import { createOrganization } from "~/org/org-service";
import { requireSupabase } from "~/lib/supabase";
import { securePreferences } from "~/lib/secure-store";
import { userMessage } from "~/lib/errors";
import { AlertBanner, Button, Card, Screen, TextField, Txt } from "~/components/ui";
import { space } from "~/theme/tokens";

/**
 * Aucune organisation : créer la sienne (rôle propriétaire, fonction create_organization_with_owner)
 * ou rejoindre une organisation existante via le lien d'invitation reçu par email.
 */
export function OnboardingScreen({ onCreated }: { onCreated: () => Promise<void> }) {
  const user = useUser();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!user) return;
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
    <Screen>
      <Txt variant="title1" style={{ marginTop: space[6] }} accessibilityRole="header">
        Bienvenue
      </Txt>
      <Txt variant="bodyRegular">{user?.email}</Txt>
      {error ? <AlertBanner text={error} /> : null}
      <Card padded style={{ gap: space[4] }}>
        <Txt variant="bodyRegular">Créez votre organisation (votre entreprise) pour commencer. Vous en serez le propriétaire.</Txt>
        <TextField label="Nom de l'organisation" value={name} onChangeText={setName} autoCapitalize="words" returnKeyType="done" onSubmitEditing={submit} />
        <Button label="Créer l'organisation" onPress={submit} loading={busy} />
      </Card>
      <Card padded style={{ gap: space[3] }}>
        <Txt variant="bodyRegular">Invité par un collègue ? Ouvrez le lien d'invitation reçu par email depuis l'application web MON STOCK, puis revenez ici.</Txt>
        <Button label="Se déconnecter" variant="secondary" onPress={() => void signOut()} />
      </Card>
    </Screen>
  );
}
