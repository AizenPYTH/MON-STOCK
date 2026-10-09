import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, type TextInput } from "react-native";
import { Link } from "expo-router";
import { signIn, type FieldErrors } from "~/auth/auth-service";
import { Button, Card, Muted, Notice, Screen, TextField, Title } from "~/ui/components";
import { spacing } from "~/ui/theme";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldErrors>({});
  const passwordRef = useRef<TextInput>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const r = await signIn({ email, password });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      setFields(r.fieldErrors ?? {});
    }
    // Succès : la session change, la garde de navigation ouvre l'application.
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <Title subtitle="Stock, ventes, sourcing et intelligence pour vendeurs multicanaux.">MON STOCK</Title>
        <Card>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            error={fields.email}
            testID="login-email"
          />
          <TextField
            ref={passwordRef}
            label="Mot de passe"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
            error={fields.password}
            testID="login-password"
          />
          <Button label="Se connecter" onPress={submit} loading={busy} testID="login-submit" />
        </Card>
        <Link href="/forgot-password" style={{ marginTop: spacing.sm, paddingVertical: spacing.md }} accessibilityRole="link">
          <Muted>Mot de passe oublié ?</Muted>
        </Link>
        <Link href="/signup" style={{ paddingVertical: spacing.md }} accessibilityRole="link">
          <Muted>Pas encore de compte ? Créer un compte</Muted>
        </Link>
      </Screen>
    </KeyboardAvoidingView>
  );
}
