import { Alert, Pressable, View } from "react-native";
import { router } from "expo-router";
import { MessageSquare, Trash2 } from "lucide-react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DetailHeader, EmptyState, ErrorState, Screen, SkeletonList, Txt, useToast } from "~/components/ui";
import { deleteConversation, fetchConversations } from "~/data/advisor";
import { useActiveOrg } from "~/org/org-provider";
import { requireSupabase } from "~/lib/supabase";
import { userMessage } from "~/lib/errors";
import { color, radius, space } from "~/theme/tokens";

/** Historique des conversations du conseiller (les vôtres uniquement : RLS). */
export default function AdvisorHistoryScreen() {
  const { active } = useActiveOrg();
  const orgId = active.organization.id;
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: [orgId, "advisor", "conversations"], queryFn: () => fetchConversations(requireSupabase(), orgId) });
  const remove = useMutation({
    mutationFn: (id: string) => deleteConversation(requireSupabase(), orgId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [orgId, "advisor", "conversations"] }),
    onError: (e) => toast({ text: userMessage(e), tone: "error" }),
  });

  function confirmDelete(id: string, title: string) {
    Alert.alert("Supprimer la conversation ?", `« ${title} » et ses messages seront supprimés définitivement.`, [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: () => remove.mutate(id) },
    ]);
  }

  return (
    <Screen>
      <DetailHeader parentLabel="Conseiller" />
      <Txt variant="title2" accessibilityRole="header">
        Conversations
      </Txt>
      {list.isPending ? <SkeletonList rows={6} thumb={false} /> : null}
      {list.isError ? <ErrorState description={userMessage(list.error)} onRetry={() => void list.refetch()} /> : null}
      {list.data && list.data.length === 0 ? <EmptyState title="Aucune conversation" description="Posez votre première question au conseiller." actions={[{ label: "Nouvelle conversation", onPress: () => router.replace("/advisor") }]} /> : null}
      {(list.data ?? []).map((c) => (
        <View key={c.id} style={{ flexDirection: "row", alignItems: "center", gap: space[2], backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, paddingLeft: space[3] }}>
          <MessageSquare size={18} color={color.ink3} />
          <Pressable accessibilityRole="button" accessibilityLabel={`Ouvrir : ${c.title}`} onPress={() => router.push({ pathname: "/advisor", params: { conversationId: c.id } })} style={{ flex: 1, paddingVertical: space[3], gap: 2 }}>
            <Txt variant="body" numberOfLines={2}>
              {c.title}
            </Txt>
            <Txt variant="label">{new Date(c.lastMessageAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</Txt>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Supprimer : ${c.title}`} onPress={() => confirmDelete(c.id, c.title)} hitSlop={6} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <Trash2 size={18} color={color.dangerInk} />
          </Pressable>
        </View>
      ))}
    </Screen>
  );
}
