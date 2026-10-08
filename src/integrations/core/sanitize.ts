import { redact } from "@/lib/logger";

/**
 * Nettoyage des secrets AVANT persistance (sync_errors, sync_runs.error_summary,
 * channel_connections.last_error, webhook_events.error) et affichage.
 * `redact` (logger) masque les CLÉS sensibles ; ce module masque aussi les VALEURS qui
 * ressemblent à un secret, où qu'elles apparaissent (message d'erreur tiers, URL…).
 */
const SECRET_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  // En-têtes d'autorisation recopiés dans un message.
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=^#%!*-]{6,}/gi, "$1 [REDACTED]"],
  // Tokens OAuth eBay (« v^1.1#i^1#… »).
  [/v\^1\.1#[^\s"'<>,;)]+/g, "[REDACTED_TOKEN]"],
  // Secrets chiffrés MON STOCK (v1:<iv>:<ciphertext>:<tag>).
  [/\bv1:[A-Za-z0-9+/=]{8,}:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]{8,}/g, "[REDACTED_ENCRYPTED]"],
  // JWT (clés Supabase, tokens d'application…).
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[REDACTED_JWT]"],
  // Paramètres d'URL ou de formulaire sensibles.
  [/([?&\s"']|^)((?:access_token|refresh_token|client_secret|code|token|assertion)=)[^&\s"'<>]+/gi, "$1$2[REDACTED]"],
  // Champs JSON sensibles recopiés tels quels dans un message.
  [/("(?:access_token|refresh_token|client_secret|authorization)"\s*:\s*")[^"]*"/gi, '$1[REDACTED]"'],
];

export function scrubSecrets(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

/** Masque les clés sensibles puis les valeurs ressemblant à un secret, récursivement. */
export function scrubDeep<T>(value: T, depth = 0): T {
  const keyed = depth === 0 ? redact(value) : value;
  return scrubValues(keyed, depth) as T;
}

function scrubValues(value: unknown, depth: number): unknown {
  if (depth > 8) return value;
  if (typeof value === "string") return scrubSecrets(value);
  if (Array.isArray(value)) return value.map((v) => scrubValues(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = scrubValues(v, depth + 1);
    return out;
  }
  return value;
}
