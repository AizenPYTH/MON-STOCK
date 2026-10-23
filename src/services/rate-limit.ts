import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import { AppError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { createAdminSupabaseClient, type AdminSupabaseClient } from "@/lib/supabase/admin";

const log = createLogger("RATE_LIMIT");

/**
 * Limitation de débit des routes coûteuses de l'Edge (audit S-15, I-29) : même mécanisme que le
 * quota IA (src/services/ai/quota.ts) — réservation ATOMIQUE en base (fonction api_rate_reserve,
 * migration 20261023000800, service_role seulement) AVANT le travail coûteux.
 *
 *  - délai minimal par OBJET (connexion eBay, colis) : un même objet n'est pas retraité en boucle ;
 *  - plafond par UTILISATEUR et par ORGANISATION sur une fenêtre glissante.
 *
 * Défaillance : si la fonction n'existe pas encore (Edge déployée avant la migration), la demande
 * passe avec un avertissement journalisé — une limite de débit protège, elle n'autorise rien.
 * Toute autre erreur de la base refuse la demande (503).
 */
export const API_RATE_LIMITS = {
  /** POST /ebay/sync : une synchronisation manuelle par connexion toutes les 2 min (même délai que « Synchroniser maintenant » des sources). */
  ebay_sync: { subjectMinIntervalSeconds: 120, userLimit: 20, userWindowSeconds: 3600, orgLimit: 60, orgWindowSeconds: 3600 },
  /** POST /shipping/quotes : clés transporteurs partagées par toutes les organisations (Sendcloud : 100 requêtes/min). */
  shipping_quotes: { subjectMinIntervalSeconds: null, userLimit: 20, userWindowSeconds: 60, orgLimit: 40, orgWindowSeconds: 60 },
  /** POST /tracking/refresh : un colis au plus une fois par minute ; quota quotidien DHL de 250 appels. */
  tracking_refresh: { subjectMinIntervalSeconds: 60, userLimit: 60, userWindowSeconds: 3600, orgLimit: 200, orgWindowSeconds: 86_400 },
} as const;

export type ApiRateBucket = keyof typeof API_RATE_LIMITS;

const LABEL: Record<ApiRateBucket, { subject: string; user: string; org: string }> = {
  ebay_sync: {
    subject: "Synchronisation de ce compte eBay lancée il y a moins de 2 minutes : patientez un peu.",
    user: "Trop de synchronisations eBay demandées : réessayez plus tard.",
    org: "Trop de synchronisations eBay demandées pour l'organisation : réessayez plus tard.",
  },
  shipping_quotes: {
    subject: "Devis déjà demandé : patientez un instant.",
    user: "Trop de demandes de devis d'affilée : patientez une minute.",
    org: "Trop de demandes de devis pour l'organisation : patientez une minute.",
  },
  tracking_refresh: {
    subject: "Colis actualisé il y a moins d'une minute : patientez un peu.",
    user: "Trop d'actualisations de colis demandées : réessayez plus tard.",
    org: "Limite quotidienne d'actualisations de colis de l'organisation atteinte : le suivi automatique continue.",
  },
};

const UNAVAILABLE = "Contrôle de la limite d'utilisation momentanément indisponible : réessayez dans un instant.";

type Subject = { organization: Pick<OrgContext["organization"], "id">; user: Pick<OrgContext["user"], "id"> };

/** Fonction absente (migration non appliquée) : PostgREST PGRST202, Postgres 42883. */
function isMissingFunction(error: { code?: string | null }): boolean {
  return error.code === "PGRST202" || error.code === "42883";
}

/**
 * Réserve un appel. Lève RATE_LIMITED (429) si refusé ; 503 si la limite ne peut pas être vérifiée.
 * `subject` : identifiant de l'objet traité (connexion, colis), null pour une limite par utilisateur seule.
 */
export async function reserveApiRate(ctx: Subject, bucket: ApiRateBucket, subject: string | null, admin: AdminSupabaseClient = createAdminSupabaseClient()): Promise<void> {
  const rule = API_RATE_LIMITS[bucket];
  let data: unknown;
  try {
    const res = await admin.rpc("api_rate_reserve", {
      p_organization_id: ctx.organization.id,
      p_user_id: ctx.user.id,
      p_bucket: bucket,
      p_subject: subject,
      p_subject_min_interval_seconds: rule.subjectMinIntervalSeconds,
      p_user_limit: rule.userLimit,
      p_user_window_seconds: rule.userWindowSeconds,
      p_org_limit: rule.orgLimit,
      p_org_window_seconds: rule.orgWindowSeconds,
    });
    if (res.error) {
      if (isMissingFunction(res.error)) {
        log.warn("limite de débit non appliquée : fonction api_rate_reserve absente (migration 20261023000800 à appliquer)", { bucket });
        return;
      }
      log.warn("limite de débit : réservation en échec, demande refusée", { bucket, code: res.error.code ?? null });
      throw new AppError("INTERNAL", UNAVAILABLE, { status: 503 });
    }
    data = res.data;
  } catch (e) {
    if (e instanceof AppError) throw e;
    log.warn("limite de débit : réservation impossible, demande refusée", { bucket });
    throw new AppError("INTERNAL", UNAVAILABLE, { status: 503 });
  }
  const r = data && typeof data === "object" && !Array.isArray(data) ? (data as { allowed?: unknown; reason?: unknown; retry_after_seconds?: unknown }) : null;
  if (!r || typeof r.allowed !== "boolean") {
    log.warn("limite de débit : réponse illisible, demande refusée", { bucket });
    throw new AppError("INTERNAL", UNAVAILABLE, { status: 503 });
  }
  if (r.allowed) return;
  const retryAfter = typeof r.retry_after_seconds === "number" ? r.retry_after_seconds : null;
  const label = LABEL[bucket];
  const message = r.reason === "subject_cooldown" ? label.subject : r.reason === "user_limit" ? label.user : label.org;
  log.info("appel limité", { bucket, reason: typeof r.reason === "string" ? r.reason : null, retryAfter, orgId: ctx.organization.id });
  throw new AppError("RATE_LIMITED", message, { details: { retryAfterSeconds: retryAfter } });
}
