import { useState } from "react";
import { requestPasswordReset, type FieldErrors } from "~/auth/auth-service";
import { AlertBanner, Button, Card, DetailHeader, Screen, TextField, Txt } from "~/components/ui";
import { space } from "~/theme/tokens";

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
      <DetailHeader parentLabel="Connexion" />
      <Txt variant="title2" accessibilityRole="header">
        Mot de passe oublié
      </Txt>
      {error ? <AlertBanner text={error} /> : null}
      <Card padded style={{ gap: space[4] }}>
        {sent ? (
          <Txt variant="bodyRegular">Si un compte existe pour cette adresse, un email vient d'être envoyé. Ouvrez le lien sur ce téléphone (il expire rapidement et ne sert qu'une fois).</Txt>
        ) : (
          <>
            <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" error={fields.email} />
            <Button label="Envoyer le lien" onPress={submit} loading={busy} />
          </>
        )}
      </Card>
    </Screen>
  );
}
