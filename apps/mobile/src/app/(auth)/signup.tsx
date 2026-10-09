import { useState } from "react";
import { KeyboardAvoidingView, Platform } from "react-native";
import { Link } from "expo-router";
import { signUp, type FieldErrors } from "~/auth/auth-service";
import { Body, Button, Card, Muted, Notice, Screen, TextField, Title } from "~/ui/components";
import { spacing } from "~/ui/theme";

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
        <Title>Confirmez votre email</Title>
        <Card>
          <Body>
            Un lien de confirmation a été envoyé à {sentTo}. Ouvrez-le sur CE téléphone : il rouvrira MON STOCK et vous connectera.
          </Body>
        </Card>
        <Link href="/login" style={{ paddingVertical: spacing.md }}>
          <Muted>Retour à la connexion</Muted>
        </Link>
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <Title subtitle="Votre compte donne accès à vos organisations MON STOCK.">Créer un compte</Title>
        <Card>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <TextField label="Nom complet" value={fullName} onChangeText={setFullName} autoComplete="name" textContentType="name" error={fields.full_name} />
          <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" error={fields.email} />
          <TextField
            label="Mot de passe"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            hint="8 caractères minimum."
            error={fields.password}
          />
          <Button label="Créer mon compte" onPress={submit} loading={busy} />
        </Card>
        <Link href="/login" style={{ paddingVertical: spacing.md }}>
          <Muted>Déjà un compte ? Se connecter</Muted>
        </Link>
      </Screen>
    </KeyboardAvoidingView>
  );
}
