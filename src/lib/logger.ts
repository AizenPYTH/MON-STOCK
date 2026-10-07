/**
 * Logger structuré. Les clés sensibles sont masquées : aucun token ne doit
 * jamais apparaître dans les logs.
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

function emit(level: Level, scope: string, message: string, meta?: Record<string, unknown>) {
  const line = {
    ts: new Date().toISOString(),
    level,
    scope,
    message,
    ...(meta ? redact(meta) : {}),
  };
  const text = `[${scope}] ${message}`;
  const payload = meta ? JSON.stringify(redact(meta)) : "";
  if (level === "error") console.error(text, payload);
  else if (level === "warn") console.warn(text, payload);
  else if (level === "debug") {
    if (process.env.NODE_ENV !== "production") console.debug(text, payload);
  } else console.info(text, payload);
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
