import { View } from "react-native";
import { Sparkles } from "lucide-react-native";
import { openLegalPage } from "~/lib/legal";
import { BottomSheet, Button, Card, Txt } from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";

/** Ce qui part chez le fournisseur d'IA — texte unique, versionné par AI_CONSENT_VERSION (lib/ai-consent.ts). */
export const AI_CONSENT_POINTS = [
  "votre question, ou la phrase que vous dictez une fois transcrite en texte ;",
  "les données de votre organisation utiles à la réponse : ventes, stock, prix, commandes — elles peuvent contenir le nom ou la ville d'acheteurs eBay ;",
  "le texte des réponses que vous faites lire à voix haute.",
];

export function AiConsentContent() {
  return (
    <View style={{ gap: space[3] }}>
      <Txt variant="bodyRegular">
        Le conseiller, le brouillon de produit par IA et la voix de synthèse envoient au serveur MON STOCK puis à <Txt variant="body">OpenAI (États-Unis)</Txt>, notre sous-traitant :
      </Txt>
      {AI_CONSENT_POINTS.map((p) => (
        <View key={p} style={{ flexDirection: "row", gap: space[3] }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 8, backgroundColor: color.ink3 }} />
          <Txt variant="bodyRegular" style={{ flex: 1 }}>
            {p}
          </Txt>
        </View>
      ))}
      <Txt variant="bodyRegular">Ni votre mot de passe, ni vos jetons eBay, ni vos identifiants fournisseurs ne sont transmis. Sans votre accord, ces fonctions restent désactivées ; le reste de l'application fonctionne normalement. Vous pouvez retirer cet accord à tout moment dans Réglages.</Txt>
      <Txt variant="label">La dictée utilise la reconnaissance vocale d'Apple : iOS vous demande son autorisation séparément.</Txt>
    </View>
  );
}

/** Carte pleine (écran du conseiller tant que l'accord n'est pas donné). */
export function AiConsentCard({ onAccept, onDecline, declineLabel = "Pas maintenant" }: { onAccept: () => void; onDecline?: () => void; declineLabel?: string }) {
  return (
    <Card padded style={{ gap: space[4] }} testID="ai-consent">
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
        <View style={{ width: 40, height: 40, borderRadius: radius.lg, backgroundColor: color.brand, alignItems: "center", justifyContent: "center" }}>
          <Sparkles size={20} color={color.mint} strokeWidth={2} />
        </View>
        <Txt variant="headline" accessibilityRole="header" style={{ flex: 1 }}>
          Votre accord avant d'utiliser l'IA
        </Txt>
      </View>
      <AiConsentContent />
      <Button label="J'accepte" onPress={onAccept} testID="ai-consent-accept" />
      {onDecline ? <Button label={declineLabel} variant="ghost" onPress={onDecline} testID="ai-consent-decline" /> : null}
      <Button label="Politique de confidentialité" variant="ghost" compact onPress={() => void openLegalPage("privacy")} />
    </Card>
  );
}

/** Feuille de consentement (brouillon de produit, voix de synthèse). */
export function AiConsentSheet({ visible, onAccept, onClose }: { visible: boolean; onAccept: () => void; onClose: () => void }) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Votre accord avant d'utiliser l'IA">
      <AiConsentContent />
      <Button label="J'accepte" onPress={onAccept} testID="ai-consent-accept" />
      <Button label="Pas maintenant" variant="ghost" onPress={onClose} testID="ai-consent-decline" />
    </BottomSheet>
  );
}
