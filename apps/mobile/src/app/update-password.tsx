import { useState } from "react";
import { View } from "react-native";
import { Redirect, router } from "expo-router";
import { useSession } from "~/auth/session-provider";
import { updatePassword, type FieldErrors } from "~/auth/auth-service";
import { AlertBanner, Button, Card, Screen, TextField, Txt } from "~/components/ui";
import { color, space } from "~/theme/tokens";

/** Nouveau mot de passe (après le lien « mot de passe oublié », qui ouvre une session de récupération). */
export default function UpdatePasswordScreen() {
  const session = useSession();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldErrors>({});

  if (session.status === "loading") return <View style={{ flex: 1, backgroundColor: color.bg }} />;
  if (session.status === "signedOut") return <Redirect href="/login" />;

  async function submit() {
    setBusy(true);
    setError(null);
    const r = await updatePassword({ password, confirm });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      setFields(r.fieldErrors ?? {});
      return;
    }
    router.replace("/intelligence");
  }

  return (
    <Screen>
      <Txt variant="title2" style={{ marginTop: space[6] }} accessibilityRole="header">
        Nouveau mot de passe
      </Txt>
      {error ? <AlertBanner text={error} /> : null}
      <Card padded style={{ gap: space[4] }}>
        <TextField label="Nouveau mot de passe" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" error={fields.password} />
        <TextField label="Confirmation" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" error={fields.confirm} />
        <Button label="Enregistrer" onPress={submit} loading={busy} />
      </Card>
    </Screen>
  );
}
