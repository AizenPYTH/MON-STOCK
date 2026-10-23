import { z } from "zod";

/**
 * Configuration publique de l'application (variables EXPO_PUBLIC_*, intégrées au bundle).
 * Jamais de secret ici : seules l'URL Supabase et sa clé publique (protégée par la RLS).
 */
const schema = z.object({
  supabaseUrl: z.string().url("EXPO_PUBLIC_SUPABASE_URL doit être une URL https.").startsWith("https://", "EXPO_PUBLIC_SUPABASE_URL doit être en https."),
  supabaseAnonKey: z.string().min(20, "Clé publique Supabase manquante (EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY)."),
  appEnv: z.string().trim().min(1).default("TEST"),
  /**
   * Site web public MON STOCK (pages Confidentialité, Conditions, Support, Mentions légales —
   * M-06). Défaut : l'adresse de production actuelle ; à surcharger par EXPO_PUBLIC_SITE_URL
   * le jour où le site change de domaine (aucune autre valeur n'est déduite).
   */
  siteUrl: z.string().url("EXPO_PUBLIC_SITE_URL doit être une URL https.").startsWith("https://", "EXPO_PUBLIC_SITE_URL doit être en https.").transform((v) => v.replace(/\/+$/, "")),
});

export const DEFAULT_SITE_URL = "https://mon-stock-chi.vercel.app";

export type AppConfig = z.infer<typeof schema>;

export type ConfigResult = { ok: true; config: AppConfig } | { ok: false; issues: string[] };

export function parseConfig(raw: Record<string, string | undefined>): ConfigResult {
  const parsed = schema.safeParse({
    supabaseUrl: raw.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: raw.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || raw.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    appEnv: raw.EXPO_PUBLIC_APP_ENV || undefined,
    siteUrl: raw.EXPO_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_URL,
  });
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((i) => i.message) };
  return { ok: true, config: parsed.data };
}

// Les variables EXPO_PUBLIC_* doivent être lues explicitement (remplacées à la compilation).
export const appConfig: ConfigResult = parseConfig({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_SITE_URL: process.env.EXPO_PUBLIC_SITE_URL,
});
