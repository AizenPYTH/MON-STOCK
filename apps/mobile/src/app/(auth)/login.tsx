import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, type TextInput } from "react-native";
import { router } from "expo-router";
import { signIn, type FieldErrors } from "~/auth/auth-service";
import { AlertBanner, Button, Card, Screen, TextField, Txt } from "~/components/ui";
import { space } from "~/theme/tokens";

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
        <Txt variant="title1" style={{ marginTop: space[8] }} accessibilityRole="header">
          MON STOCK
        </Txt>
        <Txt variant="bodyRegular">Stock, ventes, sourcing et intelligence pour vendeurs multicanaux.</Txt>
        {error ? <AlertBanner text={error} /> : null}
        <Card padded style={{ gap: space[4] }}>
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
        <Button label="Mot de passe oublié ?" variant="ghost" onPress={() => router.push("/forgot-password")} />
        <Button label="Créer un compte" variant="secondary" onPress={() => router.push("/signup")} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
