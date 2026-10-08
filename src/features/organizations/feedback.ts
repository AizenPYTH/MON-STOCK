/**
 * Retours des actions d'administration des membres et des invitations.
 * Les actions de formulaire redirigent avec un CODE (jamais un texte libre dans l'URL :
 * pas d'injection de contenu via un lien forgé) ; la page traduit le code en message.
 */
import { isAppError } from "@/lib/errors";

export type FeedbackTone = "success" | "danger" | "warning";

const MESSAGES = {
  role_updated: { tone: "success", message: "Rôle mis à jour." },
  member_removed: { tone: "success", message: "Membre retiré de l'organisation." },
  invitation_revoked: { tone: "success", message: "Invitation révoquée." },
  self_role: { tone: "warning", message: "Vous ne pouvez pas modifier votre propre rôle : demandez à un autre administrateur ou propriétaire." },
  self_remove: { tone: "warning", message: "Vous ne pouvez pas vous retirer vous-même depuis cette page." },
  owner_only: { tone: "danger", message: "Seul un propriétaire peut attribuer, modifier ou retirer le rôle propriétaire." },
  last_owner: { tone: "danger", message: "L'organisation doit garder au moins un propriétaire : désignez-en un autre avant de retirer ou rétrograder celui-ci." },
  not_found: { tone: "danger", message: "Ce membre ou cette invitation n'existe plus dans votre organisation." },
  invalid: { tone: "danger", message: "Requête invalide : rechargez la page et réessayez." },
  forbidden: { tone: "danger", message: "Cette action est réservée aux administrateurs de l'organisation." },
  error: { tone: "danger", message: "L'opération n'a pas pu être enregistrée. Réessayez dans un instant." },
} as const satisfies Record<string, { tone: FeedbackTone; message: string }>;

export type FeedbackCode = keyof typeof MESSAGES;

export function feedbackFor(code: string | undefined | null): { tone: FeedbackTone; message: string } | null {
  if (!code || !Object.prototype.hasOwnProperty.call(MESSAGES, code)) return null;
  return MESSAGES[code as FeedbackCode];
}

/** Traduit une erreur PostgREST/AppError en code de retour. */
export function feedbackCodeFromError(e: unknown): FeedbackCode | "session_expired" {
  if (isAppError(e)) {
    if (e.code === "AUTH_REQUIRED") return "session_expired";
    if (e.code === "FORBIDDEN") return "forbidden";
    if (e.code === "NOT_FOUND") return "not_found";
    return "error";
  }
  const message = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "";
  if (message.includes("LAST_OWNER")) return "last_owner";
  if (message.includes("row-level security") || message.includes("permission denied")) return "forbidden";
  return "error";
}

/** Erreurs d'invitation : codes affichés sur /invite/[token]. */
const INVITE_MESSAGES = {
  invalid: "Cette invitation est invalide, a expiré ou a déjà été utilisée. Demandez une nouvelle invitation à l'administrateur.",
  email_mismatch: "Cette invitation a été envoyée à une autre adresse email que celle de votre compte. Connectez-vous avec la bonne adresse.",
  email_not_confirmed: "Confirmez d'abord votre adresse email (lien reçu à l'inscription), puis réessayez.",
  error: "L'invitation n'a pas pu être acceptée. Réessayez dans un instant.",
} as const;

export type InviteErrorCode = keyof typeof INVITE_MESSAGES;

export function inviteErrorMessage(code: string | undefined | null): string | undefined {
  if (!code || !Object.prototype.hasOwnProperty.call(INVITE_MESSAGES, code)) return code ? INVITE_MESSAGES.error : undefined;
  return INVITE_MESSAGES[code as InviteErrorCode];
}

export function inviteErrorCode(message: string | undefined): InviteErrorCode {
  const m = message ?? "";
  if (m.includes("INVITATION_EMAIL_MISMATCH")) return "email_mismatch";
  if (m.includes("INVITATION_EMAIL_NOT_CONFIRMED")) return "email_not_confirmed";
  if (m.includes("INVITATION_INVALID")) return "invalid";
  return "error";
}

/** Messages spécifiques aux contraintes de la base (organisations, membres). */
export function organizationDbErrorMessage(message: string | undefined): string | null {
  const m = message ?? "";
  if (m.includes("LAST_OWNER")) return MESSAGES.last_owner.message;
  if (m.includes("ORGANIZATION_NOT_MEMBER")) return "Vous n'êtes pas membre de cette organisation.";
  if (m.includes("INVITATION_EMAIL_INVALID")) return "Adresse email invalide.";
  if (m.includes("CROSS_ORGANIZATION_REFERENCE")) return "Élément introuvable dans votre organisation.";
  return null;
}
