import { z } from "zod";

/**
 * Validation des variables d'environnement.
 * - `publicEnv` : variables NEXT_PUBLIC_* (exposées au navigateur, jamais de secret)
 * - `serverEnv()` : secrets serveur, validés paresseusement pour ne pas casser le build.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  TOKEN_ENCRYPTION_KEY: z.string().min(32, "TOKEN_ENCRYPTION_KEY doit faire au moins 32 caractères (base64 de 32 octets)."),
  CRON_SECRET: z.string().min(16).optional(),
  SOURCING_USER_AGENT: z.string().min(1).default("MonStockBot/0.1"),
});

const ebaySchema = z.object({
  EBAY_ENV: z.enum(["production", "sandbox"]).default("production"),
  EBAY_CLIENT_ID: z.string().min(1),
  EBAY_CLIENT_SECRET: z.string().min(1),
  EBAY_RU_NAME: z.string().min(1),
  EBAY_WEBHOOK_VERIFICATION_TOKEN: z.string().min(32).max(80).optional(),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;
export type EbayEnv = z.infer<typeof ebaySchema>;

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvError";
  }
}

function formatIssues(prefix: string, error: z.ZodError): string {
  const lines = error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
  return `${prefix}\n${lines.join("\n")}\nVoir .env.example pour la liste des variables attendues.`;
}

let publicCache: PublicEnv | null = null;
let serverCache: ServerEnv | null = null;

export function publicEnv(): PublicEnv {
  if (publicCache) return publicCache;
  // Les variables NEXT_PUBLIC_* doivent être référencées explicitement pour être inlinées côté client.
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    throw new EnvError(formatIssues("Configuration Supabase manquante ou invalide :", parsed.error));
  }
  publicCache = parsed.data;
  return publicCache;
}

export function serverEnv(): ServerEnv {
  if (serverCache) return serverCache;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new EnvError(formatIssues("Configuration serveur manquante ou invalide :", parsed.error));
  }
  serverCache = parsed.data;
  return serverCache;
}

/** Retourne la configuration eBay, ou null si l'intégration n'est pas configurée. */
export function ebayEnv(): EbayEnv | null {
  const parsed = ebaySchema.safeParse(process.env);
  return parsed.success ? parsed.data : null;
}

export function ebayEnvIssues(): string[] {
  const parsed = ebaySchema.safeParse(process.env);
  return parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`);
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
