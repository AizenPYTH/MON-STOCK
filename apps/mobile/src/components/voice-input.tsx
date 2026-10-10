import { useEffect, type ReactNode } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { ArrowUp, Mic, Square } from "lucide-react-native";
import { Txt } from "~/components/ui";
import { useDictation } from "~/lib/speech";
import { color, radius, size, space } from "~/theme/tokens";
import { fontFamily } from "~/theme/typography";

/**
 * Champ texte + micro : on écrit OU on parle. Pendant la dictée, le texte reconnu s'affiche en
 * direct dans le champ ; à la fin de la dictée, `onSubmit` est appelé avec le texte (l'IA côté
 * serveur fait la compréhension). Sans module de dictée (ancien build), le micro est masqué.
 */
export function VoiceInput({
  value,
  onChangeText,
  onSubmit,
  placeholder,
  busy = false,
  submitLabel = "Envoyer",
  autoSubmitOnSpeechEnd = true,
  testID,
}: {
  value: string;
  onChangeText: (v: string) => void;
  onSubmit: (text: string) => void;
  placeholder: string;
  busy?: boolean;
  submitLabel?: string;
  autoSubmitOnSpeechEnd?: boolean;
  testID?: string;
}) {
  const dictation = useDictation({ onFinal: (text) => (autoSubmitOnSpeechEnd ? onSubmit(text) : onChangeText(text)) });

  useEffect(() => {
    if (dictation.listening && dictation.transcript) onChangeText(dictation.transcript);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictation.transcript, dictation.listening]);

  const canSend = value.trim().length > 0 && !busy && !dictation.listening;

  function toggleMic() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (dictation.listening) dictation.stop();
    else void dictation.start();
  }

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space[2], backgroundColor: color.surface, borderWidth: 1, borderColor: dictation.listening ? color.accent : color.line, borderRadius: radius.xl, padding: 6 }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={dictation.listening ? "J'écoute…" : placeholder}
          placeholderTextColor={color.ink3}
          multiline
          maxLength={2000}
          editable={!busy}
          accessibilityLabel={placeholder}
          maxFontSizeMultiplier={1.6}
          style={{ flex: 1, minHeight: size.touchMin - 8, maxHeight: 140, paddingHorizontal: space[2], paddingVertical: space[2], fontFamily: fontFamily[600], fontSize: 16, color: color.ink }}
          testID={testID}
        />
        {dictation.available ? (
          <RoundButton label={dictation.listening ? "Arrêter la dictée" : "Dicter"} onPress={toggleMic} tone={dictation.listening ? "accent" : "plain"} disabled={busy}>
            {dictation.listening ? <Square size={16} color={color.inkOnDark} fill={color.inkOnDark} /> : <Mic size={20} color={color.ink} />}
          </RoundButton>
        ) : null}
        <RoundButton label={submitLabel} onPress={() => canSend && onSubmit(value.trim())} tone="dark" disabled={!canSend} testID={testID ? `${testID}-send` : undefined}>
          {busy ? <ActivityIndicator color={color.inkOnDark} /> : <ArrowUp size={20} color={color.inkOnDark} />}
        </RoundButton>
      </View>
      {dictation.listening ? (
        <Txt variant="label" color={color.accent} accessibilityLiveRegion="polite">
          J'écoute… touchez ■ quand vous avez fini.
        </Txt>
      ) : dictation.error ? (
        <Txt variant="label" color={color.danger} accessibilityLiveRegion="polite">
          {dictation.error}
        </Txt>
      ) : null}
    </View>
  );
}

function RoundButton({ children, label, onPress, tone, disabled, testID }: { children: ReactNode; label: string; onPress: () => void; tone: "plain" | "dark" | "accent"; disabled?: boolean; testID?: string }) {
  const bg = tone === "dark" ? color.ink : tone === "accent" ? color.accent : color.surface;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      testID={testID}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: radius.pill,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bg,
        borderWidth: tone === "plain" ? 1 : 0,
        borderColor: color.line,
        opacity: disabled ? 0.35 : pressed ? 0.85 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}
