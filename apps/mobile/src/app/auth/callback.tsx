import { useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { completeAuthCallback } from "~/auth/auth-service";
import { userMessage } from "~/lib/errors";
import { Button, Card, LoadingState, Notice, Screen, Title } from "~/ui/components";

/** Retour d'un lien email (monstock://auth/callback?code=…) : échange PKCE puis redirection interne. */
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ code?: string; error_code?: string; error_description?: string; next?: string }>();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    completeAuthCallback(params)
      .then((r) => {
        if (r.ok) router.replace(r.next === "/update-password" ? "/update-password" : "/dashboard");
        else setError(r.error);
      })
      .catch((e) => setError(userMessage(e)));
  }, [params]);

  if (!error) return <LoadingState label="Validation du lien…" />;
  return (
    <Screen>
      <Title>Lien non valide</Title>
      <Card>
        <Notice tone="danger">{error}</Notice>
        <Button label="Retour à la connexion" onPress={() => router.replace("/login")} />
      </Card>
    </Screen>
  );
}
