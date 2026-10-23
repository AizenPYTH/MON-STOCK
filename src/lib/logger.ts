/**
 * Logger structuré. Les clés sensibles sont masquées : aucun token ne doit
 * jamais apparaître dans les logs.
 *
 * Format (S-17) : UNE ligne JSON par événement — `{ ts, level, scope, message, requestId?, ...meta }` —
 * lisible par les journaux Supabase / Vercel et filtrable par champ. L'identifiant de requête vient
 * du fournisseur de contexte enregistré par le point d'entrée (Edge : server/edge/request-context.ts) ;
 * ce module n'importe rien (utilisable partout côté serveur).
 */
type Level = "debug" | "info" | "warn" | "error";

const SENSITIVE = /token|secret|password|authorization|credential|api[_-]?key|cookie/i;

export function redact<T>(value: T, depth = 0): T {
  if (depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? "[REDACTED]" : redact(v, depth + 1);
    }
    return out as T;
  }
  return value;
}

/** Contexte de corrélation (ex. `{ requestId }`) ajouté à chaque ligne. */
export type LogContext = { requestId?: string } & Record<string, string | number | boolean | null | undefined>;
type LogContextProvider = () => LogContext | undefined;

let contextProvider: LogContextProvider | null = null;

/** Enregistré une fois par le point d'entrée (Edge, instrumentation web). `null` le retire. */
export function setLogContextProvider(provider: LogContextProvider | null): void {
  contextProvider = provider;
}

function currentContext(): LogContext | undefined {
  try {
    return contextProvider?.() ?? undefined;
  } catch {
    return undefined;
  }
}

export interface LogLine {
  ts: string;
  level: Level;
  scope: string;
  message: string;
  requestId?: string;
  [key: string]: unknown;
}

function serialize(line: LogLine): string {
  try {
    return JSON.stringify(line, (_k, v: unknown) => (v instanceof Error ? { name: v.name, message: v.message } : typeof v === "bigint" ? v.toString() : v));
  } catch {
    // Référence circulaire, etc. : la ligne reste émise, sans les métadonnées.
    return JSON.stringify({ ts: line.ts, level: line.level, scope: line.scope, message: line.message, requestId: line.requestId, meta: "[non sérialisable]" });
  }
}

const BASE_FIELDS = new Set(["ts", "level", "scope", "message", "requestId"]);

function emit(level: Level, scope: string, message: string, meta?: Record<string, unknown>): LogLine {
  const ctx = currentContext();
  const line: LogLine = { ts: new Date().toISOString(), level, scope, message };
  if (ctx?.requestId) line.requestId = ctx.requestId;
  // Une métadonnée homonyme d'un champ de base (ex. `message` d'une erreur) est conservée sous « meta.<nom> ».
  for (const [k, v] of Object.entries(meta ? redact(meta) : {})) line[BASE_FIELDS.has(k) ? `meta.${k}` : k] = v;
  const text = serialize(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else if (level === "debug") {
    if (process.env.NODE_ENV !== "production") console.debug(text);
  } else console.info(text);
  return line;
}

export function createLogger(scope: string) {
  return {
    debug: (message: string, meta?: Record<string, unknown>) => emit("debug", scope, message, meta),
    info: (message: string, meta?: Record<string, unknown>) => emit("info", scope, message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => emit("warn", scope, message, meta),
    error: (message: string, meta?: Record<string, unknown>) => emit("error", scope, message, meta),
  };
}

export type Logger = ReturnType<typeof createLogger>;
