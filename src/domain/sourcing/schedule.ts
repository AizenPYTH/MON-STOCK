/**
 * Planification des sources (module pur) : prochain passage après un succès (fréquence de la
 * source) ou après un échec (reprise progressive : 15 min, 30 min, 1 h… plafonnée à 24 h et
 * jamais au-delà de la fréquence normale). Une panne ne transforme jamais un stock en zéro :
 * seules les dates et le compteur d'échecs changent.
 */

export type SyncFrequency = "manual" | "hourly" | "every_6_hours" | "daily";

export const FREQUENCY_MS: Record<SyncFrequency, number | null> = {
  manual: null,
  hourly: 3_600_000,
  every_6_hours: 6 * 3_600_000,
  daily: 24 * 3_600_000,
};

export const FREQUENCY_LABEL: Record<SyncFrequency, string> = {
  manual: "Manuelle",
  hourly: "Toutes les heures",
  every_6_hours: "Toutes les 6 heures",
  daily: "Une fois par jour",
};

export const BACKOFF_BASE_MS = 15 * 60_000;
export const BACKOFF_MAX_MS = 24 * 3_600_000;
/** échecs consécutifs à partir desquels une alerte est levée et la source passe « en erreur » */
export const FAILURE_ALERT_THRESHOLD = 3;

/** Délai avant le prochain essai après `failures` échecs consécutifs (≥ 1). */
export function backoffMs(failures: number, frequency: SyncFrequency): number {
  const n = Math.max(1, failures);
  const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (n - 1));
  const interval = FREQUENCY_MS[frequency];
  return interval === null ? delay : Math.min(delay, interval);
}

/** Prochain passage planifié (null = synchronisation manuelle uniquement). */
export function nextRunAt(frequency: SyncFrequency, now: Date, outcome: { ok: boolean; consecutiveFailures: number }): Date | null {
  const interval = FREQUENCY_MS[frequency];
  if (interval === null) return null;
  return new Date(now.getTime() + (outcome.ok ? interval : backoffMs(outcome.consecutiveFailures, frequency)));
}

/** Source à synchroniser maintenant (planification automatique). */
export function isScheduleDue(s: { sync_frequency: SyncFrequency; status: string; next_run_at: string | null; last_sync_at: string | null }, now: Date): boolean {
  const interval = FREQUENCY_MS[s.sync_frequency];
  if (interval === null || s.status === "paused") return false;
  if (s.next_run_at) return now.getTime() >= new Date(s.next_run_at).getTime();
  if (!s.last_sync_at) return true;
  return now.getTime() - new Date(s.last_sync_at).getTime() >= interval;
}

export type SourceDisplayStatus = "connected" | "to_configure" | "manual_import" | "running" | "error" | "disabled";

export const SOURCE_STATUS_LABEL: Record<SourceDisplayStatus, string> = {
  connected: "Connecté",
  to_configure: "À configurer",
  manual_import: "Import manuel",
  running: "Synchronisation en cours",
  error: "Erreur",
  disabled: "Source désactivée",
};

/**
 * Statut affiché d'une source : « connecté » seulement si une synchronisation automatique a déjà
 * réussi (un fournisseur enregistré n'est pas un fournisseur connecté).
 */
export function sourceDisplayStatus(s: { status: string; kind: "file_import" | "public_web" | "remote_feed" | "connection" | "manual"; running: boolean; lastSuccessfulSyncAt: string | null; consecutiveFailures: number; attested: boolean }): SourceDisplayStatus {
  if (s.status === "paused") return "disabled";
  if (s.running) return "running";
  if (s.kind === "file_import" || s.kind === "manual") return s.consecutiveFailures > 0 || s.status === "error" ? "error" : "manual_import";
  if (!s.attested) return "to_configure";
  if (s.status === "error" || s.consecutiveFailures >= FAILURE_ALERT_THRESHOLD) return "error";
  return s.lastSuccessfulSyncAt ? "connected" : "to_configure";
}
