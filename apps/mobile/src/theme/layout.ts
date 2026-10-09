import { useWindowDimensions } from "react-native";

/**
 * Règles responsive du handoff : largeur de référence 390 ; < 360 → grilles 3 colonnes en 2 ;
 * ≥ 430 → marge horizontale 24 ; tablette ≥ 768 → contenu centré (largeur max 560).
 */
export function useLayout() {
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 360 || fontScale > 1.3;
  return {
    width,
    compact,
    screenX: width >= 430 ? 24 : 20,
    maxWidth: width >= 768 ? 560 : undefined,
    kpiColumns: compact ? 2 : 3,
  };
}
