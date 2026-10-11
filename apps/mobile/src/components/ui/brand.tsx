import { Image, View } from "react-native";
import { Package, Radar, Store, Truck, type LucideIcon } from "lucide-react-native";
import { BRAND_DISCLAIMER, canShowLogo, type BrandEntry, type BrandKind } from "~/brands/registry";
import { color, radius, space } from "~/theme/tokens";
import { Txt } from "~/components/ui/text";

/**
 * Identité d'une marque tierce (canal de vente, transporteur, plateforme d'expédition, suivi).
 *
 * - Logo officiel uniquement si le registre l'autorise (`canShowLogo`) : ratio d'origine respecté,
 *   jamais recoloré ni déformé, posé sur une plaque claire si la marque l'exige.
 * - Sinon : présentation typographique NEUTRE (police et couleurs de l'application) avec une
 *   icône générique selon le type de service. Aucune couleur de marque, aucune imitation.
 * Le nom reste toujours lisible (et annoncé par le lecteur d'écran).
 */

const KIND_ICON: Record<BrandKind, LucideIcon> = { marketplace: Store, carrier: Truck, shipping_platform: Package, tracking: Radar };
const KIND_LABEL: Record<BrandKind, string> = { marketplace: "canal de vente", carrier: "transporteur", shipping_platform: "plateforme d'expédition", tracking: "service de suivi" };

const SIZES = { sm: { box: 24, icon: 13, text: 13, line: 18 }, md: { box: 36, icon: 18, text: 15, line: 20 }, lg: { box: 48, icon: 24, text: 18, line: 22 } } as const;
export type BrandMarkSize = keyof typeof SIZES;

export function BrandMark({
  brand,
  fallbackName,
  kind,
  size = "md",
  withName = true,
  detail,
  testID,
}: {
  brand: BrandEntry | null;
  /** nom affiché si la marque n'est pas au registre (texte libre d'une grille, transporteur inconnu) */
  fallbackName?: string;
  /** type de service quand la marque est inconnue (icône générique) */
  kind?: BrandKind;
  size?: BrandMarkSize;
  withName?: boolean;
  /** seconde ligne facultative (service, source…) */
  detail?: string | null;
  testID?: string;
}) {
  const s = SIZES[size];
  const name = brand?.name ?? fallbackName ?? "";
  const k = brand?.kind ?? kind ?? "carrier";
  const Icon = KIND_ICON[k];
  const logo = brand && canShowLogo(brand) ? brand.logo : null;
  const a11y = `${name}${detail ? `, ${detail}` : ""}`;

  const mark = logo ? (
    <View
      testID={testID ? `${testID}-logo` : undefined}
      style={{ height: s.box, paddingHorizontal: logo.background === "light" ? 6 : 0, borderRadius: radius.md, backgroundColor: logo.background === "light" ? "#FFFFFF" : "transparent", justifyContent: "center" }}
    >
      <Image source={logo.source} accessibilityIgnoresInvertColors resizeMode="contain" style={{ height: s.box - (logo.background === "light" ? 8 : 0), aspectRatio: logo.width / logo.height }} />
    </View>
  ) : (
    <View
      testID={testID ? `${testID}-generic` : undefined}
      style={{ width: s.box, height: s.box, borderRadius: size === "sm" ? radius.xs : radius.md, backgroundColor: color.surfaceSunken, alignItems: "center", justifyContent: "center" }}
    >
      <Icon size={s.icon} color={color.ink2} strokeWidth={2} />
    </View>
  );

  return (
    <View testID={testID} accessible accessibilityLabel={a11y} accessibilityHint={logo ? undefined : KIND_LABEL[k]} style={{ flexDirection: "row", alignItems: "center", gap: size === "sm" ? 6 : space[2], flexShrink: 1 }}>
      {mark}
      {withName && name ? (
        <View style={{ flexShrink: 1 }}>
          <Txt variant="body" numberOfLines={1} style={{ fontSize: s.text, lineHeight: s.line }}>
            {name}
          </Txt>
          {detail ? (
            <Txt variant="label" numberOfLines={1}>
              {detail}
            </Txt>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Mention d'identification (aucune affiliation), à placer près des listes de marques. */
export function BrandDisclaimer() {
  return (
    <Txt variant="label" style={{ fontSize: 12, lineHeight: 16 }}>
      {BRAND_DISCLAIMER}
    </Txt>
  );
}
