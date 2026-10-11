import { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import NetInfo from "@react-native-community/netinfo";
import { ArrowUp, History, Mic, Plus, Sparkles, Square, Volume2 } from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";
import type { AdvisorActionDTO, AdvisorCardDTO } from "@/features/mobile-api/contract";
import { ADVISOR_MESSAGE_MAX_CHARS } from "@/features/mobile-api/contract";
import { AdvisorCardView, MessageBubble, VoiceStatus, type VoicePhase } from "~/components/advisor";
import { AlertBanner, DetailHeader, Screen, StickyActions, Txt, useToast } from "~/components/ui";
import { cancelAdvisorAction, confirmAdvisorAction, fetchAdvisorStatus, fetchConversationMessages, streamAdvisorChat } from "~/data/advisor";
import { useActiveOrg } from "~/org/org-provider";
import { requireSupabase } from "~/lib/supabase";
import { userMessage } from "~/lib/errors";
import { useDictation } from "~/lib/speech";
import { speak, stopSpeaking, ttsAvailable } from "~/lib/tts";
import { useVoicePreference } from "~/lib/voice-pref";
import { color, radius, size, space } from "~/theme/tokens";
import { fontFamily } from "~/theme/typography";

/**
 * Conseiller e-commerce IA : conversation écrite OU vocale, fondée sur les données réelles du
 * compte (calculs et outils exécutés sur le serveur, sous les droits de l'utilisateur).
 *
 * Voix : dictée de l'appareil (transcription locale iOS / Android) → serveur → réponse affichée au
 * fil de l'eau et lue par la voix naturelle du serveur (OpenAI), ou à défaut par celle de l'appareil. Le micro n'écoute QUE après un appui
 * explicite ; le « mode conversation » (relance automatique de l'écoute après la réponse) doit être
 * activé par l'utilisateur et se coupe tout seul après une écoute sans parole.
 * Actions : uniquement préparées par le conseiller ; exécution sur appui de « Confirmer ».
 */

type Item = {
  key: string;
  role: "user" | "assistant" | "notice";
  content: string;
  cards: AdvisorCardDTO[];
  sources: string[];
  interrupted?: boolean;
  error?: boolean;
  streaming?: boolean;
  /** identifiant enregistré de la réponse (voix du serveur) */
  messageId?: string | null;
};

const SUGGESTIONS = [
  "Fais-moi un bilan de mon activité ce mois-ci.",
  "Quel est mon chiffre d'affaires cette semaine ?",
  "Quelle est ma marge réelle après frais et coûts d'achat ?",
  "Quels produits risquent la rupture ?",
  "Qu'est-ce que tu me conseilles de faire aujourd'hui ?",
  "Quels produits sont immobilisés depuis longtemps ?",
];

let seq = 0;
const nextKey = () => `k${++seq}`;

export default function AdvisorScreen() {
  const params = useLocalSearchParams<{ conversationId?: string }>();
  const { active } = useActiveOrg();
  const orgId = active.organization.id;
  const toast = useToast();
  const [conversationId, setConversationId] = useState<string | null>(params.conversationId ?? null);
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [conversationMode, setConversationMode] = useState(false);
  const [offline, setOffline] = useState(false);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scroll = useRef<ScrollView>(null);
  const conversationModeRef = useRef(conversationMode);
  useEffect(() => {
    conversationModeRef.current = conversationMode;
  }, [conversationMode]);
  const lastVoiceRef = useRef(false);

  const status = useQuery({ queryKey: [orgId, "advisor", "status"], queryFn: () => fetchAdvisorStatus(orgId), staleTime: 5 * 60_000, retry: 1 });
  // voix naturelle du serveur (OpenAI) si annoncée ; sinon voix de l'appareil
  const [preferredVoice] = useVoicePreference();
  const voiceOptions = (messageId: string | null | undefined) => ({ messageId, organizationId: orgId, serverVoice: Boolean(status.data?.voice), voice: preferredVoice });

  useEffect(() => NetInfo.addEventListener((s) => setOffline(s.isConnected === false || s.isInternetReachable === false)), []);

  // Conversation existante (historique) : lecture directe en base, RLS = uniquement les siennes.
  useEffect(() => {
    if (!params.conversationId) return;
    let cancelled = false;
    void fetchConversationMessages(requireSupabase(), orgId, params.conversationId)
      .then((ms) => {
        if (cancelled) return;
        setConversationId(params.conversationId!);
        setItems(ms.map((m) => ({ key: m.id, role: m.role, content: m.content, cards: m.cards, sources: m.sources, interrupted: m.interrupted, messageId: m.id })));
      })
      .catch((e) => toast({ text: userMessage(e), tone: "error" }));
    return () => {
      cancelled = true;
    };
  }, [params.conversationId, orgId, toast]);

  // Arrêt propre en quittant l'écran : lecture, écoute et requête en cours.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      void stopSpeaking();
    },
    [],
  );

  const dictation = useDictation({
    onFinal: (heard) => {
      const q = heard.trim();
      if (q) void send(q, true);
    },
    // fin d'écoute sans parole reconnue, ou erreur / refus : rien n'est envoyé, le mode conversation se coupe
    onEnd: (heard) => {
      if (!heard) {
        setPhase("idle");
        setConversationMode(false);
      }
    },
    onError: () => {
      setPhase("idle");
      setConversationMode(false);
    },
  });
  const shownPhase: VoicePhase = dictation.listening ? "listening" : phase;
  const inputValue = dictation.listening ? dictation.transcript : text;

  const updateLast = useCallback((fn: (it: Item) => Item) => setItems((xs) => xs.map((it, i) => (i === xs.length - 1 ? fn(it) : it))), []);

  async function startListening() {
    await stopSpeaking();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setText("");
    await dictation.start({ continuous: false });
  }

  function stopAll() {
    void stopSpeaking();
    if (dictation.listening) dictation.stop();
    if (busy) abortRef.current?.abort();
    setConversationMode(false);
    setPhase("idle");
  }

  async function send(question: string, voice = false) {
    const q = question.trim().slice(0, ADVISOR_MESSAGE_MAX_CHARS);
    if (!q || busy) return;
    if (offline) {
      toast({ text: "Hors ligne : le conseiller a besoin d'Internet pour consulter vos données.", tone: "error" });
      setPhase("idle");
      return;
    }
    await stopSpeaking();
    lastVoiceRef.current = voice;
    setText("");
    setBusy(true);
    setPhase("thinking");
    setStatusDetail(null);
    setItems((xs) => [...xs, { key: nextKey(), role: "user", content: q, cards: [], sources: [] }, { key: nextKey(), role: "assistant", content: "", cards: [], sources: [], streaming: true }]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const reply = await streamAdvisorChat(
        orgId,
        { conversationId, message: q, voice },
        (e) => {
          if (e.type === "conversation") setConversationId(e.conversationId);
          else if (e.type === "status") setStatusDetail(`Consultation : ${e.label}`);
          else if (e.type === "text") updateLast((it) => ({ ...it, content: it.content + e.delta }));
          else if (e.type === "card") updateLast((it) => ({ ...it, cards: [...it.cards, e.card] }));
        },
        { signal: controller.signal },
      );
      updateLast((it) => ({ ...it, content: reply.answer, cards: reply.cards, sources: reply.sources, interrupted: reply.interrupted, streaming: false, messageId: reply.messageId }));
      if (voice && ttsAvailable()) {
        setPhase("speaking");
        await speak(
          reply.answer,
          {
            onDone: () => {
              setPhase("idle");
              if (conversationModeRef.current) void startListening();
            },
            onStopped: () => setPhase("idle"),
            onError: (m) => {
              setPhase("idle");
              toast({ text: m, tone: "error" });
            },
          },
          voiceOptions(reply.messageId),
        );
      } else setPhase("idle");
    } catch (e) {
      const message = userMessage(e);
      updateLast((it) => (it.content ? { ...it, streaming: false, interrupted: true } : { ...it, content: message, error: true, streaming: false }));
      setPhase("idle");
      setConversationMode(false);
    } finally {
      setBusy(false);
      setStatusDetail(null);
      abortRef.current = null;
    }
  }

  async function decide(action: AdvisorActionDTO, kind: "confirm" | "cancel") {
    setBusyActionId(action.id);
    try {
      const r = kind === "confirm" ? await confirmAdvisorAction(orgId, action.id) : await cancelAdvisorAction(orgId, action.id);
      setItems((xs) => [
        ...xs.map((it) => ({ ...it, cards: it.cards.map((c) => (c.action?.id === action.id ? { ...c, action: r.action } : c)) })),
        { key: nextKey(), role: "notice" as const, content: r.message, cards: [], sources: [] },
      ]);
      void Haptics.notificationAsync(r.action.status === "executed" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
    } catch (e) {
      toast({ text: userMessage(e), tone: "error" });
    } finally {
      setBusyActionId(null);
    }
  }

  function newConversation() {
    stopAll();
    setConversationId(null);
    setItems([]);
    router.setParams({ conversationId: undefined });
  }

  const lastAssistant = [...items].reverse().find((i) => i.role === "assistant" && !i.streaming && !i.error && i.content);
  const notConfigured = status.data && !status.data.configured;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        scroll={false}
        footer={
          <StickyActions>
            <View style={{ flex: 1, gap: space[2] }}>
              <VoiceStatus phase={shownPhase} detail={shownPhase === "listening" ? dictation.transcript || null : statusDetail} onStop={stopAll} />
              {dictation.error ? (
                <Txt variant="label" color={color.danger} accessibilityLiveRegion="polite">
                  {dictation.error}
                </Txt>
              ) : null}
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space[2] }}>
                <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-end", backgroundColor: color.surface, borderWidth: 1, borderColor: dictation.listening ? color.accent : color.line, borderRadius: radius.xl, paddingHorizontal: space[2] }}>
                  <TextInput
                    value={inputValue}
                    onChangeText={(v) => setText(v.slice(0, ADVISOR_MESSAGE_MAX_CHARS))}
                    placeholder={dictation.listening ? "J'écoute…" : "Écrivez ou touchez le micro…"}
                    placeholderTextColor={color.ink3}
                    multiline
                    editable={!busy && !dictation.listening}
                    accessibilityLabel="Question au conseiller"
                    maxFontSizeMultiplier={1.6}
                    style={{ flex: 1, minHeight: size.touchMin, maxHeight: 120, paddingHorizontal: space[2], paddingVertical: space[3], fontFamily: fontFamily[600], fontSize: 16, color: color.ink }}
                    testID="advisor-input"
                  />
                  <Pressable accessibilityRole="button" accessibilityLabel="Envoyer" disabled={!text.trim() || busy} onPress={() => void send(text)} style={{ width: 40, height: 40, marginBottom: 4, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: text.trim() && !busy ? color.ink : color.line }} testID="advisor-send">
                    <ArrowUp size={20} color={text.trim() && !busy ? color.inkOnDark : color.ink3} />
                  </Pressable>
                </View>
                {dictation.available ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={dictation.listening ? "Arrêter l'écoute" : "Parler au conseiller"}
                    accessibilityHint="Le micro n'écoute qu'après cet appui"
                    disabled={busy}
                    onPress={() => (dictation.listening ? dictation.stop() : void startListening())}
                    style={({ pressed }) => ({ width: 56, height: 56, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: dictation.listening ? color.danger : color.accent, opacity: busy ? 0.4 : pressed ? 0.85 : 1 })}
                    testID="advisor-mic"
                  >
                    {dictation.listening ? <Square size={20} color={color.inkOnDark} fill={color.inkOnDark} /> : <Mic size={26} color={color.inkOnDark} />}
                  </Pressable>
                ) : null}
              </View>
              {dictation.available ? (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Txt variant="label">Mode conversation (relance le micro après chaque réponse)</Txt>
                  <Switch value={conversationMode} onValueChange={setConversationMode} accessibilityLabel="Mode conversation" trackColor={{ true: color.accent, false: color.line }} testID="advisor-conversation-mode" />
                </View>
              ) : (
                <Txt variant="label">Dictée indisponible sur cet appareil : écrivez votre question.</Txt>
              )}
            </View>
          </StickyActions>
        }
      >
        <DetailHeader
          parentLabel="Aujourd'hui"
          right={
            <View style={{ flexDirection: "row", gap: space[2] }}>
              <HeaderButton label="Historique des conversations" onPress={() => router.push("/advisor/history")} testID="advisor-history">
                <History size={18} color={color.ink} />
              </HeaderButton>
              <HeaderButton label="Nouvelle conversation" onPress={newConversation} testID="advisor-new">
                <Plus size={18} color={color.ink} />
              </HeaderButton>
            </View>
          }
        />
        {offline ? <AlertBanner tone="dark" text="Hors ligne : le conseiller est indisponible. Vos conversations restent consultables." /> : null}
        {notConfigured ? <AlertBanner tone="accent" text="Le conseiller n'est pas encore activé sur le serveur (clé OPENAI_API_KEY à ajouter par l'administrateur)." /> : null}
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ gap: space[3], paddingBottom: space[4] }} keyboardShouldPersistTaps="handled" onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
          {items.length === 0 ? (
            <View style={{ gap: space[3] }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
                <Sparkles size={22} color={color.accent} />
                <Txt variant="title2" accessibilityRole="header">
                  Votre conseiller
                </Txt>
              </View>
              <Txt variant="bodyRegular">
                Parlez-lui ou écrivez-lui comme à un collaborateur : il consulte vos ventes, marges, stock, commandes et expéditions ({active.organization.name}), explique ses chiffres et peut préparer des actions que vous confirmez.
              </Txt>
              {status.data ? (
                <Txt variant="label">
                  Limite : {status.data.limits.perUserPerHour} questions par heure. Données manquantes signalées, jamais inventées.
                </Txt>
              ) : null}
              <View style={{ gap: space[2] }}>
                {SUGGESTIONS.map((s) => (
                  <Pressable key={s} accessibilityRole="button" onPress={() => void send(s)} disabled={busy} style={({ pressed }) => ({ padding: space[3], borderRadius: radius.lg, backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, opacity: pressed ? 0.85 : 1 })}>
                    <Txt variant="body">{s}</Txt>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            items.map((it) => (
              <View key={it.key} style={{ gap: space[2] }}>
                {it.role === "assistant" && it.streaming && !it.content ? null : <MessageBubble role={it.role} content={it.content} streaming={it.streaming} interrupted={it.interrupted} error={it.error} sources={it.sources} />}
                {it.cards.map((c, i) => (
                  <AdvisorCardView key={`${it.key}-c${i}`} card={c} busyActionId={busyActionId} onConfirm={(a) => void decide(a, "confirm")} onCancel={(a) => void decide(a, "cancel")} />
                ))}
              </View>
            ))
          )}
          {lastAssistant && ttsAvailable() && shownPhase === "idle" ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Écouter la dernière réponse" onPress={() => { setPhase("speaking"); void speak(lastAssistant.content, { onDone: () => setPhase("idle"), onStopped: () => setPhase("idle"), onError: () => setPhase("idle") }, voiceOptions(lastAssistant.messageId)); }} style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: color.line }} testID="advisor-replay">
              <Volume2 size={14} color={color.ink2} />
              <Txt variant="label">Écouter la réponse</Txt>
            </Pressable>
          ) : null}
        </ScrollView>
      </Screen>
    </KeyboardAvoidingView>
  );
}

function HeaderButton({ label, onPress, children, testID }: { label: string; onPress: () => void; children: React.ReactNode; testID?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4} testID={testID} style={({ pressed }) => ({ width: size.iconButton, height: size.iconButton, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, opacity: pressed ? 0.85 : 1 })}>
      {children}
    </Pressable>
  );
}
