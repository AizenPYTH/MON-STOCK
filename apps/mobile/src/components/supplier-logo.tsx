import { useState } from "react";
import { Image, View } from "react-native";
import { initialsOf } from "@/domain/sourcing/pro-accounts";
import { SUPPLIER_LOGOS } from "~/data/supplier-logos.generated";
import { Txt } from "~/components/ui";
import { color } from "~/theme/tokens";

/** Logo officiel embarqué pour un domaine (registre généré depuis les sites des fournisseurs), sinon null. */
export function bundledLogo(domain: string | null | undefined) {
  if (!domain) return null;
  const d = domain.toLowerCase().replace(/^www\./, "");
  return SUPPLIER_LOGOS[d] ?? SUPPLIER_LOGOS[d.split(".").slice(-2).join(".")] ?? null;
}

/**
 * Sans domaine connu (offres du radar, imports) : logo dont le PREMIER libellé de domaine est
 * exactement le nom du fournisseur (« Foxway » → foxway.*). Aucune correspondance approximative.
 */
export function logoByName(name: string | null | undefined) {
  const slug = (shortName(name ?? "")).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  if (slug.length < 3) return null;
  for (const [domain, logo] of Object.entries(SUPPLIER_LOGOS)) if (domain.split(".")[0]!.replace(/[^a-z0-9]/g, "") === slug) return logo;
  return null;
}

function shortName(name: string) {
  return name.split(/\s+[—–-]\s+/)[0]!.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/**
 * Logo d'identification d'un fournisseur : l'icône officielle récupérée sur SON site et embarquée
 * dans l'application (aucun appel à un service tiers à l'affichage). Posée sur une plaque claire
 * pour rester lisible quel que soit le fond ; à défaut, les initiales du fournisseur. Les logos
 * restent la propriété de leurs titulaires et n'indiquent aucun partenariat.
 */
export function SupplierLogo({ domain, name, size = 36 }: { domain: string | null | undefined; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const logo = failed ? null : (bundledLogo(domain) ?? logoByName(name));
  const radius = Math.round(size * 0.28);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: radius, backgroundColor: logo ? "#FFFFFF" : color.brandSoft, borderWidth: 1, borderColor: color.line, alignItems: "center", justifyContent: "center", overflow: "hidden" }}
      testID={logo ? "supplier-logo-image" : "supplier-logo-initials"}
    >
      {logo ? (
        <Image source={logo.image} style={{ width: size * 0.72, height: size * 0.72 }} resizeMode="contain" onError={() => setFailed(true)} />
      ) : (
        <Txt variant="label" style={{ fontSize: Math.max(10, Math.round(size * 0.34)), color: color.ink, fontFamily: "Manrope_700Bold" }}>
          {initialsOf(name)}
        </Txt>
      )}
    </View>
  );
}
