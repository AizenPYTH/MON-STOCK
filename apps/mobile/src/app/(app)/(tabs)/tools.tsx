import { Pressable, View } from "react-native";
import { router, type Href } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { toolsByCategory, type ToolDefinition } from "@/domain/tools/catalog";
import { TOOL_ICONS } from "~/components/tools";
import { Card, Screen, SectionHeader, StatusChip, TabHeader, Txt } from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";

/**
 * « Mes outils » : catalogue d'outils indépendants (calculs locaux et instantanés, ou appuyés sur
 * le serveur quand une donnée externe est nécessaire). Un outil « à venir » n'est pas ouvrable.
 */
export default function ToolsScreen() {
  const groups = toolsByCategory();
  return (
    <Screen>
      <TabHeader title="Mes outils" />
      <Txt variant="bodyRegular">Calculs rapides pour acheter, vendre et expédier. Les résultats sont des estimations à partir de vos saisies.</Txt>
      {groups.map((g) => (
        <View key={g.category} style={{ gap: space[2] }}>
          <SectionHeader title={g.label} />
          <Card>
            {g.tools.map((t, i) => (
              <ToolRow key={t.id} tool={t} last={i === g.tools.length - 1} />
            ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}

function ToolRow({ tool, last }: { tool: ToolDefinition; last: boolean }) {
  const Icon = TOOL_ICONS[tool.icon];
  const soon = tool.availability === "soon" || !tool.route;
  const content = (pressed: boolean) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space[3],
        paddingVertical: space[3],
        paddingHorizontal: space[4],
        minHeight: 64,
        backgroundColor: pressed ? color.lineSoft : "transparent",
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: color.lineSoft,
        opacity: soon ? 0.6 : 1,
      }}
    >
      <View style={{ width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: soon ? color.lineSoft : color.surfaceDark }}>
        <Icon size={20} color={soon ? color.ink3 : color.inkOnDark} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt variant="body">{tool.title}</Txt>
        <Txt variant="label" numberOfLines={2}>
          {tool.description}
        </Txt>
      </View>
      {soon ? <StatusChip label="À venir" tone="neutral" /> : <ChevronRight size={18} color={color.ink3} strokeWidth={2} />}
    </View>
  );
  if (soon)
    return (
      <View accessible accessibilityLabel={`${tool.title}, à venir, non disponible`} testID={`tool-${tool.id}`}>
        {content(false)}
      </View>
    );
  return (
    <Pressable testID={`tool-${tool.id}`} accessibilityRole="button" accessibilityLabel={`${tool.title}, ${tool.description}`} onPress={() => router.push(tool.route as Href)}>
      {({ pressed }) => content(pressed)}
    </Pressable>
  );
}
