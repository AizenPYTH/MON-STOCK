import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import { appConfig } from "~/lib/config";
import { secureSessionStorage } from "~/lib/secure-store";

export type MobileSupabase = SupabaseClient<Database>;

let client: MobileSupabase | null = null;

/**
 * Client Supabase de l'application : clé PUBLIQUE + session de l'utilisateur.
 * Toutes les lectures et écritures passent par la RLS ; aucune clé service_role n'existe côté mobile.
 * - session persistée dans le trousseau / Keystore (pas dans un stockage navigateur) ;
 * - flux PKCE pour les liens email (confirmation, mot de passe oublié) ;
 * - renouvellement automatique piloté par l'état de l'application (voir SessionProvider).
 */
export function getSupabase(): MobileSupabase | null {
  if (!appConfig.ok) return null;
  if (!client) {
    client = createClient<Database>(appConfig.config.supabaseUrl, appConfig.config.supabaseAnonKey, {
      auth: {
        storage: secureSessionStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    });
  }
  return client;
}

export function requireSupabase(): MobileSupabase {
  const c = getSupabase();
  if (!c) throw new Error("Configuration Supabase manquante.");
  return c;
}
