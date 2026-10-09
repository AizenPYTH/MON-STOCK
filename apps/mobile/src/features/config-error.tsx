import { Body, Card, Muted, Notice, Screen, Title } from "~/ui/components";

/** Configuration absente ou invalide : écran explicite (jamais d'application à moitié fonctionnelle). */
export function ConfigErrorScreen({ issues }: { issues: string[] }) {
  return (
    <Screen>
      <Title>Configuration incomplète</Title>
      <Card>
        <Notice tone="danger" title="L'application ne peut pas se connecter à MON STOCK.">
          {issues.join("\n")}
        </Notice>
        <Body>Renseignez EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (fichier .env.local en développement, variables d'environnement EAS pour les builds).</Body>
        <Muted style={{ marginTop: 8 }}>Ces valeurs sont publiques ; ne mettez jamais la clé service_role dans l'application.</Muted>
      </Card>
    </Screen>
  );
}
