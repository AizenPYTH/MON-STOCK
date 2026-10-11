import { useWindowDimensions } from "react-native";

/**
 * Règles responsive du handoff : largeur de référence 390 ; marge d'écran 16 (12 sur iPhone SE,
 * 20 si ≥ 430) ; < 360 ou texte agrandi > 1,3 → grilles réduites ; tablette ≥ 768 → contenu centré.
 */
export function useLayout() {
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 360 || fontScale > 1.3;
  return {
    width,
    compact,
    screenX: width < 360 ? 12 : width >= 430 ? 20 : 16,
    maxWidth: width >= 768 ? 560 : undefined,
    kpiColumns: compact ? 2 : 3,
  };
}
