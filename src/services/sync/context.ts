import "server-only";
import type { ChannelConnection } from "@/db/types";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import type { Logger } from "@/lib/logger";
import { scrubDeep, scrubSecrets } from "@/integrations/core/sanitize";
import type { ConnectorAuth, MarketplaceConnector } from "@/integrations/core/connector";

export interface SyncErrorInput {
  code: string;
  message: string;
  entityType?: string | null;
  entityRef?: string | null;
  details?: Record<string, unknown>;
}

export interface SyncContext {
  admin: AdminSupabaseClient;
  connection: ChannelConnection;
  organizationId: string;
  salesChannelId: string;
  connector: MarketplaceConnector;
  auth: ConnectorAuth;
  log: Logger;
  /** Journalise une erreur non fatale (sans secret) ; elle sera persistée dans sync_errors. */
  recordError: (e: SyncErrorInput) => void;
}

/** Nettoie les détails avant persistance : aucune clé ni valeur sensible, taille bornée. */
export function sanitizeDetails(details: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!details) return {};
  const cleaned = scrubDeep(details);
  const json = JSON.stringify(cleaned);
  if (json.length <= 4000) return cleaned;
  return { truncated: true, preview: json.slice(0, 3900) };
}

/** Message persisté (sync_errors.message, error_summary, last_error) : sans secret, borné. */
export function sanitizeMessage(message: string, max = 2000): string {
  return scrubSecrets(message).slice(0, max);
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Pagination générique : déplacée dans src/lib/supabase/paginate.ts (réutilisée hors synchronisation).
export { DB_PAGE_SIZE, fetchAllRows } from "@/lib/supabase/paginate";
