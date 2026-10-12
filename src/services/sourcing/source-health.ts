import "server-only";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import { createLogger } from "@/lib/logger";
import { FAILURE_ALERT_THRESHOLD, nextRunAt, type SyncFrequency } from "@/domain/sourcing/schedule";
import { resolveAlerts, upsertAlert } from "@/services/sync/alerts";

const log = createLogger("SOURCE_HEALTH");

export const syncFailedAlertKey = (sourceId: string) => `sourcing_sync_failed:${sourceId}`;

/**
 * Enregistre le résultat d'une synchronisation sur la source : compteur d'échecs consécutifs,
 * prochain passage (fréquence normale après un succès, reprise progressive après un échec),
 * alerte « synchronisation en échec » à partir de 3 échecs, résolue au premier succès.
 * Les offres ne sont jamais modifiées ici (une panne n'est pas une rupture de stock).
 */
export async function recordSourceOutcome(
  admin: AdminSupabaseClient,
  input: { sourceId: string; organizationId: string; sourceName: string; frequency: SyncFrequency; previousFailures: number; ok: boolean; error?: string | null; now?: Date },
): Promise<{ consecutiveFailures: number; nextRunAt: string | null }> {
  const now = input.now ?? new Date();
  const failures = input.ok ? 0 : input.previousFailures + 1;
  const next = nextRunAt(input.frequency, now, { ok: input.ok, consecutiveFailures: failures });
  const patch = input.ok
    ? { consecutive_failures: 0, next_run_at: next?.toISOString() ?? null }
    : { consecutive_failures: failures, last_failure_at: now.toISOString(), next_run_at: next?.toISOString() ?? null, ...(failures >= FAILURE_ALERT_THRESHOLD ? { status: "error" as const } : {}) };
  const { error } = await admin.from("supplier_sources").update(patch).eq("id", input.sourceId);
  if (error) log.warn("état de la source non enregistré", { sourceId: input.sourceId, error: error.message });
  if (input.ok) await resolveAlerts(admin, input.organizationId, [syncFailedAlertKey(input.sourceId)]);
  else if (failures >= FAILURE_ALERT_THRESHOLD) {
    await upsertAlert(admin, {
      organizationId: input.organizationId,
      type: "sync_failed",
      severity: failures >= FAILURE_ALERT_THRESHOLD * 2 ? "critical" : "warning",
      title: `Synchronisation en échec : ${input.sourceName}`,
      message: `${failures} échecs consécutifs${input.error ? ` (dernier : ${input.error.slice(0, 300)})` : ""}. Les offres déjà connues sont conservées, avec leur date de vérification. Prochain essai : ${next ? next.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "manuel"}.`,
      dedupeKey: syncFailedAlertKey(input.sourceId),
      entityType: "supplier_source",
      entityId: input.sourceId,
      actionHref: "/sourcing-sources",
    });
  }
  return { consecutiveFailures: failures, nextRunAt: next?.toISOString() ?? null };
}
