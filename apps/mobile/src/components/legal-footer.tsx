import { View } from "react-native";
import { LEGAL_PAGES, openLegalPage } from "~/lib/legal";
import { Button } from "~/components/ui";
import { space } from "~/theme/tokens";

/** Liens Confidentialité / Conditions / Mentions / Aide (M-06), ouverts dans Safari intégré. */
export function LegalFooter() {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: space[1] }} accessibilityRole="none">
      {LEGAL_PAGES.map((p) => (
        <Button key={p.key} label={p.key === "privacy" ? "Confidentialité" : p.key === "terms" ? "Conditions" : p.key === "notice" ? "Mentions légales" : "Aide"} variant="ghost" compact onPress={() => void openLegalPage(p.key)} accessibilityHint={`Ouvre « ${p.label} » dans le navigateur`} testID={`legal-${p.key}`} />
      ))}
    </View>
  );
}
