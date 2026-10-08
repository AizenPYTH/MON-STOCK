import "server-only";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import { createLogger } from "@/lib/logger";

const log = createLogger("ALERTS");

export interface AlertInput {
  organizationId: string;
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  dedupeKey: string;
  entityType?: string | null;
  entityId?: string | null;
  actionHref?: string | null;
}

/** Crée ou met à jour l'alerte ouverte portant la même clé de déduplication (index unique partiel). */
export async function upsertAlert(admin: AdminSupabaseClient, input: AlertInput): Promise<void> {
  const { data: existing } = await admin
    .from("alerts")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("dedupe_key", input.dedupeKey)
    .neq("status", "resolved")
    .maybeSingle();
  if (existing) {
    const { error } = await admin
      .from("alerts")
      .update({ title: input.title, message: input.message, severity: input.severity, action_href: input.actionHref ?? null })
      .eq("id", existing.id);
    if (error) log.warn("mise à jour d'alerte impossible", { dedupeKey: input.dedupeKey, error: error.message });
    return;
  }
  const { error } = await admin.from("alerts").insert({
    organization_id: input.organizationId,
    type: input.type,
    severity: input.severity,
    title: input.title,
    message: input.message,
    dedupe_key: input.dedupeKey,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    action_href: input.actionHref ?? null,
    status: "open",
  });
  // 23505 : une autre exécution vient de créer la même alerte — rien à faire.
  if (error && error.code !== "23505") log.warn("création d'alerte impossible", { dedupeKey: input.dedupeKey, error: error.message });
}

export async function resolveAlerts(admin: AdminSupabaseClient, organizationId: string, dedupeKeys: string[]): Promise<void> {
  if (dedupeKeys.length === 0) return;
  const { error } = await admin
    .from("alerts")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .in("dedupe_key", dedupeKeys)
    .neq("status", "resolved");
  if (error) log.warn("résolution d'alertes impossible", { dedupeKeys, error: error.message });
}

export const connectionExpiredKey = (connectionId: string) => `connection_expired:${connectionId}`;
export const syncFailedKey = (connectionId: string) => `sync_failed:${connectionId}`;
