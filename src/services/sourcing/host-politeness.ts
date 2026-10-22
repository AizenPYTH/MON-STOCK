import "server-only";
import type { Json } from "@/db/database.types";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import { createLogger } from "@/lib/logger";
import type { HostSlotReserver } from "@/services/sourcing/adapter-runtime";
import type { RobotsCache, RobotsFetchResult, RobotsRules } from "@/services/sourcing/crawler/robots";

/**
 * Politesse envers les sites fournisseurs, PARTAGÉE entre utilisateurs, organisations et
 * instances de la fonction serveur (I-16) :
 *   - robots.txt mis en cache par origine (mémoire de l'instance, puis base) : relu au plus une
 *     fois par 24 h (RFC 9309, § 2.4), 10 min seulement après une erreur de lecture ;
 *   - créneau par hôte réservé en base (`sourcing_reserve_host_slot`) : le délai entre deux
 *     requêtes vers un même hôte (notre minimum, ou le Crawl-delay demandé) vaut pour TOUTES les
 *     recherches simultanées, pas seulement pour celle en cours.
 */
const log = createLogger("HOST_POLITENESS");

export const ROBOTS_CACHE_TTL_MS = 24 * 3_600_000;
export const ROBOTS_ERROR_TTL_MS = 10 * 60_000;
/** Crawl-delay pris en compte au plus (au-delà, la source ne peut pas être interrogée en direct utilement). */
export const MAX_CRAWL_DELAY_MS = 60_000;

const memory = new Map<string, { at: number; result: RobotsFetchResult }>();

/** Vide le cache mémoire (tests). */
export function clearRobotsMemoryCache(): void {
  memory.clear();
}

function fresh(result: RobotsFetchResult, at: number, now: number): boolean {
  return now - at < (result.status === "error" ? ROBOTS_ERROR_TTL_MS : ROBOTS_CACHE_TTL_MS);
}

function isRules(v: unknown): v is RobotsRules {
  return Boolean(v) && typeof v === "object" && Array.isArray((v as RobotsRules).groups) && Array.isArray((v as RobotsRules).sitemaps);
}

/** Cache robots.txt à deux niveaux (mémoire de l'instance, puis table sourcing_host_policies). */
export function sharedRobotsCache(admin: AdminSupabaseClient | null, clock: () => number = Date.now): RobotsCache {
  return {
    async get(origin) {
      const now = clock();
      const m = memory.get(origin);
      if (m && fresh(m.result, m.at, now)) return m.result;
      if (!admin) return null;
      const { data, error } = await admin.from("sourcing_host_policies").select("robots_status, robots_rules, robots_http_status, robots_error, robots_fetched_at").eq("host", origin).maybeSingle();
      if (error || !data || !data.robots_status || !data.robots_fetched_at) return null;
      const at = new Date(data.robots_fetched_at).getTime();
      const status = data.robots_status as RobotsFetchResult["status"];
      const rules = isRules(data.robots_rules) ? data.robots_rules : { groups: [], sitemaps: [] };
      const result: RobotsFetchResult = { status, rules, httpStatus: data.robots_http_status, error: data.robots_error };
      if (!fresh(result, at, now)) return null;
      memory.set(origin, { at, result });
      return result;
    },
    async set(origin, result) {
      const at = clock();
      memory.set(origin, { at, result });
      if (!admin) return;
      const crawlDelays = result.rules.groups.map((g) => g.crawlDelay).filter((d): d is number => d !== null);
      const { error } = await admin.from("sourcing_host_policies").upsert(
        {
          host: origin,
          robots_status: result.status,
          robots_rules: result.rules as unknown as Json,
          robots_http_status: result.httpStatus,
          robots_error: result.error?.slice(0, 500) ?? null,
          robots_fetched_at: new Date(at).toISOString(),
          crawl_delay_seconds: crawlDelays.length ? Math.max(...crawlDelays) : null,
          updated_at: new Date(at).toISOString(),
        },
        { onConflict: "host" },
      );
      if (error) log.warn("cache robots.txt non enregistré", { origin, error: error.message });
    },
  };
}

/**
 * Réservation de créneau partagée (RPC). En cas d'erreur de la base, la politesse locale de
 * l'instance s'applique seule (la recherche n'est pas bloquée), et l'incident est journalisé.
 */
export function sharedHostReserver(admin: AdminSupabaseClient): HostSlotReserver {
  return async (host, minIntervalMs, maxWaitMs) => {
    const { data, error } = await admin.rpc("sourcing_reserve_host_slot", { p_host: host.toLowerCase(), p_min_interval_ms: Math.min(Math.max(0, Math.round(minIntervalMs)), MAX_CRAWL_DELAY_MS), p_max_wait_ms: Math.max(0, Math.round(maxWaitMs)) });
    if (error || typeof data !== "number") {
      log.warn("créneau d'hôte non réservé (politesse locale seulement)", { host, error: error?.message ?? "réponse invalide" });
      return 0;
    }
    return data;
  };
}
