import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import { publicEnv, serverEnv } from "@/lib/env";

export type AdminSupabaseClient = SupabaseClient<Database>;

let cached: AdminSupabaseClient | null = null;

/**
 * Client service_role : CONTOURNE la RLS. À n'utiliser que dans le code serveur
 * qui vérifie lui-même l'appartenance à l'organisation (moteur de sync, webhooks,
 * cron, stockage des secrets OAuth). Jamais importé depuis un composant client.
 */
export function createAdminSupabaseClient(): AdminSupabaseClient {
  if (cached) return cached;
  const pub = publicEnv();
  const srv = serverEnv();
  cached = createClient<Database>(pub.NEXT_PUBLIC_SUPABASE_URL, srv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
