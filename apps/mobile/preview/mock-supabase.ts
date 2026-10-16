/**
 * APERÇU VISUEL UNIQUEMENT : remplace `~/lib/supabase` quand MONSTOCK_PREVIEW=1 (metro.config.js).
 * Aucune connexion à Supabase : les écrans lisent la base de démonstration en mémoire.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import { createDemoClient, DEMO_USER, demoTables } from "./demo-db";

export type MobileSupabase = SupabaseClient<Database>;

// Le client de démonstration n'implémente que le sous-ensemble utilisé par l'application.
const client = createDemoClient(demoTables(), DEMO_USER) as unknown as MobileSupabase;

export function getSupabase(): MobileSupabase | null {
  return client;
}

export function requireSupabase(): MobileSupabase {
  return client;
}
