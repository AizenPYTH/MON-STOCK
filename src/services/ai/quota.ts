import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import { AppError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { createAdminSupabaseClient, type AdminSupabaseClient } from "@/lib/supabase/admin";
import type { LlmUsage } from "./llm";

const log = createLogger("AI_QUOTA");

/**
 * Quotas et coûts des fonctions IA (audit S-09, S-10, I-14, S-23) — journal ai_usage_events.
 *
 *  - RÉSERVATION ATOMIQUE en base (fonction SQL ai_reserve_usage : compte + insère sous verrou,
 *    une seule transaction) AVANT l'appel au fournisseur ; insertion réservée au serveur
 *    (service_role) : un membre ne peut ni insérer ni effacer de lignes.
 *  - FAIL-CLOSED : si la réservation échoue (base injoignable, fonction absente, réponse illisible),
 *    la demande est REFUSÉE.
 *  - Comptage : chaque QUESTION (assistant), chaque BROUILLON, chaque APPEL AU MODÈLE (une question
 *    peut en faire jusqu'à 8) et chaque LECTURE VOCALE ; jetons consommés enregistrés par appel et
 *    plafonnés par organisation et par jour.
 * Les limites sont fixées ici (côté serveur) et transmises à la fonction SQL.
 */
export const AI_LIMITS = {
  /** questions au conseiller / à l'assistant, par utilisateur et par heure */
  assistantPerHour: 40,
  /** rafale : questions par utilisateur et par minute (mode conversation qui s'emballe, écho) */
  assistantPerMinute: 6,
  productDraftPerHour: 60,
  /** questions + brouillons, par organisation et par jour */
  orgPerDay: 400,
  /** appels au modèle (étapes d'outils comprises) */
  modelCallsPerUserPerHour: 240,
  modelCallsPerOrgPerDay: 2400,
  /** jetons (entrée + sortie) consommés par l'organisation sur 24 h glissantes */
  orgTokensPerDay: 5_000_000,
  /** lectures vocales (synthèse OpenAI) */
  speechPerUserPerHour: 60,
  speechPerOrgPerDay: 600,
} as const;

export type AiKind = "assistant" | "product_draft" | "model_call" | "speech";

const HOUR = 3600;
const DAY = 86_400;

interface Rule {
  userLimit: number;
  userWindow: number;
  orgLimit: number;
  orgWindow: number;
  orgKinds: AiKind[];
  tokens: boolean;
  burst?: { limit: number; window: number };
}

const RULES: Record<AiKind, Rule> = {
  assistant: { userLimit: AI_LIMITS.assistantPerHour, userWindow: HOUR, orgLimit: AI_LIMITS.orgPerDay, orgWindow: DAY, orgKinds: ["assistant", "product_draft"], tokens: true, burst: { limit: AI_LIMITS.assistantPerMinute, window: 60 } },
  product_draft: { userLimit: AI_LIMITS.productDraftPerHour, userWindow: HOUR, orgLimit: AI_LIMITS.orgPerDay, orgWindow: DAY, orgKinds: ["assistant", "product_draft"], tokens: true },
  model_call: { userLimit: AI_LIMITS.modelCallsPerUserPerHour, userWindow: HOUR, orgLimit: AI_LIMITS.modelCallsPerOrgPerDay, orgWindow: DAY, orgKinds: ["model_call"], tokens: true },
  speech: { userLimit: AI_LIMITS.speechPerUserPerHour, userWindow: HOUR, orgLimit: AI_LIMITS.speechPerOrgPerDay, orgWindow: DAY, orgKinds: ["speech"], tokens: false },
};

type Refusal = "not_member" | "user_limit" | "burst_limit" | "org_limit" | "org_tokens";

function refusal(kind: AiKind, reason: Refusal): AppError {
  switch (reason) {
    case "not_member":
      return new AppError("FORBIDDEN", "Utilisation de l'IA non autorisée pour ce compte.");
    case "burst_limit":
      return new AppError("RATE_LIMITED", "Trop de questions d'affilée : patientez une minute avant de reposer une question.");
    case "org_tokens":
      return new AppError("RATE_LIMITED", "Budget IA quotidien de l'organisation atteint (volume d'analyse). Réessayez demain.");
    case "user_limit":
      if (kind === "speech") return new AppError("RATE_LIMITED", `Trop de lectures vocales demandées (${AI_LIMITS.speechPerUserPerHour} par heure) : réessayez plus tard.`);
      if (kind === "model_call") return new AppError("RATE_LIMITED", "Limite d'analyses IA atteinte pour cette heure : réessayez plus tard.");
      return new AppError("RATE_LIMITED", `Limite atteinte : ${kind === "assistant" ? AI_LIMITS.assistantPerHour : AI_LIMITS.productDraftPerHour} demandes à l'IA par heure. Réessayez plus tard.`);
    case "org_limit":
      if (kind === "speech") return new AppError("RATE_LIMITED", "Limite quotidienne de lectures vocales de l'organisation atteinte. Réessayez demain.");
      if (kind === "model_call") return new AppError("RATE_LIMITED", "Budget IA quotidien de l'organisation atteint. Réessayez demain.");
      return new AppError("RATE_LIMITED", `Limite quotidienne de l'organisation atteinte (${AI_LIMITS.orgPerDay} demandes à l'IA). Réessayez demain.`);
  }
}

const QUOTA_UNAVAILABLE = "Contrôle du quota IA momentanément indisponible : réessayez dans un instant.";

type Subject = { organization: Pick<OrgContext["organization"], "id">; user: Pick<OrgContext["user"], "id"> };

/**
 * Réserve une unité de quota (atomique, fail-closed) et renvoie l'identifiant de l'événement.
 * Lève RATE_LIMITED / FORBIDDEN si refusé, une erreur 503 si le quota ne peut pas être vérifié.
 */
export async function reserveAiUsage(ctx: Subject, kind: AiKind, admin: AdminSupabaseClient = createAdminSupabaseClient()): Promise<string> {
  const rule = RULES[kind];
  let data: unknown;
  try {
    const res = await admin.rpc("ai_reserve_usage", {
      p_organization_id: ctx.organization.id,
      p_user_id: ctx.user.id,
      p_kind: kind,
      p_user_limit: rule.userLimit,
      p_user_window_seconds: rule.userWindow,
      p_org_limit: rule.orgLimit,
      p_org_window_seconds: rule.orgWindow,
      p_org_kinds: rule.orgKinds,
      p_org_token_limit: rule.tokens ? AI_LIMITS.orgTokensPerDay : null,
      p_burst_limit: rule.burst?.limit ?? null,
      p_burst_window_seconds: rule.burst?.window ?? null,
    });
    if (res.error) {
      log.warn("réservation du quota IA en échec : demande refusée", { kind, code: res.error.code ?? null });
      throw new AppError("INTERNAL", QUOTA_UNAVAILABLE, { status: 503 });
    }
    data = res.data;
  } catch (e) {
    if (e instanceof AppError) throw e;
    log.warn("réservation du quota IA impossible : demande refusée", { kind });
    throw new AppError("INTERNAL", QUOTA_UNAVAILABLE, { status: 503 });
  }
  const r = data && typeof data === "object" && !Array.isArray(data) ? (data as { allowed?: unknown; reason?: unknown; event_id?: unknown }) : null;
  if (!r || typeof r.allowed !== "boolean") {
    log.warn("réponse de quota IA illisible : demande refusée", { kind });
    throw new AppError("INTERNAL", QUOTA_UNAVAILABLE, { status: 503 });
  }
  if (!r.allowed) {
    const reason = (["not_member", "user_limit", "burst_limit", "org_limit", "org_tokens"] as const).find((x) => x === r.reason) ?? "org_limit";
    throw refusal(kind, reason);
  }
  if (typeof r.event_id !== "string") {
    log.warn("réservation de quota IA sans identifiant : demande refusée", { kind });
    throw new AppError("INTERNAL", QUOTA_UNAVAILABLE, { status: 503 });
  }
  return r.event_id;
}

/** Compatibilité des routes : réserve une question / un brouillon avant l'appel au modèle. */
export async function enforceAiQuota(ctx: Subject, kind: AiKind, admin?: AdminSupabaseClient): Promise<void> {
  await reserveAiUsage(ctx, kind, admin);
}

/** Jetons consommés par un appel réservé (comptabilité a posteriori : une erreur est journalisée, pas levée). */
export async function recordAiTokens(eventId: string, usage: LlmUsage, admin: AdminSupabaseClient = createAdminSupabaseClient()): Promise<void> {
  try {
    const { error } = await admin.rpc("ai_record_usage_tokens", { p_event_id: eventId, p_input_tokens: usage.inputTokens, p_output_tokens: usage.outputTokens });
    if (error) log.warn("jetons IA non enregistrés", { code: error.code ?? null });
  } catch {
    log.warn("jetons IA non enregistrés", { code: null });
  }
}

/**
 * Compteur des appels au modèle d'une boucle d'outils (conseiller, assistant) : chaque appel est
 * réservé AVANT d'être fait, ses jetons enregistrés APRÈS.
 */
export interface AiMeter {
  beforeModelCall(): Promise<string | null>;
  afterModelCall(eventId: string | null, usage: LlmUsage | null): Promise<void>;
}

export function aiMeter(ctx: Subject, admin?: AdminSupabaseClient): AiMeter {
  let client = admin;
  const get = () => (client ??= createAdminSupabaseClient());
  return {
    beforeModelCall: () => reserveAiUsage(ctx, "model_call", get()),
    async afterModelCall(eventId, usage) {
      if (eventId && usage) await recordAiTokens(eventId, usage, get());
    },
  };
}
