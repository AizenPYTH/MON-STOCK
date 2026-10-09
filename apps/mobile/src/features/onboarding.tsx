import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "~/auth/session-provider";
import { signOut } from "~/auth/auth-service";
import { createOrganization } from "~/org/org-service";
import { requireSupabase } from "~/lib/supabase";
import { securePreferences } from "~/lib/secure-store";
import { userMessage } from "~/lib/errors";
import { Body, Button, Card, Notice, Screen, TextField, Title } from "~/ui/components";

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
      <Title subtitle={user?.email ?? undefined}>Bienvenue sur MON STOCK</Title>
      <Card>
        <Body>Créez votre organisation (votre entreprise) pour commencer. Vous en serez le propriétaire.</Body>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <TextField label="Nom de l'organisation" value={name} onChangeText={setName} autoCapitalize="words" returnKeyType="done" onSubmitEditing={submit} />
        <Button label="Créer l'organisation" onPress={submit} loading={busy} />
      </Card>
      <Card>
        <Body>Invité par un collègue ? Ouvrez le lien d'invitation reçu par email depuis l'application web MON STOCK, puis revenez ici.</Body>
        <Button label="Se déconnecter" variant="secondary" onPress={() => void signOut()} />
      </Card>
    </Screen>
  );
}
