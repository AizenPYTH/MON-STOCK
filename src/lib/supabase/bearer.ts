import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import { publicEnv } from "@/lib/env";
import type { ServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Client Supabase côté serveur pour un appel de l'application mobile : il agit AU NOM DE
 * L'UTILISATEUR dont le jeton d'accès est fourni (en-tête `Authorization: Bearer …`).
 * Clé anon + JWT de l'utilisateur : la RLS s'applique exactement comme pour le web.
 * Aucune session n'est persistée ni rafraîchie côté serveur (le mobile gère son renouvellement).
 */
export function createBearerSupabaseClient(accessToken: string): ServerSupabaseClient {
  const env = publicEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
