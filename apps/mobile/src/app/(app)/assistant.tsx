import { Redirect } from "expo-router";

/** L'ancien assistant « Intelligence » est devenu le conseiller (texte + voix, actions à confirmer). */
export default function AssistantRedirect() {
  return <Redirect href="/advisor" />;
}
