/**
 * Calendrier de la collecte hebdomadaire (module pur).
 *
 * Chaque source a un créneau hebdomadaire (jour ISO 1 = lundi … 7 = dimanche, heure UTC) :
 * choisi par l'utilisateur, sinon réparti de façon stable d'après l'identifiant de la source
 * (nuit, 1 h–5 h UTC) pour ne pas solliciter tous les fournisseurs en même temps.
 *
 * Décision à chaque passage du cron (toutes les 15 min) :
 * - collecte en cours → on la poursuit (reprise au curseur) ;
 * - créneau de la semaine atteint et pas encore de collecte terminée pour ce créneau → on démarre ;
 * - une collecte ABANDONNÉE (erreurs répétées) peut être relancée au plus 3 fois par créneau,
 *   avec 1 h d'attente entre deux essais ; une collecte terminée (complète ou non) ne l'est pas.
 */

export const WEEKLY_MAX_ATTEMPTS = 3;
export const WEEKLY_RETRY_AFTER_MS = 60 * 60_000;
const WEEK_MS = 7 * 24 * 3_600_000;

export type CollectionResult = "running" | "complete" | "incomplete" | "failed";

/** Bilan conservé dans supplier_sources.last_collection_stats. */
export interface CollectionStats {
  /** début du créneau hebdomadaire concerné (ISO) */
  slot?: string;
  /** essais démarrés pour ce créneau */
  attempts?: number;
  result?: CollectionResult;
  attemptStartedAt?: string;
  finishedAt?: string | null;
  pages?: number;
  offers?: number;
  stored?: number;
  rejected?: number;
  requestErrors?: number;
  incomplete?: string | null;
  seen?: number;
  missed?: number;
  expired?: number;
  message?: string | null;
}

/** État de reprise conservé dans supplier_sources.collect_cursor pendant une collecte. */
export interface CollectCursor {
  cursor: string | null;
  pages: number;
  offers: number;
  stored: number;
  rejected: number;
  /** requêtes en erreur (fiches illisibles, HTTP ≠ 2xx) : une seule suffit à rendre la collecte incomplète */
  requestErrors: number;
  /** pages de catalogue en échec d'affilée (3 → collecte abandonnée) */
  consecutiveFailures: number;
  /** le catalogue ne peut pas être lu en entier (plan du site tronqué…) */
  incomplete: string | null;
  /** offres de la page courante déjà enregistrées (budget épuisé au milieu d'une page) */
  pageOffset: number;
}

export const EMPTY_CURSOR: CollectCursor = { cursor: null, pages: 0, offers: 0, stored: 0, rejected: 0, requestErrors: 0, consecutiveFailures: 0, incomplete: null, pageOffset: 0 };

export function parseCursor(raw: unknown): CollectCursor {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  return {
    cursor: typeof o.cursor === "string" ? o.cursor : null,
    pages: n(o.pages),
    offers: n(o.offers),
    stored: n(o.stored),
    rejected: n(o.rejected),
    requestErrors: n(o.requestErrors),
    consecutiveFailures: n(o.consecutiveFailures),
    incomplete: typeof o.incomplete === "string" ? o.incomplete : null,
    pageOffset: n(o.pageOffset),
  };
}

export function parseStats(raw: unknown): CollectionStats {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as CollectionStats) : {};
}

/** Créneau par défaut, stable pour une source donnée : jour 1–7, heure 1–5 UTC. */
export function defaultSlot(sourceId: string): { weekday: number; hour: number } {
  let h = 0;
  for (const ch of sourceId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { weekday: 1 + (h % 7), hour: 1 + (Math.floor(h / 7) % 5) };
}

/** Début du dernier créneau (jour ISO + heure UTC) atteint à `now`. */
export function slotStart(now: Date, weekday: number, hour: number): Date {
  const isoDay = ((now.getUTCDay() + 6) % 7) + 1; // 1 = lundi … 7 = dimanche
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 0, 0, 0));
  d.setUTCDate(d.getUTCDate() - ((isoDay - weekday + 7) % 7));
  return d.getTime() > now.getTime() ? new Date(d.getTime() - WEEK_MS) : d;
}

export interface WeeklySourceState {
  id: string;
  status: string;
  sync_frequency: string;
  schedule_weekday: number | null;
  schedule_hour_utc: number | null;
  collection_started_at: string | null;
  last_full_collection_at: string | null;
  last_collection_stats: unknown;
}

export type WeeklyDecision = { action: "continue" } | { action: "start"; slot: string; attempt: number } | { action: "wait"; reason: string };

export function weeklyDecision(s: WeeklySourceState, now: Date, opts: { force?: boolean } = {}): WeeklyDecision {
  if (s.status === "paused") return { action: "wait", reason: "source désactivée" };
  if (s.sync_frequency !== "weekly" && !opts.force) return { action: "wait", reason: "source non hebdomadaire" };
  if (s.collection_started_at) return { action: "continue" };
  const fallback = defaultSlot(s.id);
  const slot = slotStart(now, s.schedule_weekday ?? fallback.weekday, s.schedule_hour_utc ?? fallback.hour);
  const slotIso = slot.toISOString();
  const stats = parseStats(s.last_collection_stats);
  const sameSlot = stats.slot === slotIso;
  const attempt = sameSlot ? (stats.attempts ?? 0) + 1 : 1;
  if (opts.force) return { action: "start", slot: slotIso, attempt };
  if (s.last_full_collection_at && new Date(s.last_full_collection_at).getTime() >= slot.getTime()) return { action: "wait", reason: "collecte complète déjà faite pour ce créneau" };
  if (sameSlot) {
    if (stats.result === "complete" || stats.result === "incomplete") return { action: "wait", reason: "collecte déjà terminée pour ce créneau" };
    if ((stats.attempts ?? 0) >= WEEKLY_MAX_ATTEMPTS) return { action: "wait", reason: `${WEEKLY_MAX_ATTEMPTS} essais déjà faits pour ce créneau` };
    if (stats.finishedAt && now.getTime() - new Date(stats.finishedAt).getTime() < WEEKLY_RETRY_AFTER_MS) return { action: "wait", reason: "nouvel essai dans moins d'une heure" };
  }
  return { action: "start", slot: slotIso, attempt };
}

/**
 * Fin de catalogue : la collecte n'est COMPLÈTE que si tout a été lu sans aucune erreur, que le
 * catalogue n'est pas signalé incomplet, qu'au moins une offre a été enregistrée et que le volume
 * ne s'est pas effondré (moins de la moitié des offres de la collecte complète précédente : signe
 * d'un site modifié ou d'une lecture cassée, pas d'une disparition réelle). Sinon elle est
 * « incomplete » : les offres lues sont enregistrées, aucune offre n'est déclarée absente.
 */
export function endOfCatalogResult(c: CollectCursor, previousSeen: number | null = null): { result: "complete" | "incomplete"; reason: string | null } {
  if (c.incomplete) return { result: "incomplete", reason: c.incomplete };
  if (c.requestErrors > 0) return { result: "incomplete", reason: `${c.requestErrors} requête(s) en erreur` };
  if (c.consecutiveFailures > 0) return { result: "incomplete", reason: "dernière page de catalogue en erreur" };
  if (c.stored === 0) return { result: "incomplete", reason: "aucune offre enregistrée" };
  if (previousSeen !== null && previousSeen > 0 && c.stored < previousSeen / 2) return { result: "incomplete", reason: `volume en forte baisse (${c.stored} offres contre ${previousSeen} à la collecte complète précédente)` };
  return { result: "complete", reason: null };
}
