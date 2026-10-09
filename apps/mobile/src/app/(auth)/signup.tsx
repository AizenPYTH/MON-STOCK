import { useState } from "react";
import { KeyboardAvoidingView, Platform } from "react-native";
import { router } from "expo-router";
import { signUp, type FieldErrors } from "~/auth/auth-service";
import { AlertBanner, Button, Card, DetailHeader, Screen, TextField, Txt } from "~/components/ui";
import { space } from "~/theme/tokens";

export default function SignupScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldErrors>({});
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const r = await signUp({ email, password, full_name: fullName });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      setFields(r.fieldErrors ?? {});
      return;
    }
    if (r.data.needsConfirmation) setSentTo(email.trim().toLowerCase());
  }

  if (sentTo) {
    return (
      <Screen>
        <DetailHeader parentLabel="Connexion" onBack={() => router.replace("/login")} />
        <Txt variant="title2">Confirmez votre email</Txt>
        <Card padded>
          <Txt variant="bodyRegular">Un lien de confirmation a été envoyé à {sentTo}. Ouvrez-le sur CE téléphone : il rouvrira MON STOCK et vous connectera.</Txt>
        </Card>
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <DetailHeader parentLabel="Connexion" />
        <Txt variant="title2" accessibilityRole="header">
          Créer un compte
        </Txt>
        {error ? <AlertBanner text={error} /> : null}
        <Card padded style={{ gap: space[4] }}>
          <TextField label="Nom complet" value={fullName} onChangeText={setFullName} autoComplete="name" textContentType="name" error={fields.full_name} />
          <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" error={fields.email} />
          <TextField label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" hint="8 caractères minimum." error={fields.password} />
          <Button label="Créer mon compte" onPress={submit} loading={busy} />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}
