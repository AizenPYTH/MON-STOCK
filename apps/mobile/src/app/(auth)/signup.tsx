import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, type TextInput } from "react-native";
import { router } from "expo-router";
import { signUp, type FieldErrors } from "~/auth/auth-service";
import { AlertBanner, Button, Card, DetailHeader, Screen, TextField, Txt } from "~/components/ui";
import { LegalFooter } from "~/components/legal-footer";
import { openLegalPage } from "~/lib/legal";
import { color, space } from "~/theme/tokens";

export default function SignupScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldErrors>({});
  const [sentTo, setSentTo] = useState<string | null>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

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
        <AlertBanner text="Déjà client sur le site web ? Ne créez pas de second compte : connectez-vous avec la même adresse e-mail." onPress={() => router.replace("/login")} />
        {error ? <AlertBanner text={error} /> : null}
        <Card padded style={{ gap: space[4] }}>
          <TextField label="Nom complet" value={fullName} onChangeText={setFullName} autoComplete="name" textContentType="name" returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()} error={fields.full_name} />
          <TextField ref={emailRef} label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} error={fields.email} />
          <TextField ref={passwordRef} label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" returnKeyType="go" onSubmitEditing={submit} hint="8 caractères minimum." error={fields.password} />
          <Txt variant="label">
            En créant un compte, vous acceptez les{" "}
            <Txt variant="label" color={color.ink} style={{ textDecorationLine: "underline" }} accessibilityRole="link" onPress={() => void openLegalPage("terms")}>
              conditions d'utilisation
            </Txt>{" "}
            et la{" "}
            <Txt variant="label" color={color.ink} style={{ textDecorationLine: "underline" }} accessibilityRole="link" onPress={() => void openLegalPage("privacy")}>
              politique de confidentialité
            </Txt>
            .
          </Txt>
          <Button label="Créer mon compte" onPress={submit} loading={busy} />
        </Card>
        <LegalFooter />
      </Screen>
    </KeyboardAvoidingView>
  );
}
