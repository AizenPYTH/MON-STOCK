import { useState } from "react";
import { Image, View } from "react-native";
import { initialsOf, logoUrlFor } from "@/domain/sourcing/pro-accounts";
import { Txt } from "~/components/ui";
import { color } from "~/theme/tokens";

/**
 * Logo d'identification d'un fournisseur : l'icône publiée par son propre site (favicon). À défaut
 * (pas de site, image indisponible ou hors ligne), ses initiales. Les logos restent la propriété de
 * leurs titulaires et n'indiquent aucun partenariat.
 */
export function SupplierLogo({ domain, name, size = 36 }: { domain: string | null | undefined; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const uri = failed ? null : logoUrlFor(domain, size >= 48 ? 128 : 64);
  const radius = Math.round(size * 0.28);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: radius, backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, alignItems: "center", justifyContent: "center", overflow: "hidden" }}
      testID={uri ? "supplier-logo-image" : "supplier-logo-initials"}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size * 0.7, height: size * 0.7 }} resizeMode="contain" onError={() => setFailed(true)} />
      ) : (
        <Txt variant="label" style={{ fontSize: Math.max(10, Math.round(size * 0.34)), color: color.ink2 }}>
          {initialsOf(name)}
        </Txt>
      )}
    </View>
  );
}
