import "server-only";
import type { ConnectorAuth } from "@/integrations/core/connector";
import { createLogger } from "@/lib/logger";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import { upsertAlert } from "@/services/sync/alerts";

const log = createLogger("EBAY_USAGE");

/**
 * Compteur quotidien d'appels eBay (audit I-12), volontairement simple :
 *  - le moteur de synchronisation compte les appels HTTP authentifiés de chaque run (une demande de
 *    jeton = un appel Trading ou REST ; les nouvelles tentatives internes ne sont pas recomptées) ;
 *  - en fin de run, le total est ajouté au compteur du jour UTC de la connexion (ebay_api_usage_add,
 *    migration 20261023000820) ;
 *  - au-delà de 80 % du budget quotidien de l'APPLICATION eBay (toutes connexions), une ligne
 *    d'avertissement est journalisée et une alerte est créée (une par organisation et par jour).
 * Le budget par défaut (5 000) est la limite quotidienne par défaut de la Trading API ; la valeur
 * réelle se lit dans le portail développeur eBay (Application Growth Check) et se règle avec
 * EBAY_DAILY_CALL_BUDGET. Le compteur n'arrête rien : il rend la consommation visible.
 */
export const EBAY_DAILY_CALL_BUDGET_DEFAULT = 5_000;
export const EBAY_USAGE_WARN_RATIO = 0.8;

export function ebayDailyCallBudget(env: Record<string, string | undefined> = process.env): number {
  const v = Number(env.EBAY_DAILY_CALL_BUDGET ?? "");
  return Number.isInteger(v) && v > 0 ? v : EBAY_DAILY_CALL_BUDGET_DEFAULT;
}

/** Enveloppe un ConnectorAuth : chaque demande de jeton précède exactement un appel HTTP eBay. */
export function countingAuth(auth: ConnectorAuth): { auth: ConnectorAuth; calls: () => number } {
  let calls = 0;
  return {
    auth: {
      getAccessToken: (options) => {
        calls++;
        return auth.getAccessToken(options);
      },
    },
    calls: () => calls,
  };
}

export interface EbayUsageRecord {
  usageDate: string;
  calls: number;
  appCalls: number;
  budget: number;
  nearQuota: boolean;
}

/** Enregistre les appels d'un run (best effort : une erreur est journalisée, jamais levée). */
export async function recordEbayApiUsage(admin: AdminSupabaseClient, connection: { id: string; organization_id: string }, calls: number, env: Record<string, string | undefined> = process.env): Promise<EbayUsageRecord | null> {
  if (!Number.isInteger(calls) || calls <= 0) return null;
  try {
    const { data, error } = await admin.rpc("ebay_api_usage_add", { p_connection_id: connection.id, p_calls: calls });
    if (error) {
      log.warn("compteur d'appels eBay non enregistré", { connectionId: connection.id, code: error.code ?? null });
      return null;
    }
    const r = data && typeof data === "object" && !Array.isArray(data) ? (data as { usage_date?: unknown; calls?: unknown; app_calls?: unknown }) : null;
    if (!r || typeof r.calls !== "number" || typeof r.app_calls !== "number" || typeof r.usage_date !== "string") return null;
    const budget = ebayDailyCallBudget(env);
    const nearQuota = r.app_calls >= budget * EBAY_USAGE_WARN_RATIO;
    const record: EbayUsageRecord = { usageDate: r.usage_date, calls: r.calls, appCalls: r.app_calls, budget, nearQuota };
    if (nearQuota) {
      const pct = Math.round((r.app_calls / budget) * 100);
      log.warn("quota quotidien d'appels eBay bientôt atteint", { connectionId: connection.id, usageDate: r.usage_date, calls: r.calls, appCalls: r.app_calls, budget, pct });
      await upsertAlert(admin, {
        organizationId: connection.organization_id,
        type: "ebay_api_quota",
        severity: r.app_calls >= budget ? "critical" : "warning",
        title: "Quota d'appels eBay bientôt atteint",
        message: `${r.app_calls} appels eBay aujourd'hui (UTC) pour un budget de ${budget} (${pct} %). Au-delà, eBay refuse les appels jusqu'au lendemain : espacez les synchronisations ou demandez une hausse de quota (Application Growth Check).`,
        dedupeKey: `ebay_api_quota:${r.usage_date}`,
        entityType: "channel_connection",
        entityId: connection.id,
        actionHref: "/settings/integrations",
      });
    }
    return record;
  } catch (e) {
    log.warn("compteur d'appels eBay non enregistré", { connectionId: connection.id, error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}
