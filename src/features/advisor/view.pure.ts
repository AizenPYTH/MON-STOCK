import type { AdvisorActionDTO, AdvisorActionStatus, AdvisorCardDTO, AdvisorCardTone } from "@/features/mobile-api/contract";

/**
 * Règles d'affichage du conseiller (pures, partagées par la page et les tests) — reprises de
 * l'application iPhone (apps/mobile/src/components/advisor.tsx).
 */

export const ADVISOR_SUGGESTIONS = [
  "Fais-moi un bilan de mon activité ce mois-ci.",
  "Quel est mon chiffre d'affaires cette semaine ?",
  "Quelle est ma marge réelle après frais et coûts d'achat ?",
  "Quels produits risquent la rupture ?",
  "Qu'est-ce que tu me conseilles de faire aujourd'hui ?",
  "Quels produits sont immobilisés depuis longtemps ?",
] as const;

/** Élément affiché dans la conversation (message enregistré ou en cours de réception). */
export type ChatItem = {
  key: string;
  role: "user" | "assistant" | "notice";
  content: string;
  cards: AdvisorCardDTO[];
  sources: string[];
  interrupted?: boolean;
  error?: boolean;
  streaming?: boolean;
  /** identifiant enregistré de la réponse (lecture à voix haute avec la voix du serveur) */
  messageId?: string | null;
};

/** Messages enregistrés → éléments de conversation. */
export function chatItemsFrom(messages: readonly { id: string; role: "user" | "assistant" | "notice"; content: string; cards: AdvisorCardDTO[]; sources: string[]; interrupted: boolean }[]): ChatItem[] {
  return messages.map((m) => ({ key: m.id, role: m.role, content: m.content, cards: m.cards, sources: m.sources, interrupted: m.interrupted, messageId: m.role === "assistant" ? m.id : null }));
}

/** Avertissement affiché en tête de toute conversation. */
export const ADVISOR_INTRO = "Réponses appuyées sur vos données (ventes, stock, commandes, offres). Le conseiller ne modifie rien sans votre confirmation.";

/**
 * Quota réel : questions comptées dans l'heure glissante / limite par utilisateur renvoyée par le
 * serveur. Limite ou compteur inconnus → « — » et jauge vide (jamais une valeur supposée).
 */
export function quotaView(used: number | null, limit: number | null): { text: string; ratio: number | null; reached: boolean } {
  if (used === null || limit === null || limit <= 0) return { text: "—", ratio: null, reached: false };
  const shown = Math.min(used, limit);
  return { text: `${shown} / ${limit} questions cette heure`, ratio: shown / limit, reached: used >= limit };
}

/** Titre donné par le serveur à une nouvelle conversation (première question, 80 caractères). */
export function conversationTitleFrom(question: string): string {
  return question.replace(/\s+/g, " ").trim().slice(0, 80) || "Nouvelle conversation";
}

export const ACTION_STATUS: Record<AdvisorActionStatus, { label: string; tone: "accent" | "neutral" | "success" | "danger" }> = {
  pending: { label: "À confirmer", tone: "accent" },
  executing: { label: "En cours…", tone: "neutral" },
  executed: { label: "Fait", tone: "success" },
  cancelled: { label: "Annulée", tone: "neutral" },
  expired: { label: "Expirée", tone: "neutral" },
  failed: { label: "Non exécutée", tone: "danger" },
};

export const CARD_TONE_CLASS: Record<AdvisorCardTone, string> = { neutral: "text-foreground", success: "text-success", warning: "text-warning", danger: "text-danger" };

/**
 * Statut affiché : une action « à confirmer » dont le délai (10 min) est passé est présentée comme
 * expirée — le serveur la refuserait de toute façon au moment de la confirmation.
 */
export function displayedActionStatus(action: Pick<AdvisorActionDTO, "status" | "expiresAt">, now: Date = new Date()): AdvisorActionStatus {
  if (action.status !== "pending") return action.status;
  const t = Date.parse(action.expiresAt);
  return Number.isFinite(t) && t <= now.getTime() ? "expired" : "pending";
}

/** Montant exact (texte décimal du serveur) au format français : « 12.50 » → « 12,50 EUR ». */
export function formatActionAmount(amount: string | null, currency: string | null): string | null {
  if (amount === null || amount === "") return null;
  return `${amount.replace(".", ",")}${currency ? ` ${currency}` : ""}`;
}

/** Remplace, dans des cartes, l'action dont l'identifiant correspond (après confirmation / annulation). */
export function replaceActionInCards(cards: readonly AdvisorCardDTO[], action: AdvisorActionDTO): AdvisorCardDTO[] {
  return cards.map((c) => (c.action?.id === action.id ? { ...c, action } : c));
}

/** Identifiants des actions présentes dans des cartes (pour relire leur statut réel). */
export function actionIdsOf(cards: readonly AdvisorCardDTO[]): string[] {
  return cards.flatMap((c) => (c.action?.id ? [c.action.id] : []));
}

/** Cartes enregistrées en base (JSON) : on ne garde que ce qui a la forme d'une carte. */
export function sanitizeStoredCards(value: unknown): AdvisorCardDTO[] {
  if (!Array.isArray(value)) return [];
  return value.filter((c): c is AdvisorCardDTO => Boolean(c) && typeof c === "object" && typeof (c as { title?: unknown }).title === "string" && Array.isArray((c as { rows?: unknown }).rows)).map((c) => ({
    ...c,
    subtitle: c.subtitle ?? null,
    warnings: Array.isArray(c.warnings) ? c.warnings : [],
    action: c.action ?? null,
    text: c.text ?? null,
  }));
}

export function sanitizeStoredSources(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((s): s is string => typeof s === "string") : [];
}
