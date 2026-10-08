import "server-only";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/db/database.types";
import type { SyncStatus, SyncTrigger } from "@/db/types";
import { createLogger } from "@/lib/logger";

const log = createLogger("SYNC_RUNS");

export type SourcingSyncKind = "supplier_feed" | "supplier_source" | "supplier_connection" | "sourcing_alerts" | "fx_rates";

export interface SyncRunHandle {
  id: string;
  organizationId: string;
  startedAt: Date;
}

export interface SyncErrorInput {
  code: string;
  message: string;
  entityType?: string | null;
  entityRef?: string | null;
  details?: Json;
}

export const MAX_SYNC_ERRORS_RECORDED = 200;

/** Ouvre une ligne sync_runs (écriture serveur uniquement : la RLS bloque les clients utilisateurs). */
export async function startSyncRun(admin: AdminSupabaseClient, input: { organizationId: string; sourceKind: SourcingSyncKind; sourceRef?: string | null; provider: string; trigger: SyncTrigger; createdBy?: string | null }): Promise<SyncRunHandle> {
  const startedAt = new Date();
  const { data, error } = await admin
    .from("sync_runs")
    .insert({ organization_id: input.organizationId, source_kind: input.sourceKind, source_ref: input.sourceRef ?? null, provider: input.provider, trigger: input.trigger, status: "running", started_at: startedAt.toISOString(), created_by: input.createdBy ?? null })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Impossible d'ouvrir le journal de synchronisation : ${error?.message ?? "inconnu"}`);
  return { id: data.id, organizationId: input.organizationId, startedAt };
}

export async function finishSyncRun(admin: AdminSupabaseClient, run: SyncRunHandle, result: { status: SyncStatus; recordsProcessed: number; errorCount: number; stats?: Json; errorSummary?: string | null }): Promise<void> {
  const finishedAt = new Date();
  const { error } = await admin
    .from("sync_runs")
    .update({
      status: result.status,
      finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - run.startedAt.getTime(),
      records_processed: result.recordsProcessed,
      error_count: result.errorCount,
      stats: result.stats ?? {},
      error_summary: result.errorSummary ?? null,
    })
    .eq("id", run.id);
  if (error) log.warn("sync run not closed", { runId: run.id, error: error.message });
}

export async function recordSyncErrors(admin: AdminSupabaseClient, run: SyncRunHandle, errors: SyncErrorInput[]): Promise<void> {
  if (errors.length === 0) return;
  const rows = errors.slice(0, MAX_SYNC_ERRORS_RECORDED).map((e) => ({
    organization_id: run.organizationId,
    sync_run_id: run.id,
    code: e.code,
    message: e.message.slice(0, 2000),
    entity_type: e.entityType ?? null,
    entity_ref: e.entityRef ?? null,
    details: e.details ?? {},
  }));
  const { error } = await admin.from("sync_errors").insert(rows);
  if (error) log.warn("sync errors not recorded", { runId: run.id, error: error.message });
}

export const FREQUENCY_MS: Record<"manual" | "hourly" | "every_6_hours" | "daily", number | null> = {
  manual: null,
  hourly: 3_600_000,
  every_6_hours: 6 * 3_600_000,
  daily: 24 * 3_600_000,
};

export function isDue(frequency: keyof typeof FREQUENCY_MS, lastSyncAt: string | null, now: Date): boolean {
  const interval = FREQUENCY_MS[frequency];
  if (interval === null) return false;
  if (!lastSyncAt) return true;
  return now.getTime() - new Date(lastSyncAt).getTime() >= interval;
}
