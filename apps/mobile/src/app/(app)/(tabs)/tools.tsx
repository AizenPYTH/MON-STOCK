import { Pressable, View } from "react-native";
import { router, type Href } from "expo-router";
import { toolsByCategory, type ToolDefinition } from "@/domain/tools/catalog";
import { TOOL_ICONS } from "~/components/tools";
import { Screen, SectionHeader, TabHeader, Txt } from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";
import { useLayout } from "~/theme/layout";

/**
 * « Mes outils » : catalogue d'outils indépendants (calculs locaux et instantanés, ou appuyés sur
 * le serveur quand une donnée externe est nécessaire). Grille de tuiles (3 colonnes, 2 sur petit
 * écran) ; un outil « à venir » est atténué (55 %) et n'est pas ouvrable.
 */
export default function ToolsScreen() {
  const groups = toolsByCategory();
  const { compact } = useLayout();
  const columns = compact ? 2 : 3;
  return (
    <Screen>
      <TabHeader overline="Calculs locaux et instantanés" title="Mes outils" />
      <Txt variant="bodyRegular">Estimations à partir de vos saisies, pour acheter, vendre et expédier.</Txt>
      {groups.map((g) => (
        <View key={g.category} style={{ gap: space[2] }}>
          <SectionHeader title={g.label} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
            {g.tools.map((t) => (
              <ToolTile key={t.id} tool={t} columns={columns} />
            ))}
            {Array.from({ length: (columns - (g.tools.length % columns)) % columns }, (_, k) => (
              <View key={`pad-${k}`} style={{ flexBasis: 0, flexGrow: 1, minWidth: `${Math.floor(100 / columns) - 4}%` }} />
            ))}
          </View>
        </View>
      ))}
    </Screen>
  );
}

function ToolTile({ tool, columns }: { tool: ToolDefinition; columns: number }) {
  const Icon = TOOL_ICONS[tool.icon];
  const soon = tool.availability === "soon" || !tool.route;
  const body = (pressed: boolean) => (
    <View
      style={{
        minHeight: 104,
        padding: space[3],
        borderRadius: radius.xxl,
        backgroundColor: pressed ? color.surfaceSunken : color.surface,
        justifyContent: "space-between",
        gap: space[2],
        opacity: soon ? 0.55 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      }}
    >
      <View style={{ width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: soon ? color.lineSoft : color.surfaceDark }}>
        <Icon size={18} color={soon ? color.ink3 : color.inkOnDark} strokeWidth={2.2} />
      </View>
      <View style={{ gap: 2 }}>
        <Txt variant="body" numberOfLines={2} style={{ fontSize: 14, lineHeight: 18 }}>
          {tool.title}
        </Txt>
        {soon ? <Txt variant="overline">À venir</Txt> : null}
      </View>
    </View>
  );
  const frame = { flexBasis: 0, flexGrow: 1, minWidth: `${Math.floor(100 / columns) - 4}%` as `${number}%` };
  if (soon)
    return (
      <View style={frame} accessible accessibilityLabel={`${tool.title}, à venir, non disponible`} testID={`tool-${tool.id}`}>
        {body(false)}
      </View>
    );
  return (
    <Pressable style={frame} testID={`tool-${tool.id}`} accessibilityRole="button" accessibilityLabel={`${tool.title}, ${tool.description}`} onPress={() => router.push(tool.route as Href)}>
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}
