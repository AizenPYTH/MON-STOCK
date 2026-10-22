import "server-only";
import { createLogger } from "@/lib/logger";
import { createAdminSupabaseClient, type AdminSupabaseClient } from "@/lib/supabase/admin";

const log = createLogger("AI_RETENTION");

/**
 * Conservation limitée des données du conseiller IA (audit I-08, D-10, Q-09).
 *
 * Les durées sont CONFIGURABLES dans la table advisor_retention_policy (serveur uniquement) :
 * conversations (sans nouveau message), cartes de résultats, actions terminées, journal d'usage IA.
 * La purge n'est PAS planifiée automatiquement : la planification (pg_cron, tâche serveur) sera
 * décidée avec le titulaire. Ces fonctions servent à l'appeler (tâche planifiée, script d'exploitation).
 */

export interface AdvisorPurgeReport {
  conversationsDeleted: number;
  messagesCardsCleared: number;
  stuckActionsRecovered: number;
  pendingActionsExpired: number;
  actionsDeleted: number;
  usageEventsDeleted: number;
}

function counts<T extends string>(data: unknown, keys: readonly T[]): Record<T, number> {
  const r = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  return Object.fromEntries(keys.map((k) => [k, typeof r[k] === "number" ? r[k] : 0])) as Record<T, number>;
}

/** Applique les durées de conservation (advisor_purge_expired). Lève en cas d'échec. */
export async function purgeExpiredAdvisorData(admin: AdminSupabaseClient = createAdminSupabaseClient(), now?: Date): Promise<AdvisorPurgeReport> {
  const { data, error } = await admin.rpc("advisor_purge_expired", now ? { p_now: now.toISOString() } : {});
  if (error) {
    log.warn("purge des données du conseiller en échec", { code: error.code ?? null });
    throw new Error("Purge des données du conseiller impossible.");
  }
  const report = counts(data, ["conversationsDeleted", "messagesCardsCleared", "stuckActionsRecovered", "pendingActionsExpired", "actionsDeleted", "usageEventsDeleted"] as const);
  log.info("purge des données du conseiller", { ...report });
  return report;
}

export interface AdvisorEbayPurgeReport {
  cardsCleared: number;
  messagesRewritten: number;
  titlesRewritten: number;
}

/**
 * Suppression d'un compte eBay (notification MARKETPLACE_ACCOUNT_DELETION) : retire des conversations
 * du conseiller les cartes et textes qui citent ce pseudo. Appelée automatiquement par les déclencheurs
 * SQL lorsque le pseudo est anonymisé dans orders / channel_connections ; à appeler EXPLICITEMENT pour un
 * acheteur qui n'a aucune commande synchronisée (seulement vu en lecture directe). Le pseudo n'est
 * jamais journalisé. Lève en cas d'échec (eBay redélivre la notification).
 */
export async function purgeAdvisorDataForEbayAccount(username: string, admin: AdminSupabaseClient = createAdminSupabaseClient()): Promise<AdvisorEbayPurgeReport> {
  const { data, error } = await admin.rpc("advisor_purge_ebay_account", { p_username: username });
  if (error) {
    log.warn("purge du conseiller (compte eBay supprimé) en échec", { code: error.code ?? null });
    throw new Error("Purge des données du conseiller impossible.");
  }
  return counts(data, ["cardsCleared", "messagesRewritten", "titlesRewritten"] as const);
}
