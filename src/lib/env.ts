import { z } from "zod";
import { cleanEnvValue, normalizeBaseUrl, siteUrl } from "@/lib/site";

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

/** Jeton produit du robot de collecte (sans contact : aucun contact n'est inventé). */
export const DEFAULT_SOURCING_USER_AGENT = "MonStockBot/0.1";

/** Valeurs d'exemple (documentation) qui ne désignent aucun contact réel. */
const PLACEHOLDER_CONTACT_RE = /(^|[@./])example\.(com|org|net|test)\b|\(\+contact\)/i;

/** Contact utilisable dans le User-Agent : URL https ou adresse e-mail, jamais une valeur d'exemple. */
export function botContact(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v || v.length > 200 || PLACEHOLDER_CONTACT_RE.test(v) || /[\s()]/.test(v)) return null;
  if (/^https:\/\/[^/\s]+\.[^/\s]+/i.test(v)) return v;
  if (/^(mailto:)?[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v)) return v.replace(/^mailto:/i, "");
  return null;
}

/**
 * User-Agent du robot de collecte (Q-19) : SOURCING_USER_AGENT s'il est défini (et n'est pas la
 * valeur d'exemple de la documentation), sinon « MonStockBot/0.1 ». Le contact configurable
 * SOURCING_BOT_CONTACT (page « robot » en https ou e-mail réel) est ajouté sous la forme
 * « (+contact) » s'il n'y figure pas déjà. Sans contact configuré, aucun contact n'est inventé.
 */
export function buildSourcingUserAgent(env: Readonly<Record<string, string | undefined>>): string {
  const configured = (env.SOURCING_USER_AGENT ?? "").trim();
  const base = configured && !PLACEHOLDER_CONTACT_RE.test(configured) ? configured : DEFAULT_SOURCING_USER_AGENT;
  const contact = botContact(env.SOURCING_BOT_CONTACT);
  if (!contact || base.includes("(+")) return base;
  return `${base} (+${contact})`;
}

/** User-Agent du robot, lisible sans les autres secrets serveur (sondes, scripts). */
export function sourcingUserAgent(): string {
  return buildSourcingUserAgent(process.env);
}

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  TOKEN_ENCRYPTION_KEY: z.string().min(32, "TOKEN_ENCRYPTION_KEY doit faire au moins 32 caractères (base64 de 32 octets)."),
  CRON_SECRET: z.string().min(16).optional(),
  SOURCING_USER_AGENT: z.string().default(DEFAULT_SOURCING_USER_AGENT),
  /** contact du robot de collecte (URL https d'une page « robot » ou adresse e-mail réelle) */
  SOURCING_BOT_CONTACT: z.string().optional(),
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

function parsePublicEnv() {
  // Les variables NEXT_PUBLIC_* doivent être référencées explicitement pour être inlinées (au
  // moment de la build, côté navigateur ET serveur). Valeurs collées nettoyées (espaces,
  // guillemets, `https://` manquant) ; sans NEXT_PUBLIC_APP_URL, l'adresse fournie par Vercel.
  return publicSchema.safeParse({
    NEXT_PUBLIC_APP_URL: siteUrl(),
    NEXT_PUBLIC_SUPABASE_URL: normalizeBaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  });
}

export function publicEnv(): PublicEnv {
  if (publicCache) return publicCache;
  const parsed = parsePublicEnv();
  if (!parsed.success) {
    throw new EnvError(formatIssues("Configuration Supabase manquante ou invalide :", parsed.error));
  }
  publicCache = parsed.data;
  return publicCache;
}

/** Noms des variables publiques absentes ou invalides (jamais leurs valeurs) ; [] si tout va bien. */
export function publicEnvIssues(): string[] {
  const parsed = parsePublicEnv();
  return parsed.success ? [] : [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "?")))];
}

export function serverEnv(): ServerEnv {
  if (serverCache) return serverCache;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new EnvError(formatIssues("Configuration serveur manquante ou invalide :", parsed.error));
  }
  serverCache = { ...parsed.data, SOURCING_USER_AGENT: buildSourcingUserAgent(process.env) };
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
