import { Redirect } from "expo-router";
import { useSession } from "~/auth/session-provider";
import { LoadingState } from "~/ui/components";

/** Point d'entrée : session restaurée → application, sinon connexion. */
export default function Index() {
  const session = useSession();
  if (session.status === "loading") return <LoadingState label="Ouverture de MON STOCK…" />;
  return <Redirect href={session.status === "signedIn" ? "/dashboard" : "/login"} />;
}
