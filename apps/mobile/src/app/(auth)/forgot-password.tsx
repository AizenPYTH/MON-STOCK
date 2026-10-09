import { useState } from "react";
import { Link } from "expo-router";
import { requestPasswordReset, type FieldErrors } from "~/auth/auth-service";
import { Body, Button, Card, Muted, Notice, Screen, TextField, Title } from "~/ui/components";
import { spacing } from "~/ui/theme";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldErrors>({});
  const [sent, setSent] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const r = await requestPasswordReset({ email });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      setFields(r.fieldErrors ?? {});
      return;
    }
    setSent(true);
  }

  return (
    <Screen>
      <Title subtitle="Recevez un lien pour choisir un nouveau mot de passe.">Mot de passe oublié</Title>
      <Card>
        {sent ? (
          <Body>Si un compte existe pour cette adresse, un email vient d'être envoyé. Ouvrez le lien sur ce téléphone (il expire rapidement et ne sert qu'une fois).</Body>
        ) : (
          <>
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" error={fields.email} />
            <Button label="Envoyer le lien" onPress={submit} loading={busy} />
          </>
        )}
      </Card>
      <Link href="/login" style={{ paddingVertical: spacing.md }}>
        <Muted>Retour à la connexion</Muted>
      </Link>
    </Screen>
  );
}
