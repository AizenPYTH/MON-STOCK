import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { completeAuthCallback } from "~/auth/auth-service";
import { userMessage } from "~/lib/errors";
import { Button, ErrorState, Screen, Skeleton, Txt } from "~/components/ui";
import { color } from "~/theme/tokens";

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
        if (r.ok) router.replace(r.next === "/update-password" ? "/update-password" : "/intelligence");
        else setError(r.error);
      })
      .catch((e) => setError(userMessage(e)));
  }, [params]);

  if (!error)
    return (
      <View style={{ flex: 1, backgroundColor: color.bg, alignItems: "center", justifyContent: "center", gap: 12 }} accessibilityLabel="Validation du lien">
        <Skeleton w={160} h={14} />
        <Txt variant="label">Validation du lien…</Txt>
      </View>
    );
  return (
    <Screen>
      <Txt variant="title2" style={{ marginTop: 32 }}>
        Lien non valide
      </Txt>
      <ErrorState title="Impossible de valider le lien" description={error} />
      <Button label="Retour à la connexion" onPress={() => router.replace("/login")} />
    </Screen>
  );
}
