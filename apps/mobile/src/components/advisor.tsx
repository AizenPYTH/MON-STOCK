import { useEffect, useState } from "react";
import { Animated, Pressable, View } from "react-native";
import { AlertTriangle, Database, FileText, Mic, Square, Volume2, VolumeX } from "lucide-react-native";
import type { AdvisorActionDTO, AdvisorCardDTO, AdvisorCardTone } from "@/features/mobile-api/contract";
import { CopyButton } from "~/components/tools";
import { Button, Card, StatusChip, Txt } from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";
import { fontFamily } from "~/theme/typography";

/**
 * Composants du conseiller IA : bulles, cartes de résultats (calculées par le serveur à partir des
 * données, jamais rédigées par le modèle), carte d'action à confirmer, brouillon à copier, et
 * indicateur d'état vocal (écoute / analyse / lecture).
 */

export type BubbleRole = "user" | "assistant" | "notice";

const TONE: Record<AdvisorCardTone, string> = { neutral: color.ink, success: color.success, warning: color.accent, danger: color.danger };

export function MessageBubble({ role, content, streaming = false, interrupted = false, error = false, sources = [] }: { role: BubbleRole; content: string; streaming?: boolean; interrupted?: boolean; error?: boolean; sources?: string[] }) {
  if (role === "notice") {
    return (
      <View style={{ alignSelf: "center", maxWidth: "92%", paddingVertical: space[2], paddingHorizontal: space[3], borderRadius: radius.lg, backgroundColor: color.lineSoft }} accessibilityRole="text">
        <Txt variant="label" color={color.ink2} style={{ textAlign: "center" }}>
          {content}
        </Txt>
      </View>
    );
  }
  const mine = role === "user";
  return (
    <View style={{ alignItems: mine ? "flex-end" : "flex-start", gap: 4 }}>
      <View
        style={{
          maxWidth: "88%",
          paddingVertical: space[3],
          paddingHorizontal: 14,
          borderRadius: radius.xl,
          backgroundColor: mine ? color.ink : error ? color.dangerSoft : color.surface,
          borderWidth: mine ? 0 : 1,
          borderColor: error ? color.dangerSoft : color.line,
        }}
      >
        <Txt variant="body" color={mine ? color.inkOnDark : error ? color.dangerInk : color.ink} selectable style={mine ? { fontFamily: fontFamily[600] } : { fontFamily: fontFamily[500] }}>
          {content}
          {streaming ? <Txt variant="body" color={color.ink3}>▍</Txt> : null}
        </Txt>
      </View>
      {interrupted ? <StatusChip label="Réponse incomplète" tone="accent" /> : null}
      {sources.length ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 4, maxWidth: "92%" }}>
          <Database size={12} color={color.ink3} />
          <Txt variant="label" color={color.ink3} style={{ flexShrink: 1 }}>
            Données consultées : {sources.join(", ")}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

export function AdvisorCardView({ card, onConfirm, onCancel, busyActionId }: { card: AdvisorCardDTO; onConfirm?: (a: AdvisorActionDTO) => void; onCancel?: (a: AdvisorActionDTO) => void; busyActionId?: string | null }) {
  if (card.kind === "action" && card.action) return <ActionCard title={card.title} subtitle={card.subtitle} action={card.action} onConfirm={onConfirm} onCancel={onCancel} busy={busyActionId === card.action.id} />;
  return (
    <Card padded style={{ gap: space[2] }} accessibilityLabel={`${card.title}${card.subtitle ? `, ${card.subtitle}` : ""}`}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: space[2] }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="overline">{card.title}</Txt>
          {card.subtitle ? <Txt variant="label">{card.subtitle}</Txt> : null}
        </View>
        {card.kind === "draft" && card.text ? <CopyButton text={card.text} /> : null}
      </View>
      {card.kind === "draft" && card.text ? (
        <View style={{ gap: space[2] }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <FileText size={14} color={color.ink3} />
            <Txt variant="label">Brouillon — rien n'est envoyé automatiquement</Txt>
          </View>
          <Txt variant="bodyRegular" selectable>
            {card.text}
          </Txt>
        </View>
      ) : null}
      {card.rows.map((r, i) => (
        <View key={`${r.label}-${i}`} style={{ flexDirection: "row", alignItems: "flex-start", gap: space[3], paddingTop: i === 0 ? 0 : space[2], borderTopWidth: i === 0 ? 0 : 1, borderTopColor: color.lineSoft }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="body" numberOfLines={2}>
              {r.label}
            </Txt>
            {r.detail ? <Txt variant="label">{r.detail}</Txt> : null}
          </View>
          <Txt variant="body" num color={TONE[r.tone]} style={{ fontFamily: fontFamily[800], textAlign: "right", maxWidth: "45%" }}>
            {r.value}
          </Txt>
        </View>
      ))}
      {card.warnings.length ? (
        <View style={{ gap: 4, paddingTop: space[1] }}>
          {card.warnings.map((w) => (
            <View key={w} style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }}>
              <AlertTriangle size={14} color={color.accentInkOnSoft} style={{ marginTop: 2 }} />
              <Txt variant="label" color={color.accentInkOnSoft} style={{ flex: 1 }}>
                {w}
              </Txt>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const ACTION_STATUS: Record<AdvisorActionDTO["status"], { label: string; tone: "accent" | "neutral" | "success" | "danger" }> = {
  pending: { label: "À confirmer", tone: "accent" },
  executing: { label: "En cours…", tone: "neutral" },
  executed: { label: "Fait", tone: "success" },
  cancelled: { label: "Annulée", tone: "neutral" },
  expired: { label: "Expirée", tone: "neutral" },
  failed: { label: "Non exécutée", tone: "danger" },
};

/** Confirmation explicite : action, objet, montant ; un appui = cette action seulement. */
export function ActionCard({ title, subtitle, action, onConfirm, onCancel, busy }: { title: string; subtitle: string | null; action: AdvisorActionDTO; onConfirm?: (a: AdvisorActionDTO) => void; onCancel?: (a: AdvisorActionDTO) => void; busy?: boolean }) {
  const st = ACTION_STATUS[action.status];
  // l'expiration (10 min) est contrôlée par le serveur au moment de la confirmation
  const pending = action.status === "pending";
  const until = new Date(action.expiresAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return (
    <View style={{ borderRadius: radius.xl, borderWidth: 2, borderColor: pending ? color.accent : color.line, backgroundColor: color.surface, padding: space[4], gap: space[3] }} accessibilityLabel={`${title}. ${action.summary}. ${st.label}`}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[2] }}>
        <Txt variant="overline" style={{ flex: 1 }}>
          {title}
        </Txt>
        <StatusChip label={st.label} tone={st.tone} />
      </View>
      <Txt variant="body">{action.summary}</Txt>
      {action.amount ? (
        <Txt variant="label">
          Montant concerné : {action.amount.replace(".", ",")} {action.currency ?? ""}
        </Txt>
      ) : null}
      {action.outcome ? (
        <Txt variant="label" color={action.status === "executed" ? color.success : color.ink2}>
          {action.outcome}
        </Txt>
      ) : null}
      {pending && onConfirm && onCancel ? (
        <>
          <Txt variant="label">
            {subtitle ?? "Rien n'est modifié sans votre confirmation."} Valable jusqu'à {until}.
          </Txt>
          <View style={{ flexDirection: "row", gap: space[2] }}>
            <Button label="Annuler" variant="secondary" compact onPress={() => onCancel(action)} disabled={busy} style={{ flex: 1 }} testID={`advisor-cancel-${action.id}`} />
            <Button label="Confirmer" compact onPress={() => onConfirm(action)} loading={busy} style={{ flex: 1 }} testID={`advisor-confirm-${action.id}`} />
          </View>
        </>
      ) : null}
    </View>
  );
}

export type VoicePhase = "idle" | "listening" | "thinking" | "speaking";

const PHASE_LABEL: Record<VoicePhase, string> = { idle: "", listening: "J'écoute…", thinking: "Le conseiller analyse vos données…", speaking: "Le conseiller répond…" };

/** Indicateur d'état (écoute / analyse / lecture) avec pulsation et bouton d'arrêt. */
export function VoiceStatus({ phase, detail, onStop }: { phase: VoicePhase; detail?: string | null; onStop: () => void }) {
  const [pulse] = useState(() => new Animated.Value(0.4));
  useEffect(() => {
    if (phase === "idle") return;
    const loop = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }), Animated.timing(pulse, { toValue: 0.4, duration: 600, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [phase, pulse]);
  if (phase === "idle") return null;
  const Icon = phase === "listening" ? Mic : phase === "speaking" ? Volume2 : Database;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[3], padding: space[3], borderRadius: radius.xl, backgroundColor: phase === "listening" ? color.accentSoft : color.lineSoft }} accessibilityLiveRegion="polite" accessibilityLabel={`${PHASE_LABEL[phase]}${detail ? ` ${detail}` : ""}`}>
      <Animated.View style={{ opacity: pulse, width: 32, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: phase === "listening" ? color.accent : color.ink }}>
        <Icon size={16} color={color.inkOnDark} />
      </Animated.View>
      <View style={{ flex: 1 }}>
        <Txt variant="body">{PHASE_LABEL[phase]}</Txt>
        {detail ? (
          <Txt variant="label" numberOfLines={2}>
            {detail}
          </Txt>
        ) : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={phase === "speaking" ? "Arrêter la lecture" : phase === "listening" ? "Arrêter l'écoute" : "Arrêter"} onPress={onStop} hitSlop={8} style={{ width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: color.surface, borderWidth: 1, borderColor: color.line }} testID="advisor-stop">
        {phase === "speaking" ? <VolumeX size={18} color={color.ink} /> : <Square size={14} color={color.ink} fill={color.ink} />}
      </Pressable>
    </View>
  );
}
