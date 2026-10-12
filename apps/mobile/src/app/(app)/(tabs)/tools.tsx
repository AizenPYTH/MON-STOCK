import { Pressable, View } from "react-native";
import { router, type Href } from "expo-router";
import { toolTiles } from "@/domain/tools/catalog";
import { Screen, TabHeader, Txt } from "~/components/ui";
import { useLayout } from "~/theme/layout";
import { color, space } from "~/theme/tokens";

/**
 * « Outils » (maquette v3 « version simple ») : grille de 8 tuiles, 2 colonnes, un nom et un
 * symbole. Les routes ne changent pas ; les versions détaillées s'ouvrent depuis chaque outil.
 */
export default function ToolsScreen() {
  const tiles = toolTiles();
  const { compact } = useLayout();
  const rows: (typeof tiles)[] = [];
  tiles.forEach((t, i) => (i % 2 === 0 ? rows.push([t]) : rows[rows.length - 1]!.push(t)));
  return (
    <Screen contentGap={space[2] + 2}>
      <TabHeader title="Outils" />
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: "row", gap: space[2] + 2 }}>
          {r.map((t) => {
            const dark = Boolean(t.tile.dark);
            return (
              <Pressable
                key={t.id}
                testID={`tool-${t.id}`}
                accessibilityRole="button"
                accessibilityLabel={`${t.tile.label}, ${t.description}`}
                onPress={() => router.push(t.route as Href)}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: compact ? 96 : 112,
                  borderRadius: 18,
                  padding: space[4],
                  justifyContent: "space-between",
                  backgroundColor: dark ? color.brand : pressed ? color.line : color.surfaceSunken,
                  opacity: dark && pressed ? 0.85 : 1,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                })}
              >
                <Txt variant="title1" color={dark ? color.inkOnDark : color.brand} maxFontSizeMultiplier={1.3} style={{ fontSize: 30, lineHeight: 34, letterSpacing: -1 }}>
                  {t.tile.glyph}
                </Txt>
                <Txt variant="body" color={dark ? color.inkOnDark : color.brand} numberOfLines={2} style={{ fontFamily: "Manrope_800ExtraBold", fontSize: 16, lineHeight: 20 }}>
                  {t.tile.label}
                </Txt>
              </Pressable>
            );
          })}
          {r.length < 2 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </Screen>
  );
}
