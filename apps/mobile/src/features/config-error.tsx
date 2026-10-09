import { AlertBanner, Card, Screen, Txt } from "~/components/ui";
import { space } from "~/theme/tokens";

/** Configuration absente ou invalide : écran explicite (jamais d'application à moitié fonctionnelle). */
export function ConfigErrorScreen({ issues }: { issues: string[] }) {
  return (
    <Screen>
      <Txt variant="title2" style={{ marginTop: space[6] }} accessibilityRole="header">
        Configuration incomplète
      </Txt>
      <AlertBanner text={`L'application ne peut pas se connecter à MON STOCK : ${issues.join(" ")}`} />
      <Card padded style={{ gap: space[2] }}>
        <Txt variant="bodyRegular">Renseignez EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (fichier .env.local en développement, variables d'environnement EAS pour les builds).</Txt>
        <Txt variant="label">Ces valeurs sont publiques ; ne mettez jamais la clé service_role dans l'application.</Txt>
      </Card>
    </Screen>
  );
}
