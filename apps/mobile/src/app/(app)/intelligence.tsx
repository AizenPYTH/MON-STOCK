import { Redirect } from "expo-router";

/** Ancienne adresse de l'onglet « Intelligence » (renommé « Aujourd'hui ») : liens conservés. */
export default function IntelligenceRedirect() {
  return <Redirect href="/today" />;
}
