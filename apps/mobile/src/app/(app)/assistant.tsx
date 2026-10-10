import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { Database, Sparkles } from "lucide-react-native";
import type { AssistantMessageDTO } from "@/features/mobile-api/contract";
import { useActiveOrg } from "~/org/org-provider";
import { askAssistant, conversationForApi } from "~/data/ai";
import { userMessage } from "~/lib/errors";
import { DetailHeader, Screen, StickyActions, Txt } from "~/components/ui";
import { VoiceInput } from "~/components/voice-input";
import { color, radius, space } from "~/theme/tokens";
import { fontFamily } from "~/theme/typography";

/**
 * Assistant « Intelligence » : questions écrites ou dictées sur le compte (ventes eBay, commandes,
 * stock, annonces). Les réponses sont calculées sur le serveur à partir des données réelles de
 * l'organisation (lecture seule, droits de l'utilisateur) ; les données consultées sont affichées.
 */
type Bubble = { id: number; role: "user" | "assistant"; content: string; sources?: string[]; error?: boolean };

const SUGGESTIONS = [
  "Quel est le produit que j'ai le plus vendu ?",
  "Combien ai-je vendu ce mois-ci ?",
  "Quels produits dorment en stock ?",
  "Mon compte eBay est-il bien synchronisé ?",
  "Quelles sont mes 5 dernières commandes ?",
];

export default function AssistantScreen() {
  const { active } = useActiveOrg();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const scroll = useRef<ScrollView>(null);

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    // Historique envoyé : uniquement les échanges réussis (les messages d'erreur restent locaux).
    const history: AssistantMessageDTO[] = bubbles.filter((b) => !b.error).map((b) => ({ role: b.role, content: b.content }));
    setBubbles((bs) => [...bs, { id: ++seq.current, role: "user", content: q }]);
    setText("");
    setBusy(true);
    try {
      const reply = await askAssistant(active.organization.id, conversationForApi(history, q));
      setBubbles((bs) => [...bs, { id: ++seq.current, role: "assistant", content: reply.answer, sources: reply.sources.map((s) => s.label) }]);
    } catch (e) {
      setBubbles((bs) => [...bs, { id: ++seq.current, role: "assistant", content: userMessage(e), error: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        scroll={false}
        footer={
          <StickyActions>
            <View style={{ flex: 1 }}>
              <VoiceInput value={text} onChangeText={setText} onSubmit={(t) => void send(t)} placeholder="Posez votre question…" busy={busy} testID="assistant-input" />
            </View>
          </StickyActions>
        }
      >
        <DetailHeader parentLabel="Intelligence" />
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ gap: space[3], paddingBottom: space[4] }} keyboardShouldPersistTaps="handled" onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
          {bubbles.length === 0 ? (
            <View style={{ gap: space[3] }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
                <Sparkles size={20} color={color.accent} />
                <Txt variant="title2" accessibilityRole="header">
                  Assistant
                </Txt>
              </View>
              <Txt variant="body" color={color.ink2}>
                Posez une question sur vos ventes, votre stock ou votre compte eBay — à l'écrit ou au micro. Les réponses viennent de vos données réelles ({active.organization.name}).
              </Txt>
              <View style={{ gap: space[2] }}>
                {SUGGESTIONS.map((s) => (
                  <Pressable key={s} accessibilityRole="button" onPress={() => void send(s)} style={({ pressed }) => ({ padding: space[3], borderRadius: radius.lg, backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, opacity: pressed ? 0.85 : 1 })}>
                    <Txt variant="body">{s}</Txt>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            bubbles.map((b) => <MessageBubble key={b.id} bubble={b} />)
          )}
          {busy ? (
            <Txt variant="label" color={color.ink3} accessibilityLiveRegion="polite">
              L'assistant consulte vos données…
            </Txt>
          ) : null}
        </ScrollView>
      </Screen>
    </KeyboardAvoidingView>
  );
}

function MessageBubble({ bubble }: { bubble: Bubble }) {
  const mine = bubble.role === "user";
  return (
    <View style={{ alignItems: mine ? "flex-end" : "flex-start", gap: 4 }}>
      <View
        style={{
          maxWidth: "88%",
          paddingVertical: space[3],
          paddingHorizontal: 14,
          borderRadius: radius.xl,
          backgroundColor: mine ? color.ink : bubble.error ? color.dangerSoft : color.surface,
          borderWidth: mine ? 0 : 1,
          borderColor: bubble.error ? color.dangerSoft : color.line,
        }}
      >
        <Txt variant="body" color={mine ? color.inkOnDark : bubble.error ? color.danger : color.ink} selectable style={mine ? { fontFamily: fontFamily[600] } : undefined}>
          {bubble.content}
        </Txt>
      </View>
      {bubble.sources && bubble.sources.length ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 4 }}>
          <Database size={12} color={color.ink3} />
          <Txt variant="label" color={color.ink3}>
            Données consultées : {bubble.sources.join(", ")}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}
