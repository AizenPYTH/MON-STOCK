// GÉNÉRÉ par scripts/build-edge.mjs — ne pas modifier à la main.
import { Buffer as __Buffer } from "node:buffer";
const __denoEnv = globalThis.Deno?.env?.toObject?.() ?? {};
const process = { env: { NODE_ENV: "production", ...__denoEnv, NEXT_PUBLIC_SUPABASE_URL: __denoEnv.SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: __denoEnv.SUPABASE_ANON_KEY, NEXT_PUBLIC_APP_URL: __denoEnv.APP_URL ?? __denoEnv.SUPABASE_URL } };
const Buffer = globalThis.Buffer ?? __Buffer;

// server/edge/api.ts
import { z as z28 } from "npm:zod@4.6.5";

// src/lib/logger.ts
var SENSITIVE = /token|secret|password|authorization|credential|api[_-]?key|cookie/i;
function redact(value, depth = 0) {
  if (depth > 6) return value;
  if (Array.isArray(value)) return value.map((v2) => redact(v2, depth + 1));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v2] of Object.entries(value)) {
      out[k] = SENSITIVE.test(k) ? "[REDACTED]" : redact(v2, depth + 1);
    }
    return out;
  }
  return value;
}
function emit(level, scope, message, meta) {
  const line = {
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    level,
    scope,
    message,
    ...meta ? redact(meta) : {}
  };
  const text2 = `[${scope}] ${message}`;
  const payload = meta ? JSON.stringify(redact(meta)) : "";
  if (level === "error") console.error(text2, payload);
  else if (level === "warn") console.warn(text2, payload);
  else if (level === "debug") {
    if (process.env.NODE_ENV !== "production") console.debug(text2, payload);
  } else console.info(text2, payload);
  return line;
}
function createLogger(scope) {
  return {
    debug: (message, meta) => emit("debug", scope, message, meta),
    info: (message, meta) => emit("info", scope, message, meta),
    warn: (message, meta) => emit("warn", scope, message, meta),
    error: (message, meta) => emit("error", scope, message, meta)
  };
}

// src/integrations/core/sanitize.ts
var SECRET_PATTERNS = [
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
  [/("(?:access_token|refresh_token|client_secret|authorization)"\s*:\s*")[^"]*"/gi, '$1[REDACTED]"']
];
function scrubSecrets(text2) {
  let out = text2;
  for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement);
  return out;
}
function scrubDeep(value, depth = 0) {
  const keyed = depth === 0 ? redact(value) : value;
  return scrubValues(keyed, depth);
}
function scrubValues(value, depth) {
  if (depth > 8) return value;
  if (typeof value === "string") return scrubSecrets(value);
  if (Array.isArray(value)) return value.map((v2) => scrubValues(v2, depth + 1));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v2] of Object.entries(value)) out[k] = scrubValues(v2, depth + 1);
    return out;
  }
  return value;
}

// src/lib/db-error-messages.ts
var SQL_ERROR_MESSAGES = {
  AUTH_REQUIRED: { code: "AUTH_REQUIRED", message: "Connexion requise." },
  FORBIDDEN: { code: "FORBIDDEN", message: "Vous n'avez pas les droits n\xE9cessaires sur cette organisation." },
  CROSS_ORGANIZATION_REFERENCE: { code: "FORBIDDEN", message: "Op\xE9ration refus\xE9e : cet \xE9l\xE9ment appartient \xE0 une autre organisation." },
  ORGANIZATION_IMMUTABLE: { code: "FORBIDDEN", message: "Op\xE9ration refus\xE9e : un \xE9l\xE9ment ne peut pas changer d'organisation." },
  ORGANIZATION_NOT_MEMBER: { code: "FORBIDDEN", message: "Vous n'\xEAtes pas membre de cette organisation." },
  LAST_OWNER: { code: "CONFLICT", message: "Impossible : l'organisation doit conserver au moins un propri\xE9taire." },
  INVITATION_INVALID: { code: "NOT_FOUND", message: "Invitation invalide ou expir\xE9e." },
  INVITATION_EMAIL_MISMATCH: { code: "FORBIDDEN", message: "Cette invitation a \xE9t\xE9 envoy\xE9e \xE0 une autre adresse email." },
  INVITATION_EMAIL_NOT_CONFIRMED: { code: "FORBIDDEN", message: "Confirmez d'abord votre adresse email, puis acceptez l'invitation." },
  INVITATION_EMAIL_INVALID: { code: "VALIDATION", message: "Adresse email d'invitation invalide." },
  INVALID_TOKEN: { code: "VALIDATION", message: "Lien invalide." },
  INSUFFICIENT_STOCK: { code: "VALIDATION", message: "Stock insuffisant : ce mouvement rendrait le stock n\xE9gatif." },
  MOVEMENT_QUANTITY_ZERO: { code: "VALIDATION", message: "La quantit\xE9 d'un mouvement ne peut pas \xEAtre nulle." },
  MOVEMENT_QUANTITY_TOO_LARGE: { code: "VALIDATION", message: "Quantit\xE9 trop importante pour un seul mouvement." },
  MOVEMENT_SIGN_INVALID: { code: "VALIDATION", message: "Sens du mouvement incoh\xE9rent avec son type (entr\xE9e / sortie)." },
  STOCK_QUANTITY_TOO_LARGE: { code: "VALIDATION", message: "Le stock r\xE9sultant d\xE9passerait la limite autoris\xE9e." },
  SKU_NOT_FOUND: { code: "NOT_FOUND", message: "SKU introuvable." },
  SKU_CODE_EXISTS: { code: "CONFLICT", message: "Ce code SKU existe d\xE9j\xE0 dans votre organisation." },
  SKU_CODE_REQUIRED: { code: "VALIDATION", message: "Le code SKU est requis." },
  SKU_CODE_DUPLICATE_IN_REQUEST: { code: "VALIDATION", message: "Deux variantes utilisent le m\xEAme code SKU : chaque variante doit avoir un code unique." },
  VARIANTS_REQUIRED: { code: "VALIDATION", message: "Ajoutez au moins une variante." },
  VARIANTS_TOO_MANY: { code: "VALIDATION", message: "50 variantes maximum par envoi." },
  PRODUCT_NAME_REQUIRED: { code: "VALIDATION", message: "Le nom du produit est requis." },
  SKU_STALE: { code: "CONFLICT", message: "Ce SKU a \xE9t\xE9 modifi\xE9 entre-temps (autre onglet ou autre utilisateur). Rechargez la page pour voir la derni\xE8re version : vos changements n'ont pas \xE9t\xE9 enregistr\xE9s." },
  SKU_UPDATE_INVALID: { code: "VALIDATION", message: "Modification du SKU invalide : v\xE9rifiez les champs du formulaire." },
  SKU_HAS_HISTORY: { code: "CONFLICT", message: "Ce SKU a un historique (mouvements, ventes ou commandes) : archivez-le plut\xF4t que de le supprimer." },
  PRODUCT_NOT_FOUND: { code: "NOT_FOUND", message: "Produit introuvable." },
  LISTING_NOT_FOUND: { code: "NOT_FOUND", message: "Annonce introuvable." },
  CHANNEL_NOT_FOUND: { code: "NOT_FOUND", message: "Canal de vente introuvable." },
  CONNECTION_NOT_FOUND: { code: "NOT_FOUND", message: "Connexion introuvable." },
  INVALID_ORDER: { code: "VALIDATION", message: "Commande externe invalide (donn\xE9es incompl\xE8tes ou incoh\xE9rentes) : elle n'a pas \xE9t\xE9 import\xE9e." },
  PURCHASE_ORDER_NOT_FOUND: { code: "NOT_FOUND", message: "Commande fournisseur introuvable." },
  PURCHASE_ORDER_ITEM_NOT_FOUND: { code: "NOT_FOUND", message: "Ligne de commande fournisseur introuvable." },
  PURCHASE_ORDER_CANCELLED: { code: "CONFLICT", message: "Cette commande fournisseur est annul\xE9e." },
  PURCHASE_ORDER_CLOSED: { code: "CONFLICT", message: "Cette commande fournisseur est cl\xF4tur\xE9e." },
  PURCHASE_ORDER_ALREADY_RECEIVED: { code: "CONFLICT", message: "Cette commande fournisseur a d\xE9j\xE0 \xE9t\xE9 enti\xE8rement re\xE7ue." },
  PURCHASE_ORDER_EMPTY: { code: "VALIDATION", message: "La commande fournisseur ne contient aucune ligne." },
  PURCHASE_ORDER_INVALID_STATUS: { code: "VALIDATION", message: "Statut de commande fournisseur invalide." },
  PURCHASE_ORDER_INVALID_TRANSITION: { code: "CONFLICT", message: "Ce changement de statut n'est pas autoris\xE9 pour cette commande." },
  PURCHASE_ORDER_LOCKED: { code: "CONFLICT", message: "Cette commande n'est plus modifiable (envoy\xE9e ou r\xE9ceptionn\xE9e)." },
  PURCHASE_ORDER_NOT_DELETABLE: { code: "CONFLICT", message: "Cette commande ne peut pas \xEAtre supprim\xE9e : seules les commandes en brouillon le peuvent." },
  PURCHASE_ORDER_NOT_SENT: { code: "CONFLICT", message: "La commande doit \xEAtre envoy\xE9e avant d'\xEAtre r\xE9ceptionn\xE9e." },
  PURCHASE_ORDER_RECEIPT_REQUIRED: { code: "VALIDATION", message: "Indiquez au moins une quantit\xE9 re\xE7ue." },
  PURCHASE_ORDER_STALE: { code: "CONFLICT", message: "La commande a \xE9t\xE9 modifi\xE9e entre-temps : rechargez la page et r\xE9essayez." },
  INVALID_RECEIPTS: { code: "VALIDATION", message: "R\xE9ception invalide : v\xE9rifiez les quantit\xE9s saisies." }
};
var NETWORK_ERROR = /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|socket hang up|Network request failed/i;
function describeDbError(e) {
  const msg = e.message ?? "Erreur base de donn\xE9es";
  const head = msg.match(/^([A-Z][A-Z0-9_]{2,})\b/)?.[1];
  const known2 = head ? SQL_ERROR_MESSAGES[head] : void 0;
  if (known2) return { code: known2.code, message: known2.message, details: { pg: e.code ?? null, sqlCode: head ?? null } };
  for (const [k, v2] of Object.entries(SQL_ERROR_MESSAGES)) {
    if (msg.includes(k)) return { code: v2.code, message: v2.message, details: { pg: e.code ?? null, sqlCode: k } };
  }
  if (e.code === "42501") return { code: "FORBIDDEN", message: "Vous n'avez pas les droits n\xE9cessaires pour cette action." };
  if (e.code === "23505") return { code: "CONFLICT", message: "Cet enregistrement existe d\xE9j\xE0 (doublon).", details: { pg: e.details ?? null } };
  if (e.code === "23503") return { code: "CONFLICT", message: "Impossible : cet \xE9l\xE9ment est r\xE9f\xE9renc\xE9 par d'autres donn\xE9es." };
  if (e.code === "23514") return { code: "VALIDATION", message: "Valeur invalide (contrainte de validation).", details: { pg: msg } };
  if (e.code === "22001") return { code: "VALIDATION", message: "Valeur trop longue : raccourcissez le texte saisi.", details: { pg: e.code } };
  if (e.code === "22003") return { code: "VALIDATION", message: "Nombre hors limites : v\xE9rifiez les quantit\xE9s et montants saisis.", details: { pg: e.code } };
  if (e.code === "40001" || e.code === "40P01") return { code: "CONFLICT", message: "Conflit d'acc\xE8s simultan\xE9, r\xE9essayez.", details: { pg: e.code } };
  if (e.code === "PGRST116") return { code: "NOT_FOUND", message: "\xC9l\xE9ment introuvable." };
  if (e.code === "PGRST301" || /jwt expired/i.test(msg)) return { code: "AUTH_REQUIRED", message: "Votre session a expir\xE9 : reconnectez-vous.", sessionExpired: true };
  if (NETWORK_ERROR.test(msg)) return { code: "INTERNAL", message: "Base de donn\xE9es injoignable pour le moment. R\xE9essayez dans quelques instants." };
  return null;
}

// src/lib/errors.ts
var AppError = class extends Error {
  code;
  status;
  details;
  action;
  constructor(code, message, options = {}) {
    super(message, options.cause !== void 0 ? { cause: options.cause } : void 0);
    this.name = "AppError";
    this.code = code;
    this.status = options.status ?? defaultStatus(code);
    this.details = options.details;
    this.action = options.action;
  }
};
function defaultStatus(code) {
  switch (code) {
    case "AUTH_REQUIRED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "VALIDATION":
      return 400;
    case "CONFLICT":
      return 409;
    case "RATE_LIMITED":
      return 429;
    case "NOT_IMPLEMENTED":
      return 501;
    case "NOT_CONFIGURED":
    case "CONNECTION_EXPIRED":
    case "EXTERNAL_API":
    case "INTERNAL":
    default:
      return 500;
  }
}
function isAppError(e) {
  return e instanceof AppError;
}
var log = createLogger("db-error");
function newErrorReference() {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  return uuid.replace(/-/g, "").slice(0, 8).toUpperCase();
}
function fromPostgrestError(e) {
  const msg = e.message ?? "Erreur base de donn\xE9es";
  const known2 = describeDbError(e);
  if (known2) {
    const action = known2.code === "AUTH_REQUIRED" && known2.sessionExpired ? { action: { label: "Se reconnecter", href: "/login" } } : {};
    return new AppError(known2.code, known2.message, { details: known2.details, ...action });
  }
  const ref = newErrorReference();
  log.error("unmapped database error", {
    ref,
    pg: e.code ?? null,
    message: scrubSecrets(msg),
    details: e.details ? scrubSecrets(e.details) : null,
    hint: e.hint ? scrubSecrets(e.hint) : null
  });
  return new AppError("INTERNAL", `Une erreur inattendue est survenue c\xF4t\xE9 base de donn\xE9es. R\xE9essayez ou contactez le support (r\xE9f. ${ref}).`, {
    details: { pg: e.code ?? null, ref }
  });
}
function isPostgrestLike(e) {
  if (!e || typeof e !== "object") return false;
  const o = e;
  if (typeof o.message !== "string") return false;
  return o.name === "PostgrestError" || !(e instanceof Error) && typeof o.code === "string";
}
function toUserMessage(e) {
  if (isAppError(e)) return e.message;
  if (isPostgrestLike(e)) return fromPostgrestError(e).message;
  if (e instanceof Error) return e.message;
  return "Une erreur inattendue s'est produite.";
}

// src/lib/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

// src/lib/env.ts
import { z } from "npm:zod@4.6.5";
var publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1)
});
var serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  TOKEN_ENCRYPTION_KEY: z.string().min(32, "TOKEN_ENCRYPTION_KEY doit faire au moins 32 caract\xE8res (base64 de 32 octets)."),
  CRON_SECRET: z.string().min(16).optional(),
  SOURCING_USER_AGENT: z.string().min(1).default("MonStockBot/0.1")
});
var ebaySchema = z.object({
  EBAY_ENV: z.enum(["production", "sandbox"]).default("production"),
  EBAY_CLIENT_ID: z.string().min(1),
  EBAY_CLIENT_SECRET: z.string().min(1),
  EBAY_RU_NAME: z.string().min(1),
  EBAY_WEBHOOK_VERIFICATION_TOKEN: z.string().min(32).max(80).optional()
});
var EnvError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "EnvError";
  }
};
function formatIssues(prefix, error) {
  const lines = error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
  return `${prefix}
${lines.join("\n")}
Voir .env.example pour la liste des variables attendues.`;
}
var publicCache = null;
var serverCache = null;
function publicEnv() {
  if (publicCache) return publicCache;
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  });
  if (!parsed.success) {
    throw new EnvError(formatIssues("Configuration Supabase manquante ou invalide :", parsed.error));
  }
  publicCache = parsed.data;
  return publicCache;
}
function serverEnv() {
  if (serverCache) return serverCache;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new EnvError(formatIssues("Configuration serveur manquante ou invalide :", parsed.error));
  }
  serverCache = parsed.data;
  return serverCache;
}
function ebayEnv() {
  const parsed = ebaySchema.safeParse(process.env);
  return parsed.success ? parsed.data : null;
}
function ebayEnvIssues() {
  const parsed = ebaySchema.safeParse(process.env);
  return parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`);
}

// src/lib/crypto.ts
var VERSION = "v1";
function key() {
  const raw = serverEnv().TOKEN_ENCRYPTION_KEY;
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) return decoded;
  return createHash("sha256").update(raw, "utf8").digest();
}
function encryptSecret(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), enc.toString("base64"), tag.toString("base64")].join(":");
}
function decryptSecret(payload) {
  const [version, ivB64, encB64, tagB64] = payload.split(":");
  if (version !== VERSION || !ivB64 || !encB64 || !tagB64) {
    throw new Error("Secret chiffr\xE9 illisible (format inattendu).");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encB64, "base64")), decipher.final()]).toString("utf8");
}
function sha256Hex(input) {
  return createHash("sha256").update(input).digest("hex");
}
function randomToken(bytes = 24) {
  return randomBytes(bytes).toString("hex");
}

// src/lib/supabase/admin.ts
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
var cached = null;
function createAdminSupabaseClient() {
  if (cached) return cached;
  const pub = publicEnv();
  const srv = serverEnv();
  cached = createClient(pub.NEXT_PUBLIC_SUPABASE_URL, srv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return cached;
}

// src/lib/cron-auth.ts
import { createHash as createHash2, timingSafeEqual } from "node:crypto";

// server/edge/shims/next-server.ts
var NextResponse = class _NextResponse extends Response {
  static json(body, init) {
    const headers = new Headers(init?.headers);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    return new _NextResponse(JSON.stringify(body), { ...init, headers });
  }
  static redirect(url, init) {
    const status = typeof init === "number" ? init : init?.status ?? 307;
    return new _NextResponse(null, { status, headers: { Location: String(url) } });
  }
};

// src/lib/cron-auth.ts
var CRON_SECRET_MIN_LENGTH = 16;
function authorizeCron(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < CRON_SECRET_MIN_LENGTH) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: `CRON_SECRET n'est pas configur\xE9 sur ce serveur (au moins ${CRON_SECRET_MIN_LENGTH} caract\xE8res) : les t\xE2ches planifi\xE9es sont d\xE9sactiv\xE9es. Voir .env.example.` }, { status: 503 })
    };
  }
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = createHash2("sha256").update(header, "utf8").digest();
  const b = createHash2("sha256").update(expected, "utf8").digest();
  const valid = timingSafeEqual(a, b);
  if (!valid) return { ok: false, response: NextResponse.json({ ok: false, error: "Non autoris\xE9 : en-t\xEAte Authorization Bearer invalide." }, { status: 401 }) };
  return { ok: true };
}

// src/features/mobile-api/http.ts
import { z as z2 } from "npm:zod@4.6.5";

// src/integrations/core/errors.ts
var ConnectorError = class extends Error {
  code;
  provider;
  details;
  httpStatus;
  retryable;
  constructor(code, provider, message, options = {}) {
    super(message, options.cause !== void 0 ? { cause: options.cause } : void 0);
    this.name = "ConnectorError";
    this.code = code;
    this.provider = provider;
    this.details = options.details ?? {};
    this.httpStatus = options.httpStatus ?? null;
    this.retryable = options.retryable ?? (code === "RATE_LIMITED" || code === "API_ERROR");
  }
};
function isConnectorError(e) {
  return e instanceof ConnectorError;
}
var RECONNECT_ACTION = { label: "Reconnecter eBay", href: "/settings/integrations" };
function connectorErrorToAppError(e) {
  switch (e.code) {
    case "AUTH_EXPIRED":
      return new AppError("CONNECTION_EXPIRED", e.message, { action: RECONNECT_ACTION, details: e.details, cause: e });
    case "RATE_LIMITED":
      return new AppError("RATE_LIMITED", e.message, { details: e.details, cause: e });
    case "NOT_CONFIGURED":
      return new AppError("NOT_CONFIGURED", e.message, { details: e.details, cause: e });
    case "NOT_IMPLEMENTED":
      return new AppError("NOT_IMPLEMENTED", e.message, { details: e.details, cause: e });
    case "INVALID_RESPONSE":
    case "API_ERROR":
    default:
      return new AppError("EXTERNAL_API", e.message, { details: e.details, cause: e });
  }
}
function describeError(e) {
  if (isConnectorError(e)) return { code: e.code, message: e.message, details: { ...e.details, httpStatus: e.httpStatus } };
  if (e instanceof AppError) return { code: e.code, message: e.message, details: e.details ?? {} };
  if (e instanceof Error) return { code: "INTERNAL", message: e.message, details: {} };
  return { code: "INTERNAL", message: String(e), details: {} };
}

// src/features/mobile-api/http.ts
var log2 = createLogger("MOBILE_API");
var NO_STORE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
function jsonOk(data, status = 200) {
  return NextResponse.json({ ok: true, data }, { status, headers: NO_STORE });
}
function jsonError(status, error) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
}
function isPostgrestLike2(e) {
  if (!e || typeof e !== "object" || e instanceof Error) return false;
  const o = e;
  return typeof o.message === "string" && typeof o.code === "string";
}
function errorResponse(e) {
  let app = null;
  if (isAppError(e)) app = e;
  else if (isConnectorError(e)) app = connectorErrorToAppError(e);
  else if (isPostgrestLike2(e)) app = fromPostgrestError(e);
  else if (e instanceof z2.ZodError) app = new AppError("VALIDATION", e.issues[0]?.message ?? "Param\xE8tres invalides.");
  if (app) return jsonError(app.status, { code: app.code, message: app.message });
  const ref = newErrorReference();
  log2.error("unexpected mobile api error", { ref, error: scrubSecrets(e instanceof Error ? `${e.name}: ${e.message}` : String(e)) });
  return jsonError(500, { code: "INTERNAL", message: `Une erreur inattendue est survenue. R\xE9essayez ou contactez le support (r\xE9f. ${ref}).` });
}
async function handle(fn, status = 200) {
  try {
    return jsonOk(await fn(), status);
  } catch (e) {
    return errorResponse(e);
  }
}
function parseQuery(request, schema) {
  const url = new URL(request.url);
  const flat = {};
  for (const [k, v2] of url.searchParams.entries()) if (v2 !== "") flat[k] = v2;
  const parsed = schema.safeParse(flat);
  if (!parsed.success) throw new AppError("VALIDATION", parsed.error.issues[0]?.message ?? "Param\xE8tres invalides.");
  return parsed.data;
}
async function parseBody(request, schema) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 64e3) throw new AppError("VALIDATION", "Requ\xEAte trop volumineuse.");
  let body;
  try {
    const text2 = await request.text();
    if (text2.length > 64e3) throw new AppError("VALIDATION", "Requ\xEAte trop volumineuse.");
    body = text2 ? JSON.parse(text2) : {};
  } catch (e) {
    if (isAppError(e)) throw e;
    throw new AppError("VALIDATION", "Corps de requ\xEAte JSON invalide.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError("VALIDATION", parsed.error.issues[0]?.message ?? "Param\xE8tres invalides.");
  return parsed.data;
}
var uuidParam = z2.string().uuid("Identifiant invalide.");

// src/features/mobile-api/context.ts
import { z as z4 } from "npm:zod@4.6.5";

// src/lib/supabase/bearer.ts
import { createClient as createClient2 } from "npm:@supabase/supabase-js@2.117.3";
function createBearerSupabaseClient(accessToken2) {
  const env = publicEnv();
  return createClient2(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken2}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

// server/edge/shims/react.ts
function cache(fn) {
  return fn;
}

// server/edge/shims/next-other.ts
async function cookies() {
  throw new Error("cookies() indisponible hors Next.js");
}

// server/edge/shims/supabase-ssr.ts
function createServerClient() {
  throw new Error("@supabase/ssr indisponible dans l'Edge Function");
}

// src/lib/supabase/server.ts
async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const env = publicEnv();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
        }
      }
    }
  });
}

// src/features/auth/dal.ts
var getCurrentUser = cache(async () => {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  return user ?? null;
});
async function resolveOrgContext(supabase, user, preferredOrganizationId) {
  const [{ data: profile }, { data: members }] = await Promise.all([
    supabase.from("user_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("organization_members").select("role, organization:organizations(id, name, slug, is_demo)").eq("user_id", user.id)
  ]);
  const memberships = (members ?? []).filter((m) => m.organization !== null).map((m) => ({ organization: m.organization, role: m.role }));
  if (memberships.length === 0) return null;
  let current;
  if (preferredOrganizationId) {
    current = memberships.find((m) => m.organization.id === preferredOrganizationId);
    if (!current) return null;
  } else {
    const wantedId = profile?.current_organization_id ?? null;
    current = memberships.find((m) => m.organization.id === wantedId) ?? memberships[0];
  }
  if (!current) return null;
  const { data: organization } = await supabase.from("organizations").select("*").eq("id", current.organization.id).single();
  if (!organization) return null;
  const effectiveProfile = profile ?? {
    user_id: user.id,
    email: user.email ?? "",
    full_name: null,
    current_organization_id: organization.id,
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  return { supabase, user, profile: effectiveProfile, organization, role: current.role, memberships };
}
var getOrgContext = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createServerSupabaseClient();
  return resolveOrgContext(supabase, user);
});
function canWrite(role) {
  return role !== "viewer";
}
function isAdmin(role) {
  return role === "owner" || role === "admin";
}

// src/features/mobile-api/contract.ts
import { z as z3 } from "npm:zod@4.6.5";
var ORGANIZATION_HEADER = "x-organization-id";
var createOrganizationInputSchema = z3.object({
  name: z3.string().trim().min(2, "Nom trop court (2 caract\xE8res minimum).").max(120, "Nom trop long (120 caract\xE8res maximum).")
});
var STOCK_LEVELS = ["out_of_stock", "at_risk", "low", "normal"];
var MOBILE_STOCK_SORTS = ["best_sellers", "low_stock", "margin", "stock_value", "last_sale", "name"];
var stockListQuerySchema = z3.object({
  q: z3.string().trim().max(120).optional(),
  status: z3.enum(STOCK_LEVELS).optional(),
  stock: z3.enum(["in_stock", "empty", "negative"]).optional(),
  sort: z3.enum(MOBILE_STOCK_SORTS).default("best_sellers"),
  page: z3.coerce.number().int().min(1).max(1e4).default(1)
});
var MOVEMENT_TYPES = ["receipt", "adjustment", "return", "transfer_in", "transfer_out", "correction"];
var stockMovementInputSchema = z3.object({
  sku_id: z3.string().uuid(),
  type: z3.enum(MOVEMENT_TYPES),
  direction: z3.enum(["in", "out"]),
  quantity: z3.coerce.number().int("Nombre entier attendu.").min(1, "La quantit\xE9 doit \xEAtre au moins 1.").max(1e6, "Quantit\xE9 trop \xE9lev\xE9e (1 000 000 maximum)."),
  note: z3.string().trim().max(500).optional().or(z3.literal(""))
});
var ORDER_STATUSES = ["pending", "paid", "shipped", "delivered", "cancelled", "refunded", "unknown"];
var salesListQuerySchema = z3.object({
  q: z3.string().trim().max(120).optional(),
  status: z3.enum(ORDER_STATUSES).optional(),
  inventory: z3.enum(["pending"]).optional(),
  page: z3.coerce.number().int().min(1).max(1e4).default(1)
});
var PURCHASE_ORDER_STATUSES = ["draft", "sent", "confirmed", "partially_received", "received", "cancelled"];
var MANUAL_PO_STATUSES = ["draft", "sent", "confirmed", "cancelled"];
var purchaseOrderListQuerySchema = z3.object({
  status: z3.enum(["open", ...PURCHASE_ORDER_STATUSES]).optional(),
  supplier_id: z3.string().uuid().optional(),
  page: z3.coerce.number().int().min(1).max(1e4).default(1)
});
var purchaseOrderStatusInputSchema = z3.object({ status: z3.enum(MANUAL_PO_STATUSES) });
var purchaseOrderReceiveInputSchema = z3.object({
  receipts: z3.array(
    z3.object({
      item_id: z3.string().uuid(),
      quantity: z3.coerce.number().int().min(0).max(1e5),
      expected_received: z3.coerce.number().int().min(0).max(1e6).optional()
    })
  ).min(1).max(500)
});
var sourcingSearchQuerySchema = z3.object({
  q: z3.string().trim().max(200).optional(),
  /** code SKU : « Trouver moins cher » (comparaison avec le fournisseur actuel) */
  sku: z3.string().trim().max(120).optional(),
  qty: z3.coerce.number().int().min(1).max(1e5).optional(),
  max_price: z3.coerce.number().min(0).max(1e6).optional(),
  page: z3.coerce.number().int().min(1).max(500).default(1),
  /** "0" : lecture des offres déjà enregistrées seulement (pas de requête vers les sources) */
  live: z3.enum(["0", "1"]).optional()
});

// src/features/mobile-api/context.ts
var MAX_TOKEN_LENGTH = 8192;
var MOBILE_SESSION_EXPIRED = "Votre session a expir\xE9. Reconnectez-vous pour continuer.";
function bearerTokenOf(request) {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+([A-Za-z0-9\-_.=]+)$/);
  if (!match?.[1] || match[1].length > MAX_TOKEN_LENGTH) return null;
  return match[1];
}
async function requireMobileUser(request, factory = createBearerSupabaseClient) {
  const token = bearerTokenOf(request);
  if (!token) throw new AppError("AUTH_REQUIRED", "Connexion requise.");
  const supabase = factory(token);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new AppError("AUTH_REQUIRED", MOBILE_SESSION_EXPIRED);
  return { supabase, user: data.user };
}
var orgIdSchema = z4.string().uuid();
async function requireMobileOrgContext(request, options = {}, factory = createBearerSupabaseClient) {
  const rawOrg = request.headers.get(ORGANIZATION_HEADER);
  let orgId = null;
  if (rawOrg !== null) {
    const parsed = orgIdSchema.safeParse(rawOrg.trim());
    if (!parsed.success) throw new AppError("VALIDATION", "Organisation invalide.");
    orgId = parsed.data;
  }
  const { supabase, user } = await requireMobileUser(request, factory);
  const ctx = await resolveOrgContext(supabase, user, orgId);
  if (!ctx) {
    throw new AppError(
      "FORBIDDEN",
      orgId ? "Vous n'\xEAtes pas (ou plus) membre de cette organisation. Choisissez une autre organisation." : "Vous n'\xEAtes membre d'aucune organisation active."
    );
  }
  if (options.admin && !["owner", "admin"].includes(ctx.role)) {
    throw new AppError("FORBIDDEN", "Cette action est r\xE9serv\xE9e aux administrateurs de l'organisation.");
  }
  if (options.write && ctx.role === "viewer") {
    throw new AppError("FORBIDDEN", "Votre r\xF4le (lecture seule) ne permet pas cette action.");
  }
  return ctx;
}

// src/domain/inventory/velocity.ts
var DAY_MS = 864e5;
function effectiveDays(windowDays, firstSaleAt, now) {
  if (!firstSaleAt) return windowDays;
  const age = Math.max(1, Math.ceil((now.getTime() - firstSaleAt.getTime()) / DAY_MS));
  return Math.max(1, Math.min(windowDays, age));
}
function computeVelocity(stats, options = {}) {
  const now = options.now ?? /* @__PURE__ */ new Date();
  const minUnits = options.minUnitsForWindow ?? 5;
  if (stats.units90d <= 0) {
    return {
      dailyVelocity: null,
      basis: null,
      basisDays: null,
      trend: "unknown",
      trendPercent: null,
      confidence: "none",
      explanation: "Pas assez de donn\xE9es : aucune vente enregistr\xE9e sur les 90 derniers jours."
    };
  }
  const windows = [
    { basis: "7d", days: 7, units: stats.units7d },
    { basis: "30d", days: 30, units: stats.units30d },
    { basis: "90d", days: 90, units: stats.units90d }
  ];
  let chosen = windows.find((w2) => w2.units >= minUnits);
  let confidence = "high";
  if (!chosen) {
    chosen = [...windows].reverse().find((w2) => w2.units > 0);
    confidence = "low";
  } else if (chosen.basis === "90d") {
    confidence = "medium";
  }
  if (!chosen) {
    return {
      dailyVelocity: null,
      basis: null,
      basisDays: null,
      trend: "unknown",
      trendPercent: null,
      confidence: "none",
      explanation: "Pas assez de donn\xE9es."
    };
  }
  const days = effectiveDays(chosen.days, stats.firstSaleAt, now);
  const dailyVelocity = chosen.units / days;
  let trend = "unknown";
  let trendPercent = null;
  if (stats.unitsPrev7d > 0) {
    trendPercent = (stats.units7d - stats.unitsPrev7d) / stats.unitsPrev7d * 100;
    trend = trendPercent > 20 ? "up" : trendPercent < -20 ? "down" : "stable";
  } else if (stats.units7d > 0 && stats.units90d > stats.units7d) {
    trend = "up";
  } else if (stats.units7d === 0 && stats.units30d > 0) {
    trend = "down";
  }
  const basisLabel = chosen.basis === "7d" ? "7 jours" : chosen.basis === "30d" ? "30 jours" : "90 jours";
  const explanation = `${chosen.units} unit\xE9(s) vendue(s) sur ${days === chosen.days ? basisLabel : `${days} jour(s) (produit r\xE9cent)`} \u2192 ${dailyVelocity.toFixed(2)} / jour` + (confidence === "low" ? " (peu de ventes : estimation fragile)" : "");
  return { dailyVelocity, basis: chosen.basis, basisDays: days, trend, trendPercent, confidence, explanation };
}
function computeDaysOfCover(availableStock, dailyVelocity) {
  if (dailyVelocity === null || !Number.isFinite(dailyVelocity)) return null;
  if (availableStock <= 0) return 0;
  if (dailyVelocity <= 0) return Number.POSITIVE_INFINITY;
  return availableStock / dailyVelocity;
}

// src/domain/inventory/alerts.ts
var DEFAULT_LEAD_TIME_DAYS = 7;
var LOW_STOCK_COVER_DAYS = 14;
function classifyStock(input) {
  const usedDefaultLeadTime = input.leadTimeDays === null;
  const leadTime = input.leadTimeDays ?? DEFAULT_LEAD_TIME_DAYS;
  const riskHorizonDays = leadTime + 2;
  if (input.available <= 0) {
    return { level: "out_of_stock", reason: input.available < 0 ? "Stock n\xE9gatif : incoh\xE9rence \xE0 corriger." : "Aucune unit\xE9 disponible.", riskHorizonDays, usedDefaultLeadTime };
  }
  if (input.daysOfCover !== null && input.daysOfCover <= riskHorizonDays) {
    return {
      level: "at_risk",
      reason: `Couverture estim\xE9e de ${input.daysOfCover.toFixed(1)} jour(s), inf\xE9rieure au d\xE9lai de r\xE9approvisionnement (${leadTime} j${usedDefaultLeadTime ? ", d\xE9lai par d\xE9faut" : ""}).`,
      riskHorizonDays,
      usedDefaultLeadTime
    };
  }
  if (input.reorderPoint > 0 && input.available <= input.reorderPoint) {
    return { level: "low", reason: `Stock (${input.available}) sous le seuil de r\xE9approvisionnement (${input.reorderPoint}).`, riskHorizonDays, usedDefaultLeadTime };
  }
  if (input.safetyStock > 0 && input.available <= input.safetyStock) {
    return { level: "low", reason: `Stock (${input.available}) au niveau du stock de s\xE9curit\xE9 (${input.safetyStock}).`, riskHorizonDays, usedDefaultLeadTime };
  }
  if (input.daysOfCover !== null && input.daysOfCover <= LOW_STOCK_COVER_DAYS) {
    return { level: "low", reason: `Couverture estim\xE9e de ${input.daysOfCover.toFixed(1)} jour(s).`, riskHorizonDays, usedDefaultLeadTime };
  }
  return {
    level: "normal",
    reason: input.daysOfCover === null ? "Stock disponible ; vitesse de vente inconnue (pas assez de donn\xE9es)." : `Couverture estim\xE9e de ${Number.isFinite(input.daysOfCover) ? input.daysOfCover.toFixed(0) + " jour(s)" : "plus de 90 jours"}.`,
    riskHorizonDays,
    usedDefaultLeadTime
  };
}
var STOCK_LEVEL_ORDER = { out_of_stock: 0, at_risk: 1, low: 2, normal: 3 };

// src/domain/pricing/margin.ts
var UNKNOWN_COST_LABEL = {
  sale_price: "prix de vente",
  cost_price: "prix d'achat",
  marketplace_fee: "commission marketplace",
  payment_fee: "frais de paiement",
  shipping: "transport"
};
function round2(n) {
  return Math.round(n * 100) / 100;
}
function computeMargin(input) {
  const unknown = [];
  const otherCosts = input.otherCosts ?? 0;
  if (input.salePrice === null) unknown.push("sale_price");
  if (input.costPrice === null) unknown.push("cost_price");
  const grossMargin = input.salePrice !== null && input.costPrice !== null ? round2(input.salePrice - input.costPrice) : null;
  const grossMarginPercent = grossMargin !== null && input.salePrice && input.salePrice > 0 ? round2(grossMargin / input.salePrice * 100) : null;
  const marketplaceFee = input.salePrice !== null && input.feePercent !== null ? round2(input.salePrice * input.feePercent / 100) : null;
  if (input.feePercent === null) unknown.push("marketplace_fee");
  let paymentFee = null;
  if (input.salePrice !== null && (input.paymentFeePercent !== null || input.paymentFeeFixed !== null)) {
    paymentFee = round2(input.salePrice * (input.paymentFeePercent ?? 0) / 100 + (input.paymentFeeFixed ?? 0));
  }
  if (input.paymentFeePercent === null && input.paymentFeeFixed === null) unknown.push("payment_fee");
  const shippingCost = input.shippingCost;
  if (shippingCost === null) unknown.push("shipping");
  const complete = unknown.length === 0;
  let netProfit = null;
  let netMarginPercent = null;
  let totalKnownCost = null;
  if (grossMargin !== null && input.salePrice !== null && input.costPrice !== null) {
    const knownFees = (marketplaceFee ?? 0) + (paymentFee ?? 0) + (shippingCost ?? 0) + otherCosts;
    totalKnownCost = round2(input.costPrice + knownFees);
    netProfit = round2(input.salePrice - totalKnownCost);
    netMarginPercent = input.salePrice > 0 ? round2(netProfit / input.salePrice * 100) : null;
  }
  const missingFees = unknown.filter((u) => u !== "sale_price" && u !== "cost_price");
  let caveat = null;
  if (unknown.includes("cost_price")) caveat = "Co\xFBt d'achat inconnu : impossible de calculer une marge.";
  else if (unknown.includes("sale_price")) caveat = "Prix de vente inconnu : impossible de calculer une marge.";
  else if (missingFees.length > 0) caveat = `Estimation partielle : ${missingFees.map((u) => UNKNOWN_COST_LABEL[u]).join(", ")} non d\xE9duit(s).`;
  return {
    grossMargin,
    grossMarginPercent,
    marketplaceFee,
    paymentFee,
    shippingCost,
    otherCosts,
    netProfit,
    netMarginPercent,
    totalKnownCost,
    unknownCosts: unknown,
    complete,
    caveat
  };
}
function computeLandedCost(input) {
  const unknown = [];
  if (input.shippingCost === null) unknown.push("shipping");
  if (input.importFees === null) unknown.push("import_fees");
  const qty = Math.max(1, input.quantity);
  if (input.shippingCost === null) {
    return { unitLandedCost: null, totalLandedCost: null, determinable: false, unknown };
  }
  const total = input.unitPrice * qty + input.shippingCost + (input.importFees ?? 0) + (input.otherFees ?? 0);
  return { unitLandedCost: round2(total / qty), totalLandedCost: round2(total), determinable: unknown.length === 0, unknown };
}

// src/features/stock/model.ts
function enrichStockRow(row, marginCtx, now = /* @__PURE__ */ new Date()) {
  const velocity = computeVelocity(
    {
      units7d: row.units_7d ?? 0,
      units30d: row.units_30d ?? 0,
      units90d: row.units_90d ?? 0,
      unitsPrev7d: row.units_prev_7d ?? 0,
      unitsPrev30d: row.units_prev_30d ?? 0,
      firstSaleAt: row.first_sale_at ? new Date(row.first_sale_at) : null,
      lastSaleAt: row.last_sale_at ? new Date(row.last_sale_at) : null
    },
    { now }
  );
  const available = row.quantity_available ?? 0;
  const daysOfCover = computeDaysOfCover(available, velocity.dailyVelocity);
  const classification = classifyStock({
    available,
    reorderPoint: row.reorder_point ?? 0,
    safetyStock: row.safety_stock ?? 0,
    daysOfCover,
    leadTimeDays: row.lead_time_days ?? null
  });
  const margin = computeMargin({
    salePrice: row.sale_price ?? null,
    costPrice: row.cost_price ?? null,
    feePercent: marginCtx.feePercent,
    paymentFeePercent: marginCtx.paymentFeePercent,
    paymentFeeFixed: marginCtx.paymentFeeFixed,
    shippingCost: marginCtx.shippingCost
  });
  return { row, velocity, daysOfCover, classification, margin };
}
function skuLabel(row) {
  const v2 = row.variant_name && row.variant_name !== "Standard" ? ` \xB7 ${row.variant_name}` : "";
  return `${row.product_name ?? ""}${v2}`;
}
function marginContextFromChannels(channels, orgSettings) {
  const settings = orgSettings ?? {};
  const primary = channels.find((c) => c.provider === "ebay") ?? channels.find((c) => c.provider !== "manual") ?? channels[0];
  return {
    feePercent: primary?.fee_percent ?? null,
    paymentFeePercent: primary?.payment_fee_percent ?? null,
    paymentFeeFixed: primary?.payment_fee_fixed ?? null,
    shippingCost: primary?.default_shipping_cost ?? settings.default_shipping_cost ?? null
  };
}

// src/lib/supabase/paginate.ts
var DB_PAGE_SIZE = 1e3;
async function fetchRowsUpTo(page2, limit, options = {}) {
  const size = Math.max(1, options.pageSize ?? DB_PAGE_SIZE);
  const wanted = limit + 1;
  const rows = [];
  for (let from = 0; from < wanted; from += size) {
    const to = Math.min(from + size, wanted) - 1;
    const { data, error } = await page2(from, to);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < to - from + 1) break;
  }
  const truncated = rows.length > limit;
  return { rows: truncated ? rows.slice(0, limit) : rows, truncated };
}
async function fetchAllRows(page2, options = {}) {
  const { rows } = await fetchRowsUpTo(page2, options.maxRows ?? 2e5, { pageSize: options.pageSize });
  return rows;
}

// src/lib/postgrest.ts
function escapeLike(s) {
  return s.replace(/[%_\\]/g, (m) => `\\${m}`);
}

// src/features/stock/queries.ts
async function getMarginContext(ctx) {
  const { data } = await ctx.supabase.from("sales_channels").select("provider, fee_percent, payment_fee_percent, payment_fee_fixed, default_shipping_cost").eq("organization_id", ctx.organization.id).eq("is_active", true);
  return marginContextFromChannels(data ?? [], ctx.organization.settings);
}

// src/features/stock/schemas.ts
import { z as z5 } from "npm:zod@4.6.5";
var MAX_MONEY = 1e6;
var MAX_QUANTITY = 1e6;
var MAX_LEAD_TIME_DAYS = 365;
var optionalText = z5.string().trim().max(300).optional().or(z5.literal(""));
var optionalMoney = z5.union([z5.literal(""), z5.coerce.number().min(0, "Le montant ne peut pas \xEAtre n\xE9gatif.").max(MAX_MONEY, "Montant trop \xE9lev\xE9 (1 000 000 maximum).")]).optional();
var optionalInt = z5.union([z5.literal(""), z5.coerce.number().int("Nombre entier attendu.").min(0, "La valeur ne peut pas \xEAtre n\xE9gative.").max(MAX_QUANTITY, "Valeur trop \xE9lev\xE9e (1 000 000 maximum).")]).optional();
var optionalLeadTime = z5.union([z5.literal(""), z5.coerce.number().int("Nombre entier attendu.").min(0).max(MAX_LEAD_TIME_DAYS, "D\xE9lai trop long (365 jours maximum).")]).optional();
var eanSchema = z5.string().trim().regex(/^(\d{8}|\d{12,14})?$/, "EAN / GTIN : 8, 12, 13 ou 14 chiffres.").optional().or(z5.literal(""));
var skuCodeSchema = z5.string().trim().min(1, "Le code SKU est requis.").max(64).regex(/^[A-Za-z0-9._\-\/]+$/, "Le SKU ne peut contenir que lettres, chiffres, points, tirets et barres obliques.");
var conditionSchema = z5.enum(["new", "refurbished", "used", "unknown"]);
var variantFields = {
  variant_name: optionalText,
  condition: conditionSchema.default("unknown"),
  grade: optionalText,
  storage: optionalText,
  color: optionalText,
  ean: eanSchema,
  mpn: optionalText
};
var skuFields = {
  code: skuCodeSchema,
  barcode: optionalText,
  cost_price: optionalMoney,
  sale_price: optionalMoney,
  location: optionalText,
  reorder_point: optionalInt,
  safety_stock: optionalInt,
  lead_time_days: optionalLeadTime,
  default_supplier_id: z5.string().uuid().optional().or(z5.literal("")),
  initial_quantity: optionalInt
};
var createProductSchema = z5.object({
  name: z5.string().trim().min(1, "Le nom du produit est requis.").max(300),
  brand: optionalText,
  category: optionalText,
  description: z5.string().trim().max(5e3).optional().or(z5.literal("")),
  image_url: z5.string().trim().url("URL d'image invalide.").optional().or(z5.literal("")),
  ...variantFields,
  ...skuFields
});
var addSkuSchema = z5.object({
  product_id: z5.string().uuid(),
  ...variantFields,
  ...skuFields
});
var updateSkuSchema = z5.object({
  sku_id: z5.string().uuid(),
  /** Version lue à l'ouverture du formulaire (verrou optimiste contre les éditions simultanées). */
  expected_updated_at: z5.string().trim().min(1).max(64).optional(),
  /** Version de la variante lue à l'ouverture du formulaire (même verrou optimiste). */
  expected_variant_updated_at: z5.string().trim().min(1).max(64).optional(),
  barcode: optionalText,
  cost_price: optionalMoney,
  sale_price: optionalMoney,
  location: optionalText,
  reorder_point: optionalInt,
  safety_stock: optionalInt,
  lead_time_days: optionalLeadTime,
  default_supplier_id: z5.string().uuid().optional().or(z5.literal("")),
  is_active: z5.enum(["true", "false"]).optional(),
  variant_name: optionalText,
  condition: conditionSchema.optional(),
  grade: optionalText,
  storage: optionalText,
  color: optionalText,
  ean: eanSchema,
  mpn: optionalText
});
var updateProductSchema = z5.object({
  product_id: z5.string().uuid(),
  name: z5.string().trim().min(1, "Le nom du produit est requis.").max(300),
  brand: optionalText,
  category: optionalText,
  description: z5.string().trim().max(5e3).optional().or(z5.literal("")),
  image_url: z5.string().trim().url("URL d'image invalide.").optional().or(z5.literal(""))
});
var adjustStockSchema = z5.object({
  sku_id: z5.string().uuid(),
  type: z5.enum(["receipt", "adjustment", "return", "transfer_in", "transfer_out", "correction"]),
  direction: z5.enum(["in", "out"]),
  quantity: z5.coerce.number().int("Nombre entier attendu.").min(1, "La quantit\xE9 doit \xEAtre au moins 1.").max(MAX_QUANTITY, "Quantit\xE9 trop \xE9lev\xE9e (1 000 000 maximum)."),
  note: z5.string().trim().max(500).optional().or(z5.literal(""))
});
var STOCK_SORTS = ["best_sellers", "low_stock", "margin", "stock_value", "last_sale", "oldest_sale", "name"];
var STOCK_STATUS_FILTERS = ["out_of_stock", "at_risk", "low", "normal"];
var stockListParamsSchema = z5.object({
  q: z5.string().trim().max(120).optional(),
  brand: z5.string().trim().max(120).optional(),
  category: z5.string().trim().max(120).optional(),
  status: z5.enum(STOCK_STATUS_FILTERS).optional(),
  supplier: z5.string().uuid().optional(),
  channel: z5.enum(["ebay", "amazon", "shopify", "woocommerce", "manual"]).optional(),
  min_margin: z5.coerce.number().min(-MAX_MONEY).max(MAX_MONEY).optional(),
  stock: z5.enum(["in_stock", "empty", "negative"]).optional(),
  sort: z5.enum(STOCK_SORTS).default("best_sellers"),
  page: z5.coerce.number().int().min(1).default(1),
  archived: z5.enum(["1"]).optional()
});

// src/features/analytics/util.pure.ts
function daysSince(value, now) {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return (now.getTime() - d.getTime()) / 864e5;
}

// src/features/analytics/stock.pure.ts
var DEAD_STOCK_DAYS = 60;
function urgencyComparator(a, b) {
  const la = STOCK_LEVEL_ORDER[a.classification.level];
  const lb = STOCK_LEVEL_ORDER[b.classification.level];
  if (la !== lb) return la - lb;
  const da = a.daysOfCover ?? Number.POSITIVE_INFINITY;
  const db = b.daysOfCover ?? Number.POSITIVE_INFINITY;
  if (da !== db) return da - db;
  const ua = a.row.units_30d ?? 0;
  const ub = b.row.units_30d ?? 0;
  if (ua !== ub) return ub - ua;
  return (a.row.product_name ?? "").localeCompare(b.row.product_name ?? "", "fr");
}
function isDeadStock(view, now, days = DEAD_STOCK_DAYS) {
  if ((view.row.quantity_available ?? 0) <= 0) return false;
  const since = daysSince(view.row.last_sale_at, now);
  return since === null || since >= days;
}
function groupStockViews(views, now = /* @__PURE__ */ new Date(), opts = {}) {
  const byLevel = { out_of_stock: [], at_risk: [], low: [], normal: [] };
  const totals = { skus: views.length, unitsOnHand: 0, stockValueKnown: 0, skusValued: 0, skusUnknownCost: 0, skusUnknownCostWithStock: 0, skusOtherCurrency: 0 };
  const negativeStock = [];
  const deadStock = [];
  for (const v2 of views) {
    byLevel[v2.classification.level].push(v2);
    const onHand = v2.row.quantity_on_hand ?? 0;
    totals.unitsOnHand += Math.max(0, onHand);
    if (v2.row.cost_price === null) {
      totals.skusUnknownCost++;
      if (onHand > 0) totals.skusUnknownCostWithStock++;
    } else if (onHand > 0) {
      if (opts.currency && v2.row.currency && v2.row.currency.toUpperCase() !== opts.currency.toUpperCase()) {
        totals.skusOtherCurrency++;
      } else {
        totals.stockValueKnown += v2.row.cost_price * onHand;
        totals.skusValued++;
      }
    }
    if (onHand < 0 || (v2.row.quantity_available ?? 0) < 0) negativeStock.push(v2);
    if (isDeadStock(v2, now)) deadStock.push(v2);
  }
  totals.stockValueKnown = Math.round(totals.stockValueKnown * 100) / 100;
  for (const level of Object.keys(byLevel)) byLevel[level].sort(urgencyComparator);
  const topSellers = views.filter((v2) => (v2.row.units_30d ?? 0) > 0).sort((a, b) => (b.row.units_30d ?? 0) - (a.row.units_30d ?? 0) || Number(b.row.revenue_30d ?? 0) - Number(a.row.revenue_30d ?? 0)).slice(0, opts.topN ?? 10);
  const valueOf = (v2) => v2.row.cost_price === null ? -1 : v2.row.cost_price * Math.max(0, v2.row.quantity_on_hand ?? 0);
  deadStock.sort((a, b) => valueOf(b) - valueOf(a) || (b.row.quantity_available ?? 0) - (a.row.quantity_available ?? 0));
  negativeStock.sort((a, b) => (a.row.quantity_available ?? 0) - (b.row.quantity_available ?? 0));
  return {
    all: [...views],
    byLevel,
    counts: { out_of_stock: byLevel.out_of_stock.length, at_risk: byLevel.at_risk.length, low: byLevel.low.length, normal: byLevel.normal.length },
    totals,
    topSellers,
    deadStock,
    negativeStock,
    truncated: opts.truncated ?? false
  };
}

// src/features/analytics/stock-analytics.ts
var STOCK_VIEWS_MAX = 5e3;
var loadStockViews = cache(async (ctx) => {
  const orgId = ctx.organization.id;
  const marginCtx = await getMarginContext(ctx);
  let loaded;
  try {
    loaded = await fetchRowsUpTo(
      (from, to) => ctx.supabase.from("v_stock_overview").select("*").eq("organization_id", orgId).eq("is_active", true).order("sku_id", { ascending: true }).range(from, to),
      STOCK_VIEWS_MAX
    );
  } catch (e) {
    throw fromPostgrestError(e);
  }
  const { rows, truncated } = loaded;
  const now = /* @__PURE__ */ new Date();
  return { views: rows.map((r) => enrichStockRow(r, marginCtx, now)), marginCtx, truncated, now };
});
var getStockAnalytics = cache(async (ctx) => {
  const bundle = await loadStockViews(ctx);
  return groupStockViews(bundle.views, bundle.now, { truncated: bundle.truncated, currency: ctx.organization.default_currency });
});

// src/features/analytics/margins.pure.ts
var MARGIN_SORTS = ["profit_total", "net_margin", "gross_margin", "units", "name"];

// src/features/analytics/series.pure.ts
var DAY_MS2 = 864e5;
var ANALYTICS_TIME_ZONE = "Europe/Paris";
var dayFormatters = /* @__PURE__ */ new Map();
function dayFormatter(timeZone) {
  let f = dayFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    dayFormatters.set(timeZone, f);
  }
  return f;
}
function dayKey(d, timeZone = ANALYTICS_TIME_ZONE) {
  const parts = dayFormatter(timeZone).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function shiftDayKey(key2, delta) {
  const [y, m, d] = key2.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) + delta * DAY_MS2).toISOString().slice(0, 10);
}

// src/features/analytics/sales.ts
var loadDailySales = cache(async (ctx, days) => {
  const since = shiftDayKey(dayKey(/* @__PURE__ */ new Date()), -days);
  const { data, error } = await ctx.supabase.from("v_daily_sales").select("*").eq("organization_id", ctx.organization.id).gte("day", since).order("day", { ascending: true });
  if (error) throw fromPostgrestError(error);
  return data ?? [];
});

// src/features/analytics/schemas.ts
import { z as z6 } from "npm:zod@4.6.5";
var isoDate = z6.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ");
var page = z6.coerce.number().int().min(1).default(1);
var ORDER_STATUSES2 = ["pending", "paid", "shipped", "delivered", "cancelled", "refunded", "unknown"];
var salesListParamsSchema = z6.object({
  q: z6.string().trim().max(120).optional(),
  channel: z6.string().uuid().optional(),
  status: z6.enum(ORDER_STATUSES2).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  inventory: z6.enum(["pending"]).optional(),
  page
});
var marginsParamsSchema = z6.object({
  channel: z6.string().uuid().optional(),
  unknown: z6.enum(["1"]).optional(),
  min_margin: z6.coerce.number().optional(),
  sort: z6.enum(MARGIN_SORTS).default("profit_total"),
  page
});
var ALERT_LEVEL_TABS = ["todo", "out_of_stock", "at_risk", "low", "normal"];
var alertsParamsSchema = z6.object({
  level: z6.enum(ALERT_LEVEL_TABS).default("todo"),
  page
});

// src/features/analytics/dashboard.ts
var getOperationalCounts = cache(async (ctx) => {
  const orgId = ctx.organization.id;
  const since24h = new Date(Date.now() - 24 * 36e5).toISOString();
  const [syncFailed, openAlerts, unmapped, pendingSales, ordersTotal, suppliers] = await Promise.all([
    ctx.supabase.from("sync_runs").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "failed").gte("started_at", since24h),
    ctx.supabase.from("alerts").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "open"),
    ctx.supabase.from("channel_listings").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "active").in("mapping_status", ["unmapped", "suggested"]),
    ctx.supabase.from("order_items").select("id, orders!inner(status)", { count: "exact", head: true }).eq("organization_id", orgId).eq("inventory_applied", false).not("sku_id", "is", null).not("orders.status", "in", "(cancelled,refunded)"),
    ctx.supabase.from("orders").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
    ctx.supabase.from("suppliers").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("is_archived", false)
  ]);
  return {
    syncFailed24h: syncFailed.count ?? 0,
    openAlerts: openAlerts.count ?? 0,
    unmappedListings: unmapped.count ?? 0,
    pendingSales: pendingSales.count ?? 0,
    ordersTotal: ordersTotal.count ?? 0,
    suppliersCount: suppliers.count ?? 0
  };
});

// src/domain/sourcing/scoring.ts
var SCORE_MAX = { price: 30, moq: 20, delivery: 20, supplier: 20, data: 10 };
function relative(value, min, max, points, lowerIsBetter) {
  if (max === min) return points;
  const ratio = (value - min) / (max - min);
  const score = lowerIsBetter ? 1 - ratio : ratio;
  return Math.round(points * (0.2 + 0.8 * Math.max(0, Math.min(1, score))) * 10) / 10;
}
function coverageLabel(c) {
  switch (c) {
    case "complete":
      return "Comparaison compl\xE8te";
    case "partial":
      return "Comparaison partielle";
    case "price_only":
      return "Comparaison partielle (prix seul)";
    case "none":
      return "Comparaison impossible (donn\xE9es insuffisantes)";
  }
}
function scoreOffers(offers) {
  const prices = offers.map((o) => o.comparablePrice).filter((p) => p !== null && Number.isFinite(p));
  const moqs = offers.map((o) => o.moq).filter((m) => m !== null && Number.isFinite(m));
  const deliveries = offers.map((o) => o.deliveryDays).filter((d) => d !== null && Number.isFinite(d));
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const minM = Math.min(...moqs);
  const maxM = Math.max(...moqs);
  const minD = Math.min(...deliveries);
  const maxD = Math.max(...deliveries);
  const out = /* @__PURE__ */ new Map();
  for (const o of offers) {
    const unknown = [];
    const price = o.comparablePrice !== null && Number.isFinite(o.comparablePrice) ? { points: relative(o.comparablePrice, minP, maxP, SCORE_MAX.price, true), max: SCORE_MAX.price, known: true, note: o.comparablePrice === minP ? "Meilleur prix du r\xE9sultat" : `Prix ${((o.comparablePrice / minP - 1) * 100).toFixed(0)} % au-dessus du meilleur prix` } : { points: 0, max: SCORE_MAX.price, known: false, note: "Prix non comparable" };
    if (!price.known) unknown.push("prix");
    const moq = o.moq !== null && Number.isFinite(o.moq) ? { points: relative(o.moq, minM, maxM, SCORE_MAX.moq, true), max: SCORE_MAX.moq, known: true, note: `MOQ ${o.moq}${o.moq === minM ? " (le plus faible)" : ""}` } : { points: 0, max: SCORE_MAX.moq, known: false, note: "MOQ non communiqu\xE9" };
    if (!moq.known) unknown.push("MOQ");
    const delivery = o.deliveryDays !== null && Number.isFinite(o.deliveryDays) ? { points: relative(o.deliveryDays, minD, maxD, SCORE_MAX.delivery, true), max: SCORE_MAX.delivery, known: true, note: `Livraison sous ${o.deliveryDays} j${o.deliveryDays === minD ? " (la plus rapide)" : ""}` } : { points: 0, max: SCORE_MAX.delivery, known: false, note: "D\xE9lai non communiqu\xE9" };
    if (!delivery.known) unknown.push("d\xE9lai");
    const supplier = o.supplierScore !== null && Number.isFinite(o.supplierScore) ? { points: Math.round(o.supplierScore / 100 * SCORE_MAX.supplier * 10) / 10, max: SCORE_MAX.supplier, known: true, note: `Score fournisseur ${Math.round(o.supplierScore)}/100` } : { points: 0, max: SCORE_MAX.supplier, known: false, note: "Fournisseur sans score (donn\xE9es insuffisantes)" };
    if (!supplier.known) unknown.push("fournisseur");
    const completeness = Math.max(0, Math.min(1, o.dataCompleteness));
    const data = { points: Math.round(completeness * SCORE_MAX.data * 10) / 10, max: SCORE_MAX.data, known: true, note: `${Math.round(completeness * 100)} % des donn\xE9es renseign\xE9es` };
    const total = Math.round((price.points + moq.points + delivery.points + supplier.points + data.points) * 10) / 10;
    const knownCount = [price, moq, delivery, supplier].filter((c) => c.known).length;
    const coverage = knownCount === 4 ? "complete" : knownCount === 0 ? "none" : price.known && knownCount === 1 ? "price_only" : "partial";
    out.set(o.id, { total, breakdown: { price, moq, delivery, supplier, data }, unknownFactors: unknown, coverage, coverageLabel: coverageLabel(coverage) });
  }
  return out;
}
var RANKING_MODES = ["lowest_price", "best_offer", "best_margin", "fastest_delivery", "lowest_moq", "best_supplier"];
function byNullable(get, ascending) {
  return (a, b) => {
    const va = get(a);
    const vb = get(b);
    const na = va === null || va === void 0 || !Number.isFinite(va);
    const nb = vb === null || vb === void 0 || !Number.isFinite(vb);
    if (na && nb) return 0;
    if (na) return 1;
    if (nb) return -1;
    return ascending ? va - vb : vb - va;
  };
}
function rankOffers(offers, mode, scores) {
  const s = scores ?? scoreOffers(offers);
  const score = (o) => s.get(o.id)?.total ?? null;
  const tieBreak = byNullable(score, false);
  let cmp;
  switch (mode) {
    case "lowest_price":
      cmp = byNullable((o) => o.comparablePrice, true);
      break;
    case "best_margin":
      cmp = byNullable((o) => o.potentialMargin ?? null, false);
      break;
    case "fastest_delivery":
      cmp = byNullable((o) => o.deliveryDays, true);
      break;
    case "lowest_moq":
      cmp = byNullable((o) => o.moq, true);
      break;
    case "best_supplier":
      cmp = byNullable((o) => o.supplierScore, false);
      break;
    case "best_offer":
    default:
      cmp = tieBreak;
  }
  return [...offers].sort((a, b) => cmp(a, b) || tieBreak(a, b));
}
function computeDataCompleteness(fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return 0;
  const known2 = keys.filter((k) => {
    const v2 = fields[k];
    return v2 !== null && v2 !== void 0 && v2 !== "" && v2 !== "unknown";
  }).length;
  return Math.round(known2 / keys.length * 100) / 100;
}

// src/integrations/ebay/config.ts
var EBAY_PROVIDER = "ebay";
var EBAY_TRADING_COMPATIBILITY_LEVEL = "1225";
var EBAY_SCOPES = [
  { scope: "https://api.ebay.com/oauth/api_scope", reason: "Scope de base requis par eBay pour tout token OAuth." },
  { scope: "https://api.ebay.com/oauth/api_scope/sell.fulfillment", reason: "Lecture des commandes (Sell Fulfillment API) : cr\xE9ation, paiement, exp\xE9dition, annulations." },
  { scope: "https://api.ebay.com/oauth/api_scope/sell.inventory", reason: "Lecture des annonces actives (GetMyeBaySelling) et mise \xE0 jour des quantit\xE9s (ReviseInventoryStatus)." },
  { scope: "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly", reason: "Identifiant et pseudo du compte vendeur (Identity API) pour afficher le compte connect\xE9 et router les notifications." }
];
function ebayScopeList() {
  return EBAY_SCOPES.map((s) => s.scope);
}
function createEbayConfig(env) {
  const sandbox = env.EBAY_ENV === "sandbox";
  return {
    environment: env.EBAY_ENV,
    clientId: env.EBAY_CLIENT_ID,
    clientSecret: env.EBAY_CLIENT_SECRET,
    ruName: env.EBAY_RU_NAME,
    webhookVerificationToken: env.EBAY_WEBHOOK_VERIFICATION_TOKEN ?? null,
    authorizeUrl: sandbox ? "https://auth.sandbox.ebay.com/oauth2/authorize" : "https://auth.ebay.com/oauth2/authorize",
    tokenUrl: sandbox ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token" : "https://api.ebay.com/identity/v1/oauth2/token",
    apiBase: sandbox ? "https://api.sandbox.ebay.com" : "https://api.ebay.com",
    apizBase: sandbox ? "https://apiz.sandbox.ebay.com" : "https://apiz.ebay.com",
    tradingUrl: sandbox ? "https://api.sandbox.ebay.com/ws/api.dll" : "https://api.ebay.com/ws/api.dll"
  };
}

// src/integrations/ebay/oauth.ts
import { z as z7 } from "npm:zod@4.6.5";

// src/integrations/core/http.ts
var log3 = createLogger("HTTP");
var DEFAULT_TIMEOUT_MS = 3e4;
var DEFAULT_RETRIES = 3;
var MAX_BACKOFF_MS = 8e3;
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
var MAX_RETRY_AFTER_MS = MAX_BACKOFF_MS * 4;
function parseRetryAfterMs(header, now = Date.now()) {
  if (!header) return null;
  const trimmed = header.trim();
  if (trimmed === "") return null;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1e3);
  const date = Date.parse(trimmed);
  if (!Number.isNaN(date)) return Math.max(0, date - now);
  return null;
}
function backoff(attempt) {
  const base = Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt);
  return base + Math.floor(Math.random() * 250);
}
async function fetchWithRetry(url, init, options) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const label = options.label ?? new URL(url).pathname;
  let lastError = null;
  let lastStatus = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    timer.unref?.();
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      lastStatus = res.status;
      if (res.status === 429 || res.status >= 500) {
        clearTimeout(timer);
        const requested = parseRetryAfterMs(res.headers.get("retry-after"));
        await res.body?.cancel().catch(() => void 0);
        const tooLong = requested !== null && requested > MAX_RETRY_AFTER_MS;
        if (attempt < retries && !tooLong) {
          const wait = requested ?? backoff(attempt);
          log3.warn("r\xE9ponse transitoire, nouvelle tentative", { provider: options.provider, label, status: res.status, attempt: attempt + 1, waitMs: wait });
          await sleep(wait);
          continue;
        }
        const retryAfterSeconds = requested !== null ? Math.ceil(requested / 1e3) : null;
        if (res.status === 429) {
          const when = retryAfterSeconds !== null && retryAfterSeconds > 60 ? `r\xE9essayez dans ${Math.ceil(retryAfterSeconds / 60)} min` : "r\xE9essayez dans quelques minutes";
          throw new ConnectorError("RATE_LIMITED", options.provider, `Quota API ${options.provider} atteint (HTTP 429) : ${when}.`, {
            httpStatus: 429,
            details: { label, retryAfterSeconds, attempts: attempt + 1 }
          });
        }
        throw new ConnectorError("API_ERROR", options.provider, `L'API ${options.provider} est indisponible (HTTP ${res.status}) apr\xE8s ${attempt + 1} tentative(s).`, {
          httpStatus: res.status,
          details: { label, attempts: attempt + 1 }
        });
      }
      return res;
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof ConnectorError) throw e;
      lastError = e;
      const aborted2 = e instanceof Error && e.name === "AbortError";
      if (attempt < retries) {
        const wait = backoff(attempt);
        log3.warn(aborted2 ? "d\xE9lai d\xE9pass\xE9, nouvelle tentative" : "erreur r\xE9seau, nouvelle tentative", { provider: options.provider, label, attempt: attempt + 1, waitMs: wait });
        await sleep(wait);
        continue;
      }
    }
  }
  const aborted = lastError instanceof Error && lastError.name === "AbortError";
  throw new ConnectorError(
    "API_ERROR",
    options.provider,
    aborted ? `L'API ${options.provider} n'a pas r\xE9pondu dans le d\xE9lai imparti (${Math.round(timeoutMs / 1e3)} s).` : `Impossible de joindre l'API ${options.provider} (erreur r\xE9seau).`,
    { httpStatus: lastStatus, details: { label, attempts: retries + 1, reason: lastError instanceof Error ? lastError.message : String(lastError) }, cause: lastError }
  );
}
async function readBodyText(res, provider = "api", label = "body") {
  try {
    return await res.text();
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    throw new ConnectorError(
      "API_ERROR",
      provider,
      aborted ? `L'API ${provider} n'a pas fini d'envoyer sa r\xE9ponse dans le d\xE9lai imparti.` : `R\xE9ponse de l'API ${provider} interrompue pendant la lecture.`,
      { httpStatus: res.status, details: { label, reason: e instanceof Error ? e.message : String(e) }, cause: e }
    );
  }
}
async function readJson(res, provider = "api") {
  const text2 = await readBodyText(res, provider);
  if (!text2) return null;
  try {
    return JSON.parse(text2);
  } catch {
    return null;
  }
}

// src/integrations/ebay/oauth.ts
var tokenResponseSchema = z7.object({
  access_token: z7.string().min(1),
  expires_in: z7.number().int().positive(),
  token_type: z7.string().optional(),
  refresh_token: z7.string().min(1).optional(),
  refresh_token_expires_in: z7.number().int().positive().optional()
});
var tokenErrorSchema = z7.object({
  error: z7.string(),
  error_description: z7.string().optional()
});
function buildAuthorizeUrl(config, state, scopes = ebayScopeList()) {
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.ruName);
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "login");
  return url.toString();
}
function basicAuth(config) {
  return "Basic " + Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString("base64");
}
async function tokenRequest(config, body, label) {
  const res = await fetchWithRetry(
    config.tokenUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basicAuth(config), Accept: "application/json" },
      body: body.toString()
    },
    { provider: EBAY_PROVIDER, label, retries: 2, timeoutMs: 2e4 }
  );
  const json2 = await readJson(res, EBAY_PROVIDER);
  if (!res.ok) {
    const err = tokenErrorSchema.safeParse(json2);
    const code = err.success ? err.data.error : `http_${res.status}`;
    const description = err.success ? err.data.error_description : void 0;
    if (code === "invalid_client" || code === "unauthorized_client") {
      throw new ConnectorError("NOT_CONFIGURED", EBAY_PROVIDER, "eBay refuse les identifiants de l'application (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET invalides ou environnement production/sandbox incoh\xE9rent).", {
        httpStatus: res.status,
        details: { oauthError: code, description: description ?? null, step: label },
        retryable: false
      });
    }
    if (code === "invalid_scope" && label === "oauth:refresh_token") {
      throw new ConnectorError("AUTH_EXPIRED", EBAY_PROVIDER, "eBay refuse les autorisations demand\xE9es : de nouvelles autorisations sont n\xE9cessaires. Reconnectez votre compte eBay pour les accorder.", {
        httpStatus: res.status,
        details: { oauthError: code, description: description ?? null, step: label },
        retryable: false
      });
    }
    if (code === "invalid_grant" || code === "invalid_token" || res.status === 401) {
      throw new ConnectorError("AUTH_EXPIRED", EBAY_PROVIDER, "L'autorisation eBay n'est plus valide (le token a expir\xE9 ou a \xE9t\xE9 r\xE9voqu\xE9). Reconnectez votre compte eBay.", {
        httpStatus: res.status,
        details: { oauthError: code, description: description ?? null, step: label },
        retryable: false
      });
    }
    throw new ConnectorError("API_ERROR", EBAY_PROVIDER, `eBay a refus\xE9 la demande de token (${code}${description ? ` : ${description}` : ""}).`, {
      httpStatus: res.status,
      details: { oauthError: code, description: description ?? null, step: label },
      retryable: false
    });
  }
  const parsed = tokenResponseSchema.safeParse(json2);
  if (!parsed.success) {
    throw new ConnectorError("INVALID_RESPONSE", EBAY_PROVIDER, "R\xE9ponse de token eBay inattendue (format non reconnu).", { details: { step: label, issues: parsed.error.issues.map((i) => i.path.join(".")) } });
  }
  return parsed.data;
}
function toTokenSet(data, now, previousRefresh) {
  return {
    accessToken: data.access_token,
    accessTokenExpiresAt: new Date(now.getTime() + data.expires_in * 1e3),
    refreshToken: data.refresh_token ?? previousRefresh?.token ?? null,
    refreshTokenExpiresAt: data.refresh_token_expires_in ? new Date(now.getTime() + data.refresh_token_expires_in * 1e3) : previousRefresh?.expiresAt ?? null,
    tokenType: data.token_type ?? "User Access Token"
  };
}
async function exchangeAuthorizationCode(config, code, now = /* @__PURE__ */ new Date()) {
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: config.ruName });
  const data = await tokenRequest(config, body, "oauth:exchange_code");
  return toTokenSet(data, now);
}
async function refreshAccessToken(config, refreshToken, scopes = ebayScopeList(), now = /* @__PURE__ */ new Date()) {
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, scope: scopes.join(" ") });
  const data = await tokenRequest(config, body, "oauth:refresh_token");
  return toTokenSet(data, now, { token: refreshToken, expiresAt: null });
}
async function getApplicationAccessToken(config, now = /* @__PURE__ */ new Date()) {
  const body = new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" });
  const data = await tokenRequest(config, body, "oauth:client_credentials");
  return { accessToken: data.access_token, expiresAt: new Date(now.getTime() + data.expires_in * 1e3) };
}

// src/integrations/ebay/identity.ts
import { z as z10 } from "npm:zod@4.6.5";

// src/integrations/core/types.ts
import { z as z8 } from "npm:zod@4.6.5";
var ORDER_STATUSES3 = ["pending", "paid", "shipped", "delivered", "cancelled", "refunded", "unknown"];
var LISTING_STATUSES = ["active", "ended", "unsold", "unknown"];
var isoDate2 = z8.string().refine((s) => !Number.isNaN(Date.parse(s)), "Date ISO invalide");
var nullableNumber = z8.number().finite().nullable();
var normalizedOrderItemSchema = z8.object({
  externalLineItemId: z8.string().min(1),
  externalListingId: z8.string().min(1).nullable(),
  /** Clé de variation ('' si l'article n'a pas de variation). Voir variationKey(). */
  externalVariationId: z8.string(),
  externalSku: z8.string().min(1).nullable(),
  title: z8.string(),
  quantity: z8.number().int().positive(),
  unitPrice: nullableNumber,
  currency: z8.string().length(3).nullable(),
  total: nullableNumber
});
var normalizedOrderSchema = z8.object({
  externalOrderId: z8.string().min(1),
  orderNumber: z8.string().nullable(),
  status: z8.enum(ORDER_STATUSES3),
  paymentStatus: z8.string().nullable(),
  fulfillmentStatus: z8.string().nullable(),
  cancelStatus: z8.string().nullable(),
  buyerUsername: z8.string().nullable(),
  currency: z8.string().length(3),
  subtotal: nullableNumber,
  shippingTotal: nullableNumber,
  taxTotal: nullableNumber,
  feeTotal: nullableNumber,
  total: nullableNumber,
  placedAt: isoDate2,
  externalModifiedAt: isoDate2.nullable(),
  payloadHash: z8.string().min(1),
  items: z8.array(normalizedOrderItemSchema)
});
var normalizedListingVariationSchema = z8.object({
  sku: z8.string().min(1).nullable(),
  specifics: z8.record(z8.string(), z8.string()),
  quantityListed: z8.number().int().nullable(),
  quantitySold: z8.number().int().nullable(),
  quantityAvailable: z8.number().int().nullable(),
  price: nullableNumber,
  currency: z8.string().length(3).nullable()
});
var normalizedListingSchema = z8.object({
  externalListingId: z8.string().min(1),
  title: z8.string(),
  sku: z8.string().min(1).nullable(),
  externalProductId: z8.string().nullable(),
  quantityListed: z8.number().int().nullable(),
  quantitySold: z8.number().int().nullable(),
  quantityAvailable: z8.number().int().nullable(),
  price: nullableNumber,
  currency: z8.string().length(3).nullable(),
  listingUrl: z8.string().nullable(),
  imageUrl: z8.string().nullable(),
  status: z8.enum(LISTING_STATUSES),
  startedAt: isoDate2.nullable(),
  endsAt: isoDate2.nullable(),
  variations: z8.array(normalizedListingVariationSchema)
});
var accountInfoSchema = z8.object({
  externalAccountId: z8.string().min(1),
  username: z8.string().min(1),
  accountType: z8.string().nullable(),
  registrationMarketplaceId: z8.string().nullable()
});
var tokenSetSchema = z8.object({
  accessToken: z8.string().min(1),
  accessTokenExpiresAt: z8.date(),
  refreshToken: z8.string().min(1).nullable(),
  refreshTokenExpiresAt: z8.date().nullable(),
  tokenType: z8.string()
});

// src/integrations/ebay/rest.ts
import { z as z9 } from "npm:zod@4.6.5";
var ebayRestErrorSchema = z9.object({
  errors: z9.array(
    z9.object({
      errorId: z9.number().optional(),
      domain: z9.string().optional(),
      category: z9.string().optional(),
      message: z9.string().optional(),
      longMessage: z9.string().optional()
    })
  )
});
function summarizeRestErrors(json2) {
  const parsed = ebayRestErrorSchema.safeParse(json2);
  if (!parsed.success || parsed.data.errors.length === 0) return { message: "", errorIds: [] };
  const first = parsed.data.errors[0];
  return {
    message: first?.longMessage ?? first?.message ?? "",
    errorIds: parsed.data.errors.map((e) => e.errorId).filter((x) => typeof x === "number")
  };
}
async function ebayRestGet(auth, url, label, options = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await auth.getAccessToken({ forceRefresh: attempt > 0 });
    const res = await fetchWithRetry(
      url,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Accept-Language": "fr-FR",
          ...options.marketplaceId ? { "X-EBAY-C-MARKETPLACE-ID": options.marketplaceId } : {}
        }
      },
      { provider: EBAY_PROVIDER, label }
    );
    const json2 = await readJson(res, EBAY_PROVIDER);
    if (res.status === 401) {
      if (attempt === 0) continue;
      const { message, errorIds } = summarizeRestErrors(json2);
      throw new ConnectorError("AUTH_EXPIRED", EBAY_PROVIDER, "Impossible de synchroniser eBay : le token d'autorisation a expir\xE9 ou a \xE9t\xE9 r\xE9voqu\xE9.", {
        httpStatus: 401,
        details: { label, ebayMessage: message || null, errorIds },
        retryable: false
      });
    }
    if (res.status === 403) {
      const { message, errorIds } = summarizeRestErrors(json2);
      throw new ConnectorError("AUTH_EXPIRED", EBAY_PROVIDER, `eBay refuse l'acc\xE8s (${message || "scope insuffisant"}). Reconnectez votre compte pour accorder les autorisations n\xE9cessaires.`, {
        httpStatus: 403,
        details: { label, ebayMessage: message || null, errorIds },
        retryable: false
      });
    }
    if (!res.ok) {
      const { message, errorIds } = summarizeRestErrors(json2);
      throw new ConnectorError("API_ERROR", EBAY_PROVIDER, `Erreur de l'API eBay (HTTP ${res.status})${message ? ` : ${message}` : ""}.`, {
        httpStatus: res.status,
        details: { label, errorIds },
        retryable: res.status >= 500
      });
    }
    return json2;
  }
  throw new ConnectorError("API_ERROR", EBAY_PROVIDER, "Appel eBay interrompu.", { details: { label } });
}

// src/integrations/ebay/identity.ts
var ebayUserSchema = z10.object({
  userId: z10.string().min(1),
  username: z10.string().min(1),
  accountType: z10.string().optional(),
  registrationMarketplaceId: z10.string().optional(),
  status: z10.string().optional()
});
function normalizeEbayUser(raw) {
  const parsed = ebayUserSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ConnectorError("INVALID_RESPONSE", EBAY_PROVIDER, "R\xE9ponse inattendue de l'Identity API eBay (impossible de lire le compte vendeur).", {
      details: { issues: parsed.error.issues.map((i) => i.path.join(".")) }
    });
  }
  return accountInfoSchema.parse({
    externalAccountId: parsed.data.userId,
    username: parsed.data.username,
    accountType: parsed.data.accountType ?? null,
    registrationMarketplaceId: parsed.data.registrationMarketplaceId ?? null
  });
}
async function fetchEbayAccountInfo(config, auth) {
  const json2 = await ebayRestGet(auth, `${config.apizBase}/commerce/identity/v1/user/`, "identity:getUser");
  return normalizeEbayUser(json2);
}

// src/integrations/ebay/fulfillment.ts
import { createHash as createHash3 } from "node:crypto";
import { z as z11 } from "npm:zod@4.6.5";

// src/integrations/core/variation.ts
function aspectsKey(aspects) {
  const pairs = Array.isArray(aspects) ? aspects.map((a) => [a.name, a.value]) : Object.entries(aspects);
  return pairs.map(([n, v2]) => [n.trim(), v2.trim()]).filter(([n, v2]) => n.length > 0 && v2.length > 0).sort(([a], [b]) => a.localeCompare(b)).map(([n, v2]) => `${n}=${v2}`).join("|");
}
function variationKey(input) {
  const sku = input.sku?.trim();
  if (sku) return sku;
  if (input.aspects) {
    const key2 = aspectsKey(input.aspects);
    if (key2) return key2;
  }
  return input.fallbackId?.trim() ?? "";
}

// src/integrations/ebay/fulfillment.ts
var amountSchema = z11.object({
  value: z11.union([z11.string(), z11.number()]),
  currency: z11.string().optional(),
  convertedFromValue: z11.union([z11.string(), z11.number()]).optional(),
  convertedFromCurrency: z11.string().optional()
}).transform((a) => {
  const n = typeof a.value === "number" ? a.value : Number(a.value);
  return { value: Number.isFinite(n) ? n : null, currency: a.currency ?? null };
});
var lineItemSchema = z11.object({
  lineItemId: z11.string().min(1),
  legacyItemId: z11.string().optional(),
  legacyVariationId: z11.string().optional(),
  sku: z11.string().optional(),
  title: z11.string().optional(),
  quantity: z11.number().int().positive(),
  lineItemCost: amountSchema.optional(),
  total: amountSchema.optional(),
  lineItemFulfillmentStatus: z11.string().optional(),
  variationAspects: z11.array(z11.object({ name: z11.string(), value: z11.string() })).optional()
});
var ebayOrderSchema = z11.object({
  orderId: z11.string().min(1),
  legacyOrderId: z11.string().optional(),
  creationDate: z11.string(),
  lastModifiedDate: z11.string().optional(),
  orderFulfillmentStatus: z11.string().optional(),
  orderPaymentStatus: z11.string().optional(),
  cancelStatus: z11.object({ cancelState: z11.string().optional() }).passthrough().optional(),
  buyer: z11.object({ username: z11.string().optional() }).passthrough().optional(),
  pricingSummary: z11.object({
    priceSubtotal: amountSchema.optional(),
    deliveryCost: amountSchema.optional(),
    tax: amountSchema.optional(),
    total: amountSchema.optional(),
    fee: amountSchema.optional()
  }).passthrough().optional(),
  totalMarketplaceFee: amountSchema.optional(),
  lineItems: z11.array(lineItemSchema).default([])
});
var ebayOrdersPageSchema = z11.object({
  total: z11.number().int().nonnegative().optional(),
  limit: z11.number().int().optional(),
  offset: z11.number().int().optional(),
  next: z11.string().optional(),
  orders: z11.array(z11.unknown()).default([])
});
function mapEbayOrderStatus(input) {
  if (input.cancelState === "CANCELED") return "cancelled";
  if (input.paymentStatus === "FULLY_REFUNDED") return "refunded";
  if (input.fulfillmentStatus === "FULFILLED") return "shipped";
  switch (input.paymentStatus) {
    case "PAID":
    case "PARTIALLY_REFUNDED":
      return "paid";
    case "PENDING":
    case "FAILED":
      return "pending";
    default:
      return input.fulfillmentStatus === "IN_PROGRESS" || input.fulfillmentStatus === "NOT_STARTED" ? "pending" : "unknown";
  }
}
function stableHash(raw) {
  return createHash3("sha256").update(JSON.stringify(raw)).digest("hex");
}
function normalizeLineItem(li, orderCurrency) {
  const isVariation = Boolean(li.legacyVariationId) || (li.variationAspects?.length ?? 0) > 0;
  const unitPrice = li.lineItemCost?.value ?? null;
  const total = li.total?.value ?? (unitPrice !== null ? Math.round(unitPrice * li.quantity * 100) / 100 : null);
  return {
    externalLineItemId: li.lineItemId,
    externalListingId: li.legacyItemId ?? null,
    externalVariationId: isVariation ? variationKey({ sku: li.sku, aspects: li.variationAspects ?? null, fallbackId: li.legacyVariationId ?? null }) : "",
    externalSku: li.sku?.trim() ? li.sku.trim() : null,
    title: li.title ?? "",
    quantity: li.quantity,
    unitPrice,
    currency: li.lineItemCost?.currency ?? li.total?.currency ?? orderCurrency,
    total
  };
}
function normalizeEbayOrder(raw) {
  const parsed = ebayOrderSchema.safeParse(raw);
  if (!parsed.success) {
    const id = typeof raw === "object" && raw !== null && "orderId" in raw ? String(raw.orderId) : null;
    throw new ConnectorError("INVALID_RESPONSE", EBAY_PROVIDER, `Commande eBay ${id ?? "(id inconnu)"} au format inattendu : ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}.`, {
      details: { orderId: id, issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      retryable: false
    });
  }
  const o = parsed.data;
  const ps = o.pricingSummary;
  const currency = ps?.total?.currency ?? ps?.priceSubtotal?.currency ?? o.lineItems[0]?.lineItemCost?.currency ?? "EUR";
  const status = mapEbayOrderStatus({ cancelState: o.cancelStatus?.cancelState ?? null, paymentStatus: o.orderPaymentStatus ?? null, fulfillmentStatus: o.orderFulfillmentStatus ?? null });
  const order = {
    externalOrderId: o.orderId,
    orderNumber: o.legacyOrderId ?? null,
    status,
    paymentStatus: o.orderPaymentStatus ?? null,
    fulfillmentStatus: o.orderFulfillmentStatus ?? null,
    cancelStatus: o.cancelStatus?.cancelState ?? null,
    buyerUsername: o.buyer?.username ?? null,
    currency,
    subtotal: ps?.priceSubtotal?.value ?? null,
    shippingTotal: ps?.deliveryCost?.value ?? null,
    taxTotal: ps?.tax?.value ?? null,
    feeTotal: o.totalMarketplaceFee?.value ?? ps?.fee?.value ?? null,
    total: ps?.total?.value ?? null,
    placedAt: new Date(o.creationDate).toISOString(),
    externalModifiedAt: o.lastModifiedDate ? new Date(o.lastModifiedDate).toISOString() : null,
    payloadHash: stableHash(raw),
    items: o.lineItems.map((li) => normalizeLineItem(li, currency))
  };
  return normalizedOrderSchema.parse(order);
}
function buildLastModifiedFilter(since, until) {
  const from = since.toISOString();
  return until ? `lastmodifieddate:[${from}..${until.toISOString()}]` : `lastmodifieddate:[${from}..]`;
}
var EBAY_ORDERS_PAGE_SIZE = 100;
var EBAY_ORDERS_MAX_PAGES = 50;
async function* iterateEbayOrders(config, auth, params) {
  let offset = 0;
  for (let page2 = 0; page2 < EBAY_ORDERS_MAX_PAGES; page2++) {
    const url = new URL(`${config.apiBase}/sell/fulfillment/v1/order`);
    url.searchParams.set("filter", buildLastModifiedFilter(params.since, params.until));
    url.searchParams.set("limit", String(EBAY_ORDERS_PAGE_SIZE));
    url.searchParams.set("offset", String(offset));
    const json2 = await ebayRestGet(auth, url.toString(), "fulfillment:getOrders");
    const parsed = ebayOrdersPageSchema.safeParse(json2);
    if (!parsed.success) {
      throw new ConnectorError("INVALID_RESPONSE", EBAY_PROVIDER, "R\xE9ponse inattendue de la Fulfillment API eBay (liste de commandes illisible).", {
        details: { issues: parsed.error.issues.map((i) => i.path.join(".")) }
      });
    }
    const orders = [];
    const invalid = [];
    for (const raw of parsed.data.orders) {
      try {
        orders.push(normalizeEbayOrder(raw));
      } catch (e) {
        const id = typeof raw === "object" && raw !== null && "orderId" in raw ? String(raw.orderId) : null;
        invalid.push({ orderId: id, message: e instanceof Error ? e.message : String(e) });
      }
    }
    const total = parsed.data.total ?? null;
    const hasNext = Boolean(parsed.data.next) && parsed.data.orders.length > 0;
    const truncated = hasNext && page2 === EBAY_ORDERS_MAX_PAGES - 1;
    yield { orders, invalid, total, truncated, hasMore: hasNext };
    if (!hasNext) return;
    offset += parsed.data.orders.length;
  }
}

// src/integrations/ebay/trading.ts
import { XMLParser } from "npm:fast-xml-parser@5.11.2";
var EBAY_TRADING_NS = "urn:ebay:apis:eBLBaseComponents";
var TRADING_AUTH_ERROR_CODES = /* @__PURE__ */ new Set(["931", "932", "17470", "21916984", "21917053", "21916017", "21916018"]);
var TRADING_RATE_LIMIT_ERROR_CODES = /* @__PURE__ */ new Set(["518"]);
var TRADING_TRANSIENT_ERROR_CODES = /* @__PURE__ */ new Set(["10007"]);
var EBAY_TRADING_SITE_ID = "0";
var GET_MY_EBAY_SELLING_PAGE_SIZE = 200;
var GET_MY_EBAY_SELLING_MAX_PAGES = 50;
var ARRAY_PATHS = /* @__PURE__ */ new Set([
  "GetMyeBaySellingResponse.ActiveList.ItemArray.Item",
  "GetMyeBaySellingResponse.ActiveList.ItemArray.Item.Variations.Variation",
  "GetMyeBaySellingResponse.ActiveList.ItemArray.Item.Variations.Variation.VariationSpecifics.NameValueList",
  "GetMyeBaySellingResponse.ActiveList.ItemArray.Item.Variations.Variation.VariationSpecifics.NameValueList.Value",
  "GetMyeBaySellingResponse.ActiveList.ItemArray.Item.PictureDetails.PictureURL",
  "GetMyeBaySellingResponse.Errors",
  "ReviseInventoryStatusResponse.Errors",
  "ReviseInventoryStatusResponse.InventoryStatus"
]);
var parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  removeNSPrefix: true,
  // Les identifiants (ItemID…) restent des chaînes : aucune perte de précision.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (_name, jpath) => ARRAY_PATHS.has(typeof jpath === "string" ? jpath : jpath.toString())
});
function node(v2) {
  return v2 && typeof v2 === "object" && !Array.isArray(v2) ? v2 : null;
}
function arr(v2) {
  if (v2 === void 0 || v2 === null) return [];
  return Array.isArray(v2) ? v2 : [v2];
}
function text(v2) {
  if (v2 === void 0 || v2 === null) return null;
  if (typeof v2 === "string") return v2;
  if (typeof v2 === "number" || typeof v2 === "boolean") return String(v2);
  const n = node(v2);
  if (n && typeof n["#text"] === "string") return n["#text"];
  return null;
}
function int(v2) {
  const t = text(v2);
  if (t === null || t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function money(v2) {
  const t = text(v2);
  const n = t === null || t === "" ? NaN : Number(t);
  const nd = node(v2);
  const currency = nd && typeof nd["@_currencyID"] === "string" ? nd["@_currencyID"] : null;
  return { value: Number.isFinite(n) ? n : null, currency: currency && currency.length === 3 ? currency : null };
}
function isoOrNull(v2) {
  const t = text(v2);
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function extractTradingErrors(response) {
  return arr(response?.Errors).map(node).filter((e) => e !== null).map((e) => ({
    code: text(e.ErrorCode) ?? "",
    shortMessage: text(e.ShortMessage) ?? "",
    longMessage: text(e.LongMessage) ?? "",
    severity: text(e.SeverityCode) ?? ""
  }));
}
function isTradingAuthError(errors) {
  return errors.some((e) => TRADING_AUTH_ERROR_CODES.has(e.code) || /(iaf|auth)\s*token.*(expired|invalid|hard expired)|invalid.*token|token.*(expired|invalid)/i.test(`${e.shortMessage} ${e.longMessage}`));
}
function assertTradingAck(callName, response) {
  if (!response) {
    throw new ConnectorError("INVALID_RESPONSE", EBAY_PROVIDER, `R\xE9ponse XML illisible pour l'appel Trading ${callName}.`, { details: { callName } });
  }
  const ack = text(response.Ack) ?? "";
  const errors = extractTradingErrors(response);
  const failures = errors.filter((e) => e.severity !== "Warning");
  const warnings = errors.filter((e) => e.severity === "Warning").map((e) => e.longMessage || e.shortMessage);
  if (ack === "Success" || ack === "Warning") return { warnings };
  if (isTradingAuthError(errors)) {
    throw new ConnectorError("AUTH_EXPIRED", EBAY_PROVIDER, "Impossible de synchroniser eBay : le token d'autorisation a expir\xE9 ou a \xE9t\xE9 r\xE9voqu\xE9.", {
      details: { callName, errorCodes: failures.map((e) => e.code) },
      retryable: false
    });
  }
  const first = failures[0] ?? errors[0];
  const message = first ? first.longMessage || first.shortMessage : `Ack=${ack || "absent"}`;
  const errorSummary = failures.map((e) => ({ code: e.code, message: e.shortMessage }));
  if (failures.some((e) => TRADING_RATE_LIMIT_ERROR_CODES.has(e.code) || /usage limit|call limit/i.test(`${e.shortMessage} ${e.longMessage}`))) {
    throw new ConnectorError("RATE_LIMITED", EBAY_PROVIDER, `Quota d'appels de la Trading API eBay atteint (${callName}) : la synchronisation reprendra au prochain run.`, {
      details: { callName, ack, errors: errorSummary },
      retryable: true
    });
  }
  throw new ConnectorError("API_ERROR", EBAY_PROVIDER, `eBay a refus\xE9 l'appel ${callName} : ${message}`, {
    details: { callName, ack, errors: errorSummary },
    retryable: failures.some((e) => TRADING_TRANSIENT_ERROR_CODES.has(e.code))
  });
}
function xmlEscape(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function buildGetMyeBaySellingRequest(pageNumber, entriesPerPage = GET_MY_EBAY_SELLING_PAGE_SIZE) {
  return `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="${EBAY_TRADING_NS}">
  <ErrorLanguage>fr_FR</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <DetailLevel>ReturnAll</DetailLevel>
  <ActiveList>
    <Include>true</Include>
    <IncludeNotes>false</IncludeNotes>
    <Sort>TimeLeft</Sort>
    <Pagination>
      <EntriesPerPage>${entriesPerPage}</EntriesPerPage>
      <PageNumber>${pageNumber}</PageNumber>
    </Pagination>
  </ActiveList>
</GetMyeBaySellingRequest>`;
}
function buildReviseInventoryStatusRequest(ref, quantity) {
  const sku = ref.variationSku ? `
    <SKU>${xmlEscape(ref.variationSku)}</SKU>` : "";
  return `<?xml version="1.0" encoding="utf-8"?>
<ReviseInventoryStatusRequest xmlns="${EBAY_TRADING_NS}">
  <ErrorLanguage>fr_FR</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <InventoryStatus>
    <ItemID>${xmlEscape(ref.externalListingId)}</ItemID>${sku}
    <Quantity>${Math.max(0, Math.trunc(quantity))}</Quantity>
  </InventoryStatus>
</ReviseInventoryStatusRequest>`;
}
function parseVariation(v2) {
  const specifics = {};
  for (const nv of arr(node(v2.VariationSpecifics)?.NameValueList).map(node)) {
    if (!nv) continue;
    const name = text(nv.Name);
    const value = arr(nv.Value).map(text).filter((x) => Boolean(x)).join(", ");
    if (name && value) specifics[name] = value;
  }
  const listed = int(v2.Quantity);
  const sold = int(node(v2.SellingStatus)?.QuantitySold);
  const price = money(v2.StartPrice);
  return {
    sku: text(v2.SKU)?.trim() || null,
    specifics,
    quantityListed: listed,
    quantitySold: sold,
    quantityAvailable: listed !== null ? Math.max(0, listed - (sold ?? 0)) : null,
    price: price.value,
    currency: price.currency
  };
}
function parseItem(item) {
  const selling = node(item.SellingStatus);
  const listed = int(item.Quantity);
  const sold = int(selling?.QuantitySold);
  const explicitAvailable = int(item.QuantityAvailable);
  const current = money(selling?.CurrentPrice);
  const bin = money(item.BuyItNowPrice);
  const start = money(item.StartPrice);
  const price = current.value !== null ? current : bin.value !== null ? bin : start;
  const details = node(item.ListingDetails);
  const pictures = node(item.PictureDetails);
  const firstPicture = arr(pictures?.PictureURL).map(text).find((x) => Boolean(x)) ?? text(pictures?.GalleryURL);
  const variations = arr(node(item.Variations)?.Variation).map(node).filter((v2) => v2 !== null).map(parseVariation);
  const listingStatus = text(selling?.ListingStatus);
  const status = listingStatus === "Active" ? "active" : listingStatus === "Completed" || listingStatus === "Ended" ? "ended" : listingStatus ? "unknown" : "active";
  const variationAvailable = variations.length > 0 ? variations.reduce((acc, v2) => v2.quantityAvailable === null ? acc : (acc ?? 0) + v2.quantityAvailable, null) : null;
  return normalizedListingSchema.parse({
    externalListingId: text(item.ItemID) ?? "",
    title: text(item.Title) ?? "",
    sku: text(item.SKU)?.trim() || null,
    externalProductId: text(node(item.ProductListingDetails)?.ProductReferenceID) ?? null,
    quantityListed: listed,
    quantitySold: sold,
    quantityAvailable: explicitAvailable ?? variationAvailable ?? (listed !== null ? Math.max(0, listed - (sold ?? 0)) : null),
    price: price.value,
    currency: price.currency ?? (text(item.Currency)?.length === 3 ? text(item.Currency) : null),
    listingUrl: text(details?.ViewItemURL) ?? null,
    imageUrl: firstPicture ?? null,
    status,
    startedAt: isoOrNull(details?.StartTime),
    endsAt: isoOrNull(details?.EndTime),
    variations
  });
}
function parseGetMyeBaySellingResponse(xml) {
  const doc = node(parser.parse(xml));
  const response = node(doc?.GetMyeBaySellingResponse);
  const { warnings } = assertTradingAck("GetMyeBaySelling", response);
  const active = node(response?.ActiveList);
  const pagination = node(active?.PaginationResult);
  const listings = [];
  const invalid = [];
  for (const item of arr(node(active?.ItemArray)?.Item).map(node)) {
    if (!item) continue;
    try {
      listings.push(parseItem(item));
    } catch (e) {
      invalid.push({ itemId: text(item.ItemID), message: e instanceof Error ? e.message : String(e) });
    }
  }
  return {
    listings,
    invalid,
    pageNumber: int(node(active?.Pagination)?.PageNumber) ?? 1,
    totalPages: int(pagination?.TotalNumberOfPages) ?? 1,
    totalEntries: int(pagination?.TotalNumberOfEntries),
    warnings
  };
}
function parseReviseInventoryStatusResponse(xml) {
  const doc = node(parser.parse(xml));
  const response = node(doc?.ReviseInventoryStatusResponse);
  return assertTradingAck("ReviseInventoryStatus", response);
}
async function tradingCall(config, auth, callName, body) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await auth.getAccessToken({ forceRefresh: attempt > 0 });
    const res = await fetchWithRetry(
      config.tradingUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "X-EBAY-API-SITEID": EBAY_TRADING_SITE_ID,
          "X-EBAY-API-COMPATIBILITY-LEVEL": EBAY_TRADING_COMPATIBILITY_LEVEL,
          "X-EBAY-API-CALL-NAME": callName,
          "X-EBAY-API-IAF-TOKEN": token
        },
        body
      },
      { provider: EBAY_PROVIDER, label: `trading:${callName}`, timeoutMs: 6e4 }
    );
    const xml = await readBodyText(res, EBAY_PROVIDER, `trading:${callName}`);
    if (res.status === 401 && attempt === 0) continue;
    if (!res.ok) {
      throw new ConnectorError(res.status === 401 ? "AUTH_EXPIRED" : "API_ERROR", EBAY_PROVIDER, `La Trading API eBay a r\xE9pondu HTTP ${res.status} pour ${callName}.`, { httpStatus: res.status, details: { callName } });
    }
    if (attempt === 0) {
      const probe = node(node(parser.parse(xml))?.[`${callName}Response`]);
      if (probe && text(probe.Ack) === "Failure" && isTradingAuthError(extractTradingErrors(probe))) continue;
    }
    return xml;
  }
  throw new ConnectorError("AUTH_EXPIRED", EBAY_PROVIDER, "Impossible de synchroniser eBay : le token d'autorisation a expir\xE9 ou a \xE9t\xE9 r\xE9voqu\xE9.", { details: { callName } });
}
async function* iterateGetMyeBaySelling(config, auth) {
  for (let page2 = 1; page2 <= GET_MY_EBAY_SELLING_MAX_PAGES; page2++) {
    const xml = await tradingCall(config, auth, "GetMyeBaySelling", buildGetMyeBaySellingRequest(page2));
    const parsed = parseGetMyeBaySellingResponse(xml);
    yield parsed;
    if (page2 >= parsed.totalPages) return;
  }
}
async function reviseInventoryStatus(config, auth, ref, quantity) {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new ConnectorError("API_ERROR", EBAY_PROVIDER, "La quantit\xE9 \xE0 envoyer \xE0 eBay doit \xEAtre un entier positif ou nul.", { retryable: false });
  }
  const xml = await tradingCall(config, auth, "ReviseInventoryStatus", buildReviseInventoryStatusRequest(ref, quantity));
  const { warnings } = parseReviseInventoryStatusResponse(xml);
  return { ok: true, quantity, warnings };
}

// src/integrations/ebay/connector.ts
var log4 = createLogger("EBAY");
var EbayConnector = class {
  provider = EBAY_PROVIDER;
  label = "eBay";
  available = true;
  scopes = EBAY_SCOPES;
  configOverride;
  constructor(config) {
    this.configOverride = config ?? null;
  }
  /** Configuration courante (null si EBAY_* absentes). */
  config() {
    if (this.configOverride) return this.configOverride;
    const env = ebayEnv();
    return env ? createEbayConfig(env) : null;
  }
  isConfigured() {
    return this.config() !== null;
  }
  configurationIssues() {
    return this.configOverride ? [] : ebayEnvIssues();
  }
  requireConfig() {
    const config = this.config();
    if (!config) {
      throw new ConnectorError("NOT_CONFIGURED", EBAY_PROVIDER, "Int\xE9gration eBay non configur\xE9e sur ce serveur : renseignez EBAY_CLIENT_ID, EBAY_CLIENT_SECRET et EBAY_RU_NAME (voir docs/ebay-setup.md).", {
        details: { missing: ebayEnvIssues() },
        retryable: false
      });
    }
    return config;
  }
  getAuthorizeUrl(state) {
    return buildAuthorizeUrl(this.requireConfig(), state, ebayScopeList());
  }
  exchangeCode(code) {
    return exchangeAuthorizationCode(this.requireConfig(), code);
  }
  refreshToken(refreshToken) {
    return refreshAccessToken(this.requireConfig(), refreshToken, ebayScopeList());
  }
  getAccountInfo(auth) {
    return fetchEbayAccountInfo(this.requireConfig(), auth);
  }
  async *getOrders(auth, params) {
    const config = this.requireConfig();
    for await (const page2 of iterateEbayOrders(config, auth, params)) {
      for (const inv of page2.invalid) log4.warn("commande eBay ignor\xE9e (format inattendu)", { orderId: inv.orderId, reason: inv.message });
      if (page2.truncated) log4.warn("r\xE9cup\xE9ration des commandes tronqu\xE9e (limite de pages atteinte) : la suite sera reprise au prochain run");
      yield { orders: page2.orders, invalid: page2.invalid.map((i) => ({ ref: i.orderId, message: i.message })), truncated: page2.truncated, hasMore: page2.hasMore };
    }
  }
  async *getListings(auth) {
    const config = this.requireConfig();
    let pageIndex = 0;
    for await (const page2 of iterateGetMyeBaySelling(config, auth)) {
      pageIndex++;
      for (const inv of page2.invalid) log4.warn("annonce eBay ignor\xE9e (format inattendu)", { itemId: inv.itemId, reason: inv.message });
      const truncated = pageIndex >= GET_MY_EBAY_SELLING_MAX_PAGES && page2.totalPages > pageIndex;
      if (truncated) log4.warn("liste d'annonces tronqu\xE9e (limite de pages atteinte)", { pages: pageIndex, totalPages: page2.totalPages });
      yield { listings: page2.listings, invalid: page2.invalid.map((i) => ({ ref: i.itemId, message: i.message })), warnings: page2.warnings, truncated };
    }
  }
  /** Les quantités eBay sont celles des annonces : GetMyeBaySelling est la source de vérité. */
  async *getInventory(auth) {
    for await (const page2 of this.getListings(auth)) {
      const levels = [];
      for (const l of page2.listings) {
        if (l.variations.length === 0) {
          levels.push({ ref: { externalListingId: l.externalListingId, variationSku: null }, quantityAvailable: l.quantityAvailable });
        } else {
          for (const v2 of l.variations) levels.push({ ref: { externalListingId: l.externalListingId, variationSku: v2.sku }, quantityAvailable: v2.quantityAvailable });
        }
      }
      yield levels;
    }
  }
  /**
   * ReviseInventoryStatus. Limitation connue : les annonces créées via l'Inventory API (offres)
   * refusent les révisions Trading ; eBay renvoie alors une erreur explicite qui est remontée telle quelle.
   */
  updateListingInventory(auth, ref, quantity) {
    return reviseInventoryStatus(this.requireConfig(), auth, ref, quantity);
  }
  /**
   * eBay ne publie pas d'endpoint de révocation des tokens utilisateur : les tokens sont
   * supprimés de notre base, et le vendeur peut retirer l'autorisation côté eBay
   * (Mon eBay → Compte → Préférences du site → Autorisations tierces).
   */
  async revoke(_auth) {
    return {
      revoked: false,
      note: "Les tokens ont \xE9t\xE9 supprim\xE9s de MON STOCK. eBay n'offre pas d'API publique de r\xE9vocation : pour retirer l'autorisation c\xF4t\xE9 eBay, allez dans Mon eBay \u2192 Compte \u2192 Pr\xE9f\xE9rences du site \u2192 Autorisations tierces."
    };
  }
};

// src/integrations/amazon/connector.ts
var MESSAGE = "L'int\xE9gration Amazon (Selling Partner API) n'est pas encore disponible dans MON STOCK. Aucune donn\xE9e Amazon n'est simul\xE9e.";
function notImplemented() {
  throw new ConnectorError("NOT_IMPLEMENTED", "amazon", MESSAGE, { retryable: false });
}
var AmazonConnector = class {
  provider = "amazon";
  label = "Amazon";
  available = false;
  scopes = [];
  isConfigured() {
    return false;
  }
  configurationIssues() {
    return [MESSAGE];
  }
  getAuthorizeUrl() {
    return notImplemented();
  }
  exchangeCode() {
    return Promise.reject(new ConnectorError("NOT_IMPLEMENTED", "amazon", MESSAGE));
  }
  refreshToken() {
    return Promise.reject(new ConnectorError("NOT_IMPLEMENTED", "amazon", MESSAGE));
  }
  getAccountInfo() {
    return Promise.reject(new ConnectorError("NOT_IMPLEMENTED", "amazon", MESSAGE));
  }
  async *getOrders() {
    notImplemented();
  }
  async *getListings() {
    notImplemented();
  }
  async *getInventory() {
    notImplemented();
  }
  updateListingInventory() {
    return Promise.reject(new ConnectorError("NOT_IMPLEMENTED", "amazon", MESSAGE));
  }
  revoke() {
    return Promise.reject(new ConnectorError("NOT_IMPLEMENTED", "amazon", MESSAGE));
  }
};

// src/integrations/shopify/connector.ts
var MESSAGE2 = "L'int\xE9gration Shopify (Admin API) n'est pas encore disponible dans MON STOCK. Aucune donn\xE9e Shopify n'est simul\xE9e.";
function notImplemented2() {
  throw new ConnectorError("NOT_IMPLEMENTED", "shopify", MESSAGE2, { retryable: false });
}
var ShopifyConnector = class {
  provider = "shopify";
  label = "Shopify";
  available = false;
  scopes = [];
  isConfigured() {
    return false;
  }
  configurationIssues() {
    return [MESSAGE2];
  }
  getAuthorizeUrl() {
    return notImplemented2();
  }
  exchangeCode() {
    return Promise.reject(new ConnectorError("NOT_IMPLEMENTED", "shopify", MESSAGE2));
  }
  refreshToken() {
    return Promise.reject(new ConnectorError("NOT_IMPLEMENTED", "shopify", MESSAGE2));
  }
  getAccountInfo() {
    return Promise.reject(new ConnectorError("NOT_IMPLEMENTED", "shopify", MESSAGE2));
  }
  async *getOrders() {
    notImplemented2();
  }
  async *getListings() {
    notImplemented2();
  }
  async *getInventory() {
    notImplemented2();
  }
  updateListingInventory() {
    return Promise.reject(new ConnectorError("NOT_IMPLEMENTED", "shopify", MESSAGE2));
  }
  revoke() {
    return Promise.reject(new ConnectorError("NOT_IMPLEMENTED", "shopify", MESSAGE2));
  }
};

// src/integrations/core/registry.ts
var CONNECTOR_CATALOG = [
  { provider: "ebay", label: "eBay", available: true, description: "Annonces, commandes et quantit\xE9s via les API officielles eBay (OAuth 2.0)." },
  { provider: "amazon", label: "Amazon", available: false, description: "Selling Partner API : pr\xE9vu dans l'architecture, pas encore impl\xE9ment\xE9." },
  { provider: "shopify", label: "Shopify", available: false, description: "Admin API : pr\xE9vu dans l'architecture, pas encore impl\xE9ment\xE9." },
  { provider: "woocommerce", label: "WooCommerce", available: false, description: "REST API WooCommerce : pr\xE9vu dans l'architecture, pas encore impl\xE9ment\xE9." }
];
var ebay = null;
var amazon = null;
var shopify = null;
function getConnector(provider) {
  switch (provider) {
    case "ebay":
      return ebay ??= new EbayConnector();
    case "amazon":
      return amazon ??= new AmazonConnector();
    case "shopify":
      return shopify ??= new ShopifyConnector();
    case "woocommerce":
      throw new ConnectorError("NOT_IMPLEMENTED", "woocommerce", "L'int\xE9gration WooCommerce n'est pas encore disponible dans MON STOCK. Aucune donn\xE9e n'est simul\xE9e.", { retryable: false });
    case "manual":
      throw new ConnectorError("NOT_IMPLEMENTED", "manual", "Le canal \xAB Ventes manuelles \xBB n'a pas de connecteur : les ventes y sont saisies \xE0 la main.", { retryable: false });
  }
}
function getEbayConnector() {
  return getConnector("ebay");
}
function listConnectorCatalog() {
  return [...CONNECTOR_CATALOG];
}

// src/features/integrations/queries.ts
async function getIntegrationsOverview(ctx) {
  const ebay2 = getEbayConnector();
  const config = ebay2.config();
  const base = {
    catalog: listConnectorCatalog(),
    ebay: { configured: ebay2.isConfigured(), issues: ebay2.configurationIssues(), environment: config?.environment ?? null, scopes: ebay2.scopes },
    connections: [],
    unmappedCount: 0,
    queryError: null
  };
  try {
    const orgId = ctx.organization.id;
    const [{ data: connections, error: connError }, { count }] = await Promise.all([
      ctx.supabase.from("channel_connections").select("*, sales_channel:sales_channels(name)").eq("organization_id", orgId).order("created_at"),
      ctx.supabase.from("channel_listings").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "active").in("mapping_status", ["unmapped", "suggested"])
    ]);
    if (connError) throw connError;
    const ids = (connections ?? []).map((c) => c.id);
    const lastRuns = /* @__PURE__ */ new Map();
    if (ids.length > 0) {
      const { data: runs } = await ctx.supabase.from("sync_runs").select("*").eq("organization_id", orgId).eq("source_kind", "channel").in("source_ref", ids).order("started_at", { ascending: false }).limit(ids.length * 5);
      for (const r of runs ?? []) if (r.source_ref && !lastRuns.has(r.source_ref)) lastRuns.set(r.source_ref, r);
    }
    base.connections = (connections ?? []).map((c) => {
      const { sales_channel, ...connection } = c;
      return { connection, channelName: sales_channel?.name ?? "", lastRun: lastRuns.get(c.id) ?? null };
    });
    base.unmappedCount = count ?? 0;
  } catch (e) {
    base.queryError = toUserMessage(e);
  }
  return base;
}

// src/integrations/sourcing/catalog.ts
var VERIFIED_FROM_SNIPPETS = {
  lastCheckedAt: "2026-10-07",
  checkedFrom: "search_snippets_official_domain",
  pageOpened: false,
  robotsChecked: false
};
function v(notes) {
  return { ...VERIFIED_FROM_SNIPPETS, notes };
}
var SOURCING_CATALOG = [
  // ---------------------------------------------------------------------------
  // 4. Reconditionné et B2B « refurbished » (France / Europe)
  // ---------------------------------------------------------------------------
  {
    key: "backmarket-pro",
    name: "Back Market Pro",
    url: "https://pro.backmarket.fr/",
    category: ["smartphones", "laptops", "tablettes", "accessoires"],
    country: "FR / UK / US",
    pricePublic: "unknown",
    accountRequired: true,
    api: "no",
    feed: "unknown",
    stockVisible: "unknown",
    automationAllowed: "forbidden_by_terms",
    termsNote: "CGU Back Market : interdiction des \xAB software, devices, scripts, robots or any other means or process (including web crawlers\u2026) \xBB pour du web scraping. Pas d'API c\xF4t\xE9 acheteur (API vendeur uniquement).",
    integrationMethod: "SUPPLIER_ACCOUNT",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "4.1",
    verification: v(
      "Compte r\xE9serv\xE9 aux professionnels (n\xB0 TVA intracommunautaire). Affichage des prix avant connexion : \xC0 v\xE9rifier. Flux CSV/XML : non trouv\xE9. Volume : canal MANUAL (sourcing accompagn\xE9)."
    )
  },
  {
    key: "foxway",
    name: "Foxway (Reseller Store + Wholesale)",
    url: "https://resellers.foxway.com/",
    category: ["smartphones", "tablettes", "laptops", "wearables", "accessoires"],
    country: "EU (Wholesale : ex-works UK)",
    pricePublic: "after_login",
    accountRequired: true,
    api: "unknown",
    feed: "unknown",
    stockVisible: "yes",
    automationAllowed: "unknown",
    termsNote: "CGV du Reseller Portal : compte requis, mot de passe strictement personnel. Clause scraping explicite : non trouv\xE9e.",
    integrationMethod: "SUPPLIER_ACCOUNT",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "4.2",
    verification: v(
      "\xAB Real-time prices and on-site checkout \xBB apr\xE8s cr\xE9ation de compte ; \xAB real-time stock visibility \xBB. Wholesale : deals \xAB take-all \xBB d\xE9crits dans un tableur (manuel), feed structur\xE9 \xC0 v\xE9rifier. API : \xC0 v\xE9rifier."
    )
  },
  {
    key: "refurbed-business",
    name: "refurbed Business",
    url: "https://business.refurbed.de/",
    category: ["smartphones", "laptops", "tablettes", "\xE9crans"],
    country: "DE / AT (+ IE) ; FR : \xC0 v\xE9rifier",
    pricePublic: "yes",
    accountRequired: true,
    api: "unknown",
    feed: "no",
    stockVisible: "unknown",
    automationAllowed: "unknown",
    termsNote: "AGB B2B : devis et listes de prix non contraignants. Clause scraping : non trouv\xE9e.",
    integrationMethod: "MANUAL",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "4.3",
    verification: v(
      "Prix B2C publics ; offre B2B sur devis par e-mail (MOQ 15 appareils identiques), pas de portail de commande automatis\xE9 trouv\xE9. API : non trouv\xE9e. Portail business FR : \xC0 v\xE9rifier."
    )
  },
  {
    key: "largo",
    name: "Largo (Largo Business)",
    url: "https://www.largo.fr/",
    category: ["smartphones", "tablettes", "ordinateurs", "accessoires"],
    country: "FR / BE / CH",
    pricePublic: "after_login",
    accountRequired: true,
    api: "unknown",
    feed: "unknown",
    stockVisible: "yes",
    automationAllowed: "unknown",
    termsNote: "CGU / clause d'acc\xE8s automatis\xE9 : non trouv\xE9es.",
    integrationMethod: "SUPPLIER_ACCOUNT",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "4.4",
    verification: v(
      "Extranet distributeurs : \xAB acc\xE8s en temps r\xE9el au stock disponible, saisie de commande simplifi\xE9e \xBB. API et flux : \xC0 v\xE9rifier. Conditions exactes du compte (Kbis, validation) : \xC0 v\xE9rifier. PARTNER_FEED si Largo fournit un export."
    )
  },
  {
    key: "recommerce",
    name: "Recommerce",
    url: "https://www.recommerce.com/fr/",
    category: ["smartphones"],
    country: "EU (20 pays)",
    pricePublic: "no",
    accountRequired: null,
    api: "unknown",
    feed: "unknown",
    stockVisible: "unknown",
    automationAllowed: "unknown",
    termsNote: "CGU / clause d'acc\xE8s automatis\xE9 : non trouv\xE9es.",
    integrationMethod: "PARTNER_FEED",
    suggestedAdapter: null,
    status: "partial",
    docSection: "4.5",
    verification: v(
      "Prix B2C publics sur recommerce.com ; B2B via distributeurs/op\xE9rateurs/partenariat, pas de portail ouvert trouv\xE9. API / flux : non trouv\xE9s. Compte : \xC0 v\xE9rifier (contact commercial)."
    )
  },
  {
    key: "smaaart",
    name: "SMAAART",
    url: "https://smaaart.fr/",
    category: ["smartphones", "ordinateurs", "tablettes"],
    country: "FR",
    pricePublic: "unknown",
    accountRequired: null,
    api: "unknown",
    feed: "unknown",
    stockVisible: "unknown",
    automationAllowed: "unknown",
    integrationMethod: "MANUAL",
    suggestedAdapter: null,
    status: "partial",
    docSection: "4.6",
    verification: v(
      "Prix B2C publics ; programme revendeurs / tarifs pro : \xC0 v\xE9rifier. API / flux : non trouv\xE9s. Alternative : PARTNER_FEED apr\xE8s qualification commerciale."
    )
  },
  {
    key: "ab-business",
    name: "AB Business",
    url: "https://www.abbusiness.fr/",
    category: ["smartphones", "tablettes", "accessoires"],
    country: "FR",
    pricePublic: "unknown",
    accountRequired: null,
    api: "unknown",
    feed: "unknown",
    stockVisible: "unknown",
    automationAllowed: "unknown",
    termsNote: "CGU : \xC0 v\xE9rifier.",
    integrationMethod: "SUPPLIER_ACCOUNT",
    suggestedAdapter: null,
    status: "partial",
    docSection: "4.7",
    verification: v(
      "Grossiste t\xE9l\xE9phonie (neuf + reconditionn\xE9). Visibilit\xE9 des prix avant compte non confirm\xE9e ; conditions pro non trouv\xE9es ; API / flux non trouv\xE9s. SUPPLIER_ACCOUNT probable, \xE0 confirmer."
    )
  },
  // ---------------------------------------------------------------------------
  // 5. Distributeurs IT et mobilité
  // ---------------------------------------------------------------------------
  {
    key: "ingram-micro-fr",
    name: "Ingram Micro France",
    url: "https://fr.ingrammicro.eu/",
    category: ["informatique", "mobilit\xE9", "accessoires"],
    country: "FR",
    pricePublic: "after_login",
    accountRequired: true,
    api: "yes",
    apiDocsUrl: "https://developer.ingrammicro.com/reseller",
    feed: "unknown",
    stockVisible: "yes",
    automationAllowed: "yes",
    termsNote: "Terms of Use couvrant les API : acc\xE8s \xAB solely within the applicable country for your account(s) \xBB, apps abusives r\xE9voqu\xE9es. Pas de clause anti-scraping sp\xE9cifique trouv\xE9e (l'API est la voie officielle).",
    integrationMethod: "API",
    suggestedAdapter: "ingram-micro",
    status: "verified_official_snippets",
    docSection: "5.1",
    verification: v(
      "Reseller APIs v6 (catalogue, prix & disponibilit\xE9 \u2264 50 SKU/appel, stock par entrep\xF4t), sans frais, acc\xE8s avec n\xB0 client / Partner ID. Listes de prix / EDI : \xC0 v\xE9rifier. Pi\xE8ces d'ouverture de compte : \xC0 v\xE9rifier."
    )
  },
  {
    key: "td-synnex-fr",
    name: "TD SYNNEX France",
    url: "https://fr.tdsynnex.com/",
    category: ["informatique"],
    country: "FR / EU",
    pricePublic: "after_login",
    accountRequired: true,
    api: "yes",
    apiDocsUrl: "https://developer.api.tdsynnex.com/eu",
    feed: "unknown",
    stockVisible: "yes",
    automationAllowed: "yes",
    termsNote: "Via l'API officielle (Developer Portal). CGU hors API : \xC0 v\xE9rifier.",
    integrationMethod: "API",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "5.2",
    verification: v(
      "Developer Portal EU : REST APIs produits, prix, disponibilit\xE9, commandes ; sandbox, Swagger. Compte revendeur (RIB, Kbis < 3 mois, DBE-S1, n\xB0 TVA, SIRET\u2026). EDI : probable, non confirm\xE9."
    )
  },
  {
    key: "also-fr",
    name: "ALSO France",
    url: "https://www.also.com/ec/cms5/fr_2000/2000/",
    category: ["informatique"],
    country: "FR / EU",
    pricePublic: "after_login",
    accountRequired: true,
    api: "yes",
    apiDocsUrl: "https://www.also.com/ec/cms5/de_1010/1010/services/it-services/edi-und-xml-integration/index.jsp",
    feed: "yes",
    stockVisible: "yes",
    automationAllowed: "yes",
    termsNote: "Via flux SFTP / EDI-XML du groupe. CGV (section Documentation) : \xC0 v\xE9rifier.",
    integrationMethod: "FEED",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "5.3",
    verification: v(
      "Groupe : int\xE9gration XML/EDI (commande XML ou requ\xEAte HTTP vers l'ERP), \xAB SFTP price lists \xBB, contenu 1WorldSync quotidien. Disponibilit\xE9 exacte pour la filiale France : \xC0 v\xE9rifier. Webshop : disponibilit\xE9 et prix d'achat en temps r\xE9el apr\xE8s compte."
    )
  },
  {
    key: "exertis-fr",
    name: "Exertis France",
    url: "https://www.exertis.fr/",
    category: ["informatique", "gaming", "mobilit\xE9", "audio-vid\xE9o"],
    country: "FR",
    pricePublic: "after_login",
    accountRequired: true,
    api: "yes",
    apiDocsUrl: "https://exertis.fr/web-services.php",
    feed: "yes",
    stockVisible: "unknown",
    automationAllowed: "yes",
    termsNote: "Via \xAB PriceCAT feeds \xBB et EDI (page web-services). CGU hors flux : \xC0 v\xE9rifier.",
    integrationMethod: "FEED",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "5.4",
    verification: v(
      "API = EDI (commandes). Flux PriceCAT : format exact \xC0 v\xE9rifier. Ouverture de compte : CGV sign\xE9es, Kbis < 3 mois, RIB, papier en-t\xEAte, CNI du g\xE9rant."
    )
  },
  {
    key: "westcoast-uk",
    name: "Westcoast",
    url: "https://www.westcoast.co.uk/",
    category: ["informatique", "composants"],
    country: "UK (FR : \xC0 v\xE9rifier)",
    pricePublic: "after_login",
    accountRequired: true,
    api: "yes",
    apiDocsUrl: "https://www.westcoast.co.uk/what-we-do/Electronic_Trading.html",
    feed: "yes",
    stockVisible: "yes",
    automationAllowed: "yes",
    termsNote: "Via XML Portal / EDI (EDIFact, Tradacoms, BOSS XML, cXML). CGU hors API : \xC0 v\xE9rifier.",
    integrationMethod: "API",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "5.5",
    verification: v(
      "\xAB XML Portal \xBB (stock, prix, commandes) ; feed par marque configurable par l'account manager. Compte : Cash with Order ou cr\xE9dit. Site FR officiel : \xC0 v\xE9rifier."
    )
  },
  {
    key: "komsa-de",
    name: "KOMSA",
    url: "https://komsa.com/",
    category: ["smartphones", "accessoires", "informatique"],
    country: "DE (FR : \xC0 v\xE9rifier)",
    pricePublic: "after_login",
    accountRequired: true,
    api: "yes",
    apiDocsUrl: "https://komsa.com/en/downloads/edi/interfaces-at-komsa",
    feed: "yes",
    stockVisible: "yes",
    automationAllowed: "yes",
    termsNote: "Via webservice REST authentifi\xE9 et EDI (XML/JSON, SFTP). CG easydata (PDF) : \xC0 v\xE9rifier.",
    integrationMethod: "API",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "5.6",
    verification: v(
      "Webservice de disponibilit\xE9 temps r\xE9el (GET partner.komsa.de/api/v1/product/[article]) ; EDI complet XML/JSON via webservice ou SFTP ; donn\xE9es articles easydata. Compte apr\xE8s v\xE9rification soci\xE9t\xE9 + solvabilit\xE9 (KARLO). Livraison France : \xC0 v\xE9rifier."
    )
  },
  {
    key: "brodos-de",
    name: "Brodos AG",
    url: "https://brodos.com/",
    category: ["smartphones", "tablettes", "accessoires"],
    country: "DE (intl. possible)",
    pricePublic: "after_login",
    accountRequired: true,
    api: "yes",
    apiDocsUrl: "https://forms.brodos.com/brodos-developer-area/",
    feed: "yes",
    stockVisible: "unknown",
    automationAllowed: "yes",
    termsNote: "Via les API document\xE9es (Developer Area) et openTRANS XML. CGU hors API : \xC0 v\xE9rifier.",
    integrationMethod: "API",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "5.7",
    verification: v(
      "Activate API, Customer API, Marketplace OFFER API, Article Master Data API, commandes openTRANS XML ; identifiants de test via account manager. Livraison France : \xC0 v\xE9rifier."
    )
  },
  // ---------------------------------------------------------------------------
  // 6. Déstockage, liquidation, enchères B2B
  // ---------------------------------------------------------------------------
  {
    key: "stocklear",
    name: "Stocklear",
    url: "https://stocklear.fr/",
    category: ["retours clients", "invendus", "t\xE9l\xE9phonie"],
    country: "FR (+ EU)",
    pricePublic: "after_login",
    accountRequired: true,
    api: "unknown",
    feed: "unknown",
    stockVisible: "unknown",
    automationAllowed: "unknown",
    termsNote: "CGU / clause d'acc\xE8s automatis\xE9 : non trouv\xE9es. Automatisation \xE0 confirmer avec Stocklear.",
    integrationMethod: "SUPPLIER_ACCOUNT",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "6.1",
    verification: v(
      "\xAB Only certified accounts\u2026 have access to offers and the ability to bid and purchase \xBB. Compte pro valid\xE9 manuellement (SIRET, Kbis < 1 an, TVA). API / flux : \xC0 v\xE9rifier."
    )
  },
  {
    key: "destockplus",
    name: "Destockplus",
    url: "https://www.destockplus.com/",
    category: ["lots", "t\xE9l\xE9phonie", "d\xE9stockage"],
    country: "FR",
    pricePublic: "yes",
    accountRequired: false,
    api: "no",
    feed: "no",
    stockVisible: "unknown",
    automationAllowed: "unknown",
    termsNote: "CGV : interdiction de programmes visant \xE0 endommager ou intercepter clandestinement les syst\xE8mes/donn\xE9es ; clause sp\xE9cifique robots/scraping : non trouv\xE9e. robots.txt \xE0 lire avant toute automatisation.",
    integrationMethod: "PUBLIC_WEB",
    suggestedAdapter: "jsonld-public",
    status: "verified_official_snippets",
    docSection: "6.2",
    verification: v(
      "Annonces publiques (consultation sans compte), prix affich\xE9s ou \xAB sur demande \xBB selon l'annonceur. \xAB Flux d'annonces \xBB = flux entrant pour les vendeurs, pas de flux sortant acheteurs. Qualit\xE9 h\xE9t\xE9rog\xE8ne."
    )
  },
  {
    key: "merkandi",
    name: "Merkandi",
    url: "https://merkandi.fr/",
    category: ["surstocks", "retours", "reconditionn\xE9", "\xE9lectronique"],
    country: "EU / monde",
    pricePublic: "after_login",
    accountRequired: true,
    api: "unknown",
    feed: "unknown",
    stockVisible: "unknown",
    automationAllowed: "unknown",
    termsNote: "Clause robots/scraping : non trouv\xE9e dans les extraits des conditions. Automatisation \xE0 confirmer par \xE9crit avec Merkandi.",
    integrationMethod: "SUPPLIER_ACCOUNT",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "6.3",
    verification: v(
      "Abonnement annuel payant (STANDARD 239 \u20AC HT, PREMIUM 279 \u20AC HT). Particuliers et entreprises accept\xE9s comme acheteurs. API / flux : non trouv\xE9s (import d'offres c\xF4t\xE9 vendeur uniquement)."
    )
  },
  {
    key: "bstock-europe",
    name: "B-Stock (Europe / Amazon EU / France)",
    url: "https://bstock.com/auctions/europe/",
    category: ["\xE9lectronique", "mobiles (grades A\u2013D)", "retours Amazon"],
    country: "EU / UK",
    pricePublic: "after_login",
    accountRequired: true,
    api: "unknown",
    feed: "unknown",
    stockVisible: "unknown",
    automationAllowed: "forbidden_by_terms",
    termsNote: "Terms of Use : interdiction de \xAB any robot, spider, scraper, data mining tool, data gathering or extraction tool, or any other automated means, to access, collect, copy or record the Services \xBB.",
    integrationMethod: "MANUAL",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "6.4",
    verification: v(
      "Ench\xE8res apr\xE8s compte (business license + n\xB0 TVA ; Amazon EU : virement uniquement). API / flux : non trouv\xE9s. Alternative : alertes natives du compte vendeur ; PARTNER_FEED sur accord \xE9crit."
    )
  },
  {
    key: "eurolots",
    name: "Eurolots",
    url: "https://www.eurolots.com/en",
    category: ["\xE9lectronique", "lots mixtes"],
    country: "EU",
    pricePublic: "after_login",
    accountRequired: true,
    api: "unknown",
    feed: "unknown",
    stockVisible: "unknown",
    automationAllowed: "unknown",
    termsNote: "CGU / clause d'acc\xE8s automatis\xE9 : \xC0 v\xE9rifier.",
    integrationMethod: "SUPPLIER_ACCOUNT",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "6.5",
    verification: v("\xAB Company registration is mandatory \xBB, revue manuelle de chaque candidature ; minimum 100 \u20AC par commande. API / flux : \xC0 v\xE9rifier.")
  },
  {
    key: "wholesale-clearance-uk",
    name: "Wholesale Clearance UK",
    url: "https://www.wholesaleclearance.co.uk/",
    category: ["\xE9lectronique", "lots", "d\xE9stockage"],
    country: "UK",
    pricePublic: "yes",
    accountRequired: false,
    api: "no",
    feed: "no",
    stockVisible: "unknown",
    automationAllowed: "forbidden_by_terms",
    termsNote: "Conditions du site : interdiction de \xAB automated software, process, program, robot, web crawler, spider, data mining, trawling or 'screen scraping' software \xBB.",
    integrationMethod: "MANUAL",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "6.6",
    verification: v("Prix publics ; achats r\xE9put\xE9s professionnels (B2B basis), pas de soci\xE9t\xE9/TVA requise ; paiement int\xE9gral avant exp\xE9dition. Import FR post-Brexit \xE0 pr\xE9voir.")
  },
  {
    key: "gem-wholesale",
    name: "Gem Wholesale",
    url: "https://www.gemwholesale.co.uk/",
    category: ["\xE9lectrom\xE9nager", "\xE9lectronique domestique"],
    country: "UK",
    pricePublic: "yes",
    accountRequired: null,
    api: "no",
    feed: "no",
    stockVisible: "unknown",
    automationAllowed: "unknown",
    termsNote: "Clause robots : non trouv\xE9e.",
    integrationMethod: "PUBLIC_WEB",
    suggestedAdapter: "jsonld-public",
    status: "verified_official_snippets",
    docSection: "6.7",
    verification: v("Prix publics HT, minimum \xA3250 + VAT, \xAB trade only \xBB (modalit\xE9s de compte non trouv\xE9es). Faible pertinence pour le p\xE9rim\xE8tre smartphones.")
  },
  {
    key: "solostocks",
    name: "SoloStocks",
    url: "https://www.solostocks.fr/",
    category: ["t\xE9l\xE9phonie", "informatique", "multi-secteurs"],
    country: "ES / FR / EU / LATAM",
    pricePublic: "yes",
    accountRequired: true,
    api: "unknown",
    feed: "unknown",
    stockVisible: "unknown",
    automationAllowed: "unknown",
    termsNote: "Conditions non index\xE9es : clause d'acc\xE8s automatis\xE9 non trouv\xE9e. Ne pas automatiser avant lecture des CGU.",
    integrationMethod: "PUBLIC_WEB",
    suggestedAdapter: "jsonld-public",
    status: "partial",
    docSection: "6.8",
    verification: v("Prix publics sur annonces (selon vendeur) ; inscription pr\xE9alable pour n\xE9gocier avec les fournisseurs. API / flux : non trouv\xE9s.")
  },
  // ---------------------------------------------------------------------------
  // 7. Brokers, marketplaces B2B avec API, plateformes US/Asie
  // ---------------------------------------------------------------------------
  {
    key: "brokerbin",
    name: "BrokerBin",
    url: "https://brokerbin.com/",
    category: ["pi\xE8ces IT", "syst\xE8mes IT", "t\xE9l\xE9com/r\xE9seau"],
    country: "Monde",
    pricePublic: "after_login",
    accountRequired: true,
    api: "unknown",
    feed: "unknown",
    stockVisible: "unknown",
    automationAllowed: "forbidden_by_terms",
    termsNote: "Terms : interdiction de \xAB mining, harvesting, or scripting any data \xBB ; \xAB robot, spider, scraper, or other automated means\u2026 without express written permission \xBB.",
    integrationMethod: "MANUAL",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "7.1",
    verification: v("Bourse \xAB members-only \xBB (plans 1 599 \xE0 3 750 $/an, v\xE9rification par account manager). API / flux : non trouv\xE9s. Smartphones : marginal.")
  },
  {
    key: "gsmexchange",
    name: "gsmExchange",
    url: "https://www.gsmexchange.com/",
    category: ["smartphones en gros", "accessoires"],
    country: "Monde (Dublin)",
    pricePublic: "after_login",
    accountRequired: true,
    api: "no",
    feed: "no",
    stockVisible: "unknown",
    automationAllowed: "forbidden_by_terms",
    termsNote: "Terms : interdiction de \xAB systematic retrieval of site content\u2026 through robots, spiders, automatic devices or manual processes \xBB ; partage d'identifiants = r\xE9siliation.",
    integrationMethod: "MANUAL",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "7.2",
    verification: v("Membres v\xE9rifi\xE9s : 100\u2013500 terminaux min. par transaction, > 1 an d'exp\xE9rience, 2 r\xE9f\xE9rences commerciales, preuve TVA. Frais de transaction sur le trading floor.")
  },
  {
    key: "handelot",
    name: "Handelot",
    url: "https://www.handelot.com/",
    category: ["mobiles", "tablettes", "consoles", "TV", "informatique"],
    country: "Monde (Pologne)",
    pricePublic: "after_login",
    accountRequired: true,
    api: "unknown",
    feed: "unknown",
    stockVisible: "unknown",
    automationAllowed: "unknown",
    termsNote: "CGU / clause d'acc\xE8s automatis\xE9 : non trouv\xE9es.",
    integrationMethod: "SUPPLIER_ACCOUNT",
    suggestedAdapter: null,
    status: "partial",
    docSection: "7.3",
    verification: v("Niveaux VIP / VIP Gold / Junior ; 2 r\xE9f\xE9rences commerciales, > 1 an d'activit\xE9. Tarif d'adh\xE9sion : non trouv\xE9. API / flux : non trouv\xE9s.")
  },
  {
    key: "amazon-business-fr",
    name: "Amazon Business (FR)",
    url: "https://business.amazon.fr/",
    category: ["smartphones", "informatique", "tout"],
    country: "FR / EU",
    pricePublic: "after_login",
    accountRequired: true,
    api: "yes",
    apiDocsUrl: "https://developer-docs.amazon.com/amazon-business/docs/product-search-api-overview",
    feed: "no",
    stockVisible: "unknown",
    automationAllowed: "forbidden_by_terms",
    termsNote: "CGU : interdiction sans consentement \xE9crit des \xAB data mining, robots, or similar data gathering and extraction tools \xBB et de constituer une base de donn\xE9es de prix. Seule voie : Product Search API sur approbation (r\xF4les attribu\xE9s par Amazon Business).",
    integrationMethod: "API",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "7.4",
    verification: v("Prix pro apr\xE8s compte Business gratuit et v\xE9rifi\xE9 (SIRET/TVA). Product Search API (searchProducts, getProductsByAsins \u2264 30 ASIN) apr\xE8s questionnaire d'onboarding. Sans approbation : SUPPLIER_ACCOUNT sans automatisation.")
  },
  {
    key: "ebay-browse-api",
    name: "eBay (Browse API)",
    url: "https://developer.ebay.com/api-docs/buy/browse/overview.html",
    category: ["smartphones", "lots", "tout"],
    country: "FR / EU / monde",
    pricePublic: "yes",
    accountRequired: false,
    api: "yes",
    apiDocsUrl: "https://developer.ebay.com/api-docs/buy/browse/overview.html",
    feed: "no",
    stockVisible: "unknown",
    automationAllowed: "forbidden_by_terms",
    termsNote: "CGU eBay.fr : robots, spiders, scrapers et data mining interdits hors API ; robots.txt : acc\xE8s automatis\xE9 interdit sauf moteurs de recherche ; licence API : \xAB market research \xBB et contournement des limites interdits.",
    integrationMethod: "API",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "7.5",
    verification: v("Browse API (token applicatif, 5 000 appels/jour par d\xE9faut) ; Buy APIs en Limited Release : production r\xE9serv\xE9e aux partenaires EPN apr\xE8s \xAB Application Growth Check \xBB. Aucun scraping HTML.")
  },
  {
    key: "bigbuy",
    name: "BigBuy",
    url: "https://www.bigbuy.eu/fr/",
    category: ["\xE9lectronique", "informatique", "accessoires"],
    country: "EU (Espagne)",
    pricePublic: "unknown",
    accountRequired: true,
    api: "yes",
    apiDocsUrl: "https://api.bigbuy.eu/rest/doc",
    feed: "yes",
    stockVisible: "yes",
    automationAllowed: "yes",
    termsNote: "Via API REST et fichiers CSV/XML/FTP (voie officielle). Clause scraping : non trouv\xE9e.",
    integrationMethod: "API",
    suggestedAdapter: "bigbuy",
    status: "verified_official_snippets",
    docSection: "7.6",
    verification: v(
      "API REST/JSON r\xE9serv\xE9e aux packs Ecommerce ou sup\xE9rieurs (tarif \xC0 v\xE9rifier) ; CSV/XML avec code, EAN, prix distributeur, PVC, stock ; FTP sur demande. Visibilit\xE9 des prix avant compte : \xC0 v\xE9rifier. Pr\xE9sence de smartphones de marque : \xC0 v\xE9rifier."
    )
  },
  {
    key: "cdiscount-pro",
    name: "CdiscountPro",
    url: "https://www.cdiscountpro.com/",
    category: ["informatique", "t\xE9l\xE9phonie"],
    country: "FR",
    pricePublic: "yes",
    accountRequired: false,
    api: "unknown",
    feed: "unknown",
    stockVisible: "unknown",
    automationAllowed: "unknown",
    termsNote: "CGU : \xC0 v\xE9rifier (non lues).",
    integrationMethod: "PUBLIC_WEB",
    suggestedAdapter: "jsonld-public",
    status: "partial",
    docSection: "7.7",
    verification: v("Prix publics affich\xE9s HT (> 100 000 r\xE9f\xE9rences) ; conditions de commande/compte : \xC0 v\xE9rifier. API / flux : non trouv\xE9s. Prix de d\xE9tail pro, pas de prix de gros.")
  },
  {
    key: "alibaba",
    name: "Alibaba.com",
    url: "https://www.alibaba.com/",
    category: ["\xE9lectronique", "tout"],
    country: "Asie / monde",
    pricePublic: "yes",
    accountRequired: false,
    api: "yes",
    apiDocsUrl: "https://openapi.alibaba.com/doc/doc.htm",
    feed: "no",
    stockVisible: "unknown",
    automationAllowed: "forbidden_by_terms",
    termsNote: "CGU : \xAB Systematic retrieval of Site Content\u2026 (whether through robots, spiders, automatic devices or manual processes) without written permission \xBB interdit. Seule voie : Open Platform sur approbation.",
    integrationMethod: "API",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "7.8",
    verification: v("Fourchettes de prix indicatives publiques (MOQ), prix r\xE9els n\xE9goci\xE9s. Open Platform : inscription d\xE9veloppeur, OAuth, acc\xE8s \xAB scoped to approved business partners \xBB. Sans acc\xE8s : MANUAL.")
  },
  {
    key: "global-sources",
    name: "Global Sources",
    url: "https://www.globalsources.com/",
    category: ["\xE9lectronique grand public", "mobile"],
    country: "Asie / monde (Hong Kong)",
    pricePublic: "no",
    accountRequired: true,
    api: "unknown",
    feed: "no",
    stockVisible: "unknown",
    automationAllowed: "unknown",
    termsNote: "CGU : usage limit\xE9 \xE0 des \xAB non-substantial portions\u2026 for personal or internal and non-commercial purposes \xBB, reproduction/r\xE9utilisation interdite sans permission \xE9crite ; clause robots explicite : non trouv\xE9e.",
    integrationMethod: "MANUAL",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "7.9",
    verification: v("Prix sur demande (inquiries) ; inscription gratuite. API / flux : non trouv\xE9s.")
  },
  {
    key: "liquidation-com",
    name: "Liquidation.com",
    url: "https://www.liquidation.com/",
    category: ["\xE9lectronique", "mobiles", "retours"],
    country: "US",
    pricePublic: "after_login",
    accountRequired: true,
    api: "no",
    feed: "no",
    stockVisible: "unknown",
    automationAllowed: "forbidden_by_terms",
    termsNote: "User Agreement : interdiction des \xAB spiders, crawlers, robots or any other similar means\u2026 data-mining \xBB.",
    integrationMethod: "MANUAL",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "7.10",
    verification: v("Compte gratuit ; acheteurs internationaux : virement uniquement ; export \xE0 la charge de l'acheteur. Priorit\xE9 basse.")
  },
  {
    key: "direct-liquidation",
    name: "Direct Liquidation",
    url: "https://www.directliquidation.com/",
    category: ["\xE9lectronique", "retours"],
    country: "US",
    pricePublic: "after_login",
    accountRequired: true,
    api: "no",
    feed: "no",
    stockVisible: "unknown",
    automationAllowed: "forbidden_by_terms",
    termsNote: "Terms : interdiction de \xAB robot, spider, data miner, wanderer, crawler or any other automatic or manual device or process to copy or monitor \xBB.",
    integrationMethod: "MANUAL",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "7.11",
    verification: v("Compte (nom, e-mail, t\xE9l\xE9phone, soci\xE9t\xE9) ; pas d'exp\xE9dition internationale g\xE9r\xE9e. Priorit\xE9 basse.")
  },
  {
    key: "via-trading",
    name: "Via Trading",
    url: "https://www.viatrading.com/",
    category: ["\xE9lectronique", "retours"],
    country: "US (export)",
    pricePublic: "yes",
    accountRequired: false,
    api: "no",
    feed: "no",
    stockVisible: "unknown",
    automationAllowed: "forbidden_by_terms",
    termsNote: "Terms : interdiction sans permission \xE9crite des \xAB automated tools to scrape, copy or download listings, manifests, images or pricing \xBB ; republication des manifestes interdite.",
    integrationMethod: "MANUAL",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "7.12",
    verification: v("Prix publics, \xAB no membership fee and no minimum dollar order \xBB, aucune licence/soci\xE9t\xE9 requise ; minimum un carton, une palette ou un camion. Priorit\xE9 basse.")
  },
  {
    key: "888lots",
    name: "888 Lots",
    url: "https://888lots.com/",
    category: ["\xE9lectronique", "mobiles"],
    country: "US uniquement",
    pricePublic: "after_login",
    accountRequired: true,
    api: "no",
    feed: "no",
    stockVisible: "unknown",
    automationAllowed: "unknown",
    termsNote: "Non applicable : \xAB does not accept international customers \xBB.",
    integrationMethod: "NOT_INTEGRABLE",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "7.13",
    verification: v("Certificat de revente US exig\xE9 ; clients internationaux refus\xE9s \u2192 plateforme s\u0153ur Eurolots (6.5) pour l'Europe.")
  }
];
function listCatalogSources() {
  return SOURCING_CATALOG;
}

// src/domain/sourcing/dictionaries.ts
var BRANDS = [
  { key: "apple", display: "Apple", aliases: ["apple"] },
  { key: "samsung", display: "Samsung", aliases: ["samsung"] },
  { key: "google", display: "Google", aliases: ["google"] },
  { key: "xiaomi", display: "Xiaomi", aliases: ["xiaomi", "mi"] },
  { key: "huawei", display: "Huawei", aliases: ["huawei"] },
  { key: "honor", display: "Honor", aliases: ["honor"] },
  { key: "oneplus", display: "OnePlus", aliases: ["oneplus", "one plus"] },
  { key: "oppo", display: "Oppo", aliases: ["oppo"] },
  { key: "realme", display: "Realme", aliases: ["realme"] },
  { key: "sony", display: "Sony", aliases: ["sony"] },
  { key: "nintendo", display: "Nintendo", aliases: ["nintendo"] },
  { key: "microsoft", display: "Microsoft", aliases: ["microsoft"] },
  { key: "dyson", display: "Dyson", aliases: ["dyson"] },
  { key: "lenovo", display: "Lenovo", aliases: ["lenovo"] },
  { key: "dell", display: "Dell", aliases: ["dell"] },
  { key: "hp", display: "HP", aliases: ["hp", "hewlett packard"] },
  { key: "asus", display: "Asus", aliases: ["asus"] },
  { key: "acer", display: "Acer", aliases: ["acer"] },
  { key: "motorola", display: "Motorola", aliases: ["motorola", "moto"] },
  { key: "nokia", display: "Nokia", aliases: ["nokia"] },
  { key: "jbl", display: "JBL", aliases: ["jbl"] },
  { key: "bose", display: "Bose", aliases: ["bose"] },
  { key: "garmin", display: "Garmin", aliases: ["garmin"] },
  { key: "gopro", display: "GoPro", aliases: ["gopro", "go pro"] },
  { key: "dji", display: "DJI", aliases: ["dji"] },
  { key: "logitech", display: "Logitech", aliases: ["logitech"] },
  { key: "philips", display: "Philips", aliases: ["philips"] },
  { key: "bosch", display: "Bosch", aliases: ["bosch"] },
  { key: "lg", display: "LG", aliases: ["lg"] }
];
function variantWord(v2) {
  if (!v2) return "";
  const x = v2.replace(/\s+/g, " ").trim();
  if (x === "promax" || x === "pro max") return "pro max";
  if (x === "+" || x === "plus") return "plus";
  return x;
}
function cap(s) {
  return s.split(" ").map((w2) => w2.length === 0 ? w2 : w2[0].toUpperCase() + w2.slice(1)).join(" ");
}
var MODEL_PATTERNS = [
  // ---- Apple ----
  {
    brand: "apple",
    regex: /\biphone\s?(xs\s?max|xs|xr|x)\b/,
    build: (m) => {
      const v2 = (m[1] ?? "").replace(/\s+/g, " ");
      return { model: `iphone ${v2}`, display: `iPhone ${v2.toUpperCase()}` };
    }
  },
  {
    brand: "apple",
    regex: /\biphone\s?se\b\s?(?:\(?\s?(20(?:16|20|22))\s?\)?|(2|3)(?:nd|rd|e|eme|ème)?(?:\s?gen(?:eration)?)?)?/,
    build: (m) => {
      const year = m[1] ?? (m[2] === "2" ? "2020" : m[2] === "3" ? "2022" : void 0);
      return { model: year ? `iphone se ${year}` : "iphone se", display: year ? `iPhone SE (${year})` : "iPhone SE" };
    }
  },
  {
    brand: "apple",
    regex: /\biphone\s?(\d{1,2})\s?(pro\s?max|promax|pro|plus|mini|max)?\b/,
    build: (m) => {
      const n = Number(m[1]);
      if (n < 3 || n > 30) return null;
      const v2 = variantWord(m[2]);
      return { model: `iphone ${n}${v2 ? ` ${v2}` : ""}`, display: `iPhone ${n}${v2 ? ` ${cap(v2)}` : ""}` };
    }
  },
  {
    brand: "apple",
    // taille (décimale, ou 11 / 12 / 13 pouces), génération (1–10, « 9e gén. », « 9th generation »), année.
    // Chaque nombre est borné (?![a-z0-9]) : « iPad Air 2022 » ne donne jamais « ipad air 20 ».
    regex: /\bipad\s?(pro|air|mini)?(?:\s?(\d{1,2}[.,]\d|1[1-3])(?![a-z0-9])(?:\s?(?:pouces?|inch))?)?(?:\s?(\d{1,2})(?:\s?(?:e|eme|th|nd|rd|st))?(?:\s?gen(?:eration)?)?(?![a-z0-9]))?(?:\s?(20[12]\d)(?![a-z0-9]))?/,
    build: (m) => {
      const v2 = m[1] ?? "";
      const size = m[2]?.replace(",", ".") ?? "";
      const gen = m[3] && Number(m[3]) >= 1 && Number(m[3]) <= 10 ? String(Number(m[3])) : "";
      if (m[3] && !gen) return null;
      const year = m[4] ?? "";
      const model = ["ipad", v2, size, gen, year].filter(Boolean).join(" ");
      const display = ["iPad", v2 ? cap(v2) : "", size ? `${size}"` : "", gen, year].filter(Boolean).join(" ");
      return { model, display };
    }
  },
  {
    brand: "apple",
    // puce Apple Silicon (M1–M4, Pro / Max / Ultra) conservée dans le modèle : « MacBook Air M2 » ≠ « MacBook Air M1 ».
    // L'année n'entre dans le modèle qu'en l'absence de puce (générations Intel).
    regex: /\bmacbook\s?(air|pro)?(?:\s?(1[3-6](?:[.,]\d)?)(?![a-z0-9])(?:\s?(?:pouces?|inch))?)?(?:\s?(m[1-4](?:\s?(?:pro|max|ultra))?)(?![a-z0-9]))?(?:\s?(20[012]\d)(?![a-z0-9]))?(?![a-z0-9])/,
    build: (m) => {
      const v2 = m[1] ?? "";
      const size = m[2]?.replace(",", ".") ?? "";
      const chip = m[3]?.replace(/\s+/g, " ") ?? "";
      const year = !chip && m[4] ? m[4] : "";
      return {
        model: ["macbook", v2, size, chip, year].filter(Boolean).join(" "),
        display: ["MacBook", v2 ? cap(v2) : "", size ? `${size}"` : "", chip ? chip.toUpperCase().replace(/ (PRO|MAX|ULTRA)$/, (x) => cap(x.toLowerCase())) : "", year].filter(Boolean).join(" ")
      };
    }
  },
  {
    brand: "apple",
    regex: /\bairpods\s?(pro|max)?\s?(\d)?\b/,
    build: (m) => {
      const v2 = m[1] ?? "";
      const gen = m[2] ?? "";
      return { model: ["airpods", v2, gen].filter(Boolean).join(" "), display: ["AirPods", v2 ? cap(v2) : "", gen].filter(Boolean).join(" ") };
    }
  },
  {
    brand: "apple",
    regex: /\b(?:apple\s?)?watch\s?(ultra|se|series)?\s?(\d{1,2})?\b/,
    build: (m) => {
      if (!m[1] && !m[2]) return null;
      const v2 = m[1] ?? "series";
      const n = m[2] ?? "";
      return { model: ["apple watch", v2, n].filter(Boolean).join(" "), display: ["Apple Watch", cap(v2), n].filter(Boolean).join(" ") };
    }
  },
  { brand: "apple", regex: /\bmac\s?mini\b/, build: () => ({ model: "mac mini", display: "Mac mini" }) },
  { brand: "apple", regex: /\bimac\b/, build: () => ({ model: "imac", display: "iMac" }) },
  // ---- Samsung ----
  {
    brand: "samsung",
    regex: /\bgalaxy\s?s(\d{2})\s?(ultra|plus|\+|fe|edge)?(?![a-z0-9])/,
    build: (m) => {
      const v2 = variantWord(m[2]);
      return { model: `galaxy s${m[1]}${v2 ? ` ${v2}` : ""}`, display: `Galaxy S${m[1]}${v2 ? ` ${v2 === "fe" ? "FE" : cap(v2)}` : ""}` };
    }
  },
  {
    brand: "samsung",
    regex: /\bgalaxy\s?note\s?(\d{1,2})\s?(ultra|plus|\+)?(?![a-z0-9])/,
    build: (m) => {
      const v2 = variantWord(m[2]);
      return { model: `galaxy note ${m[1]}${v2 ? ` ${v2}` : ""}`, display: `Galaxy Note ${m[1]}${v2 ? ` ${cap(v2)}` : ""}` };
    }
  },
  {
    brand: "samsung",
    regex: /\bgalaxy\s?z\s?(fold|flip)\s?(\d)?\b/,
    build: (m) => ({ model: ["galaxy z", m[1], m[2]].filter(Boolean).join(" "), display: ["Galaxy Z", cap(m[1] ?? ""), m[2]].filter(Boolean).join(" ") })
  },
  {
    brand: "samsung",
    regex: /\bgalaxy\s?tab\s?(s|a)\s?(\d{1,2})\s?(ultra|plus|\+|fe|lite)?(?![a-z0-9])/,
    build: (m) => {
      const v2 = variantWord(m[3]);
      return { model: `galaxy tab ${m[1]}${m[2]}${v2 ? ` ${v2}` : ""}`, display: `Galaxy Tab ${(m[1] ?? "").toUpperCase()}${m[2]}${v2 ? ` ${v2 === "fe" ? "FE" : cap(v2)}` : ""}` };
    }
  },
  {
    brand: "samsung",
    regex: /\bgalaxy\s?a(\d{2})\s?(s|e)?\b/,
    build: (m) => ({ model: `galaxy a${m[1]}${m[2] ?? ""}`, display: `Galaxy A${m[1]}${m[2] ?? ""}` })
  },
  { brand: "samsung", regex: /\bgalaxy\s?m(\d{2})\b/, build: (m) => ({ model: `galaxy m${m[1]}`, display: `Galaxy M${m[1]}` }) },
  {
    brand: "samsung",
    regex: /\bgalaxy\s?xcover\s?(\d)?\s?(pro)?\b/,
    build: (m) => ({ model: ["galaxy xcover", m[1], m[2]].filter(Boolean).join(" "), display: ["Galaxy XCover", m[1], m[2] ? "Pro" : ""].filter(Boolean).join(" ") })
  },
  {
    brand: "samsung",
    regex: /\bgalaxy\s?(buds|watch)\s?(\d)?\s?(pro|ultra|fe|classic|live)?\b/,
    build: (m) => ({
      model: ["galaxy", m[1], m[2], m[3]].filter(Boolean).join(" "),
      display: ["Galaxy", cap(m[1] ?? ""), m[2], m[3] ? m[3] === "fe" ? "FE" : cap(m[3]) : ""].filter(Boolean).join(" ")
    })
  },
  // ---- Google ----
  {
    brand: "google",
    regex: /\bpixel\s?(\d{1,2})\s?(a|pro\s?xl|pro|xl|fold)?\b/,
    build: (m) => {
      const v2 = (m[2] ?? "").replace(/\s+/g, " ");
      if (v2 === "a") return { model: `pixel ${m[1]}a`, display: `Pixel ${m[1]}a` };
      return { model: `pixel ${m[1]}${v2 ? ` ${v2}` : ""}`, display: `Pixel ${m[1]}${v2 ? ` ${v2 === "xl" ? "XL" : v2 === "pro xl" ? "Pro XL" : cap(v2)}` : ""}` };
    }
  },
  // ---- Xiaomi ----
  {
    brand: "xiaomi",
    regex: /\bredmi\s?(note)?\s?(\d{1,2})\s?(pro\s?\+|pro\s?plus|pro|s|t|c|lite|ultra)?(?![a-z0-9])/,
    build: (m) => {
      const v2 = (m[3] ?? "").replace(/\s+/g, " ").replace("pro +", "pro plus");
      return { model: ["redmi", m[1], m[2], v2].filter(Boolean).join(" "), display: ["Redmi", m[1] ? "Note" : "", m[2], v2 ? cap(v2) : ""].filter(Boolean).join(" ") };
    }
  },
  {
    brand: "xiaomi",
    regex: /\bpoco\s?([xfmc]\d{1,2})\s?(pro|gt)?\b/,
    build: (m) => ({ model: ["poco", m[1], m[2]].filter(Boolean).join(" "), display: ["Poco", (m[1] ?? "").toUpperCase(), m[2] ? cap(m[2]) : ""].filter(Boolean).join(" ") })
  },
  {
    brand: "xiaomi",
    regex: /\b(?:xiaomi|mi)\s?(\d{1,2})\s?(t\s?pro|t|pro|ultra|lite)?\b/,
    build: (m) => {
      const v2 = (m[2] ?? "").replace(/\s+/g, " ");
      return { model: [m[1], v2].filter(Boolean).join(" "), display: [m[1], v2 ? v2.toUpperCase().replace("PRO", "Pro").replace("ULTRA", "Ultra").replace("LITE", "Lite") : ""].filter(Boolean).join(" ") };
    }
  },
  // ---- Huawei / Honor ----
  {
    brand: "huawei",
    regex: /\bhuawei\s+(p|mate|nova)\s?(\d{1,2})\s?(pro\s?\+|pro|lite)?(?![a-z0-9])/,
    build: (m) => ({ model: [`${m[1]}${m[2]}`, m[3]?.replace(/\s+/g, "")].filter(Boolean).join(" "), display: [`${(m[1] ?? "").toUpperCase()}${m[2]}`, m[3] ? cap(m[3]) : ""].filter(Boolean).join(" ") })
  },
  {
    brand: "honor",
    regex: /\bhonor\s+(magic|x)?\s?(\d{1,2})\s?(pro|lite)?\b/,
    build: (m) => ({ model: [m[1], m[2], m[3]].filter(Boolean).join(" "), display: [m[1] ? cap(m[1]) : "", m[2], m[3] ? cap(m[3]) : ""].filter(Boolean).join(" ") })
  },
  // ---- OnePlus / Oppo ----
  {
    brand: "oneplus",
    regex: /\boneplus\s?(nord\s?(?:ce\s?)?\d?|\d{1,2}[rt]?)\s?(pro)?\b/,
    build: (m) => ({ model: [(m[1] ?? "").replace(/\s+/g, " ").trim(), m[2]].filter(Boolean).join(" "), display: [cap((m[1] ?? "").trim()), m[2] ? "Pro" : ""].filter(Boolean).join(" ") })
  },
  {
    brand: "oppo",
    regex: /\boppo\s+(reno|find|a)\s?(\d{1,2}|x\d?)\s?(pro|lite|neo)?\b/,
    build: (m) => ({ model: [m[1], m[2], m[3]].filter(Boolean).join(" "), display: [cap(m[1] ?? ""), (m[2] ?? "").toUpperCase(), m[3] ? cap(m[3]) : ""].filter(Boolean).join(" ") })
  },
  // ---- Consoles ----
  {
    brand: "sony",
    regex: /\b(?:playstation|ps)\s?(4|5)\s?(pro|slim|digital(?:\s?edition)?)?\b/,
    build: (m) => ({ model: ["playstation", m[1], m[2]?.replace(/\s+/g, " ")].filter(Boolean).join(" "), display: ["PlayStation", m[1], m[2] ? cap(m[2]) : ""].filter(Boolean).join(" ") })
  },
  {
    brand: "nintendo",
    regex: /\b(?:nintendo\s?)?switch\s?(oled|lite|2)?\b/,
    build: (m) => ({ model: ["nintendo switch", m[1]].filter(Boolean).join(" "), display: ["Nintendo Switch", m[1] === "oled" ? "OLED" : m[1] ? cap(m[1]) : ""].filter(Boolean).join(" ") })
  },
  {
    brand: "microsoft",
    regex: /\bxbox\s?(series\s?[xs]|one\s?[xs]?)\b/,
    build: (m) => ({ model: `xbox ${(m[1] ?? "").replace(/\s+/g, " ")}`, display: `Xbox ${cap((m[1] ?? "").replace(/\s+/g, " ")).replace(/\b(X|S)$/, (c) => c.toUpperCase())}` })
  },
  {
    brand: "microsoft",
    regex: /\bsurface\s?(pro|laptop|go|book)\s?(\d{1,2})?\b/,
    build: (m) => ({ model: ["surface", m[1], m[2]].filter(Boolean).join(" "), display: ["Surface", cap(m[1] ?? ""), m[2]].filter(Boolean).join(" ") })
  },
  // ---- Dyson ----
  {
    brand: "dyson",
    regex: /\bdyson\s+(v\d{1,2}|airwrap|supersonic|gen\s?5)\s?(absolute|animal|detect|origin|complete|motorhead|fluffy)?\b/,
    build: (m) => ({ model: [(m[1] ?? "").replace(/\s+/g, ""), m[2]].filter(Boolean).join(" "), display: [(m[1] ?? "").toUpperCase().replace("GEN", "Gen"), m[2] ? cap(m[2]) : ""].filter(Boolean).join(" ") })
  }
];
var COLORS = [
  { key: "gray", display: "Gray", aliases: ["space gray", "space grey", "gris sideral", "gris sid\xE9ral", "graphite", "graphit", "gris", "gray", "grey", "grau", "titanium gray", "gris titane"] },
  { key: "black", display: "Black", aliases: ["jet black", "noir de jais", "noir", "black", "schwarz", "nero", "negro", "black titanium", "titane noir"] },
  { key: "white", display: "White", aliases: ["blanc", "white", "weiss", "bianco", "blanco", "white titanium", "titane blanc"] },
  { key: "midnight", display: "Midnight", aliases: ["midnight", "minuit"] },
  { key: "starlight", display: "Starlight", aliases: ["starlight", "lumiere stellaire", "lumi\xE8re stellaire"] },
  { key: "blue", display: "Blue", aliases: ["sierra blue", "bleu alpin", "alpine blue", "pacific blue", "bleu pacifique", "bleu nuit", "deep blue", "bleu", "blue", "blau", "azul", "blue titanium", "titane bleu"] },
  { key: "red", display: "Red", aliases: ["product red", "rouge", "red", "rot", "rosso", "rojo"] },
  { key: "green", display: "Green", aliases: ["alpine green", "vert alpin", "midnight green", "vert nuit", "vert", "green", "grun", "verde"] },
  { key: "silver", display: "Silver", aliases: ["argent", "silver", "silber", "argento", "plata"] },
  { key: "gold", display: "Gold", aliases: ["rose gold", "or rose", "dore", "dor\xE9", "gold", "golden", "or"] },
  { key: "purple", display: "Purple", aliases: ["deep purple", "violet intense", "violet", "purple", "mauve", "lilas", "lilac", "lavande", "lavender"] },
  { key: "pink", display: "Pink", aliases: ["rose", "pink", "rosa"] },
  { key: "yellow", display: "Yellow", aliases: ["jaune", "yellow", "gelb"] },
  { key: "orange", display: "Orange", aliases: ["orange", "corail", "coral"] },
  { key: "titanium", display: "Titanium", aliases: ["natural titanium", "titane naturel", "titane", "titanium", "desert titanium", "titane desert"] },
  { key: "brown", display: "Brown", aliases: ["marron", "brown", "bronze", "cuivre", "copper"] },
  { key: "beige", display: "Beige", aliases: ["beige", "sable", "sand"] }
];
var CONDITION_WORDS = [
  { condition: "new", aliases: ["brand new", "neuf", "neuve", "neufs", "new", "sealed", "scelle", "scell\xE9", "blister", "nuevo", "nuovo", "neu"] },
  { condition: "refurbished", aliases: ["remis a neuf", "remis \xE0 neuf", "reconditionne", "reconditionn\xE9", "reconditionnee", "reconditionn\xE9e", "reconditionnes", "refurbished", "refurb", "recond", "renewed", "ricondizionato", "generaluberholt"] },
  { condition: "used", aliases: ["second hand", "seconde main", "pre owned", "preowned", "d occasion", "occasion", "used", "usado", "usato", "gebraucht"] }
];
var NOISE_TOKENS = /* @__PURE__ */ new Set([
  "smartphone",
  "smartphones",
  "telephone",
  "t\xE9l\xE9phone",
  "phone",
  "mobile",
  "portable",
  "tablette",
  "tablet",
  "ordinateur",
  "laptop",
  "unlocked",
  "debloque",
  "d\xE9bloqu\xE9",
  "desimlocke",
  "d\xE9simlock\xE9",
  "simfree",
  "sim",
  "free",
  "dual",
  "esim",
  "5g",
  "4g",
  "lte",
  "3g",
  "garantie",
  "warranty",
  "mois",
  "months",
  "month",
  "ans",
  "an",
  "year",
  "years",
  "lot",
  "pcs",
  "pieces",
  "pi\xE8ces",
  "units",
  "unites",
  "unit\xE9s",
  "pack",
  "bundle",
  "x",
  "original",
  "originale",
  "genuine",
  "authentique",
  "officiel",
  "official",
  "oem",
  "de",
  "du",
  "des",
  "le",
  "la",
  "les",
  "et",
  "avec",
  "sans",
  "pour",
  "the",
  "with",
  "and",
  "for",
  "of",
  "go",
  "gb",
  "tb",
  "to"
]);
var VARIANT_TOKENS = [
  { key: "wifi", aliases: ["wifi", "wi fi", "wlan"] },
  { key: "cellular", aliases: ["cellular", "cellulaire", "4g cellular", "5g cellular", "lte cellular"] },
  { key: "dual sim", aliases: ["dual sim", "dual sims", "double sim", "ds"] }
];
var MPN_STOPWORDS = /* @__PURE__ */ new Set(["note", "tab", "mate", "nova", "poco", "ipad", "se", "s", "a", "m", "x", "z", "v", "ps", "mi", "pro", "max", "gen", "iphone", "pixel", "redmi", "galaxy", "watch", "xbox"]);
var ISO_4217 = /* @__PURE__ */ new Set([
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "JPY",
  "CNY",
  "HKD",
  "SGD",
  "AUD",
  "CAD",
  "NZD",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "RON",
  "BGN",
  "HRK",
  "TRY",
  "ILS",
  "AED",
  "SAR",
  "QAR",
  "KWD",
  "INR",
  "PKR",
  "BDT",
  "LKR",
  "THB",
  "VND",
  "IDR",
  "MYR",
  "PHP",
  "KRW",
  "TWD",
  "ZAR",
  "NGN",
  "EGP",
  "MAD",
  "TND",
  "DZD",
  "KES",
  "BRL",
  "MXN",
  "ARS",
  "CLP",
  "COP",
  "PEN",
  "RUB",
  "UAH",
  "KZT",
  "ISK",
  "GEL",
  "RSD",
  "MKD",
  "BAM",
  "ALL",
  "MDL"
]);
var STORAGE_SIZES_GB = /* @__PURE__ */ new Set([8, 16, 32, 64, 128, 256, 512, 1024, 2048]);

// src/domain/sourcing/normalizer.ts
var UNKNOWN = "-";
function normalizeText(input) {
  if (!input) return "";
  return input.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’`´]/g, " ").replace(/[^a-z0-9+/.,\s]/g, " ").replace(/(?<!\d)[.,]|[.,](?!\d)/g, " ").replace(/\s+/g, " ").trim();
}
function isValidGtin(digits2) {
  if (!/^\d{8}$|^\d{12,14}$/.test(digits2)) return false;
  const nums = digits2.split("").map(Number);
  const check = nums.pop();
  let sum = 0;
  for (let i = nums.length - 1, w2 = 3; i >= 0; i--, w2 = w2 === 3 ? 1 : 3) sum += nums[i] * w2;
  return (10 - sum % 10) % 10 === check;
}
function extractEan(text2) {
  const m = text2.match(/(?<!\d)(\d{8}|\d{12,14})(?!\d)/);
  if (!m || !m[1]) return null;
  return { ean: m[1], valid: isValidGtin(m[1]) };
}
var STORAGE_TOKEN = /^\d{1,4}(gb|go|g|tb|to)$/i;
function looksLikeMpn(token) {
  const t = token.trim();
  if (t.length < 5 || t.length > 32) return false;
  if (!/^[A-Z0-9][A-Z0-9\-/]*$/i.test(t)) return false;
  if ((t.match(/[A-Z]/gi) ?? []).length < 2) return false;
  if (!/\d/.test(t)) return false;
  if (STORAGE_TOKEN.test(t)) return false;
  if (/^\d/.test(t)) return false;
  const prefix = t.match(/^([A-Z]+)/i)?.[1]?.toLowerCase() ?? "";
  if (prefix && MPN_STOPWORDS.has(prefix)) return false;
  return true;
}
function extractMpn(text2) {
  for (const tok of text2.split(/\s+/)) {
    const clean = tok.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9/]+$/g, "");
    if (looksLikeMpn(clean)) return clean.toUpperCase();
  }
  return null;
}
function normalizeStorage(raw) {
  if (!raw) return null;
  const t = normalizeText(raw);
  const m = t.match(/(\d{1,4})\s?(tb|to|gb|go|g)?(?![a-z])/);
  if (!m || !m[1]) return null;
  const n = Number(m[1]);
  const unit = m[2];
  if (unit === "tb" || unit === "to") return `${n}TB`;
  if (unit) return `${n}GB`;
  if (STORAGE_SIZES_GB.has(n)) return `${n}GB`;
  return null;
}
function cutMatch(work, m) {
  const idx = m.index ?? work.indexOf(m[0]);
  return `${work.slice(0, idx)} ${work.slice(idx + m[0].length)}`;
}
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}
var COLOR_ALIASES = COLORS.flatMap((c) => c.aliases.map((a) => ({ key: c.key, display: c.display, alias: normalizeText(a) }))).sort((a, b) => b.alias.length - a.alias.length);
var CONDITION_ALIASES = CONDITION_WORDS.flatMap((c) => c.aliases.map((a) => ({ condition: c.condition, alias: normalizeText(a) }))).sort((a, b) => b.alias.length - a.alias.length);
var BRAND_ALIASES = BRANDS.flatMap((b) => b.aliases.filter((a) => a.length > 2).map((a) => ({ key: b.key, display: b.display, alias: normalizeText(a) }))).sort((a, b) => b.alias.length - a.alias.length);
var VARIANT_ALIASES = VARIANT_TOKENS.flatMap((v2) => v2.aliases.map((a) => ({ key: v2.key, alias: normalizeText(a) }))).sort((a, b) => b.alias.length - a.alias.length);
function wordRegex(alias) {
  return new RegExp(`(?<![a-z0-9])${escapeRegex(alias)}(?![a-z0-9])`);
}
function normalizeColor(raw) {
  if (!raw) return null;
  const t = normalizeText(raw);
  for (const c of COLOR_ALIASES) {
    if (wordRegex(c.alias).test(t)) return { key: c.key, display: c.display };
  }
  return null;
}
function normalizeGrade(raw) {
  if (!raw) return null;
  const t = normalizeText(raw);
  const m = t.match(/(?<![a-z0-9])(?:grade|gr)?\s?([abc]\+?(?:\s?\/\s?[abc]\+?)?)(?:\s?grade)?(?![a-z0-9+])/);
  if (!m || !m[1]) return null;
  return m[1].replace(/\s+/g, "").toUpperCase();
}
function normalizeCondition(raw) {
  if (!raw) return "unknown";
  const t = normalizeText(raw);
  if (t === "new" || t === "refurbished" || t === "used") return t;
  for (const c of CONDITION_ALIASES) {
    if (wordRegex(c.alias).test(t)) return c.condition;
  }
  return "unknown";
}
function normalizeBrand(raw) {
  if (!raw) return null;
  const t = normalizeText(raw);
  if (!t) return null;
  for (const b of BRANDS) {
    if (b.key === t || b.aliases.some((a) => normalizeText(a) === t)) return { key: b.key, display: b.display };
  }
  return { key: t, display: raw.trim() };
}
function titleCase(s) {
  return s.split(" ").map((w2) => w2 ? w2[0].toUpperCase() + w2.slice(1) : w2).join(" ");
}
function buildNormalizedKey(p) {
  return [p.brand ?? UNKNOWN, p.model ?? UNKNOWN, p.storage?.toLowerCase() ?? UNKNOWN, p.color ?? UNKNOWN, p.condition, p.grade?.toLowerCase() ?? UNKNOWN].join("|");
}
function normalizeProduct(text2, hints = {}) {
  const original = (text2 ?? "").trim();
  let work = ` ${normalizeText(original)} `;
  const inferred = [];
  const eanFound = extractEan(original);
  let ean = eanFound?.ean ?? null;
  let eanValid = eanFound ? eanFound.valid : null;
  if (ean) work = work.replace(wordRegex(ean), " ");
  let mpn = extractMpn(original);
  if (mpn) work = work.replace(wordRegex(normalizeText(mpn)), " ");
  let brand = null;
  let brandDisplay = null;
  let model = null;
  let modelDisplay = null;
  for (const p of MODEL_PATTERNS) {
    const m = work.match(p.regex);
    if (!m) continue;
    const built = p.build(m);
    if (!built) continue;
    model = built.model;
    modelDisplay = built.display;
    const entry = BRANDS.find((b) => b.key === p.brand);
    brand = p.brand;
    brandDisplay = entry?.display ?? p.brand;
    work = cutMatch(work, m);
    break;
  }
  for (const b of BRAND_ALIASES) {
    const re = wordRegex(b.alias);
    if (re.test(work)) {
      if (!brand) {
        brand = b.key;
        brandDisplay = b.display;
      }
      work = work.replace(re, " ");
      break;
    }
  }
  const storages = [];
  work = work.replace(/(?<![a-z0-9])(\d{1,4})\s?(tb|to|gb|go|g)(?![a-z0-9])/g, (full, n, unit) => {
    const num = Number(n);
    if (unit === "g" && !STORAGE_SIZES_GB.has(num)) return full;
    const isTb = unit === "tb" || unit === "to";
    storages.push({ value: isTb ? `${num}TB` : `${num}GB`, gb: isTb ? num * 1024 : num });
    return " ";
  });
  if (storages.length === 0) {
    work = work.replace(/(?<![a-z0-9.,])(\d{2,4})(?![a-z0-9.,])/g, (full, n) => {
      const num = Number(n);
      if (storages.length === 0 && STORAGE_SIZES_GB.has(num)) {
        storages.push({ value: `${num}GB`, gb: num });
        return " ";
      }
      return full;
    });
  }
  storages.sort((a, b) => b.gb - a.gb);
  let storage = storages[0]?.value ?? null;
  const variantParts2 = storages.slice(1).map((s) => `${s.value.toLowerCase()} ram`);
  let grade = null;
  const gradePatterns = [/(?<![a-z0-9])grade\s?([abc]\+?(?:\s?\/\s?[abc]\+?)?)(?![a-z0-9+])/, /(?<![a-z0-9])gr\s?([abc]\+?)(?![a-z0-9+])/, /(?<![a-z0-9])([abc]\+?)\s?grade(?![a-z0-9])/];
  for (const re of gradePatterns) {
    const m = work.match(re);
    if (m && m[1]) {
      grade = m[1].replace(/\s+/g, "").toUpperCase();
      work = cutMatch(work, m);
      break;
    }
  }
  let condition = "unknown";
  for (const c of CONDITION_ALIASES) {
    const re = wordRegex(c.alias);
    if (re.test(work)) {
      condition = c.condition;
      work = work.replace(re, " ");
      break;
    }
  }
  let color = null;
  let colorDisplay = null;
  for (const c of COLOR_ALIASES) {
    const re = wordRegex(c.alias);
    if (re.test(work)) {
      color = c.key;
      colorDisplay = c.display;
      work = work.replace(re, " ");
      break;
    }
  }
  if (!grade && model) {
    const m = work.match(/(?<![a-z0-9+])([abc]\+?)(?![a-z0-9+])/);
    if (m && m[1]) {
      grade = m[1].toUpperCase();
      work = cutMatch(work, m);
    }
  }
  for (const v2 of VARIANT_ALIASES) {
    const re = wordRegex(v2.alias);
    if (re.test(work)) {
      if (!variantParts2.includes(v2.key)) variantParts2.push(v2.key);
      work = work.replace(re, " ");
    }
  }
  if (hints.brand) {
    const b = normalizeBrand(hints.brand);
    if (b) {
      brand = b.key;
      brandDisplay = b.display;
    }
  }
  if (hints.model) {
    const parsed = normalizeProduct(hints.model);
    if (parsed.model && !parsed.inferred.includes("model")) {
      model = parsed.model;
      modelDisplay = parsed.modelDisplay;
      if (!hints.brand && parsed.brand) {
        brand = parsed.brand;
        brandDisplay = parsed.brandDisplay;
      }
    } else {
      const m = normalizeText(hints.model);
      if (m) {
        model = m;
        modelDisplay = hints.model.trim();
      }
    }
  }
  if (hints.storage) storage = normalizeStorage(hints.storage) ?? storage;
  if (hints.color) {
    const c = normalizeColor(hints.color);
    if (c) {
      color = c.key;
      colorDisplay = c.display;
    } else {
      const raw = normalizeText(hints.color);
      if (raw) {
        color = raw;
        colorDisplay = titleCase(raw);
      }
    }
  }
  if (hints.grade) grade = normalizeGrade(hints.grade) ?? grade;
  if (hints.condition) {
    const c = normalizeCondition(hints.condition);
    if (c !== "unknown") condition = c;
  }
  if (hints.ean) {
    const e = hints.ean.replace(/\D/g, "");
    if (e.length >= 8) {
      ean = e;
      eanValid = isValidGtin(e);
    }
  }
  if (hints.mpn && hints.mpn.trim()) mpn = hints.mpn.trim().toUpperCase();
  if (condition === "unknown" && grade) {
    condition = "refurbished";
    inferred.push("condition");
  }
  const remainingTokens = work.split(/\s+/).map((t) => t.trim()).filter((t) => t.length > 0 && !NOISE_TOKENS.has(t) && !/^[+/.,]+$/.test(t));
  const remainingText = remainingTokens.join(" ");
  if (!model && remainingTokens.length > 0) {
    model = remainingTokens.slice(0, 4).join(" ");
    modelDisplay = null;
    inferred.push("model");
  }
  const variant = variantParts2.length > 0 ? variantParts2.join(" ") : null;
  const displayParts = [brandDisplay, modelDisplay ?? (model && inferred.includes("model") ? titleCase(model) : null), storage, colorDisplay, grade ? `Grade ${grade}` : null].filter((x) => Boolean(x));
  const displayTitle = modelDisplay || brandDisplay ? displayParts.join(" ") : original || displayParts.join(" ");
  let confidence = 0.2;
  if (brand) confidence += 0.2;
  if (model && !inferred.includes("model")) confidence += 0.5;
  if (storage) confidence += 0.05;
  if (color) confidence += 0.03;
  if (ean && eanValid) confidence = Math.max(confidence, 0.99);
  confidence = Math.min(0.99, Math.round(confidence * 100) / 100);
  const result = {
    brand,
    brandDisplay,
    model,
    modelDisplay,
    storage,
    color,
    colorDisplay,
    condition,
    grade,
    variant,
    ean,
    eanValid,
    mpn,
    normalizedKey: "",
    displayTitle,
    remainingText,
    inferred,
    confidence
  };
  result.normalizedKey = buildNormalizedKey(result);
  return result;
}
var CONDITION_LABEL_FR = {
  new: "Neuf",
  refurbished: "Reconditionn\xE9",
  used: "Occasion",
  unknown: "Non communiqu\xE9"
};

// src/services/sourcing/http.ts
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
var DEFAULT_TIMEOUT_MS2 = 3e4;
var DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
function decodeBytes(buffer, encoding) {
  const enc = (encoding ?? "utf-8").toLowerCase();
  try {
    return new TextDecoder(enc, { fatal: false }).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}
function isPrivateAddress(address) {
  const a = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(a) === 4) {
    const parts = a.split(".").map(Number);
    const [p0 = 0, p1 = 0] = parts;
    if (p0 === 10 || p0 === 127 || p0 === 0) return true;
    if (p0 === 169 && p1 === 254) return true;
    if (p0 === 172 && p1 >= 16 && p1 <= 31) return true;
    if (p0 === 192 && p1 === 168) return true;
    if (p0 === 100 && p1 >= 64 && p1 <= 127) return true;
    if (p0 >= 224) return true;
    return false;
  }
  if (isIP(a) === 6) {
    if (a === "::" || a === "::1") return true;
    if (a.startsWith("fe80:") || a.startsWith("fc") || a.startsWith("fd")) return true;
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return isPrivateAddress(mapped[1]);
    return false;
  }
  return false;
}
function isIpLiteralLike(host) {
  if (isIP(host.replace(/^\[|\]$/g, ""))) return true;
  return /^(0x[0-9a-f]+|\d+)$/i.test(host) || /^(0x[0-9a-f]+|\d+)(\.(0x[0-9a-f]+|\d+)){1,3}$/i.test(host);
}
function assertPublicHttpUrl(url) {
  const u = new URL(url);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`URL non support\xE9e (${u.protocol}) : seuls http et https sont accept\xE9s.`);
  if (u.username || u.password) throw new Error("Les identifiants dans l'URL ne sont pas accept\xE9s.");
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Les adresses locales ou priv\xE9es ne sont pas accessibles.");
  }
  if (isIpLiteralLike(host)) {
    if (!isIP(host.replace(/^\[|\]$/g, "")) || isPrivateAddress(host)) throw new Error("Les adresses locales ou priv\xE9es ne sont pas accessibles.");
  }
  return u;
}
async function assertResolvesToPublicAddress(u, resolver = (h) => lookup(h, { all: true })) {
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("Les adresses locales ou priv\xE9es ne sont pas accessibles.");
    return;
  }
  let addresses;
  try {
    addresses = await resolver(host);
  } catch {
    throw new Error(`Nom d'h\xF4te introuvable : ${host}.`);
  }
  if (addresses.length === 0) throw new Error(`Nom d'h\xF4te introuvable : ${host}.`);
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new Error("Les adresses locales ou priv\xE9es ne sont pas accessibles.");
}
var MAX_REDIRECTS = 5;
async function readBounded(res, maxBytes) {
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new Error(`R\xE9ponse trop volumineuse (${declared} octets, maximum ${maxBytes}).`);
  if (!res.body) return new ArrayBuffer(0);
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => void 0);
        throw new Error(`R\xE9ponse trop volumineuse (plus de ${maxBytes} octets).`);
      }
      chunks.push(value);
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
}
async function fetchText(url, options) {
  let target = assertPublicHttpUrl(url);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS2;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const doFetch = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertResolvesToPublicAddress(target, options.resolver);
      res = await doFetch(target.toString(), {
        method: options.method ?? "GET",
        redirect: "manual",
        headers: { "User-Agent": options.userAgent, Accept: options.accept ?? "text/html,application/xhtml+xml,application/xml,text/csv,application/json;q=0.9,*/*;q=0.8", ...options.headers ?? {} },
        body: options.method === "POST" ? options.body ?? "" : void 0,
        signal: controller.signal
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        if (hop === MAX_REDIRECTS) throw new Error("Trop de redirections.");
        await res.body?.cancel().catch(() => void 0);
        target = assertPublicHttpUrl(new URL(location, target).toString());
        continue;
      }
      break;
    }
    if (!res) throw new Error("Aucune r\xE9ponse.");
    const buffer = await readBounded(res, maxBytes);
    const contentType = res.headers.get("content-type");
    const charset = contentType?.match(/charset=([\w-]+)/i)?.[1] ?? null;
    return { ok: res.ok, status: res.status, text: decodeBytes(buffer, options.encoding ?? charset), contentType, bytes: buffer.byteLength, finalUrl: target.toString() };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error(`D\xE9lai d\xE9pass\xE9 (${timeoutMs / 1e3} s) pour ${target.hostname}.`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// src/integrations/sourcing/shared.ts
var DEFAULT_REQUEST_TIMEOUT_MS = 15e3;
var defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function createAdapterHttp(ctx) {
  const requests = [];
  const startedAt = Date.now();
  const budget = ctx.timeoutMs ?? null;
  const sleep3 = ctx.sleep ?? defaultSleep;
  let lastRequestAt = null;
  const remainingMs = () => budget === null ? Number.POSITIVE_INFINITY : Math.max(0, budget - (Date.now() - startedAt));
  return {
    requests,
    remainingMs,
    exhausted: () => remainingMs() <= 0,
    countOffers(n) {
      const last = requests[requests.length - 1];
      if (last) last.offers = n;
    },
    async request(url, options = {}) {
      const minDelay = ctx.minDelayMs ?? 0;
      if (lastRequestAt !== null && minDelay > 0) {
        const wait = minDelay - (Date.now() - lastRequestAt);
        if (wait > 0) await sleep3(wait);
      }
      const remaining = remainingMs();
      if (remaining <= 0) throw new Error("Budget de temps \xE9puis\xE9 avant la requ\xEAte.");
      const t0 = Date.now();
      lastRequestAt = t0;
      let traced = false;
      try {
        const res = await fetchText(url, {
          userAgent: ctx.userAgent,
          fetchImpl: ctx.fetchImpl,
          resolver: ctx.resolver,
          accept: options.accept,
          headers: options.headers,
          method: options.method,
          body: options.body,
          maxBytes: options.maxBytes,
          timeoutMs: Math.min(DEFAULT_REQUEST_TIMEOUT_MS, Number.isFinite(remaining) ? remaining : DEFAULT_REQUEST_TIMEOUT_MS)
        });
        requests.push({ url, status: res.status, durationMs: Date.now() - t0, offers: 0, error: res.ok ? null : `HTTP ${res.status}` });
        traced = true;
        if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
        return res;
      } catch (e) {
        if (!traced) requests.push({ url, status: null, durationMs: Date.now() - t0, offers: 0, error: errorMessage(e) });
        throw e;
      }
    }
  };
}
function errorMessage(e) {
  return e instanceof Error ? e.message : String(e);
}
function failedSearch(method, error, requests = []) {
  return { offers: [], method, requests, error, truncated: false };
}
function applyQueryTemplate(template, rawQuery) {
  return template.replace(/\{query\}/g, encodeURIComponent(rawQuery.trim()));
}
function trimSlash(base) {
  return base.replace(/\/+$/, "");
}
function joinUrl(base, path) {
  return `${trimSlash(base)}/${path.replace(/^\/+/, "")}`;
}
function str(v2) {
  if (v2 === null || v2 === void 0) return null;
  const s = String(v2).trim();
  return s.length > 0 ? s : null;
}
function digits(v2) {
  const s = str(v2)?.replace(/\D/g, "") ?? "";
  return s.length >= 8 ? s : null;
}
function stripHtml(html) {
  if (!html) return "";
  return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}
function inferConditionFromText(text2) {
  const t = (text2 ?? "").slice(0, 4e3);
  if (!t.trim()) return { condition: null, grade: null, inferred: [] };
  const inferred = [];
  const condition = normalizeCondition(t);
  const normalizedForGrade = normalizeProduct(t);
  const grade = normalizedForGrade.grade ?? normalizeGrade(t.match(/\b(?:grade|gr\.?)\s?[abc]\+?\b/i)?.[0] ?? null);
  if (condition !== "unknown") inferred.push("condition");
  if (grade) inferred.push("grade");
  return { condition: condition === "unknown" ? null : condition, grade, inferred };
}
function cleanId(s) {
  return (s ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
}
function matchesQuery(parsed, candidate) {
  if (parsed.kind === "empty") return false;
  const text2 = normalizeText(`${candidate.title} ${candidate.brand ?? ""} ${candidate.mpn ?? ""} ${candidate.sku ?? ""} ${candidate.extraText ?? ""}`);
  if (parsed.ean) {
    const ean = (candidate.ean ?? "").replace(/\D/g, "");
    return ean.length >= 8 && (ean === parsed.ean || ean.replace(/^0+/, "") === parsed.ean.replace(/^0+/, ""));
  }
  if (parsed.kind === "mpn" && parsed.mpn) {
    const q = cleanId(parsed.mpn);
    if (cleanId(candidate.mpn) === q || cleanId(candidate.sku) === q) return true;
    return text2.replace(/[^a-z0-9]/g, "").includes(q.toLowerCase());
  }
  const tokensOk = parsed.tokens.length > 0 && parsed.tokens.every((t) => text2.includes(t));
  if (parsed.kind !== "structured") return tokensOk;
  const n = normalizeProduct(candidate.title, { brand: candidate.brand ?? null, ean: candidate.ean ?? null, mpn: candidate.mpn ?? null });
  const c = parsed.criteria;
  if (c.brand && n.brand && c.brand !== n.brand) return false;
  if (c.model && n.model && !n.inferred.includes("model") && c.model !== n.model) return false;
  if (c.model && (!n.model || n.inferred.includes("model"))) return tokensOk;
  if (c.storage && n.storage && c.storage !== n.storage) return false;
  if (c.color && n.color && c.color !== n.color) return false;
  if (c.grade && n.grade && c.grade !== n.grade) return false;
  return Boolean(c.model || tokensOk);
}
function settingString(settings, key2) {
  return str(settings[key2]);
}
function settingInt(settings, key2, fallback, min, max) {
  const v2 = settings[key2];
  const n = typeof v2 === "number" ? v2 : typeof v2 === "string" ? Number(v2) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
var TtlCache = class {
  constructor(ttlMs) {
    this.ttlMs = ttlMs;
  }
  ttlMs;
  store = /* @__PURE__ */ new Map();
  get(key2, now = Date.now()) {
    const hit = this.store.get(key2);
    if (!hit) return null;
    if (hit.expiresAt <= now) {
      this.store.delete(key2);
      return null;
    }
    return hit.value;
  }
  set(key2, value, now = Date.now(), ttlMs = this.ttlMs) {
    this.store.set(key2, { value, expiresAt: now + ttlMs });
  }
  clear() {
    this.store.clear();
  }
};

// src/integrations/sourcing/jsonld-public/crawler.ts
import { z as z12 } from "npm:zod@4.6.5";
var jsonLdSettingsSchema = z12.object({
  search_url: z12.string().max(2e3).optional(),
  urls: z12.array(z12.string().max(2e3)).max(50).optional(),
  max_pages: z12.number().int().min(1).max(50).optional()
});
var DEFAULT_MAX_PAGES = 20;
function parseJsonLdSettings(settings) {
  const parsed = jsonLdSettingsSchema.safeParse(settings);
  return parsed.success ? parsed.data : {};
}
function sameHost(baseUrl, url) {
  if (!baseUrl) return true;
  try {
    return new URL(url).host.toLowerCase() === new URL(baseUrl).host.toLowerCase();
  } catch {
    return false;
  }
}
function searchUrlFor(config, rawQuery) {
  const settings = parseJsonLdSettings(config.settings);
  const template = settings.search_url?.trim();
  if (!template || !template.includes("{query}") || !rawQuery.trim()) return null;
  const url = applyQueryTemplate(template, rawQuery);
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return sameHost(config.baseUrl, url) ? url : null;
}
function catalogUrls(config) {
  const settings = parseJsonLdSettings(config.settings);
  const max = Math.min(settings.max_pages ?? DEFAULT_MAX_PAGES, 50);
  return (settings.urls ?? []).filter((u) => sameHost(config.baseUrl, u)).slice(0, max);
}

// src/services/sourcing/crawler/parsers/jsonld-parser.ts
import { z as z14 } from "npm:zod@4.6.5";

// src/services/sourcing/feed-parsers.ts
import { parse as parseCsv } from "npm:csv-parse@7.0.3/sync";
import { XMLParser as XMLParser2 } from "npm:fast-xml-parser@5.11.2";
import { z as z13 } from "npm:zod@4.6.5";

// src/domain/sourcing/types.ts
var RAW_OFFER_FIELDS = [
  "external_offer_id",
  "title",
  "price",
  "currency",
  "tax_type",
  "moq",
  "minimum_order_value",
  "available_quantity",
  "stock_status",
  "shipping_cost",
  "delivery_days",
  "delivery_min_days",
  "delivery_max_days",
  "country",
  "url",
  "ean",
  "mpn",
  "brand",
  "model",
  "storage",
  "color",
  "grade",
  "condition",
  "supplier_sku"
];

// src/services/sourcing/feed-parsers.ts
var feedOptionsSchema = z13.object({
  delimiter: z13.string().min(1).max(3).optional(),
  encoding: z13.string().min(1).max(30).optional(),
  root_path: z13.string().max(200).optional(),
  header_row: z13.boolean().optional(),
  columns: z13.array(z13.string()).optional()
});
var fieldMappingSchema = z13.partialRecord(
  z13.enum(RAW_OFFER_FIELDS),
  z13.union([z13.string().min(1).max(200), z13.object({ const: z13.string().max(200) })])
);
var MAX_FEED_ROWS = 5e4;
function getPath(obj, path) {
  if (!path) return obj;
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter((p) => p.length > 0);
  let cur = obj;
  for (const p of parts) {
    if (cur === null || cur === void 0) return void 0;
    if (Array.isArray(cur)) {
      const idx = Number(p);
      cur = Number.isInteger(idx) ? cur[idx] : cur.map((x) => x && typeof x === "object" ? x[p] : void 0).find((v2) => v2 !== void 0);
    } else if (typeof cur === "object") {
      cur = cur[p];
    } else return void 0;
  }
  return cur;
}
function findFirstArray(obj, depth = 0, path = "") {
  if (depth > 6 || obj === null || typeof obj !== "object") return null;
  if (Array.isArray(obj)) return obj.length > 0 && typeof obj[0] === "object" ? { path, items: obj } : null;
  for (const [k, v2] of Object.entries(obj)) {
    const found = findFirstArray(v2, depth + 1, path ? `${path}.${k}` : k);
    if (found) return found;
  }
  return null;
}
function detectDelimiter(sample) {
  const candidates = [";", ",", "	", "|"];
  const firstLine = sample.split(/\r?\n/)[0] ?? "";
  let best = ",";
  let bestCount = 0;
  for (const c of candidates) {
    const count = firstLine.split(c).length - 1;
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best;
}
function flatten(obj, prefix = "", out = {}, depth = 0) {
  if (depth > 4 || obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    if (prefix) out[prefix] = obj;
    return out;
  }
  for (const [k, v2] of Object.entries(obj)) {
    const key2 = prefix ? `${prefix}.${k}` : k;
    if (v2 !== null && typeof v2 === "object" && !Array.isArray(v2)) flatten(v2, key2, out, depth + 1);
    else out[key2] = v2;
  }
  return out;
}
function parseFeedContent(content, format, options = {}) {
  const warnings = [];
  let rows = [];
  const text2 = content.replace(/^﻿/, "");
  if (format === "csv") {
    const delimiter = options.delimiter ?? detectDelimiter(text2.slice(0, 4e3));
    const headerRow = options.header_row ?? true;
    const parsed = parseCsv(text2, {
      columns: headerRow ? true : options.columns ?? false,
      delimiter,
      bom: true,
      trim: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      to: MAX_FEED_ROWS + 1
    });
    if (!headerRow && !options.columns) {
      rows = parsed.map((r) => Object.fromEntries(r.map((v2, i) => [`col${i + 1}`, v2])));
    } else {
      rows = parsed;
    }
    if (options.delimiter === void 0 || options.delimiter === null) warnings.push(`D\xE9limiteur d\xE9tect\xE9 automatiquement : \xAB ${delimiter} \xBB`);
  } else {
    let doc;
    if (format === "xml") {
      const parser2 = new XMLParser2({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true, parseTagValue: false, trimValues: true, cdataPropName: false });
      doc = parser2.parse(text2);
    } else {
      doc = JSON.parse(text2);
    }
    let items = null;
    if (options.root_path) {
      const found = getPath(doc, options.root_path);
      if (Array.isArray(found)) items = found;
      else if (found && typeof found === "object") items = [found];
      else warnings.push(`Chemin racine \xAB ${options.root_path} \xBB introuvable dans le flux.`);
    }
    if (!items) {
      if (Array.isArray(doc)) items = doc;
      else {
        const found = findFirstArray(doc);
        if (found) {
          items = found.items;
          warnings.push(`Chemin racine d\xE9tect\xE9 automatiquement : \xAB ${found.path} \xBB`);
        }
      }
    }
    rows = (items ?? []).filter((x) => x !== null && typeof x === "object").map((x) => flatten(x));
  }
  if (rows.length > MAX_FEED_ROWS) {
    warnings.push(`Flux tronqu\xE9 \xE0 ${MAX_FEED_ROWS} lignes.`);
    rows = rows.slice(0, MAX_FEED_ROWS);
  }
  const columns = Array.from(new Set(rows.slice(0, 200).flatMap((r) => Object.keys(r))));
  return { rows, columns, warnings };
}
function toNumber(v2) {
  if (v2 === null || v2 === void 0) return null;
  if (typeof v2 === "number") return Number.isFinite(v2) ? v2 : null;
  const s = String(v2).trim().replace(/\s| /g, "").replace(/[€$£]/g, "");
  if (!s) return null;
  const normalized = /,\d{1,2}$/.test(s) && s.includes(".") ? s.replace(/\./g, "").replace(",", ".") : /\.\d{1,2}$/.test(s) && s.includes(",") ? s.replace(/,/g, "") : s.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
function toInt(v2) {
  const n = toNumber(v2);
  return n === null ? null : Math.round(n);
}
function toTaxType(v2) {
  const s = String(v2 ?? "").trim().toLowerCase();
  if (!s) return "unknown";
  if (/^(ht|hors[\s-]?taxes?|excl|exclusive|net|ex[\s-]?vat|without[\s-]?vat|false|0)$/.test(s)) return "ht";
  if (/^(ttc|toutes[\s-]?taxes|incl|inclusive|inc[\s-]?vat|with[\s-]?vat|gross|true|1)$/.test(s)) return "ttc";
  return "unknown";
}
function toStockStatus(v2) {
  const s = String(v2 ?? "").trim().toLowerCase();
  if (!s) return "unknown";
  if (/^(in[\s_-]?stock|en[\s_-]?stock|disponible|available|yes|true|oui|1|instock|https?:\/\/schema\.org\/instock)$/.test(s)) return "in_stock";
  if (/^(out[\s_-]?of[\s_-]?stock|rupture|indisponible|unavailable|no|false|non|0|outofstock|sold[\s_-]?out|https?:\/\/schema\.org\/outofstock)$/.test(s)) return "out_of_stock";
  if (/^(low|faible|limited|limite|limitedavailability|https?:\/\/schema\.org\/limitedavailability)$/.test(s)) return "low";
  return "unknown";
}
function toDeliveryRange(v2) {
  if (v2 === null || v2 === void 0 || v2 === "") return { min: null, max: null };
  const s = String(v2).trim();
  const m = s.match(/(\d+)\s*(?:-|–|à|to|a)\s*(\d+)/i);
  if (m) return { min: Number(m[1]), max: Number(m[2]) };
  const n = toInt(s.replace(/[^\d.,]/g, ""));
  return { min: n, max: n };
}
function str2(v2) {
  if (v2 === null || v2 === void 0) return null;
  const s = String(v2).trim();
  return s.length > 0 ? s : null;
}
function mapRow(row, mapping, defaults = {}) {
  const errors = [];
  const read = (field2) => {
    const m = mapping[field2];
    if (m === void 0) return void 0;
    if (typeof m === "string") {
      const direct = row[m];
      return direct !== void 0 ? direct : getPath(row, m);
    }
    return m.const;
  };
  const externalOfferId = str2(read("external_offer_id")) ?? str2(read("supplier_sku")) ?? str2(read("ean"));
  const title = str2(read("title"));
  const price = toNumber(read("price"));
  const currency = str2(read("currency"))?.toUpperCase() ?? defaults.currency?.toUpperCase() ?? null;
  if (!externalOfferId) errors.push("Identifiant d'offre manquant (external_offer_id, supplier_sku ou ean).");
  if (!title) errors.push("Titre manquant.");
  if (read("price") !== void 0 && price === null && str2(read("price")) !== null) errors.push(`Prix illisible : \xAB ${String(read("price")).slice(0, 30)} \xBB.`);
  if (price === null) errors.push("Prix manquant.");
  if (!currency) errors.push("Devise manquante (colonne ou devise par d\xE9faut de la source).");
  if (errors.length > 0 || !externalOfferId || !title) return { offer: null, errors };
  const deliveryBoth = toDeliveryRange(read("delivery_days"));
  const dMin = toInt(read("delivery_min_days")) ?? deliveryBoth.min;
  const dMax = toInt(read("delivery_max_days")) ?? deliveryBoth.max;
  const taxRaw = read("tax_type");
  const taxType = taxRaw !== void 0 ? toTaxType(taxRaw) : defaults.taxType ?? "unknown";
  const stockRaw = read("stock_status");
  const availableQuantity = toInt(read("available_quantity"));
  const offer = {
    externalOfferId,
    externalProductId: str2(read("supplier_sku")),
    title,
    price,
    currency,
    taxType,
    moq: toInt(read("moq")),
    minimumOrderValue: toNumber(read("minimum_order_value")),
    availableQuantity,
    stockStatus: stockRaw !== void 0 ? toStockStatus(stockRaw) : availableQuantity === null ? "unknown" : availableQuantity > 0 ? "in_stock" : "out_of_stock",
    shippingCost: toNumber(read("shipping_cost")),
    shippingCurrency: currency,
    deliveryMinDays: dMin,
    deliveryMaxDays: dMax,
    country: str2(read("country"))?.toUpperCase().slice(0, 2) ?? defaults.country ?? null,
    url: str2(read("url")),
    ean: str2(read("ean"))?.replace(/\D/g, "") || null,
    mpn: str2(read("mpn")),
    brand: str2(read("brand")),
    model: str2(read("model")),
    storage: str2(read("storage")),
    color: str2(read("color")),
    grade: str2(read("grade")),
    condition: read("condition") !== void 0 ? normalizeCondition(str2(read("condition"))) : null,
    supplierSku: str2(read("supplier_sku")),
    raw: row
  };
  return { offer, errors };
}

// src/services/sourcing/crawler/parsers/jsonld-parser.ts
var SCRIPT_RE = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
var offerSchema = z14.object({
  "@type": z14.union([z14.string(), z14.array(z14.string())]).optional(),
  price: z14.union([z14.string(), z14.number()]).optional(),
  lowPrice: z14.union([z14.string(), z14.number()]).optional(),
  priceCurrency: z14.string().optional(),
  availability: z14.string().optional(),
  url: z14.string().optional(),
  itemCondition: z14.string().optional(),
  sku: z14.string().optional(),
  inventoryLevel: z14.union([z14.object({ value: z14.union([z14.string(), z14.number()]).optional() }), z14.string(), z14.number()]).optional(),
  eligibleQuantity: z14.object({ minValue: z14.union([z14.string(), z14.number()]).optional() }).optional(),
  priceSpecification: z14.union([
    z14.object({ price: z14.union([z14.string(), z14.number()]).optional(), priceCurrency: z14.string().optional(), valueAddedTaxIncluded: z14.boolean().optional() }),
    z14.array(z14.object({ price: z14.union([z14.string(), z14.number()]).optional(), priceCurrency: z14.string().optional(), valueAddedTaxIncluded: z14.boolean().optional() }))
  ]).optional(),
  areaServed: z14.unknown().optional()
}).passthrough();
var productSchema = z14.object({
  "@type": z14.union([z14.string(), z14.array(z14.string())]).optional(),
  name: z14.string().optional(),
  sku: z14.union([z14.string(), z14.number()]).optional(),
  productID: z14.union([z14.string(), z14.number()]).optional(),
  gtin13: z14.union([z14.string(), z14.number()]).optional(),
  gtin: z14.union([z14.string(), z14.number()]).optional(),
  gtin12: z14.union([z14.string(), z14.number()]).optional(),
  gtin14: z14.union([z14.string(), z14.number()]).optional(),
  gtin8: z14.union([z14.string(), z14.number()]).optional(),
  mpn: z14.union([z14.string(), z14.number()]).optional(),
  brand: z14.union([z14.string(), z14.object({ name: z14.string().optional() }).passthrough()]).optional(),
  color: z14.string().optional(),
  url: z14.string().optional(),
  itemCondition: z14.string().optional(),
  offers: z14.union([offerSchema, z14.array(offerSchema)]).optional()
}).passthrough();
function typeIncludes(t, wanted) {
  if (!t) return false;
  const list = Array.isArray(t) ? t : [t];
  return list.some((x) => x.toLowerCase().endsWith(wanted.toLowerCase()));
}
function collectNodes(node2, out, depth = 0) {
  if (depth > 8 || node2 === null || typeof node2 !== "object") return;
  if (Array.isArray(node2)) {
    for (const n of node2) collectNodes(n, out, depth + 1);
    return;
  }
  const obj = node2;
  out.push(obj);
  for (const key2 of ["@graph", "itemListElement", "mainEntity", "item", "hasVariant", "isVariantOf"]) {
    if (obj[key2] !== void 0) collectNodes(obj[key2], out, depth + 1);
  }
}
function extractJsonLdBlocks(html) {
  const blocks = [];
  for (const m of html.matchAll(SCRIPT_RE)) {
    const raw = (m[1] ?? "").trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
    }
  }
  return blocks;
}
function conditionFrom(itemCondition) {
  if (!itemCondition) return null;
  const c = itemCondition.toLowerCase();
  if (c.includes("new")) return "new";
  if (c.includes("refurbished")) return "refurbished";
  if (c.includes("used")) return "used";
  return null;
}
function resolveUrl(url, base) {
  if (!url) return null;
  try {
    return new URL(url, base).toString();
  } catch {
    return null;
  }
}
function offersOf(p) {
  if (!p.offers) return [];
  const list = Array.isArray(p.offers) ? p.offers : [p.offers];
  const out = [];
  for (const o of list) {
    const nested = o.offers;
    if (nested && typeIncludes(o["@type"], "AggregateOffer")) {
      const inner = Array.isArray(nested) ? nested : [nested];
      for (const n of inner) {
        const parsed = offerSchema.safeParse(n);
        if (parsed.success) out.push(parsed.data);
      }
    } else out.push(o);
  }
  return out;
}
function parseJsonLdProducts(html, pageUrl) {
  const nodes = [];
  for (const block of extractJsonLdBlocks(html)) collectNodes(block, nodes);
  const products = nodes.map((n) => productSchema.safeParse(n)).filter((r) => r.success).map((r) => r.data).filter((p) => typeIncludes(p["@type"], "Product") && p.name);
  const offers = [];
  const seen = /* @__PURE__ */ new Set();
  for (const p of products) {
    const gtin = [p.gtin13, p.gtin, p.gtin14, p.gtin12, p.gtin8].map((g) => g === void 0 ? null : String(g).replace(/\D/g, "")).find((g) => g && g.length >= 8) ?? null;
    const brand = typeof p.brand === "string" ? p.brand : p.brand?.name ?? null;
    const productOffers = offersOf(p);
    const sku = p.sku !== void 0 ? String(p.sku) : p.productID !== void 0 ? String(p.productID) : null;
    const productUrl = resolveUrl(p.url, pageUrl);
    if (productOffers.length === 0) continue;
    productOffers.forEach((o, index) => {
      const spec = Array.isArray(o.priceSpecification) ? o.priceSpecification[0] : o.priceSpecification;
      const price = toNumber(o.price ?? o.lowPrice ?? spec?.price);
      const currency = (o.priceCurrency ?? spec?.priceCurrency ?? null)?.toUpperCase() ?? null;
      const url = resolveUrl(o.url, pageUrl) ?? productUrl ?? pageUrl;
      const offerSku = o.sku ?? sku;
      const id = offerSku ?? gtin ?? url;
      const externalOfferId = productOffers.length > 1 && !o.sku ? `${id}#${index}` : id;
      if (seen.has(externalOfferId)) return;
      seen.add(externalOfferId);
      const inv = o.inventoryLevel;
      const qty = inv === void 0 ? null : typeof inv === "object" ? toNumber(inv.value) : toNumber(inv);
      const stockStatus = o.availability ? toStockStatus(o.availability.replace(/^https?:\/\/schema\.org\//i, "")) : "unknown";
      const taxType = spec?.valueAddedTaxIncluded === true ? "ttc" : spec?.valueAddedTaxIncluded === false ? "ht" : "unknown";
      offers.push({
        externalOfferId,
        externalProductId: sku,
        title: p.name,
        price,
        currency,
        taxType,
        moq: toNumber(o.eligibleQuantity?.minValue) ? Math.round(toNumber(o.eligibleQuantity?.minValue)) : null,
        availableQuantity: qty !== null && qty >= 0 ? Math.round(qty) : null,
        stockStatus,
        url,
        ean: gtin,
        mpn: p.mpn !== void 0 ? String(p.mpn) : null,
        brand,
        color: p.color ?? null,
        condition: conditionFrom(o.itemCondition ?? p.itemCondition),
        supplierSku: offerSku,
        raw: { product: { name: p.name, sku, gtin, brand }, offer: { price: o.price ?? o.lowPrice, currency, availability: o.availability } }
      });
    });
  }
  return offers;
}
var jsonLdParser = {
  key: "jsonld",
  label: "G\xE9n\xE9rique schema.org (JSON-LD)",
  description: "Lit les blocs JSON-LD Product/Offer d\xE9clar\xE9s par la page (nom, SKU, GTIN, MPN, marque, prix, devise, disponibilit\xE9, \xE9tat, URL). Si la page n'en d\xE9clare pas, aucune offre n'est extraite.",
  parse: parseJsonLdProducts
};

// src/integrations/sourcing/jsonld-public/parser.ts
function parseJsonLdPage(html, pageUrl) {
  return parseJsonLdProducts(html, pageUrl);
}

// src/integrations/sourcing/jsonld-public/mapper.ts
function mapJsonLdOffer(offer, config, pageUrl) {
  return {
    ...offer,
    currency: offer.currency ?? config.defaultCurrency ?? null,
    taxType: offer.taxType && offer.taxType !== "unknown" ? offer.taxType : config.defaultTaxType,
    country: offer.country ?? config.defaultCountry ?? null,
    url: offer.url ?? pageUrl,
    raw: { page_url: pageUrl, jsonld: offer.raw ?? null }
  };
}

// src/integrations/sourcing/jsonld-public/index.ts
var HTML_ACCEPT = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5";
async function fetchPage(config, url, ctx) {
  const http = createAdapterHttp(ctx);
  const res = await http.request(url, { accept: HTML_ACCEPT });
  const offers = parseJsonLdPage(res.text, res.finalUrl || url).map((o) => mapJsonLdOffer(o, config, res.finalUrl || url));
  http.countOffers(offers.length);
  return { offers, requests: http.requests };
}
var jsonLdPublicAdapter = {
  key: "jsonld-public",
  label: "Page publique (JSON-LD schema.org)",
  description: "Lit les blocs JSON-LD Product/Offer d\xE9clar\xE9s par une page publique (nom, SKU, GTIN, MPN, marque, prix, devise, disponibilit\xE9, \xE9tat). Recherche via une URL de recherche du site contenant {query} ; catalogue via une liste d'URLs. Sans JSON-LD, aucune offre n'est extraite. V\xE9rifi\xE9 sur fixtures uniquement.",
  method: "public_html",
  access: "public",
  capabilities: { search: true, catalog: true, stockQuantity: false },
  credentialFields: [],
  configFields: [
    { name: "search_url", label: "URL de recherche du site (avec {query})", required: false, placeholder: "https://boutique.example/recherche?q={query}", help: "Doit \xEAtre sur le m\xEAme h\xF4te que l'URL de base. Sans cette URL, la source n'est pas interrog\xE9e en direct (catalogue uniquement)." },
    { name: "urls", label: "Pages de catalogue (une par ligne)", required: false, help: "Pages produit ou cat\xE9gorie lues lors des synchronisations (50 maximum)." },
    { name: "max_pages", label: "Pages maximum par synchronisation", required: false, placeholder: "20" }
  ],
  htmlParser: jsonLdParser,
  verification: "fixtures",
  urlsForQuery(config, _query, rawQuery) {
    const url = searchUrlFor(config, rawQuery);
    return url ? [url] : [];
  },
  urlsForCatalog(config) {
    return catalogUrls(config);
  },
  async search(config, _query, rawQuery, ctx) {
    const url = searchUrlFor(config, rawQuery);
    if (!url) return failedSearch("public_html", "Aucune URL de recherche configur\xE9e (r\xE9glage search_url avec {query}) : recherche en direct impossible pour cette source.");
    if (ctx.disallowedUrls?.includes(url)) return failedSearch("public_html", "URL de recherche interdite par robots.txt.");
    try {
      const { offers, requests } = await fetchPage(config, url, ctx);
      return { offers, method: "public_html", requests, error: null, truncated: false };
    } catch (e) {
      return failedSearch("public_html", errorMessage(e));
    }
  },
  async fetchCatalog(config, cursor, ctx) {
    const urls = catalogUrls(config);
    const index = cursor ? Number(cursor) : 0;
    const url = Number.isInteger(index) && index >= 0 ? urls[index] : void 0;
    if (!url) return { offers: [], method: "public_html", requests: [], nextCursor: null };
    if (ctx.disallowedUrls?.includes(url)) return { offers: [], method: "public_html", requests: [{ url, status: null, durationMs: 0, offers: 0, error: "Interdite par robots.txt" }], nextCursor: index + 1 < urls.length ? String(index + 1) : null };
    try {
      const { offers, requests } = await fetchPage(config, url, ctx);
      return { offers, method: "public_html", requests, nextCursor: index + 1 < urls.length ? String(index + 1) : null };
    } catch (e) {
      return { offers: [], method: "public_html", requests: [{ url, status: null, durationMs: 0, offers: 0, error: errorMessage(e) }], nextCursor: index + 1 < urls.length ? String(index + 1) : null };
    }
  },
  async testConnection(config, ctx) {
    const urls = catalogUrls(config);
    const probe = urls[0] ?? config.baseUrl;
    if (!probe) return { ok: false, message: "Aucune URL configur\xE9e (URL de base ou pages de catalogue)." };
    try {
      const http = createAdapterHttp(ctx);
      const res = await http.request(probe, { accept: HTML_ACCEPT, maxBytes: 5 * 1024 * 1024 });
      const offers = parseJsonLdPage(res.text, res.finalUrl || probe);
      return { ok: true, message: offers.length > 0 ? `Page lue : ${offers.length} offre(s) JSON-LD d\xE9tect\xE9e(s).` : "Page lue, mais aucun bloc JSON-LD Product n'a \xE9t\xE9 d\xE9tect\xE9 : v\xE9rifiez que le site d\xE9clare ses produits en schema.org." };
    } catch (e) {
      return { ok: false, message: errorMessage(e) };
    }
  }
};

// src/integrations/sourcing/shopify-storefront/crawler.ts
var SHOPIFY_PRODUCTS_PATH = "/products.json";
var SHOPIFY_SUGGEST_PATH = "/search/suggest.json";
var SHOPIFY_PRODUCT_DETAIL_PATH = (handle2) => `/products/${encodeURIComponent(handle2)}.json`;
var SHOPIFY_PAGE_LIMIT = 250;
var SHOPIFY_SUGGEST_LIMIT = 20;
var SHOPIFY_MAX_DETAILS_PER_SEARCH = 5;
var SHOPIFY_MAX_CATALOG_PAGES = 40;
function productsUrl(baseUrl, page2, limit = SHOPIFY_PAGE_LIMIT) {
  return `${joinUrl(baseUrl, SHOPIFY_PRODUCTS_PATH)}?limit=${limit}&page=${page2}`;
}
function suggestUrl(baseUrl, query, limit = SHOPIFY_SUGGEST_LIMIT) {
  const params = new URLSearchParams({ q: query.trim() });
  params.set("resources[type]", "product");
  params.set("resources[limit]", String(limit));
  params.set("resources[options][unavailable_products]", "show");
  return `${joinUrl(baseUrl, SHOPIFY_SUGGEST_PATH)}?${params.toString()}`;
}
function productDetailUrl(baseUrl, handle2) {
  return joinUrl(baseUrl, SHOPIFY_PRODUCT_DETAIL_PATH(handle2));
}

// src/integrations/sourcing/shopify-storefront/parser.ts
import { z as z15 } from "npm:zod@4.6.5";
var numOrStr = z15.union([z15.number(), z15.string()]);
var shopifyVariantSchema = z15.looseObject({
  id: numOrStr,
  title: z15.string().nullish(),
  option1: z15.string().nullish(),
  option2: z15.string().nullish(),
  option3: z15.string().nullish(),
  sku: z15.string().nullish(),
  barcode: z15.string().nullish(),
  price: numOrStr.nullish(),
  compare_at_price: numOrStr.nullish(),
  available: z15.boolean().nullish(),
  inventory_quantity: z15.number().nullish(),
  taxable: z15.boolean().nullish()
});
var shopifyProductSchema = z15.looseObject({
  id: numOrStr,
  title: z15.string(),
  handle: z15.string(),
  body_html: z15.string().nullish(),
  vendor: z15.string().nullish(),
  product_type: z15.string().nullish(),
  tags: z15.union([z15.array(z15.string()), z15.string()]).nullish(),
  variants: z15.array(shopifyVariantSchema).default([]),
  options: z15.array(z15.looseObject({ name: z15.string(), position: z15.number().optional(), values: z15.array(z15.string()).optional() })).default([])
});
var shopifyProductsResponseSchema = z15.looseObject({ products: z15.array(shopifyProductSchema) });
var shopifyProductDetailResponseSchema = z15.looseObject({ product: shopifyProductSchema });
var shopifySuggestProductSchema = z15.looseObject({
  id: numOrStr,
  title: z15.string(),
  handle: z15.string(),
  url: z15.string().nullish(),
  price: numOrStr.nullish(),
  available: z15.boolean().nullish(),
  vendor: z15.string().nullish(),
  type: z15.string().nullish(),
  body: z15.string().nullish(),
  variants: z15.array(z15.looseObject({ id: numOrStr, title: z15.string().nullish(), sku: z15.string().nullish(), price: numOrStr.nullish(), available: z15.boolean().nullish(), url: z15.string().nullish() })).optional()
});
var shopifySuggestResponseSchema = z15.looseObject({
  resources: z15.looseObject({ results: z15.looseObject({ products: z15.array(shopifySuggestProductSchema).default([]) }) })
});
function parseProductsJson(text2) {
  const parsed = shopifyProductsResponseSchema.safeParse(JSON.parse(text2));
  if (!parsed.success) throw new Error(`R\xE9ponse products.json inattendue : ${parsed.error.issues[0]?.message ?? "format invalide"}.`);
  return parsed.data.products;
}
function parseProductDetailJson(text2) {
  const parsed = shopifyProductDetailResponseSchema.safeParse(JSON.parse(text2));
  if (!parsed.success) throw new Error(`R\xE9ponse products/{handle}.json inattendue : ${parsed.error.issues[0]?.message ?? "format invalide"}.`);
  return parsed.data.product;
}
function parseSuggestJson(text2) {
  const parsed = shopifySuggestResponseSchema.safeParse(JSON.parse(text2));
  if (!parsed.success) throw new Error(`R\xE9ponse search/suggest.json inattendue : ${parsed.error.issues[0]?.message ?? "format invalide"}.`);
  return parsed.data.resources.results.products;
}

// src/integrations/sourcing/shopify-storefront/mapper.ts
var STORAGE_OPTION = /^(storage|stockage|capacit[ée]|m[ée]moire|memory|taille de stockage|capacity)$/i;
var COLOR_OPTION = /^(color|colour|couleur|coloris)$/i;
var CONDITION_OPTION = /^(condition|[ée]tat|grade|qualit[ée])$/i;
function optionValue(product, variant, matcher) {
  const values = [variant.option1, variant.option2, variant.option3];
  for (const [i, opt] of product.options.entries()) {
    const position = (opt.position ?? i + 1) - 1;
    if (matcher.test(opt.name.trim())) return str(values[position]);
  }
  return null;
}
function mapShopifyProduct(product, config, baseUrl, requestUrl) {
  const productUrl = joinUrl(baseUrl, `/products/${encodeURIComponent(product.handle)}`);
  const description = stripHtml(product.body_html);
  const inferred = inferConditionFromText(`${product.title} ${description}`);
  const variants = product.variants.length > 0 ? product.variants : [];
  return variants.map((v2) => {
    const price = toNumber(v2.price);
    const quantity = typeof v2.inventory_quantity === "number" ? Math.max(0, Math.round(v2.inventory_quantity)) : null;
    const stockStatus = v2.available === true ? quantity !== null && quantity === 0 ? "unknown" : "in_stock" : v2.available === false ? "out_of_stock" : "unknown";
    const variantTitle = str(v2.title) && v2.title !== "Default Title" ? v2.title : null;
    const conditionOption = optionValue(product, v2, CONDITION_OPTION);
    const title = variantTitle ? `${product.title} ${variantTitle}` : product.title;
    const variantId = String(v2.id);
    return {
      externalOfferId: `${product.id}:${variantId}`,
      externalProductId: String(product.id),
      title,
      price,
      currency: config.defaultCurrency ?? null,
      taxType: config.defaultTaxType,
      availableQuantity: quantity,
      stockStatus,
      url: `${productUrl}?variant=${encodeURIComponent(variantId)}`,
      ean: str(v2.barcode)?.replace(/\D/g, "") || null,
      brand: str(product.vendor),
      storage: optionValue(product, v2, STORAGE_OPTION),
      color: optionValue(product, v2, COLOR_OPTION),
      grade: inferred.grade,
      condition: conditionOption ?? inferred.condition,
      supplierSku: str(v2.sku),
      country: config.defaultCountry ?? null,
      raw: {
        request_url: requestUrl,
        handle: product.handle,
        product_type: product.product_type ?? null,
        variant: { id: variantId, title: v2.title ?? null, sku: v2.sku ?? null, price: v2.price ?? null, compare_at_price: v2.compare_at_price ?? null, available: v2.available ?? null, inventory_quantity: v2.inventory_quantity ?? null },
        currency_source: config.defaultCurrency ? "config" : "absent",
        inferred: conditionOption ? inferred.inferred.filter((f) => f !== "condition") : inferred.inferred,
        condition_source: conditionOption ? "option" : inferred.condition ? "description" : null
      }
    };
  });
}

// src/integrations/sourcing/shopify-storefront/index.ts
var JSON_ACCEPT = "application/json;q=0.9,*/*;q=0.5";
function baseOf(config) {
  return config.baseUrl ? trimSlash(config.baseUrl) : null;
}
var shopifyStorefrontAdapter = {
  key: "shopify-storefront",
  label: "Boutique Shopify (JSON public)",
  description: "Interroge les endpoints JSON publics d'une boutique Shopify : suggestions de recherche puis fiches produit (titre, marque, SKU, prix, disponibilit\xE9, options stockage/couleur). La devise et le HT/TTC ne sont pas fournis par Shopify : ils proviennent des r\xE9glages de la source. Quantit\xE9 en stock uniquement si la boutique l'expose. V\xE9rifi\xE9 sur fixtures uniquement.",
  method: "public_json",
  access: "public",
  capabilities: { search: true, catalog: true, stockQuantity: false },
  credentialFields: [],
  configFields: [
    { name: "max_details", label: "Fiches produit lues par recherche", required: false, placeholder: String(SHOPIFY_MAX_DETAILS_PER_SEARCH), help: "Chaque fiche est une requ\xEAte suppl\xE9mentaire (d\xE9lai de politesse appliqu\xE9)." },
    { name: "max_pages", label: "Pages de catalogue par synchronisation", required: false, placeholder: String(SHOPIFY_MAX_CATALOG_PAGES) }
  ],
  verification: "fixtures",
  urlsForQuery(config, _query, rawQuery) {
    const base = baseOf(config);
    if (!base || !rawQuery.trim()) return [];
    return [suggestUrl(base, rawQuery), productDetailUrl(base, "exemple")];
  },
  urlsForCatalog(config) {
    const base = baseOf(config);
    return base ? [productsUrl(base, 1)] : [];
  },
  async search(config, _query, rawQuery, ctx) {
    const base = baseOf(config);
    if (!base) return failedSearch("public_json", "URL de base de la boutique manquante.");
    const http = createAdapterHttp(ctx);
    const maxDetails = settingInt(config.settings, "max_details", SHOPIFY_MAX_DETAILS_PER_SEARCH, 1, 20);
    try {
      const sUrl = suggestUrl(base, rawQuery);
      const res = await http.request(sUrl, { accept: JSON_ACCEPT });
      const suggestions = parseSuggestJson(res.text);
      http.countOffers(suggestions.length);
      const offers = [];
      let truncated = suggestions.length > maxDetails;
      for (const s of suggestions.slice(0, maxDetails)) {
        if (http.exhausted()) {
          truncated = true;
          break;
        }
        const dUrl = productDetailUrl(base, s.handle);
        if (ctx.disallowedUrls?.includes(dUrl)) continue;
        try {
          const d = await http.request(dUrl, { accept: JSON_ACCEPT });
          const mapped = mapShopifyProduct(parseProductDetailJson(d.text), config, base, dUrl);
          http.countOffers(mapped.length);
          offers.push(...mapped);
        } catch {
        }
      }
      return { offers, method: "public_json", requests: http.requests, error: null, truncated };
    } catch (e) {
      return failedSearch("public_json", errorMessage(e), http.requests);
    }
  },
  async fetchCatalog(config, cursor, ctx) {
    const base = baseOf(config);
    if (!base) return { offers: [], method: "public_json", requests: [{ url: "", status: null, durationMs: 0, offers: 0, error: "URL de base manquante." }], nextCursor: null };
    const page2 = Math.max(1, cursor ? Number(cursor) || 1 : 1);
    const maxPages = settingInt(config.settings, "max_pages", SHOPIFY_MAX_CATALOG_PAGES, 1, 200);
    const http = createAdapterHttp(ctx);
    const url = productsUrl(base, page2);
    try {
      const res = await http.request(url, { accept: JSON_ACCEPT });
      const products = parseProductsJson(res.text);
      const offers = products.flatMap((p) => mapShopifyProduct(p, config, base, url));
      http.countOffers(offers.length);
      const hasMore = products.length >= SHOPIFY_PAGE_LIMIT && page2 < maxPages;
      return { offers, method: "public_json", requests: http.requests, nextCursor: hasMore ? String(page2 + 1) : null };
    } catch (e) {
      return { offers: [], method: "public_json", requests: http.requests.length > 0 ? http.requests : [{ url, status: null, durationMs: 0, offers: 0, error: errorMessage(e) }], nextCursor: null };
    }
  },
  async testConnection(config, ctx) {
    const base = baseOf(config);
    if (!base) return { ok: false, message: "URL de base de la boutique manquante." };
    try {
      const http = createAdapterHttp(ctx);
      const res = await http.request(productsUrl(base, 1, 1), { accept: JSON_ACCEPT, maxBytes: 2 * 1024 * 1024 });
      const products = parseProductsJson(res.text);
      return { ok: true, message: products.length > 0 ? `Boutique Shopify accessible : products.json r\xE9pond (${products.length} produit lu).` : "products.json r\xE9pond mais ne liste aucun produit publi\xE9." };
    } catch (e) {
      return { ok: false, message: `products.json inaccessible : ${errorMessage(e)}` };
    }
  }
};

// src/integrations/sourcing/woocommerce-store/crawler.ts
var WC_STORE_PRODUCTS_PATH = "/wp-json/wc/store/v1/products";
var WC_PAGE_SIZE = 100;
var WC_MAX_CATALOG_PAGES = 50;
var WC_MAX_SEARCH_PAGES = 2;
function productsSearchUrl(baseUrl, query, page2, perPage = WC_PAGE_SIZE) {
  const params = new URLSearchParams({ search: query.trim(), per_page: String(perPage), page: String(page2) });
  return `${joinUrl(baseUrl, WC_STORE_PRODUCTS_PATH)}?${params.toString()}`;
}
function productsCatalogUrl(baseUrl, page2, perPage = WC_PAGE_SIZE) {
  const params = new URLSearchParams({ per_page: String(perPage), page: String(page2) });
  return `${joinUrl(baseUrl, WC_STORE_PRODUCTS_PATH)}?${params.toString()}`;
}

// src/integrations/sourcing/woocommerce-store/parser.ts
import { z as z16 } from "npm:zod@4.6.5";
var numOrStr2 = z16.union([z16.number(), z16.string()]);
var wcPricesSchema = z16.looseObject({
  price: numOrStr2.nullish(),
  regular_price: numOrStr2.nullish(),
  sale_price: numOrStr2.nullish(),
  currency_code: z16.string().nullish(),
  currency_minor_unit: z16.number().int().min(0).max(6).nullish()
});
var wcProductSchema = z16.looseObject({
  id: numOrStr2,
  name: z16.string(),
  slug: z16.string().nullish(),
  type: z16.string().nullish(),
  permalink: z16.string().nullish(),
  sku: z16.string().nullish(),
  short_description: z16.string().nullish(),
  description: z16.string().nullish(),
  prices: wcPricesSchema.nullish(),
  is_in_stock: z16.boolean().nullish(),
  is_purchasable: z16.boolean().nullish(),
  is_on_backorder: z16.boolean().nullish(),
  low_stock_remaining: z16.number().nullish(),
  categories: z16.array(z16.looseObject({ id: numOrStr2.optional(), name: z16.string().optional(), slug: z16.string().optional() })).nullish(),
  attributes: z16.array(z16.looseObject({ id: numOrStr2.optional(), name: z16.string(), taxonomy: z16.string().nullish(), terms: z16.array(z16.looseObject({ name: z16.string().optional(), slug: z16.string().optional() })).optional() })).nullish(),
  add_to_cart: z16.looseObject({ minimum: z16.number().nullish(), maximum: z16.number().nullish(), multiple: z16.number().nullish() }).nullish()
});
function parseWcProducts(text2) {
  const parsed = z16.array(wcProductSchema).safeParse(JSON.parse(text2));
  if (!parsed.success) throw new Error(`R\xE9ponse Store API inattendue : ${parsed.error.issues[0]?.message ?? "format invalide"}.`);
  return parsed.data;
}
function minorToAmount(value, minorUnit) {
  if (value === null || value === void 0 || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return null;
  const unit = minorUnit ?? 2;
  return Math.round(n) / 10 ** unit;
}

// src/integrations/sourcing/woocommerce-store/mapper.ts
var STORAGE_ATTR = /^(pa_)?(storage|stockage|capacit[ée]|m[ée]moire|memory|capacity)$/i;
var COLOR_ATTR = /^(pa_)?(color|colour|couleur|coloris)$/i;
var BRAND_ATTR = /^(pa_)?(brand|marque|manufacturer|fabricant)$/i;
var CONDITION_ATTR = /^(pa_)?(condition|[ée]tat|grade)$/i;
function attr(product, matcher) {
  for (const a of product.attributes ?? []) {
    const key2 = (a.taxonomy ?? a.name).trim();
    if (!matcher.test(key2) && !matcher.test(a.name.trim())) continue;
    const terms = (a.terms ?? []).map((t) => str(t.name)).filter((x) => Boolean(x));
    if (terms.length === 1) return terms[0];
  }
  return null;
}
function mapWcProduct(product, config, requestUrl) {
  const prices = product.prices ?? null;
  const price = minorToAmount(prices?.price ?? prices?.sale_price ?? prices?.regular_price, prices?.currency_minor_unit);
  const currency = str(prices?.currency_code)?.toUpperCase() ?? config.defaultCurrency ?? null;
  const lowStock = typeof product.low_stock_remaining === "number" ? Math.max(0, Math.round(product.low_stock_remaining)) : null;
  const stockStatus = product.is_in_stock === true ? lowStock !== null ? "low" : "in_stock" : product.is_in_stock === false ? product.is_on_backorder ? "unknown" : "out_of_stock" : "unknown";
  const description = stripHtml(`${product.short_description ?? ""} ${product.description ?? ""}`);
  const inferred = inferConditionFromText(`${product.name} ${description}`);
  const conditionAttr = attr(product, CONDITION_ATTR);
  const moq = product.add_to_cart?.minimum && product.add_to_cart.minimum > 1 ? Math.round(product.add_to_cart.minimum) : null;
  return {
    externalOfferId: String(product.id),
    externalProductId: String(product.id),
    title: product.name,
    price,
    currency,
    taxType: config.defaultTaxType,
    moq,
    availableQuantity: lowStock,
    stockStatus,
    url: str(product.permalink),
    brand: attr(product, BRAND_ATTR),
    storage: attr(product, STORAGE_ATTR),
    color: attr(product, COLOR_ATTR),
    grade: inferred.grade,
    condition: conditionAttr ?? inferred.condition,
    supplierSku: str(product.sku),
    country: config.defaultCountry ?? null,
    raw: {
      request_url: requestUrl,
      type: product.type ?? null,
      prices: prices ? { price: prices.price ?? null, regular_price: prices.regular_price ?? null, sale_price: prices.sale_price ?? null, currency_code: prices.currency_code ?? null, currency_minor_unit: prices.currency_minor_unit ?? null } : null,
      is_in_stock: product.is_in_stock ?? null,
      is_on_backorder: product.is_on_backorder ?? null,
      low_stock_remaining: product.low_stock_remaining ?? null,
      categories: (product.categories ?? []).map((c) => c.name ?? null).filter(Boolean).slice(0, 10),
      currency_source: str(prices?.currency_code) ? "payload" : config.defaultCurrency ? "config" : "absent",
      inferred: conditionAttr ? inferred.inferred.filter((f) => f !== "condition") : inferred.inferred,
      condition_source: conditionAttr ? "attribute" : inferred.condition ? "description" : null
    }
  };
}

// src/integrations/sourcing/woocommerce-store/index.ts
var JSON_ACCEPT2 = "application/json;q=0.9,*/*;q=0.5";
function baseOf2(config) {
  return config.baseUrl ? trimSlash(config.baseUrl) : null;
}
var wooCommerceStoreAdapter = {
  key: "woocommerce-store",
  label: "Boutique WooCommerce (Store API publique)",
  description: "Interroge l'API Store publique de WooCommerce (recherche texte pagin\xE9e) : nom, SKU, prix et devise, promotion, disponibilit\xE9, quantit\xE9 restante si faible, minimum de commande, attributs (marque, stockage, couleur). HT/TTC non pr\xE9cis\xE9 par l'API : r\xE9glage de la source. V\xE9rifi\xE9 sur fixtures uniquement.",
  method: "public_json",
  access: "public",
  capabilities: { search: true, catalog: true, stockQuantity: false },
  credentialFields: [],
  configFields: [
    { name: "max_search_pages", label: "Pages lues par recherche", required: false, placeholder: String(WC_MAX_SEARCH_PAGES) },
    { name: "max_pages", label: "Pages de catalogue par synchronisation", required: false, placeholder: String(WC_MAX_CATALOG_PAGES) }
  ],
  verification: "fixtures",
  urlsForQuery(config, _query, rawQuery) {
    const base = baseOf2(config);
    return base && rawQuery.trim() ? [productsSearchUrl(base, rawQuery, 1)] : [];
  },
  urlsForCatalog(config) {
    const base = baseOf2(config);
    return base ? [productsCatalogUrl(base, 1)] : [];
  },
  async search(config, _query, rawQuery, ctx) {
    const base = baseOf2(config);
    if (!base) return failedSearch("public_json", "URL de base de la boutique manquante.");
    const http = createAdapterHttp(ctx);
    const maxPages = settingInt(config.settings, "max_search_pages", WC_MAX_SEARCH_PAGES, 1, 10);
    const offers = [];
    let truncated = false;
    try {
      for (let page2 = 1; page2 <= maxPages; page2++) {
        const url = productsSearchUrl(base, rawQuery, page2);
        if (page2 > 1 && http.exhausted()) {
          truncated = true;
          break;
        }
        const res = await http.request(url, { accept: JSON_ACCEPT2 });
        const products = parseWcProducts(res.text);
        const mapped = products.map((p) => mapWcProduct(p, config, url)).filter((o) => o !== null);
        http.countOffers(mapped.length);
        offers.push(...mapped);
        if (products.length < WC_PAGE_SIZE) break;
        if (page2 === maxPages) truncated = true;
      }
      return { offers, method: "public_json", requests: http.requests, error: null, truncated };
    } catch (e) {
      if (offers.length > 0) return { offers, method: "public_json", requests: http.requests, error: null, truncated: true };
      return failedSearch("public_json", errorMessage(e), http.requests);
    }
  },
  async fetchCatalog(config, cursor, ctx) {
    const base = baseOf2(config);
    if (!base) return { offers: [], method: "public_json", requests: [{ url: "", status: null, durationMs: 0, offers: 0, error: "URL de base manquante." }], nextCursor: null };
    const page2 = Math.max(1, cursor ? Number(cursor) || 1 : 1);
    const maxPages = settingInt(config.settings, "max_pages", WC_MAX_CATALOG_PAGES, 1, 200);
    const http = createAdapterHttp(ctx);
    const url = productsCatalogUrl(base, page2);
    try {
      const res = await http.request(url, { accept: JSON_ACCEPT2 });
      const products = parseWcProducts(res.text);
      const offers = products.map((p) => mapWcProduct(p, config, url)).filter((o) => o !== null);
      http.countOffers(offers.length);
      const hasMore = products.length >= WC_PAGE_SIZE && page2 < maxPages;
      return { offers, method: "public_json", requests: http.requests, nextCursor: hasMore ? String(page2 + 1) : null };
    } catch (e) {
      return { offers: [], method: "public_json", requests: http.requests.length > 0 ? http.requests : [{ url, status: null, durationMs: 0, offers: 0, error: errorMessage(e) }], nextCursor: null };
    }
  },
  async testConnection(config, ctx) {
    const base = baseOf2(config);
    if (!base) return { ok: false, message: "URL de base de la boutique manquante." };
    try {
      const http = createAdapterHttp(ctx);
      const res = await http.request(productsCatalogUrl(base, 1, 1), { accept: JSON_ACCEPT2, maxBytes: 2 * 1024 * 1024 });
      const products = parseWcProducts(res.text);
      return { ok: true, message: products.length > 0 ? "API Store WooCommerce accessible (produit lu)." : "API Store accessible mais aucun produit publi\xE9." };
    } catch (e) {
      return { ok: false, message: `API Store inaccessible : ${errorMessage(e)}` };
    }
  }
};

// src/integrations/sourcing/google-merchant-feed/crawler.ts
var GMC_FEED_ACCEPT = "application/xml,text/xml,application/rss+xml,application/atom+xml,text/csv,text/tab-separated-values,text/plain;q=0.9,*/*;q=0.5";
var GMC_CACHE_TTL_MS = 10 * 6e4;
var GMC_CATALOG_PAGE_SIZE = 1e3;
var GMC_MAX_BYTES = 50 * 1024 * 1024;
function feedUrlOf(config) {
  const explicit = settingString(config.settings, "feed_url");
  if (explicit) return explicit;
  const base = config.baseUrl?.trim();
  if (!base) return null;
  return /\.(xml|rss|atom|tsv|csv|txt)(\?.*)?$/i.test(base) ? base : null;
}
function detectFeedFormat(text2, contentType) {
  const head = text2.slice(0, 2e3).trimStart();
  if (head.startsWith("<")) return "xml";
  if (contentType && /xml/i.test(contentType) && !/csv|tab-separated/i.test(contentType)) return "xml";
  return "tsv";
}

// src/integrations/sourcing/google-merchant-feed/parser.ts
import { parse as parseCsv2 } from "npm:csv-parse@7.0.3/sync";
import { XMLParser as XMLParser3 } from "npm:fast-xml-parser@5.11.2";
import { z as z17 } from "npm:zod@4.6.5";
var MAX_FEED_ITEMS = 5e4;
var scalar = z17.union([z17.string(), z17.number(), z17.boolean()]);
var textNode = z17.union([scalar, z17.looseObject({ "#text": scalar.optional() })]);
var anyField = z17.union([textNode, z17.array(textNode)]);
var gmcItemSchema = z17.record(z17.string(), z17.unknown());
function textOf(v2) {
  const parsed = anyField.safeParse(v2);
  if (!parsed.success) return null;
  const first = Array.isArray(parsed.data) ? parsed.data[0] : parsed.data;
  if (first === void 0 || first === null) return null;
  if (typeof first === "object") {
    const t = first["#text"];
    return t === void 0 ? null : String(t).trim() || null;
  }
  const s = String(first).trim();
  return s.length > 0 ? s : null;
}
function field(item, name) {
  if (item[`g:${name}`] !== void 0) return item[`g:${name}`];
  if (item[name] !== void 0) return item[name];
  const lower = name.toLowerCase();
  for (const [k, v2] of Object.entries(item)) {
    const key2 = k.toLowerCase().replace(/^g:/, "");
    if (key2 === lower) return v2;
  }
  return void 0;
}
function parseGmcPrice(raw) {
  if (!raw) return null;
  const m = raw.trim().match(/^([\d\s.,]+)\s*([A-Za-z]{3})?$/);
  if (!m || !m[1]) return null;
  const numeric = m[1].replace(/\s/g, "");
  const normalized = /,\d{1,2}$/.test(numeric) && numeric.includes(".") ? numeric.replace(/\./g, "").replace(",", ".") : /\.\d{1,2}$/.test(numeric) && numeric.includes(",") ? numeric.replace(/,/g, "") : numeric.replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;
  return { amount, currency: m[2] ? m[2].toUpperCase() : null };
}
function linkOf(item) {
  const g = textOf(field(item, "link"));
  if (g && /^https?:\/\//i.test(g)) return g;
  const raw = item.link;
  const list = Array.isArray(raw) ? raw : raw !== void 0 ? [raw] : [];
  for (const l of list) {
    if (l && typeof l === "object") {
      const href = l["@_href"];
      if (typeof href === "string" && /^https?:\/\//i.test(href)) return href;
    }
  }
  return g;
}
function shippingOf(item) {
  const raw = field(item, "shipping");
  const list = Array.isArray(raw) ? raw : raw !== void 0 ? [raw] : [];
  const out = [];
  for (const s of list) {
    if (!s || typeof s !== "object") continue;
    const rec = s;
    out.push({ country: textOf(field(rec, "country"))?.toUpperCase().slice(0, 2) ?? null, price: parseGmcPrice(textOf(field(rec, "price"))) });
  }
  return out;
}
function toItem(record) {
  const id = textOf(field(record, "id"));
  const title = textOf(field(record, "title"));
  if (!id || !title) return null;
  const quantityRaw = textOf(field(record, "quantity"));
  const quantity = quantityRaw !== null && /^\d+$/.test(quantityRaw) ? Number(quantityRaw) : null;
  const raw = {};
  for (const key2 of ["id", "title", "price", "sale_price", "availability", "gtin", "mpn", "brand", "condition", "item_group_id", "link"]) {
    const v2 = textOf(field(record, key2));
    if (v2 !== null) raw[key2] = v2;
  }
  return {
    id,
    title,
    description: textOf(field(record, "description")),
    link: linkOf(record),
    price: parseGmcPrice(textOf(field(record, "price"))),
    salePrice: parseGmcPrice(textOf(field(record, "sale_price"))),
    availability: textOf(field(record, "availability"))?.toLowerCase() ?? null,
    gtin: textOf(field(record, "gtin"))?.replace(/\D/g, "") || null,
    mpn: textOf(field(record, "mpn")),
    brand: textOf(field(record, "brand")),
    condition: textOf(field(record, "condition"))?.toLowerCase() ?? null,
    itemGroupId: textOf(field(record, "item_group_id")),
    color: textOf(field(record, "color")),
    size: textOf(field(record, "size")),
    shipping: shippingOf(record),
    quantity,
    raw
  };
}
function parseGmcXml(text2) {
  const parser2 = new XMLParser3({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: false, parseTagValue: false, trimValues: true, cdataPropName: false });
  const doc = parser2.parse(text2.replace(/^\uFEFF/, ""));
  const rss = doc.rss;
  const channel = rss?.channel;
  const feed = doc.feed;
  const rawItems = channel?.item ?? feed?.entry ?? null;
  if (rawItems === null || rawItems === void 0) throw new Error("Flux non reconnu : ni <rss><channel><item>, ni <feed><entry>.");
  const list = Array.isArray(rawItems) ? rawItems : [rawItems];
  const items = [];
  for (const entry of list.slice(0, MAX_FEED_ITEMS)) {
    const parsed = gmcItemSchema.safeParse(entry);
    if (!parsed.success) continue;
    const item = toItem(parsed.data);
    if (item) items.push(item);
  }
  return items;
}
function parseGmcTsv(text2) {
  const clean = text2.replace(/^\uFEFF/, "");
  const firstLine = clean.split(/\r?\n/)[0] ?? "";
  const delimiter = firstLine.includes("	") ? "	" : firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
  const rows = parseCsv2(clean, { columns: (header) => header.map((h) => h.trim().toLowerCase().replace(/^g:/, "")), delimiter, bom: true, trim: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true, to: MAX_FEED_ITEMS + 1 });
  const items = [];
  for (const row of rows) {
    const parsed = gmcItemSchema.safeParse(row);
    if (!parsed.success) continue;
    const record = { ...parsed.data };
    const shippingCol = Object.keys(record).find((k) => k.startsWith("shipping"));
    if (shippingCol && typeof record[shippingCol] === "string") {
      const [country, ...rest] = record[shippingCol].split(":");
      record.shipping = rest.length > 0 ? { country: country?.trim() ?? null, price: rest.join(":").trim() } : { price: record[shippingCol] };
    }
    const item = toItem(record);
    if (item) items.push(item);
  }
  return items;
}
function parseGmcFeed(text2, format) {
  return format === "xml" ? parseGmcXml(text2) : parseGmcTsv(text2);
}

// src/integrations/sourcing/google-merchant-feed/mapper.ts
function gmcAvailability(value) {
  switch (value) {
    case "in_stock":
    case "in stock":
      return "in_stock";
    case "limited_availability":
    case "limited availability":
      return "low";
    case "out_of_stock":
    case "out of stock":
      return "out_of_stock";
    case "preorder":
    case "backorder":
      return "unknown";
    default:
      return "unknown";
  }
}
function gmcCondition(value) {
  if (value === "new" || value === "refurbished" || value === "used") return value;
  return null;
}
function mapGmcItem(item, config, feedUrl) {
  const sale = item.salePrice && item.price && item.salePrice.amount > 0 && item.salePrice.amount < item.price.amount ? item.salePrice : null;
  const effective = sale ?? item.price;
  const currency = effective?.currency ?? item.price?.currency ?? config.defaultCurrency ?? null;
  const shipping = item.shipping.find((s) => !config.defaultCountry || !s.country || s.country === config.defaultCountry) ?? item.shipping[0] ?? null;
  return {
    externalOfferId: item.id,
    externalProductId: item.itemGroupId ?? item.id,
    title: item.title,
    price: effective?.amount ?? null,
    currency,
    taxType: config.defaultTaxType,
    availableQuantity: item.quantity,
    stockStatus: gmcAvailability(item.availability),
    shippingCost: shipping?.price?.amount ?? null,
    shippingCurrency: shipping?.price?.currency ?? currency,
    url: item.link,
    ean: item.gtin,
    mpn: item.mpn,
    brand: item.brand,
    color: item.color,
    condition: gmcCondition(item.condition),
    supplierSku: item.id,
    country: shipping?.country ?? config.defaultCountry ?? null,
    raw: { feed_url: feedUrl, item: item.raw, availability: item.availability, sale_price_applied: sale !== null, currency_source: effective?.currency ? "feed" : config.defaultCurrency ? "config" : "absent" }
  };
}

// src/integrations/sourcing/google-merchant-feed/index.ts
var feedCache = new TtlCache(GMC_CACHE_TTL_MS);
async function loadFeed(config, ctx, options) {
  const url = feedUrlOf(config);
  if (!url) throw new Error("URL du flux manquante (r\xE9glage feed_url ou URL de base pointant vers un fichier).");
  const now = ctx.now ? ctx.now().getTime() : Date.now();
  const cached2 = options.useCache ? feedCache.get(url, now) : null;
  if (cached2) return { url, feed: cached2, requests: [], fromCache: true };
  const http = createAdapterHttp(ctx);
  const res = await http.request(url, { accept: GMC_FEED_ACCEPT, maxBytes: GMC_MAX_BYTES });
  const format = detectFeedFormat(res.text, res.contentType);
  const items = parseGmcFeed(res.text, format);
  const offers = items.map((i) => mapGmcItem(i, config, res.finalUrl || url));
  http.countOffers(offers.length);
  const feed = { offers, fetchedAt: new Date(now).toISOString(), format };
  feedCache.set(url, feed, now);
  return { url, feed, requests: http.requests, fromCache: false };
}
var googleMerchantFeedAdapter = {
  key: "google-merchant-feed",
  label: "Flux Google Merchant (RSS / Atom / TSV)",
  description: "Lit un flux produit public au format Google Merchant Center (g:id, g:title, g:price \xAB 229.00 EUR \xBB, g:sale_price, g:availability, g:gtin, g:mpn, g:brand, g:condition, g:link, g:shipping, g:item_group_id). La recherche filtre le flux lu (mis en cache 10 min) : aucune requ\xEAte suppl\xE9mentaire par recherche. V\xE9rifi\xE9 sur fixtures uniquement.",
  method: "public_feed",
  access: "public",
  capabilities: { search: true, catalog: true, stockQuantity: false },
  credentialFields: [],
  configFields: [{ name: "feed_url", label: "URL du flux Google Merchant", required: true, placeholder: "https://boutique.example/feeds/google.xml" }],
  verification: "fixtures",
  urlsForQuery(config) {
    const url = feedUrlOf(config);
    return url ? [url] : [];
  },
  urlsForCatalog(config) {
    const url = feedUrlOf(config);
    return url ? [url] : [];
  },
  async search(config, query, _rawQuery, ctx) {
    const feedUrl = feedUrlOf(config);
    if (feedUrl && ctx.disallowedUrls?.includes(feedUrl)) return failedSearch("public_feed", "URL du flux interdite par robots.txt.");
    try {
      const { url, feed, requests, fromCache } = await loadFeed(config, ctx, { useCache: true });
      const offers = feed.offers.filter((o) => matchesQuery(query, { title: o.title, brand: o.brand, ean: o.ean, mpn: o.mpn, sku: o.supplierSku }));
      return { offers, method: "public_feed", requests: fromCache ? [{ url, status: null, durationMs: 0, offers: offers.length, error: null }] : requests, error: null, truncated: false };
    } catch (e) {
      return failedSearch("public_feed", errorMessage(e));
    }
  },
  async fetchCatalog(config, cursor, ctx) {
    const offset = Math.max(0, cursor ? Number(cursor) || 0 : 0);
    try {
      const { feed, requests } = await loadFeed(config, ctx, { useCache: offset > 0 });
      const page2 = feed.offers.slice(offset, offset + GMC_CATALOG_PAGE_SIZE);
      const next = offset + GMC_CATALOG_PAGE_SIZE < feed.offers.length ? String(offset + GMC_CATALOG_PAGE_SIZE) : null;
      return { offers: page2, method: "public_feed", requests, nextCursor: next };
    } catch (e) {
      return { offers: [], method: "public_feed", requests: [{ url: feedUrlOf(config) ?? "", status: null, durationMs: 0, offers: 0, error: errorMessage(e) }], nextCursor: null };
    }
  },
  async testConnection(config, ctx) {
    try {
      const { feed } = await loadFeed(config, ctx, { useCache: false });
      return { ok: true, message: `Flux lu (${feed.format.toUpperCase()}) : ${feed.offers.length} article(s).` };
    } catch (e) {
      return { ok: false, message: errorMessage(e) };
    }
  }
};

// src/integrations/sourcing/bigbuy/index.ts
import { createHash as createHash4 } from "node:crypto";

// src/integrations/sourcing/bigbuy/crawler.ts
var BIGBUY_API_BASE = "https://api.bigbuy.eu";
var BIGBUY_SANDBOX_BASE = "https://api.sandbox.bigbuy.eu";
var BIGBUY_PRODUCTS_PATH = "/rest/catalog/products.json";
var BIGBUY_PRODUCTS_INFORMATION_PATH = "/rest/catalog/productsinformation.json";
var BIGBUY_PRODUCTS_STOCK_AVAILABLE_PATH = "/rest/catalog/productsstockavailable.json";
var BIGBUY_MANUFACTURERS_PATH = "/rest/catalog/manufacturers.json";
var BIGBUY_TEST_PATH = "/rest/user/purchase.json";
var BIGBUY_PAGE_SIZE = 1e3;
var BIGBUY_MAX_CATALOG_PAGES = 20;
var BIGBUY_SEARCH_INDEX_PAGES = 3;
var BIGBUY_CACHE_TTL_MS = 10 * 6e4;
var BIGBUY_DEFAULT_ISO = "fr";
var BIGBUY_MAX_BYTES = 60 * 1024 * 1024;
function bigbuyBase(sandbox, override) {
  return override ?? (sandbox ? BIGBUY_SANDBOX_BASE : BIGBUY_API_BASE);
}
function productsUrl2(base, isoCode, page2, pageSize = BIGBUY_PAGE_SIZE) {
  return `${joinUrl(base, BIGBUY_PRODUCTS_PATH)}?isoCode=${encodeURIComponent(isoCode)}&page=${page2}&pageSize=${pageSize}`;
}
function productsInformationUrl(base, isoCode, page2, pageSize = BIGBUY_PAGE_SIZE) {
  return `${joinUrl(base, BIGBUY_PRODUCTS_INFORMATION_PATH)}?isoCode=${encodeURIComponent(isoCode)}&page=${page2}&pageSize=${pageSize}`;
}
function productsStockAvailableUrl(base) {
  return joinUrl(base, BIGBUY_PRODUCTS_STOCK_AVAILABLE_PATH);
}
function manufacturersUrl(base) {
  return joinUrl(base, BIGBUY_MANUFACTURERS_PATH);
}
function testUrl(base) {
  return joinUrl(base, BIGBUY_TEST_PATH);
}
function authHeaders(apiKey) {
  return { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
}

// src/integrations/sourcing/bigbuy/parser.ts
import { z as z18 } from "npm:zod@4.6.5";
var numOrStr3 = z18.union([z18.number(), z18.string()]);
var bigbuyProductSchema = z18.looseObject({
  id: numOrStr3,
  sku: z18.string().nullish(),
  ean13: numOrStr3.nullish(),
  manufacturer: numOrStr3.nullish(),
  wholesalePrice: numOrStr3.nullish(),
  retailPrice: numOrStr3.nullish(),
  taxRate: numOrStr3.nullish(),
  active: z18.union([z18.boolean(), z18.number()]).nullish(),
  condition: z18.string().nullish()
});
var bigbuyProductInformationSchema = z18.looseObject({
  id: numOrStr3,
  sku: z18.string().nullish(),
  name: z18.string().nullish(),
  description: z18.string().nullish(),
  url: z18.string().nullish(),
  isoCode: z18.string().nullish()
});
var bigbuyStockSchema = z18.looseObject({
  id: numOrStr3,
  sku: z18.string().nullish(),
  stocks: z18.array(z18.looseObject({ quantity: numOrStr3.nullish(), minHandlingDays: numOrStr3.nullish(), maxHandlingDays: numOrStr3.nullish(), warehouse: numOrStr3.nullish() })).default([])
});
var bigbuyManufacturerSchema = z18.looseObject({ id: numOrStr3, name: z18.string().nullish() });
function parseList(text2, schema, label) {
  const json2 = JSON.parse(text2);
  const parsed = z18.array(schema).safeParse(json2);
  if (!parsed.success) throw new Error(`R\xE9ponse ${label} inattendue : ${parsed.error.issues[0]?.message ?? "format invalide"}.`);
  return parsed.data;
}
var parseBigbuyProducts = (text2) => parseList(text2, bigbuyProductSchema, "products.json");
var parseBigbuyProductsInformation = (text2) => parseList(text2, bigbuyProductInformationSchema, "productsinformation.json");
var parseBigbuyStock = (text2) => parseList(text2, bigbuyStockSchema, "productsstockavailable.json");
var parseBigbuyManufacturers = (text2) => parseList(text2, bigbuyManufacturerSchema, "manufacturers.json");

// src/integrations/sourcing/bigbuy/mapper.ts
var BIGBUY_CURRENCY = "EUR";
function mapBigbuyProduct(product, info, stock, brandName, requestUrl) {
  const title = str(info?.name);
  if (!title) return null;
  const quantities = (stock?.stocks ?? []).map((s) => toNumber(s.quantity)).filter((n) => n !== null && n >= 0);
  const availableQuantity = stock ? Math.round(quantities.reduce((a, b) => a + b, 0)) : null;
  const minDays = (stock?.stocks ?? []).map((s) => toNumber(s.minHandlingDays)).filter((n) => n !== null);
  const maxDays = (stock?.stocks ?? []).map((s) => toNumber(s.maxHandlingDays)).filter((n) => n !== null);
  const condition = normalizeCondition(product.condition ?? null);
  const taxRate = toNumber(product.taxRate);
  return {
    externalOfferId: String(product.id),
    externalProductId: String(product.id),
    title,
    price: toNumber(product.wholesalePrice),
    currency: BIGBUY_CURRENCY,
    taxType: "ht",
    vatRate: taxRate !== null && taxRate >= 0 && taxRate <= 100 ? taxRate : null,
    availableQuantity,
    stockStatus: availableQuantity === null ? "unknown" : availableQuantity > 0 ? "in_stock" : "out_of_stock",
    deliveryMinDays: minDays.length > 0 ? Math.round(Math.min(...minDays)) : null,
    deliveryMaxDays: maxDays.length > 0 ? Math.round(Math.max(...maxDays)) : null,
    url: str(info?.url),
    ean: str(product.ean13)?.replace(/\D/g, "") || null,
    brand: brandName,
    condition: condition === "unknown" ? null : condition,
    supplierSku: str(product.sku),
    raw: {
      request_url: requestUrl,
      product: { id: product.id, sku: product.sku ?? null, ean13: product.ean13 ?? null, manufacturer: product.manufacturer ?? null, wholesalePrice: product.wholesalePrice ?? null, retailPrice: product.retailPrice ?? null, taxRate: product.taxRate ?? null, condition: product.condition ?? null },
      description_excerpt: stripHtml(info?.description).slice(0, 300) || null,
      stock: stock ? stock.stocks.map((s) => ({ quantity: s.quantity ?? null, minHandlingDays: s.minHandlingDays ?? null, maxHandlingDays: s.maxHandlingDays ?? null, warehouse: s.warehouse ?? null })) : null,
      price_basis: "wholesalePrice (hors TVA, EUR, documentation BigBuy)"
    }
  };
}

// src/integrations/sourcing/bigbuy/index.ts
var stockCache = new TtlCache(BIGBUY_CACHE_TTL_MS);
var manufacturerCache = new TtlCache(BIGBUY_CACHE_TTL_MS);
var indexCache = new TtlCache(BIGBUY_CACHE_TTL_MS);
function session(config, ctx) {
  const apiKey = ctx.credentials?.api_key?.trim();
  if (!apiKey) return null;
  const sandbox = config.settings.sandbox === true || config.settings.sandbox === "true";
  const base = bigbuyBase(sandbox, settingString(config.settings, "api_base"));
  const isoCode = (settingString(config.settings, "iso_code") ?? BIGBUY_DEFAULT_ISO).toLowerCase();
  const cacheKey2 = `${createHash4("sha256").update(apiKey).digest("hex").slice(0, 16)}|${base}|${isoCode}`;
  return { base, apiKey, isoCode, headers: authHeaders(apiKey), cacheKey: cacheKey2 };
}
function nowOf(ctx) {
  return ctx.now ? ctx.now().getTime() : Date.now();
}
async function loadManufacturers(s, http, ctx) {
  const cached2 = manufacturerCache.get(s.cacheKey, nowOf(ctx));
  if (cached2) return cached2;
  const map = /* @__PURE__ */ new Map();
  try {
    const res = await http.request(manufacturersUrl(s.base), { headers: s.headers, accept: "application/json" });
    for (const m of parseBigbuyManufacturers(res.text)) if (m.name) map.set(String(m.id), m.name);
    manufacturerCache.set(s.cacheKey, map, nowOf(ctx));
  } catch {
  }
  return map;
}
async function loadStock(s, http, ctx) {
  const cached2 = stockCache.get(s.cacheKey, nowOf(ctx));
  if (cached2) return cached2;
  try {
    const res = await http.request(productsStockAvailableUrl(s.base), { headers: s.headers, accept: "application/json", maxBytes: BIGBUY_MAX_BYTES });
    const map = /* @__PURE__ */ new Map();
    for (const st of parseBigbuyStock(res.text)) map.set(String(st.id), st);
    http.countOffers(map.size);
    stockCache.set(s.cacheKey, map, nowOf(ctx));
    return map;
  } catch {
    return null;
  }
}
async function loadCatalogPage(s, http, ctx, page2, pageSize) {
  const pUrl = productsUrl2(s.base, s.isoCode, page2, pageSize);
  const products = parseBigbuyProducts((await http.request(pUrl, { headers: s.headers, accept: "application/json", maxBytes: BIGBUY_MAX_BYTES })).text);
  http.countOffers(products.length);
  if (products.length === 0) return { offers: [], productCount: 0 };
  const iUrl = productsInformationUrl(s.base, s.isoCode, page2, pageSize);
  const infos = parseBigbuyProductsInformation((await http.request(iUrl, { headers: s.headers, accept: "application/json", maxBytes: BIGBUY_MAX_BYTES })).text);
  const infoById = new Map(infos.map((i) => [String(i.id), i]));
  const [brands, stock] = [await loadManufacturers(s, http, ctx), await loadStock(s, http, ctx)];
  const offers = [];
  for (const p of products) {
    if (p.active === false || p.active === 0) continue;
    const id = String(p.id);
    const mapped = mapBigbuyProduct(p, infoById.get(id) ?? null, stock?.get(id) ?? null, p.manufacturer !== null && p.manufacturer !== void 0 ? brands.get(String(p.manufacturer)) ?? null : null, pUrl);
    if (mapped) offers.push(mapped);
  }
  return { offers, productCount: products.length };
}
async function buildSearchIndex(s, config, http, ctx) {
  const cached2 = indexCache.get(s.cacheKey, nowOf(ctx));
  if (cached2) return cached2;
  const pages = settingInt(config.settings, "search_pages", BIGBUY_SEARCH_INDEX_PAGES, 1, 20);
  const pageSize = settingInt(config.settings, "page_size", BIGBUY_PAGE_SIZE, 50, BIGBUY_PAGE_SIZE);
  const offers = [];
  let truncated = false;
  for (let page2 = 0; page2 < pages; page2++) {
    if (page2 > 0 && http.exhausted()) {
      truncated = true;
      break;
    }
    const { offers: pageOffers, productCount } = await loadCatalogPage(s, http, ctx, page2, pageSize);
    offers.push(...pageOffers);
    if (productCount < pageSize) break;
    if (page2 === pages - 1) truncated = true;
  }
  const index = { offers, truncated };
  if (offers.length > 0) indexCache.set(s.cacheKey, index, nowOf(ctx));
  return index;
}
var bigbuyAdapter = {
  key: "bigbuy",
  label: "BigBuy (API officielle, cl\xE9 API)",
  description: "Catalogue grossiste BigBuy via l'API REST officielle avec votre cl\xE9 API : nom, SKU, EAN, marque, prix de gros HT (EUR), taux de TVA, stock par entrep\xF4t, d\xE9lais de pr\xE9paration. Pas de recherche texte c\xF4t\xE9 BigBuy : la recherche en direct filtre les premi\xE8res pages du catalogue (index en cache 10 min) et est signal\xE9e comme partielle. Impl\xE9ment\xE9 d'apr\xE8s la documentation publique, non exerc\xE9 en conditions r\xE9elles depuis cet environnement.",
  method: "official_api",
  access: "account",
  capabilities: { search: true, catalog: true, stockQuantity: true },
  credentialFields: [{ name: "api_key", label: "Cl\xE9 API BigBuy", secret: true, placeholder: "Cl\xE9 g\xE9n\xE9r\xE9e dans votre espace BigBuy (API)" }],
  configFields: [
    { name: "iso_code", label: "Langue du catalogue (isoCode)", required: false, placeholder: BIGBUY_DEFAULT_ISO },
    { name: "sandbox", label: "Environnement bac \xE0 sable (true/false)", required: false, placeholder: "false" },
    { name: "max_pages", label: "Pages de catalogue par synchronisation", required: false, placeholder: String(BIGBUY_MAX_CATALOG_PAGES) },
    { name: "search_pages", label: "Pages index\xE9es pour la recherche en direct", required: false, placeholder: String(BIGBUY_SEARCH_INDEX_PAGES) }
  ],
  verification: "fixtures",
  async search(config, query, _rawQuery, ctx) {
    const s = session(config, ctx);
    if (!s) return failedSearch("official_api", "Cl\xE9 API BigBuy absente : connectez votre compte fournisseur.");
    const http = createAdapterHttp(ctx);
    try {
      const index = await buildSearchIndex(s, config, http, ctx);
      const offers = index.offers.filter((o) => matchesQuery(query, { title: o.title, brand: o.brand, ean: o.ean, sku: o.supplierSku }));
      return { offers, method: "official_api", requests: http.requests, error: null, truncated: index.truncated };
    } catch (e) {
      return failedSearch("official_api", errorMessage(e), http.requests);
    }
  },
  async fetchCatalog(config, cursor, ctx) {
    const s = session(config, ctx);
    if (!s) return { offers: [], method: "official_api", requests: [], nextCursor: null };
    const page2 = Math.max(0, cursor ? Number(cursor) || 0 : 0);
    const maxPages = settingInt(config.settings, "max_pages", BIGBUY_MAX_CATALOG_PAGES, 1, 500);
    const pageSize = settingInt(config.settings, "page_size", BIGBUY_PAGE_SIZE, 50, BIGBUY_PAGE_SIZE);
    const http = createAdapterHttp(ctx);
    try {
      const { offers, productCount } = await loadCatalogPage(s, http, ctx, page2, pageSize);
      const hasMore = productCount >= pageSize && page2 + 1 < maxPages;
      return { offers, method: "official_api", requests: http.requests, nextCursor: hasMore ? String(page2 + 1) : null };
    } catch (e) {
      return { offers: [], method: "official_api", requests: http.requests.length > 0 ? http.requests : [{ url: productsUrl2(s.base, s.isoCode, page2, pageSize), status: null, durationMs: 0, offers: 0, error: errorMessage(e) }], nextCursor: null };
    }
  },
  async testConnection(config, ctx) {
    const s = session(config, ctx);
    if (!s) return { ok: false, message: "Cl\xE9 API BigBuy absente." };
    try {
      const http = createAdapterHttp(ctx);
      const res = await http.request(testUrl(s.base), { headers: s.headers, accept: "application/json", maxBytes: 2 * 1024 * 1024 });
      JSON.parse(res.text);
      return { ok: true, message: "Cl\xE9 API BigBuy accept\xE9e (r\xE9ponse authentifi\xE9e re\xE7ue)." };
    } catch (e) {
      const msg = errorMessage(e);
      return { ok: false, message: /HTTP 401|HTTP 403/.test(msg) ? "Cl\xE9 API BigBuy refus\xE9e (401/403) : v\xE9rifiez la cl\xE9 et l'environnement (production / bac \xE0 sable)." : `BigBuy injoignable : ${msg}` };
    }
  }
};

// src/integrations/sourcing/ingram-micro/index.ts
import { createHash as createHash5, randomUUID } from "node:crypto";

// src/integrations/sourcing/ingram-micro/crawler.ts
var INGRAM_API_BASE = "https://api.ingrammicro.com";
var INGRAM_SANDBOX_BASE = "https://api.ingrammicro.com/sandbox";
var INGRAM_TOKEN_PATH = "/oauth/oauth20/token";
var INGRAM_CATALOG_PATH = "/resellers/v6/catalog";
var INGRAM_PRICE_AVAILABILITY_PATH = "/resellers/v6/catalog/priceandavailability";
var INGRAM_PA_QUERY = "includeAvailability=true&includePricing=true&includeProductAttributes=false";
var INGRAM_PA_BATCH = 50;
var INGRAM_SEARCH_PAGE_SIZE = 25;
var INGRAM_CATALOG_PAGE_SIZE = 50;
var INGRAM_MAX_CATALOG_PAGES = 20;
var INGRAM_DEFAULT_SENDER_ID = "MON STOCK";
var INGRAM_DEFAULT_LANGUAGE = "fr-FR";
var INGRAM_TOKEN_SAFETY_S = 60;
function ingramBase(sandbox, override) {
  return override ?? (sandbox ? INGRAM_SANDBOX_BASE : INGRAM_API_BASE);
}
function tokenUrl(base) {
  const origin = new URL(base).origin;
  return joinUrl(base.endsWith("/sandbox") ? base : origin, INGRAM_TOKEN_PATH);
}
function catalogUrl(base, params) {
  const q = new URLSearchParams({ pageNumber: String(params.pageNumber), pageSize: String(params.pageSize) });
  if (params.keyword?.trim()) q.set("keyword", params.keyword.trim());
  return `${joinUrl(base, INGRAM_CATALOG_PATH)}?${q.toString()}`;
}
function priceAvailabilityUrl(base) {
  return `${joinUrl(base, INGRAM_PRICE_AVAILABILITY_PATH)}?${INGRAM_PA_QUERY}`;
}
function tokenRequestBody(clientId, clientSecret) {
  return new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }).toString();
}
function ingramHeaders(input) {
  return {
    Authorization: `Bearer ${input.accessToken}`,
    "IM-CustomerNumber": input.customerNumber,
    "IM-CountryCode": input.countryCode.toUpperCase(),
    "IM-CorrelationID": input.correlationId,
    "IM-SenderID": input.senderId,
    "Accept-Language": input.language,
    Accept: "application/json",
    "Content-Type": "application/json"
  };
}

// src/integrations/sourcing/ingram-micro/parser.ts
import { z as z19 } from "npm:zod@4.6.5";
var numOrStr4 = z19.union([z19.number(), z19.string()]);
var ingramTokenSchema = z19.looseObject({
  access_token: z19.string().min(1),
  token_type: z19.string().nullish(),
  expires_in: numOrStr4.nullish()
});
var ingramCatalogItemSchema = z19.looseObject({
  ingramPartNumber: z19.string().nullish(),
  vendorPartNumber: z19.string().nullish(),
  upcCode: z19.string().nullish(),
  vendorName: z19.string().nullish(),
  description: z19.string().nullish(),
  extraDescription: z19.string().nullish(),
  category: z19.string().nullish(),
  subCategory: z19.string().nullish(),
  productType: z19.string().nullish(),
  discontinued: z19.union([z19.boolean(), z19.string()]).nullish(),
  authorizedToPurchase: z19.union([z19.boolean(), z19.string()]).nullish(),
  links: z19.array(z19.looseObject({ topic: z19.string().nullish(), href: z19.string().nullish(), type: z19.string().nullish() })).nullish()
});
var ingramCatalogResponseSchema = z19.looseObject({
  recordsFound: numOrStr4.nullish(),
  pageSize: numOrStr4.nullish(),
  pageNumber: numOrStr4.nullish(),
  catalog: z19.array(ingramCatalogItemSchema).nullish()
});
var ingramAvailabilityByWarehouseSchema = z19.looseObject({
  location: z19.string().nullish(),
  warehouseId: numOrStr4.nullish(),
  quantityAvailable: numOrStr4.nullish(),
  quantityBackordered: numOrStr4.nullish()
});
var ingramPriceAvailabilityItemSchema = z19.looseObject({
  productStatusCode: z19.string().nullish(),
  productStatusMessage: z19.string().nullish(),
  ingramPartNumber: z19.string().nullish(),
  vendorPartNumber: z19.string().nullish(),
  upc: z19.string().nullish(),
  vendorName: z19.string().nullish(),
  description: z19.string().nullish(),
  uom: z19.string().nullish(),
  productAuthorized: z19.union([z19.boolean(), z19.string()]).nullish(),
  availability: z19.looseObject({
    available: z19.union([z19.boolean(), z19.string()]).nullish(),
    totalAvailability: numOrStr4.nullish(),
    availabilityByWarehouse: z19.array(ingramAvailabilityByWarehouseSchema).nullish()
  }).nullish(),
  pricing: z19.looseObject({
    currencyCode: z19.string().nullish(),
    retailPrice: numOrStr4.nullish(),
    customerPrice: numOrStr4.nullish()
  }).nullish()
});
function parseIngramToken(text2) {
  const parsed = ingramTokenSchema.safeParse(JSON.parse(text2));
  if (!parsed.success) throw new Error("R\xE9ponse du serveur de jetons inattendue (access_token absent).");
  const exp = parsed.data.expires_in === null || parsed.data.expires_in === void 0 ? Number.NaN : Number(parsed.data.expires_in);
  return { accessToken: parsed.data.access_token, expiresInS: Number.isFinite(exp) && exp > 0 ? exp : null };
}
function parseIngramCatalog(text2) {
  const parsed = ingramCatalogResponseSchema.safeParse(JSON.parse(text2));
  if (!parsed.success) throw new Error(`R\xE9ponse catalogue inattendue : ${parsed.error.issues[0]?.message ?? "format invalide"}.`);
  const rf = Number(parsed.data.recordsFound ?? Number.NaN);
  return { items: parsed.data.catalog ?? [], recordsFound: Number.isFinite(rf) ? rf : null };
}
function parseIngramPriceAvailability(text2) {
  const json2 = JSON.parse(text2);
  const parsed = z19.array(ingramPriceAvailabilityItemSchema).safeParse(json2);
  if (!parsed.success) throw new Error(`R\xE9ponse prix & disponibilit\xE9 inattendue : ${parsed.error.issues[0]?.message ?? "format invalide"}.`);
  return parsed.data;
}

// src/integrations/sourcing/ingram-micro/mapper.ts
function truthy(v2) {
  if (v2 === null || v2 === void 0) return null;
  if (typeof v2 === "boolean") return v2;
  return /^(true|yes|y|1)$/i.test(v2) ? true : /^(false|no|n|0)$/i.test(v2) ? false : null;
}
function mapIngramOffer(pa, catalog, config, requestUrl) {
  const partNumber = str(pa.ingramPartNumber) ?? str(catalog?.ingramPartNumber);
  if (!partNumber) return null;
  if (pa.productStatusCode && /^e$/i.test(pa.productStatusCode)) return null;
  const price = toNumber(pa.pricing?.customerPrice);
  const currency = str(pa.pricing?.currencyCode)?.toUpperCase() ?? config.defaultCurrency ?? null;
  if (price === null) return null;
  const title = str(pa.description) ?? str(catalog?.description);
  if (!title) return null;
  const total = toNumber(pa.availability?.totalAvailability);
  const available = truthy(pa.availability?.available);
  const availableQuantity = total !== null && total >= 0 ? Math.round(total) : null;
  const stockStatus = availableQuantity !== null ? availableQuantity > 0 ? "in_stock" : "out_of_stock" : available === true ? "in_stock" : available === false ? "out_of_stock" : "unknown";
  const vendorPart = str(pa.vendorPartNumber) ?? str(catalog?.vendorPartNumber);
  const upc = digits(pa.upc ?? catalog?.upcCode);
  const link = catalog?.links?.find((l) => l.href && /^https?:\/\//i.test(l.href))?.href ?? null;
  return {
    externalOfferId: partNumber,
    externalProductId: partNumber,
    title: catalog?.extraDescription ? `${title} ${catalog.extraDescription}`.trim() : title,
    price,
    currency,
    taxType: config.defaultTaxType,
    availableQuantity,
    stockStatus,
    url: link,
    ean: upc,
    mpn: vendorPart,
    brand: str(pa.vendorName) ?? str(catalog?.vendorName),
    supplierSku: partNumber,
    country: config.defaultCountry ?? null,
    raw: {
      request_url: requestUrl,
      ingramPartNumber: partNumber,
      vendorPartNumber: vendorPart,
      upc: pa.upc ?? catalog?.upcCode ?? null,
      pricing: pa.pricing ? { currencyCode: pa.pricing.currencyCode ?? null, customerPrice: pa.pricing.customerPrice ?? null, retailPrice: pa.pricing.retailPrice ?? null } : null,
      availability: pa.availability ? { available: pa.availability.available ?? null, totalAvailability: pa.availability.totalAvailability ?? null, warehouses: (pa.availability.availabilityByWarehouse ?? []).map((w2) => ({ location: w2.location ?? null, quantityAvailable: w2.quantityAvailable ?? null })).slice(0, 20) } : null,
      productStatusCode: pa.productStatusCode ?? null,
      category: catalog?.category ?? null,
      discontinued: catalog?.discontinued ?? null,
      price_basis: "pricing.customerPrice (prix revendeur du compte, API Reseller v6)"
    }
  };
}

// src/integrations/sourcing/ingram-micro/index.ts
var tokenCache = new TtlCache(60 * 6e4);
function session2(config, ctx) {
  const c = ctx.credentials ?? {};
  const clientId = c.client_id?.trim();
  const clientSecret = c.client_secret?.trim();
  const customerNumber = c.customer_number?.trim();
  const countryCode = (c.country_code?.trim() || config.defaultCountry || "").toUpperCase();
  if (!clientId || !clientSecret || !customerNumber || !countryCode) return null;
  const sandbox = config.settings.sandbox === true || config.settings.sandbox === "true";
  const base = ingramBase(sandbox, settingString(config.settings, "api_base"));
  return {
    base,
    clientId,
    clientSecret,
    customerNumber,
    countryCode,
    senderId: settingString(config.settings, "sender_id") ?? INGRAM_DEFAULT_SENDER_ID,
    language: settingString(config.settings, "language") ?? INGRAM_DEFAULT_LANGUAGE,
    cacheKey: `${createHash5("sha256").update(`${clientId}:${clientSecret}`).digest("hex").slice(0, 16)}|${base}`
  };
}
function nowOf2(ctx) {
  return ctx.now ? ctx.now().getTime() : Date.now();
}
async function accessToken(s, http, ctx) {
  const cached2 = tokenCache.get(s.cacheKey, nowOf2(ctx));
  if (cached2) return cached2;
  const res = await http.request(tokenUrl(s.base), { method: "POST", body: tokenRequestBody(s.clientId, s.clientSecret), headers: { "Content-Type": "application/x-www-form-urlencoded" }, accept: "application/json" });
  const token = parseIngramToken(res.text);
  const ttlS = Math.max(60, (token.expiresInS ?? 3600) - INGRAM_TOKEN_SAFETY_S);
  tokenCache.set(s.cacheKey, token.accessToken, nowOf2(ctx), ttlS * 1e3);
  return token.accessToken;
}
function headersFor(s, token) {
  return ingramHeaders({ accessToken: token, customerNumber: s.customerNumber, countryCode: s.countryCode, senderId: s.senderId, correlationId: randomUUID().replace(/-/g, "").slice(0, 32), language: s.language });
}
async function priceAndAvailability(s, token, http, items, config) {
  const offers = [];
  const byPart = new Map(items.filter((i) => i.ingramPartNumber).map((i) => [i.ingramPartNumber.trim().toUpperCase(), i]));
  const parts = Array.from(byPart.keys());
  for (let i = 0; i < parts.length; i += INGRAM_PA_BATCH) {
    const batch = parts.slice(i, i + INGRAM_PA_BATCH);
    const url = priceAvailabilityUrl(s.base);
    const res = await http.request(url, { method: "POST", body: JSON.stringify({ products: batch.map((p) => ({ ingramPartNumber: p })) }), headers: headersFor(s, token), accept: "application/json" });
    const rows = parseIngramPriceAvailability(res.text);
    let count = 0;
    for (const row of rows) {
      const key2 = (row.ingramPartNumber ?? "").trim().toUpperCase();
      const mapped = mapIngramOffer(row, byPart.get(key2) ?? null, config, url);
      if (mapped) {
        offers.push(mapped);
        count++;
      }
    }
    http.countOffers(count);
    if (http.exhausted()) break;
  }
  return offers;
}
var ingramMicroAdapter = {
  key: "ingram-micro",
  label: "Ingram Micro (Reseller API v6, OAuth2)",
  description: "Catalogue, prix revendeur et disponibilit\xE9 Ingram Micro via l'API Reseller v6 avec les identifiants OAuth2 de votre compte (num\xE9ro client et pays requis). Recherche par mot-cl\xE9 puis prix & disponibilit\xE9 par lot de 50 r\xE9f\xE9rences ; quantit\xE9 totale disponible, r\xE9f\xE9rence fabricant, UPC, marque. HT/TTC non pr\xE9cis\xE9 par l'API : r\xE9glage de la source. Impl\xE9ment\xE9 d'apr\xE8s la documentation publique, non exerc\xE9 en conditions r\xE9elles depuis cet environnement.",
  method: "official_api",
  access: "account",
  capabilities: { search: true, catalog: true, stockQuantity: true },
  credentialFields: [
    { name: "client_id", label: "Client ID (application Ingram Micro)", secret: false },
    { name: "client_secret", label: "Client Secret", secret: true },
    { name: "customer_number", label: "Num\xE9ro client Ingram (IM-CustomerNumber)", secret: false, placeholder: "20-222222" },
    { name: "country_code", label: "Code pays du compte (IM-CountryCode)", secret: false, placeholder: "FR" }
  ],
  configFields: [
    { name: "sandbox", label: "Environnement bac \xE0 sable (true/false)", required: false, placeholder: "false" },
    { name: "sender_id", label: "Identifiant d'exp\xE9diteur (IM-SenderID)", required: false, placeholder: INGRAM_DEFAULT_SENDER_ID },
    { name: "language", label: "Langue des libell\xE9s (Accept-Language)", required: false, placeholder: INGRAM_DEFAULT_LANGUAGE },
    { name: "max_pages", label: "Pages de catalogue par synchronisation", required: false, placeholder: String(INGRAM_MAX_CATALOG_PAGES) }
  ],
  verification: "fixtures",
  async search(config, _query, rawQuery, ctx) {
    const s = session2(config, ctx);
    if (!s) return failedSearch("official_api", "Identifiants Ingram Micro incomplets (client_id, client_secret, num\xE9ro client, pays).");
    const http = createAdapterHttp(ctx);
    try {
      const token = await accessToken(s, http, ctx);
      const pageSize = settingInt(config.settings, "search_page_size", INGRAM_SEARCH_PAGE_SIZE, 1, INGRAM_PA_BATCH);
      const url = catalogUrl(s.base, { pageNumber: 1, pageSize, keyword: rawQuery });
      const res = await http.request(url, { headers: headersFor(s, token), accept: "application/json" });
      const { items, recordsFound } = parseIngramCatalog(res.text);
      http.countOffers(items.length);
      const offers = items.length > 0 ? await priceAndAvailability(s, token, http, items, config) : [];
      return { offers, method: "official_api", requests: http.requests, error: null, truncated: recordsFound !== null && recordsFound > items.length };
    } catch (e) {
      return failedSearch("official_api", errorMessage(e), http.requests);
    }
  },
  async fetchCatalog(config, cursor, ctx) {
    const s = session2(config, ctx);
    if (!s) return { offers: [], method: "official_api", requests: [], nextCursor: null };
    const page2 = Math.max(1, cursor ? Number(cursor) || 1 : 1);
    const maxPages = settingInt(config.settings, "max_pages", INGRAM_MAX_CATALOG_PAGES, 1, 500);
    const http = createAdapterHttp(ctx);
    try {
      const token = await accessToken(s, http, ctx);
      const keyword = settingString(config.settings, "catalog_keyword");
      const url = catalogUrl(s.base, { pageNumber: page2, pageSize: INGRAM_CATALOG_PAGE_SIZE, keyword });
      const res = await http.request(url, { headers: headersFor(s, token), accept: "application/json" });
      const { items, recordsFound } = parseIngramCatalog(res.text);
      http.countOffers(items.length);
      const offers = items.length > 0 ? await priceAndAvailability(s, token, http, items, config) : [];
      const hasMore = items.length >= INGRAM_CATALOG_PAGE_SIZE && page2 < maxPages && (recordsFound === null || page2 * INGRAM_CATALOG_PAGE_SIZE < recordsFound);
      return { offers, method: "official_api", requests: http.requests, nextCursor: hasMore ? String(page2 + 1) : null };
    } catch (e) {
      return { offers: [], method: "official_api", requests: http.requests.length > 0 ? http.requests : [{ url: catalogUrl(s.base, { pageNumber: page2, pageSize: INGRAM_CATALOG_PAGE_SIZE }), status: null, durationMs: 0, offers: 0, error: errorMessage(e) }], nextCursor: null };
    }
  },
  async testConnection(config, ctx) {
    const s = session2(config, ctx);
    if (!s) return { ok: false, message: "Identifiants Ingram Micro incomplets (client_id, client_secret, num\xE9ro client, pays)." };
    try {
      const http = createAdapterHttp(ctx);
      const token = await accessToken(s, http, ctx);
      const res = await http.request(catalogUrl(s.base, { pageNumber: 1, pageSize: 1 }), { headers: headersFor(s, token), accept: "application/json", maxBytes: 2 * 1024 * 1024 });
      const { recordsFound } = parseIngramCatalog(res.text);
      return { ok: true, message: `Jeton OAuth2 obtenu et catalogue accessible${recordsFound !== null ? ` (${recordsFound} r\xE9f\xE9rence(s) annonc\xE9e(s))` : ""}.` };
    } catch (e) {
      const msg = errorMessage(e);
      return { ok: false, message: /HTTP 401|HTTP 403/.test(msg) ? "Identifiants refus\xE9s (401/403) : v\xE9rifiez client_id / client_secret, le num\xE9ro client et le pays." : `Ingram Micro injoignable : ${msg}` };
    }
  }
};

// src/integrations/sourcing/ebay-browse/index.ts
import { z as z20 } from "npm:zod@4.6.5";

// src/domain/sourcing/query-parser.ts
function parseQuery2(input) {
  const raw = (input ?? "").trim();
  const normalized = normalizeProduct(raw);
  const structuredModel = normalized.model && !normalized.inferred.includes("model") ? normalized.model : null;
  const criteria = {
    brand: normalized.brand,
    model: structuredModel,
    storage: normalized.storage,
    color: normalized.color,
    grade: normalized.grade,
    condition: normalized.inferred.includes("condition") ? "unknown" : normalized.condition
  };
  const tokens = normalizeText(raw).split(" ").filter((t) => t.length >= 2 && !NOISE_TOKENS.has(t));
  let kind = "text";
  if (!raw) kind = "empty";
  else if (normalized.ean) kind = "ean";
  else if (normalized.mpn && !structuredModel) kind = "mpn";
  else if (structuredModel || normalized.brand && (normalized.storage || normalized.color || normalized.grade)) kind = "structured";
  return {
    raw,
    kind,
    ean: normalized.ean,
    mpn: normalized.mpn,
    criteria,
    tokens,
    freeText: normalized.remainingText,
    normalized
  };
}

// src/integrations/sourcing/ebay-browse/index.ts
var EBAY_BROWSE_DEFAULT_MARKETPLACE = "EBAY_FR";
var EBAY_BROWSE_DEFAULT_LIMIT = 30;
var tokenSchema = z20.object({ access_token: z20.string().min(1), expires_in: z20.number().int().positive() });
var amountSchema2 = z20.object({ value: z20.string(), currency: z20.string() }).partial();
var itemSummarySchema = z20.object({
  itemId: z20.string(),
  title: z20.string(),
  price: amountSchema2.optional(),
  condition: z20.string().optional(),
  conditionId: z20.string().optional(),
  itemWebUrl: z20.string().optional(),
  itemLocation: z20.object({ country: z20.string().optional(), postalCode: z20.string().optional() }).partial().optional(),
  seller: z20.object({ username: z20.string().optional(), feedbackPercentage: z20.string().optional(), feedbackScore: z20.number().optional() }).partial().optional(),
  shippingOptions: z20.array(z20.object({ shippingCost: amountSchema2.optional(), shippingCostType: z20.string().optional() }).partial()).optional(),
  buyingOptions: z20.array(z20.string()).optional(),
  epid: z20.string().optional(),
  itemGroupType: z20.string().optional()
});
var searchResponseSchema = z20.object({ total: z20.number().optional(), itemSummaries: z20.array(z20.unknown()).optional() });
var appToken = null;
function apiBase(env) {
  return env.EBAY_ENV === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
}
function base64(s) {
  return typeof btoa === "function" ? btoa(s) : Buffer.from(s, "utf8").toString("base64");
}
async function getAppToken(ctx) {
  const env = ebayEnv();
  if (!env) throw new Error("Cl\xE9s de l'application eBay absentes du serveur (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET / EBAY_RU_NAME).");
  const key2 = `${env.EBAY_ENV}:${env.EBAY_CLIENT_ID}`;
  const now = (ctx.now ?? (() => /* @__PURE__ */ new Date()))().getTime();
  if (appToken && appToken.key === key2 && appToken.expiresAt - 5 * 6e4 > now) return appToken.token;
  const fetchImpl = ctx.fetchImpl ?? fetch;
  const res = await fetchImpl(`${apiBase(env)}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${base64(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`)}` },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }).toString()
  });
  const json2 = await res.json().catch(() => null);
  if (!res.ok) throw new Error(res.status === 401 ? "eBay refuse les cl\xE9s de l'application (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET)." : `Jeton d'application eBay refus\xE9 (HTTP ${res.status}).`);
  const t = tokenSchema.parse(json2);
  appToken = { token: t.access_token, expiresAt: now + t.expires_in * 1e3, key: key2 };
  return t.access_token;
}
function money2(a) {
  const v2 = a?.value !== void 0 ? Number(a.value) : NaN;
  return { value: Number.isFinite(v2) ? v2 : null, currency: a?.currency && /^[A-Z]{3}$/.test(a.currency) ? a.currency : null };
}
function ebayCondition(item) {
  const id = item.conditionId ?? "";
  const fromTitle = inferConditionFromText(item.title);
  if (id === "1000") return { condition: "new", grade: null };
  if (["2000", "2010", "2020", "2030", "2500"].includes(id)) return { condition: "refurbished", grade: fromTitle.grade };
  if (["3000", "4000", "5000", "6000", "7000"].includes(id)) return { condition: "used", grade: fromTitle.grade };
  const inferred = inferConditionFromText(`${item.condition ?? ""} ${item.title}`);
  return { condition: inferred.condition, grade: inferred.grade };
}
function mapEbayItem(item, requestUrl) {
  const price = money2(item.price);
  if (price.value === null || price.value <= 0) return null;
  const shipping = item.shippingOptions?.[0];
  const ship = money2(shipping?.shippingCost);
  const cond = ebayCondition(item);
  const lot = /\blots?\b|\bx\s?\d{2,}\b|\d{2,}\s?(pcs|pi[eè]ces|unit[ée]s)\b/i.test(item.title);
  return {
    externalOfferId: item.itemId,
    externalProductId: item.epid ?? null,
    title: item.title,
    price: price.value,
    currency: price.currency,
    // eBay affiche des prix TTC pour les acheteurs particuliers en France (TVA incluse « where applicable »).
    taxType: "unknown",
    shippingCost: ship.value,
    shippingCurrency: ship.currency,
    country: item.itemLocation?.country && /^[A-Z]{2}$/.test(item.itemLocation.country) ? item.itemLocation.country : null,
    url: item.itemWebUrl ?? null,
    condition: cond.condition,
    grade: cond.grade,
    stockStatus: "unknown",
    availableQuantity: null,
    raw: {
      request_url: requestUrl,
      seller: item.seller ?? null,
      condition_label: item.condition ?? null,
      condition_id: item.conditionId ?? null,
      buying_options: item.buyingOptions ?? null,
      shipping_cost_type: shipping?.shippingCostType ?? null,
      is_lot: lot,
      price_basis: "prix affich\xE9 sur eBay (marketplace et livraison France) \u2014 offre publi\xE9e, quantit\xE9 non fournie par la recherche"
    }
  };
}
function ebaySearchUrl(env, rawQuery, settings) {
  const url = new URL(`${apiBase(env)}/buy/browse/v1/item_summary/search`);
  url.searchParams.set("q", rawQuery.trim().slice(0, 100));
  url.searchParams.set("limit", String(settingInt(settings, "limit", EBAY_BROWSE_DEFAULT_LIMIT, 1, 100)));
  const delivery = settingString(settings, "delivery_country") ?? "FR";
  const filters = [`deliveryCountry:${delivery}`, "buyingOptions:{FIXED_PRICE|BEST_OFFER}"];
  const categories = settingString(settings, "category_ids");
  if (categories) url.searchParams.set("category_ids", categories);
  url.searchParams.set("filter", filters.join(","));
  return url.toString();
}
var ebayBrowseAdapter = {
  key: "ebay-browse",
  label: "eBay \u2014 annonces publi\xE9es (API Browse officielle)",
  description: "Recherche les annonces eBay (marketplace FR, livraison en France) via l'API officielle Buy Browse avec les cl\xE9s de l'application du serveur : titre, prix, \xE9tat/grade (programme reconditionn\xE9 eBay), frais de port affich\xE9s, vendeur, lien. La quantit\xE9 disponible n'est pas fournie par la recherche (inconnue).",
  method: "official_api",
  access: "public",
  capabilities: { search: true, catalog: false, stockQuantity: false },
  credentialFields: [],
  configFields: [
    { name: "marketplace", label: "Marketplace eBay", required: false, placeholder: EBAY_BROWSE_DEFAULT_MARKETPLACE },
    { name: "category_ids", label: "Cat\xE9gories eBay (identifiants, facultatif)", required: false }
  ],
  verification: "fixtures",
  async search(config, _query, rawQuery, ctx) {
    const env = ebayEnv();
    if (!env) return failedSearch("official_api", "Cl\xE9s de l'application eBay non configur\xE9es sur le serveur : recherche eBay indisponible.");
    if (!rawQuery.trim()) return failedSearch("official_api", "Requ\xEAte vide.");
    const http = createAdapterHttp(ctx);
    const url = ebaySearchUrl(env, rawQuery, config.settings);
    try {
      const token = await getAppToken(ctx);
      const marketplace = settingString(config.settings, "marketplace") ?? EBAY_BROWSE_DEFAULT_MARKETPLACE;
      const res = await http.request(url, { accept: "application/json", headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": marketplace, "Accept-Language": "fr-FR" } });
      const body = searchResponseSchema.parse(JSON.parse(res.text));
      const offers = [];
      for (const raw of body.itemSummaries ?? []) {
        const parsed = itemSummarySchema.safeParse(raw);
        if (!parsed.success) continue;
        const offer = mapEbayItem(parsed.data, url);
        if (offer) offers.push(offer);
      }
      http.countOffers(offers.length);
      return { offers, method: "official_api", requests: http.requests, error: null, truncated: (body.total ?? 0) > offers.length };
    } catch (e) {
      return failedSearch("official_api", `eBay : ${errorMessage(e)}`, http.requests);
    }
  },
  async testConnection(config, ctx) {
    const r = await ebayBrowseAdapter.search(config, parseQuery2("iphone"), "iphone", ctx);
    return r.error ? { ok: false, message: r.error } : { ok: true, message: `API eBay joignable : ${r.offers.length} annonce(s) pour \xAB iphone \xBB.` };
  }
};

// src/services/sourcing/crawler/robots.ts
function parseRobotsTxt(text2) {
  const groups = [];
  const sitemaps = [];
  let current = null;
  let lastWasAgent = false;
  for (const rawLine of text2.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key2 = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key2 === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key2 === "sitemap") {
      sitemaps.push(value);
      continue;
    }
    if (!current) continue;
    if (key2 === "allow") current.allow.push(value);
    else if (key2 === "disallow") current.disallow.push(value);
    else if (key2 === "crawl-delay") {
      const n = Number(value.replace(",", "."));
      if (Number.isFinite(n) && n >= 0) current.crawlDelay = n;
    }
  }
  return { groups, sitemaps };
}
function patternToRegex(pattern) {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern).split("*").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}
function userAgentToken(userAgent) {
  return (userAgent.split(/[\s/]/)[0] ?? userAgent).toLowerCase();
}
function selectGroup(rules, userAgent) {
  const token = userAgentToken(userAgent);
  let best = null;
  let bestLen = -1;
  for (const g of rules.groups) {
    for (const a of g.agents) {
      if (a !== "*" && token.startsWith(a) && a.length > bestLen) {
        best = g;
        bestLen = a.length;
      }
    }
  }
  if (best) return best;
  return rules.groups.find((g) => g.agents.includes("*")) ?? null;
}
function evaluateRobots(rules, userAgent, path) {
  const group = selectGroup(rules, userAgent);
  if (!group) return { allowed: true, crawlDelay: null, matchedAgent: null, rule: null };
  const p = path.startsWith("/") ? path : `/${path}`;
  let bestLen = -1;
  let allowed = true;
  let rule = null;
  const consider = (patterns, isAllow) => {
    for (const pat of patterns) {
      if (pat === "") continue;
      if (!patternToRegex(pat).test(p)) continue;
      const len = pat.length;
      if (len > bestLen || len === bestLen && isAllow) {
        bestLen = len;
        allowed = isAllow;
        rule = `${isAllow ? "Allow" : "Disallow"}: ${pat}`;
      }
    }
  };
  consider(group.disallow, false);
  consider(group.allow, true);
  return { allowed, crawlDelay: group.crawlDelay, matchedAgent: group.agents[0] ?? null, rule };
}
async function fetchRobots(baseUrl, userAgent, fetchImpl = fetch, timeoutMs = 1e4) {
  const empty = { groups: [], sitemaps: [] };
  let origin;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return { status: "error", rules: empty, httpStatus: null, error: "URL de base invalide." };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${origin}/robots.txt`, { headers: { "User-Agent": userAgent, Accept: "text/plain" }, redirect: "follow", signal: controller.signal });
    if (res.status === 404 || res.status === 410) return { status: "missing", rules: empty, httpStatus: res.status, error: null };
    if (!res.ok) return { status: "error", rules: empty, httpStatus: res.status, error: `robots.txt inaccessible (HTTP ${res.status}).` };
    const text2 = await res.text();
    return { status: "ok", rules: parseRobotsTxt(text2.slice(0, 512 * 1024)), httpStatus: res.status, error: null };
  } catch (e) {
    return { status: "error", rules: empty, httpStatus: null, error: e instanceof Error ? e.message : "Erreur r\xE9seau." };
  } finally {
    clearTimeout(timer);
  }
}
async function checkRobotsForUrls(baseUrl, urls, userAgent, fetchImpl = fetch) {
  const fetched = await fetchRobots(baseUrl, userAgent, fetchImpl);
  if (fetched.status === "error") {
    return { allowed: false, robotsStatus: "error", crawlDelay: null, disallowedUrls: urls, details: fetched.error ?? "robots.txt inaccessible." };
  }
  if (fetched.status === "missing") {
    return { allowed: true, robotsStatus: "missing", crawlDelay: null, disallowedUrls: [], details: "Aucun robots.txt : aucune restriction d\xE9clar\xE9e (les CGU du site restent \xE0 v\xE9rifier)." };
  }
  const disallowed = [];
  let crawlDelay = null;
  for (const u of urls) {
    let path = "/";
    try {
      const parsed = new URL(u);
      path = parsed.pathname + parsed.search;
    } catch {
      disallowed.push(u);
      continue;
    }
    const d = evaluateRobots(fetched.rules, userAgent, path);
    if (d.crawlDelay !== null) crawlDelay = d.crawlDelay;
    if (!d.allowed) disallowed.push(u);
  }
  const group = selectGroup(fetched.rules, userAgent);
  const agent = group?.agents[0] ?? "*";
  return {
    allowed: disallowed.length === 0,
    robotsStatus: "ok",
    crawlDelay,
    disallowedUrls: disallowed,
    details: disallowed.length === 0 ? `robots.txt lu (groupe \xAB ${agent} \xBB) : toutes les URLs sont autoris\xE9es${crawlDelay !== null ? `, d\xE9lai demand\xE9 ${crawlDelay} s` : ""}.` : `robots.txt (groupe \xAB ${agent} \xBB) interdit ${disallowed.length} URL(s) : le crawl est refus\xE9.`
  };
}

// src/integrations/sourcing/sitemap-jsonld/index.ts
var SITEMAP_MAX_CHILDREN = 6;
var SITEMAP_MAX_URLS = 4e4;
var SITEMAP_DEFAULT_PAGES = 3;
var SITEMAP_CACHE_TTL_MS = 6 * 36e5;
var cache2 = /* @__PURE__ */ new Map();
function parseSitemapXml(xml) {
  const kind = /<sitemapindex[\s>]/i.test(xml) ? "index" : /<urlset[\s>]/i.test(xml) ? "urlset" : "unknown";
  const locs = [];
  const re = /<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml)) && locs.length < SITEMAP_MAX_URLS) locs.push(m[1].replace(/&amp;/g, "&"));
  return { kind, locs };
}
function rankChildSitemaps(locs) {
  const skip = /image|video|blog|post|article|news|cms|categor|page-sitemap|tag|author|brand|manufacturer/i;
  const score = (u) => /product|produit|(^|[^a-z])items?([^a-z]|$)/i.test(u) ? 0 : 1;
  return locs.filter((u) => !skip.test(u) && !/\.gz($|\?)/i.test(u)).sort((a, b) => score(a) - score(b));
}
var STOP = /* @__PURE__ */ new Set(["de", "du", "des", "la", "le", "les", "en", "et", "pour", "avec", "go", "gb", "to", "tb", "reconditionne", "reconditionnee", "occasion", "neuf", "grade", "lot", "lots", "gros", "pas", "cher", "prix", "bas"]);
function queryTokens(rawQuery) {
  return [...new Set(normalizeText(rawQuery).split(/[^a-z0-9]+/).filter((t) => t.length >= 2 && !STOP.has(t)))].slice(0, 8);
}
function matchProductUrls(urls, rawQuery, max) {
  const tokens = queryTokens(rawQuery);
  if (tokens.length === 0) return [];
  const need = Math.min(2, tokens.length);
  const scored = [];
  for (const url of urls) {
    let path;
    try {
      path = normalizeText(decodeURIComponent(new URL(url).pathname));
    } catch {
      continue;
    }
    const parts = new Set(path.split(/[^a-z0-9]+/));
    let matched = 0;
    let score = 0;
    for (const t of tokens) {
      if (!parts.has(t)) continue;
      matched += 1;
      score += /^\d+$/.test(t) ? 1.5 : 1;
    }
    if (matched >= need) scored.push({ url, score, len: path.length });
  }
  scored.sort((a, b) => b.score - a.score || a.len - b.len);
  return scored.slice(0, max).map((s) => s.url);
}
async function loadIndex(base, ctx, http, settings) {
  const now = (ctx.now ?? (() => /* @__PURE__ */ new Date()))().getTime();
  const hit = cache2.get(base);
  if (hit && now - hit.at < SITEMAP_CACHE_TTL_MS) return hit;
  let robots = null;
  try {
    const r = await http.request(`${base}/robots.txt`, { accept: "text/plain" });
    robots = parseRobotsTxt(r.text.slice(0, 512 * 1024));
  } catch {
    robots = null;
  }
  const configured = settingString(settings, "sitemap_url");
  const roots = configured ? [configured] : robots?.sitemaps.length ? robots.sitemaps.slice(0, 3) : [`${base}/sitemap.xml`];
  const urls = [];
  const read = [];
  const queue = [...roots];
  while (queue.length > 0 && read.length < SITEMAP_MAX_CHILDREN && urls.length < SITEMAP_MAX_URLS && !http.exhausted()) {
    const sm = queue.shift();
    if (new URL(sm).host !== new URL(base).host) continue;
    const res = await http.request(sm, { accept: "application/xml,text/xml;q=0.9,*/*;q=0.5", maxBytes: 6e6 });
    read.push(sm);
    const parsed = parseSitemapXml(res.text);
    if (parsed.kind === "index") queue.push(...rankChildSitemaps(parsed.locs).slice(0, SITEMAP_MAX_CHILDREN));
    else for (const u of parsed.locs) if (urls.length < SITEMAP_MAX_URLS) urls.push(u);
  }
  const index = { at: now, urls, robots, sitemaps: read };
  if (urls.length > 0) cache2.set(base, index);
  return index;
}
function allowedByRobots(robots, userAgent, url) {
  if (!robots) return true;
  const u = new URL(url);
  return evaluateRobots(robots, userAgent, u.pathname + u.search).allowed;
}
var sitemapJsonLdAdapter = {
  key: "sitemap-jsonld",
  label: "Boutique publique (sitemap + donn\xE9es structur\xE9es)",
  description: "Trouve les fiches produit correspondant \xE0 la recherche dans le plan du site (sitemap publi\xE9 pour les robots), puis lit leurs donn\xE9es structur\xE9es schema.org (prix, devise, disponibilit\xE9, \xE9tat, marque, SKU/GTIN). Chaque URL est v\xE9rifi\xE9e contre robots.txt ; 3 fiches par recherche, une requ\xEAte \xE0 la fois.",
  method: "public_html",
  access: "public",
  capabilities: { search: true, catalog: false, stockQuantity: false },
  credentialFields: [],
  configFields: [
    { name: "sitemap_url", label: "URL du sitemap (facultatif)", required: false, help: "Par d\xE9faut : sitemaps d\xE9clar\xE9s dans robots.txt, sinon /sitemap.xml." },
    { name: "max_pages", label: "Fiches lues par recherche", required: false, placeholder: String(SITEMAP_DEFAULT_PAGES) }
  ],
  searchBudgetMs: 25e3,
  verification: "fixtures",
  urlsForQuery(config) {
    if (!config.baseUrl) return [];
    const base = trimSlash(config.baseUrl);
    return [settingString(config.settings, "sitemap_url") ?? `${base}/sitemap.xml`];
  },
  async search(config, _query, rawQuery, ctx) {
    if (!config.baseUrl) return failedSearch("public_html", "URL de base de la boutique manquante.");
    const base = trimSlash(config.baseUrl);
    const http = createAdapterHttp(ctx);
    try {
      const index = await loadIndex(base, ctx, http, config.settings);
      if (index.urls.length === 0) return failedSearch("public_html", "Plan du site (sitemap) introuvable ou vide : la boutique n'est pas interrogeable de cette fa\xE7on.", http.requests);
      const max = settingInt(config.settings, "max_pages", SITEMAP_DEFAULT_PAGES, 1, 6);
      const candidates = matchProductUrls(index.urls, rawQuery, max * 2).filter((u) => new URL(u).host === new URL(base).host && allowedByRobots(index.robots, ctx.userAgent, u));
      if (candidates.length === 0) return { offers: [], method: "public_html", requests: http.requests, error: null, truncated: false };
      const offers = [];
      let pages = 0;
      for (const url of candidates) {
        if (pages >= max || http.exhausted()) break;
        try {
          const res = await http.request(url, { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", maxBytes: 4e6 });
          pages += 1;
          const found = parseJsonLdPage(res.text, res.finalUrl || url).map((o) => mapJsonLdOffer(o, config, res.finalUrl || url));
          http.countOffers(found.length);
          offers.push(...found);
        } catch {
          pages += 1;
        }
      }
      return { offers, method: "public_html", requests: http.requests, error: null, truncated: candidates.length > pages };
    } catch (e) {
      return failedSearch("public_html", errorMessage(e), http.requests);
    }
  },
  async testConnection(config, ctx) {
    const r = await sitemapJsonLdAdapter.search(config, parseQuery2("iphone"), "iphone", ctx);
    return r.error ? { ok: false, message: r.error } : { ok: true, message: `${r.offers.length} offre(s) structur\xE9e(s) lue(s) pour \xAB iphone \xBB.` };
  }
};

// src/integrations/sourcing/registry.ts
var SOURCE_ADAPTERS = [jsonLdPublicAdapter, shopifyStorefrontAdapter, wooCommerceStoreAdapter, googleMerchantFeedAdapter, bigbuyAdapter, ingramMicroAdapter, ebayBrowseAdapter, sitemapJsonLdAdapter];
function listSourceAdapters() {
  return SOURCE_ADAPTERS;
}
function getSourceAdapter(key2) {
  if (!key2) return null;
  return SOURCE_ADAPTERS.find((a) => a.key === key2) ?? null;
}
function listAccountAdapters() {
  return SOURCE_ADAPTERS.filter((a) => a.access === "account");
}
function listAdapterHtmlParsers() {
  const out = [];
  for (const a of SOURCE_ADAPTERS) {
    if (a.htmlParser && !out.some((p) => p.key === a.htmlParser.key)) out.push(a.htmlParser);
  }
  return out;
}

// src/services/sourcing/adapter-runtime.ts
function configObject(config) {
  return config && typeof config === "object" && !Array.isArray(config) ? config : {};
}
function adapterKeyOf(config) {
  const c = configObject(config);
  return typeof c.adapter === "string" && c.adapter.trim() ? c.adapter.trim() : null;
}
function adapterConfigFromSource(row) {
  const settings = { ...configObject(row.config) };
  if (typeof settings.max_pages === "string") {
    const n = Number(settings.max_pages);
    if (Number.isFinite(n)) settings.max_pages = n;
  }
  return {
    baseUrl: row.base_url ? row.base_url.replace(/\/+$/, "") : null,
    settings,
    defaultCurrency: row.default_currency,
    defaultTaxType: row.default_tax_type,
    defaultCountry: row.country
  };
}
var MAX_PAYLOAD_JSON = 8e3;
function boundedPayload(raw) {
  if (raw === void 0 || raw === null) return null;
  try {
    const json2 = JSON.stringify(raw);
    if (json2.length <= MAX_PAYLOAD_JSON) return raw;
    return { truncated: true, excerpt: json2.slice(0, MAX_PAYLOAD_JSON) };
  } catch {
    return null;
  }
}
function withProvenance(offer, p) {
  const requestUrl = p.requestUrl ?? (offer.raw && typeof offer.raw === "object" && typeof offer.raw.request_url === "string" ? offer.raw.request_url : null);
  return {
    ...offer,
    url: offer.url ?? p.sourceUrl ?? null,
    raw: {
      provenance: { adapter: p.adapterKey, adapter_key: p.adapterKey, method: p.method, retrieved_at: p.retrievedAt, request_url: requestUrl, source_url: offer.url ?? p.sourceUrl ?? null },
      payload: boundedPayload(offer.raw)
    }
  };
}
var METHODS = /* @__PURE__ */ new Set(["public_html", "public_json", "public_feed", "official_api", "supplier_account", "manual"]);
function parseStoredProvenance(raw) {
  const r = configObject(raw);
  const p = configObject(r.provenance ?? r._provenance);
  if (Object.keys(p).length === 0) return null;
  const str3 = (v2) => typeof v2 === "string" && v2.trim() ? v2 : null;
  const method = str3(p.method);
  const adapterKey = str3(p.adapter_key) ?? str3(p.adapterKey) ?? str3(p.adapter);
  if (!method && !adapterKey) return null;
  return { method: method && METHODS.has(method) ? method : null, adapterKey, retrievedAt: str3(p.retrieved_at) ?? str3(p.retrievedAt), requestUrl: str3(p.request_url) ?? str3(p.requestUrl) };
}
function hostOf(url) {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}
var defaultSleep2 = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var HostScheduler = class {
  constructor(minDelayMs, sleep3 = defaultSleep2, clock = () => Date.now()) {
    this.minDelayMs = minDelayMs;
    this.sleep = sleep3;
    this.clock = clock;
  }
  minDelayMs;
  sleep;
  clock;
  chains = /* @__PURE__ */ new Map();
  lastAt = /* @__PURE__ */ new Map();
  async run(host, fn) {
    const previous = this.chains.get(host) ?? Promise.resolve();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    this.chains.set(host, previous.then(() => gate));
    await previous;
    try {
      const last = this.lastAt.get(host);
      if (last !== void 0) {
        const wait = this.minDelayMs - (this.clock() - last);
        if (wait > 0) await this.sleep(wait);
      }
      this.lastAt.set(host, this.clock());
      return await fn();
    } finally {
      release();
    }
  }
  /** fetch sérialisé par hôte (passé aux adaptateurs via ctx.fetchImpl). */
  wrapFetch(fetchImpl = fetch) {
    const wrapped = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      return this.run(hostOf(url) ?? "unknown", () => fetchImpl(input, init));
    };
    return wrapped;
  }
};

// src/services/sourcing/status-summary.ts
var FEED_TYPES = /* @__PURE__ */ new Set(["CSV", "XML", "JSON"]);
function isConnectedSource(s) {
  if (s.connectionStatus !== null && s.connectionStatus !== "connected") return false;
  return s.attested && s.status === "active";
}
function isUsableNow(s, adapters) {
  if (s.status === "paused") return false;
  if (s.discovered && !s.attested) return false;
  const a = s.adapterKey ? adapters.get(s.adapterKey) : void 0;
  if (!a || !a.search) return false;
  if (a.access === "account") return s.connectionStatus === "connected";
  const needsAttestation = a.method === "public_html" || a.method === "public_json";
  if (needsAttestation && !s.attested) return false;
  if (needsAttestation && s.robotsAllowed === false) return false;
  return true;
}
function requiresAccount(s, adapters) {
  if (s.sourceType === "SUPPLIER_ACCOUNT") return true;
  const a = s.adapterKey ? adapters.get(s.adapterKey) : void 0;
  if (a?.access === "account") return true;
  return s.discovered && (s.discoveredAccess === "account" || s.discoveredAccess === "protected");
}
function usesApiOrFeed(s, adapters) {
  if (FEED_TYPES.has(s.sourceType) || s.sourceType === "API") return true;
  const a = s.adapterKey ? adapters.get(s.adapterKey) : void 0;
  return a?.method === "official_api" || a?.method === "public_feed";
}
function computeSourcingStatus(input) {
  const adapters = new Map(input.adapters.map((a) => [a.key, a]));
  const connected = input.sources.filter(isConnectedSource);
  const liveVerified = input.adapters.filter((a) => a.verification === "live").length;
  const count = (list, pred) => list.filter(pred).length;
  const orphans = input.orphanConnections ?? [];
  return [
    { key: "documented", scope: "catalog", label: "Document\xE9es", value: input.catalog.length, detail: null, definition: "Sources d\xE9crites dans le catalogue (docs/sourcing-sources.md) d'apr\xE8s leur documentation publique. Document\xE9 \u2260 v\xE9rifi\xE9 : rien n'a \xE9t\xE9 interrog\xE9." },
    { key: "verified", scope: "catalog", label: "Fiches v\xE9rifi\xE9es", value: count(input.catalog, (c) => c.status === "verified_official_snippets"), detail: `${count(input.catalog, (c) => c.accountRequired === true)} exigent un compte`, definition: "Fiches confirm\xE9es par des extraits du domaine officiel (pages non ouvertes, r\xE9seau bloqu\xE9 lors de la recherche). V\xE9rifi\xE9 \u2260 connect\xE9." },
    { key: "adapters", scope: "catalog", label: "Adaptateurs disponibles", value: input.adapters.length, detail: `${liveVerified} test\xE9(s) en conditions r\xE9elles, ${input.adapters.length - liveVerified} sur fixtures uniquement`, definition: "Adaptateurs impl\xE9ment\xE9s dans le registre (src/integrations/sourcing/registry.ts) : le code sait lire ce format, ce qui ne connecte aucune source." },
    { key: "connected", scope: "organization", label: "Sources connect\xE9es", value: connected.length, detail: null, definition: "Sources de votre organisation attest\xE9es (acc\xE8s automatis\xE9 confirm\xE9 par vous, ou compte fournisseur connect\xE9) ET actives. Connect\xE9 \u2260 offre disponible." },
    { key: "with_prices", scope: "organization", label: "Avec prix", value: count(connected, (s) => (input.offersBySource.get(s.id)?.withPrice ?? 0) > 0), detail: null, definition: "Sources connect\xE9es ayant au moins une offre active avec prix r\xE9ellement enregistr\xE9e (offre disponible)." },
    { key: "with_stock", scope: "organization", label: "Avec stock", value: count(connected, (s) => (input.offersBySource.get(s.id)?.withStock ?? 0) > 0), detail: null, definition: "Sources connect\xE9es ayant au moins une offre active dont le stock (quantit\xE9 ou statut) est communiqu\xE9 par la source." },
    { key: "account_required", scope: "organization", label: "Compte requis", value: count(input.sources, (s) => requiresAccount(s, adapters)) + orphans.length, detail: null, definition: "Sources de votre organisation qui exigent un compte fournisseur (connecteur \xAB compte \xBB, source d\xE9couverte \xAB Compte requis / prot\xE9g\xE9 \xBB). Aucun contournement de connexion n'est effectu\xE9." },
    { key: "api_or_feed", scope: "organization", label: "API / flux", value: count(connected, (s) => usesApiOrFeed(s, adapters)), detail: null, definition: "Sources connect\xE9es via une API officielle ou un flux (CSV / XML / JSON / Google Merchant)." },
    { key: "usable_now", scope: "organization", label: "Utilisables imm\xE9diatement", value: count(input.sources, (s) => isUsableNow(s, adapters)), detail: null, definition: "Sources interrogeables en direct d\xE8s maintenant : adaptateur avec recherche, attestation et robots.txt non bloquant (public), ou compte connect\xE9 et test\xE9." }
  ];
}

// src/features/sourcing/status-queries.ts
var STATUS_COUNT_CONCURRENCY = 8;
async function countOfferStatsBySource(supabase, organizationId, sourceIds, concurrency = STATUS_COUNT_CONCURRENCY) {
  const ids = [...new Set(sourceIds)];
  const out = { stats: /* @__PURE__ */ new Map(), failedSourceIds: [] };
  const base = (sourceId) => supabase.from("sourcing_offers").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("source_id", sourceId).eq("status", "active");
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const sourceId = ids[next++];
      const [withPrice, withStock] = await Promise.all([base(sourceId).gt("original_price", 0), base(sourceId).or("available_quantity.not.is.null,stock_status.neq.unknown")]);
      if (withPrice.error || withStock.error || withPrice.count === null || withStock.count === null) {
        out.failedSourceIds.push(sourceId);
        continue;
      }
      out.stats.set(sourceId, { withPrice: withPrice.count, withStock: withStock.count });
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), ids.length) }, worker));
  return out;
}
async function loadSourcingStatus(ctx) {
  const orgId = ctx.organization.id;
  const [{ data: sources }, { data: connections }] = await Promise.all([
    ctx.supabase.from("supplier_sources").select("id, source_type, status, automated_access_confirmed, robots_allowed, config").eq("organization_id", orgId).limit(1e3),
    ctx.supabase.from("supplier_connections").select("id, connector_key, status, source_id").eq("organization_id", orgId).limit(200)
  ]);
  const connectionBySource = /* @__PURE__ */ new Map();
  const orphanConnections = [];
  for (const c of connections ?? []) {
    if (c.status === "disconnected") continue;
    if (c.source_id) connectionBySource.set(c.source_id, c);
    else orphanConnections.push({ connectorKey: c.connector_key, status: c.status });
  }
  const sourceInputs = (sources ?? []).map((s) => {
    const cfg = s.config ?? {};
    const conn = connectionBySource.get(s.id) ?? null;
    return {
      id: s.id,
      sourceType: s.source_type,
      status: s.status,
      attested: s.automated_access_confirmed,
      robotsAllowed: s.robots_allowed,
      adapterKey: conn?.connector_key ?? adapterKeyOf(s.config),
      discovered: cfg.discovered === true,
      discoveredAccess: typeof cfg.access === "string" ? cfg.access : null,
      connectionStatus: conn?.status ?? null
    };
  });
  const counts = await countOfferStatsBySource(ctx.supabase, orgId, sourceInputs.filter(isConnectedSource).map((s) => s.id));
  const items = computeSourcingStatus({
    catalog: listCatalogSources(),
    adapters: listSourceAdapters().map((a) => ({ key: a.key, access: a.access, method: a.method, verification: a.verification, search: a.capabilities.search })),
    sources: sourceInputs,
    orphanConnections,
    offersBySource: counts.stats
  });
  return { items, offerCountsIncomplete: counts.failedSourceIds.length > 0 };
}

// src/features/sourcing/schemas.ts
import { z as z21 } from "npm:zod@4.6.5";
var optionalText2 = z21.string().trim().max(120).optional();
var optionalMoney2 = z21.union([z21.literal(""), z21.coerce.number().min(0)]).optional();
var optionalInt2 = z21.union([z21.literal(""), z21.coerce.number().int().min(0)]).optional();
var SOURCE_TYPES = ["PUBLIC_WEB", "API", "CSV", "XML", "JSON", "SUPPLIER_ACCOUNT", "MANUAL", "PARTNER_FEED"];
var sourcingSearchParamsSchema = z21.object({
  q: z21.string().trim().max(200).optional(),
  sku: z21.string().trim().max(64).optional(),
  category: optionalText2,
  brand: optionalText2,
  model: optionalText2,
  storage: optionalText2,
  color: optionalText2,
  condition: z21.enum(["new", "refurbished", "used"]).optional(),
  grade: z21.string().trim().max(5).optional(),
  qty: z21.coerce.number().int().min(1).optional(),
  max_price: z21.coerce.number().positive().optional(),
  country: z21.string().trim().max(60).optional(),
  max_delivery: z21.coerce.number().int().min(0).optional(),
  max_moq: z21.coerce.number().int().min(1).optional(),
  tax: z21.enum(["ht", "ttc"]).optional(),
  supplier: z21.string().uuid().optional(),
  source: z21.enum(SOURCE_TYPES).optional(),
  availability: z21.enum(["in_stock", "any"]).optional(),
  sort: z21.enum(RANKING_MODES).default("best_offer"),
  page: z21.coerce.number().int().min(1).default(1),
  /** live=0 : recherche dans les offres enregistrées uniquement (sans interroger les sources) */
  live: z21.enum(["0", "1"]).optional()
});
function parseCountries(text2) {
  if (!text2) return void 0;
  const list = text2.split(/[,\s;]+/).map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c));
  return list.length > 0 ? Array.from(new Set(list)) : void 0;
}
function toOfferFilters(p) {
  const clean = (s) => s && s.length > 0 ? s : void 0;
  return {
    category: clean(p.category),
    brand: clean(p.brand),
    model: clean(p.model),
    storage: clean(p.storage),
    color: clean(p.color),
    condition: p.condition,
    grade: clean(p.grade),
    quantity: p.qty,
    maxPrice: p.max_price,
    countries: parseCountries(p.country),
    maxDeliveryDays: p.max_delivery,
    maxMoq: p.max_moq,
    taxType: p.tax,
    supplierId: p.supplier,
    sourceType: p.source,
    availability: p.availability,
    sort: p.sort,
    page: p.page
  };
}
var alertFormSchema = z21.object({
  alert_id: z21.string().uuid().optional().or(z21.literal("")),
  name: z21.string().trim().min(1, "Le nom de l'alerte est requis.").max(120),
  query_text: z21.string().trim().min(1, "Indiquez le produit recherch\xE9.").max(200),
  max_price: optionalMoney2,
  min_quantity: optionalInt2,
  countries: z21.string().trim().max(60).optional().or(z21.literal("")),
  max_moq: z21.union([z21.literal(""), z21.coerce.number().int().min(1)]).optional(),
  grades: z21.string().trim().max(40).optional().or(z21.literal("")),
  condition: z21.enum(["", "new", "refurbished", "used"]).optional(),
  max_delivery_days: optionalInt2,
  sku_id: z21.string().uuid().optional().or(z21.literal(""))
});
var matchDecisionSchema = z21.object({ match_id: z21.string().uuid(), decision: z21.enum(["confirm", "reject"]) });
var linkOfferSchema = z21.object({ offer_id: z21.string().uuid(), sku_id: z21.string().uuid("Choisissez un SKU.") });
var offerStatusSchema = z21.object({ offer_id: z21.string().uuid(), status: z21.enum(["rejected", "active"]) });

// src/services/sourcing/offer-query.ts
var OFFER_SELECT = "*, supplier:suppliers(id, name, country, internal_score, average_lead_time_days, currency), source:supplier_sources(id, name, source_type, status, last_successful_sync_at, automated_access_confirmed, config)";
var OFFER_FETCH_LIMIT = 500;
function baseOfferQuery(client, organizationId, filters, skuIdsForCategory) {
  let q = client.from("sourcing_offers").select(OFFER_SELECT).eq("organization_id", organizationId).eq("status", "active");
  if (filters.brand) q = q.ilike("brand", escapeLike(filters.brand));
  if (filters.model) q = q.ilike("model", `%${escapeLike(filters.model)}%`);
  if (filters.storage) q = q.ilike("storage", escapeLike(filters.storage));
  if (filters.color) q = q.ilike("color", escapeLike(filters.color));
  if (filters.condition) q = q.eq("condition", filters.condition);
  if (filters.grade) q = q.ilike("grade", escapeLike(filters.grade));
  if (filters.grades && filters.grades.length > 0) q = q.in("grade", filters.grades.map((g) => g.toUpperCase()));
  if (filters.maxPrice !== void 0) q = q.lte("normalized_price", filters.maxPrice);
  if (filters.countries && filters.countries.length > 0) q = q.in("country", filters.countries.map((c) => c.toUpperCase()));
  if (filters.maxDeliveryDays !== void 0) q = q.lte("delivery_max_days", filters.maxDeliveryDays);
  if (filters.maxMoq !== void 0) q = q.or(`moq.lte.${filters.maxMoq},moq.is.null`);
  if (filters.minQuantity !== void 0) q = q.gte("available_quantity", filters.minQuantity);
  if (filters.taxType) q = q.eq("tax_type", filters.taxType);
  if (filters.supplierId) q = q.eq("supplier_id", filters.supplierId);
  if (filters.sourceType) q = q.eq("source_type", filters.sourceType);
  if (filters.availability === "in_stock") q = q.in("stock_status", ["in_stock", "low"]);
  if (skuIdsForCategory) q = skuIdsForCategory.length > 0 ? q.in("sku_id", skuIdsForCategory.slice(0, 1e3)) : q.eq("id", "00000000-0000-0000-0000-000000000000");
  return q;
}
async function findOffers(client, organizationId, parsed, filters, options = {}) {
  const skuIds = options.skuIdsForCategory ?? null;
  const build = () => baseOfferQuery(client, organizationId, filters, skuIds);
  const run = async (q) => {
    const { data, error } = await q.order("normalized_price", { ascending: true, nullsFirst: false }).limit(OFFER_FETCH_LIMIT);
    if (error) throw error;
    return data ?? [];
  };
  let offers = [];
  let stage = "none";
  if (parsed.ean) {
    offers = await run(build().eq("ean", parsed.ean));
    stage = "identifier";
  }
  if (offers.length === 0 && parsed.mpn && parsed.kind === "mpn") {
    offers = await run(build().ilike("mpn", escapeLike(parsed.mpn)));
    stage = "identifier";
  }
  if (offers.length === 0 && parsed.criteria.model && parsed.criteria.brand) {
    let q = build().eq("brand", parsed.criteria.brand).eq("model", parsed.criteria.model);
    if (parsed.criteria.storage && !filters.storage) q = q.eq("storage", parsed.criteria.storage);
    if (parsed.criteria.color && !filters.color) q = q.eq("color", parsed.criteria.color);
    if (parsed.criteria.grade && !filters.grade) q = q.eq("grade", parsed.criteria.grade);
    if (parsed.criteria.condition !== "unknown" && !filters.condition) q = q.eq("condition", parsed.criteria.condition);
    offers = await run(q);
    stage = "structured";
  }
  if (offers.length === 0 && parsed.tokens.length > 0) {
    let q = build();
    for (const t of parsed.tokens.slice(0, 8)) q = q.ilike("title_original", `%${escapeLike(t)}%`);
    offers = await run(q);
    stage = "text";
  }
  const hasFilters = Object.entries(filters).some(([k, v2]) => !["sort", "page"].includes(k) && v2 !== void 0 && v2 !== "" && !(Array.isArray(v2) && v2.length === 0));
  if (offers.length === 0 && parsed.kind === "empty" && hasFilters) {
    offers = await run(build());
    stage = "filters_only";
  }
  if (options.includeSkuId) {
    const linked = await run(build().eq("sku_id", options.includeSkuId));
    const ids = new Set(offers.map((o) => o.id));
    for (const o of linked) if (!ids.has(o.id)) offers.push(o);
    if (stage === "none" && linked.length > 0) stage = "identifier";
  }
  return { offers, stage };
}

// src/domain/sourcing/pricing.ts
function round22(n) {
  return Math.round(n * 100) / 100;
}
function round4(n) {
  return Math.round(n * 1e4) / 1e4;
}
function toHt(ttc, vatRatePercent) {
  return round4(ttc / (1 + vatRatePercent / 100));
}
function toTtc(ht, vatRatePercent) {
  return round4(ht * (1 + vatRatePercent / 100));
}
function normalizeTax(amount, taxType, target, vatRatePercent) {
  if (taxType === "unknown") return { amount, taxType: "unknown", converted: false, note: "HT/TTC non communiqu\xE9 : prix affich\xE9 tel quel" };
  if (taxType === target) return { amount, taxType: target, converted: false, note: null };
  if (vatRatePercent === null || !Number.isFinite(vatRatePercent)) return { amount, taxType, converted: false, note: "Taux de TVA non renseign\xE9 dans les param\xE8tres : conversion HT/TTC impossible" };
  const converted = target === "ht" ? toHt(amount, vatRatePercent) : toTtc(amount, vatRatePercent);
  return { amount: converted, taxType: target, converted: true, note: `Converti ${taxType.toUpperCase()} \u2192 ${target.toUpperCase()} avec une TVA de ${vatRatePercent} %` };
}
function comparablePrice(input) {
  const minimumUnits = input.moq && input.moq > 0 ? input.moq : 1;
  const byMoq = round22(input.unitPrice * minimumUnits);
  const mov = input.minimumOrderValue ?? 0;
  const minimumOrderValue = Math.max(byMoq, mov);
  return { unitPrice: input.unitPrice, minimumUnits, minimumOrderValue: round22(minimumOrderValue), constrainedByOrderValue: mov > byMoq };
}
var STALE_HOURS = 48;
var VERY_STALE_DAYS = 7;
function freshness(lastSeenAt, now = /* @__PURE__ */ new Date()) {
  if (!lastSeenAt) return { label: "Date de v\xE9rification inconnue", ageHours: null, stale: true, veryStale: true, warning: "Donn\xE9e potentiellement obsol\xE8te" };
  const d = typeof lastSeenAt === "string" ? new Date(lastSeenAt) : lastSeenAt;
  if (Number.isNaN(d.getTime())) return { label: "Date de v\xE9rification inconnue", ageHours: null, stale: true, veryStale: true, warning: "Donn\xE9e potentiellement obsol\xE8te" };
  const ms = Math.max(0, now.getTime() - d.getTime());
  const ageHours = ms / 36e5;
  const minutes = Math.round(ms / 6e4);
  let rel;
  if (minutes < 1) rel = "\xE0 l'instant";
  else if (minutes < 60) rel = `il y a ${minutes} minute${minutes > 1 ? "s" : ""}`;
  else if (ageHours < 24) {
    const h = Math.round(ageHours);
    rel = `il y a ${h} heure${h > 1 ? "s" : ""}`;
  } else {
    const days = Math.round(ageHours / 24);
    rel = `il y a ${days} jour${days > 1 ? "s" : ""}`;
  }
  const veryStale = ageHours > VERY_STALE_DAYS * 24;
  const stale = ageHours > STALE_HOURS;
  return { label: `V\xE9rifi\xE9 ${rel}`, ageHours: Math.round(ageHours * 10) / 10, stale, veryStale, warning: veryStale ? "Prix potentiellement obsol\xE8te" : stale ? "Donn\xE9e potentiellement obsol\xE8te" : null };
}

// src/domain/sourcing/validation.ts
var ANOMALY_LABEL = {
  title_missing: "Titre manquant",
  price_missing: "Prix manquant",
  price_zero: "Prix \xE0 0 (ignor\xE9, prix pr\xE9c\xE9dent conserv\xE9)",
  price_negative: "Prix n\xE9gatif",
  price_too_low: "Prix anormalement bas par rapport \xE0 l'historique",
  price_too_high: "Prix anormalement \xE9lev\xE9 par rapport \xE0 l'historique",
  negative_stock: "Stock n\xE9gatif",
  moq_invalid: "MOQ incoh\xE9rent",
  currency_unknown: "Devise inconnue",
  url_invalid: "URL invalide"
};
var PRICE_LOW_RATIO = 0.3;
var PRICE_HIGH_RATIO = 3;
var MOQ_MAX = 1e6;
function median(values) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}
function isValidHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
function validateOffer(offer, history = { previousPrice: null, prices30d: [] }) {
  const anomalies = [];
  const add = (code, severity, extra) => anomalies.push({ code, severity, message: extra ? `${ANOMALY_LABEL[code]} : ${extra}` : ANOMALY_LABEL[code] });
  if (!offer.title || offer.title.trim().length === 0) add("title_missing", "blocking");
  const currency = offer.currency?.trim().toUpperCase() ?? "";
  if (!currency || !ISO_4217.has(currency)) add("currency_unknown", "blocking", currency ? `\xAB ${currency} \xBB n'est pas un code ISO 4217 connu` : "aucune devise fournie");
  let effectivePrice = null;
  let priceRejected = false;
  if (offer.price === null || !Number.isFinite(offer.price)) {
    if (history.previousPrice !== null) {
      effectivePrice = history.previousPrice;
      priceRejected = true;
      add("price_missing", "warning", "prix pr\xE9c\xE9dent conserv\xE9");
    } else {
      add("price_missing", "blocking");
    }
  } else if (offer.price < 0) {
    add("price_negative", history.previousPrice !== null ? "warning" : "blocking");
    effectivePrice = history.previousPrice;
    priceRejected = true;
  } else if (offer.price === 0) {
    add("price_zero", history.previousPrice !== null ? "warning" : "blocking");
    effectivePrice = history.previousPrice;
    priceRejected = true;
  } else {
    effectivePrice = offer.price;
    const med = median(history.prices30d);
    if (med !== null && med > 0 && history.prices30d.length >= 2) {
      if (offer.price < med * PRICE_LOW_RATIO) add("price_too_low", "warning", `${offer.price} contre une m\xE9diane de ${med.toFixed(2)} sur 30 jours`);
      else if (offer.price > med * PRICE_HIGH_RATIO) add("price_too_high", "warning", `${offer.price} contre une m\xE9diane de ${med.toFixed(2)} sur 30 jours`);
    }
  }
  let effectiveQuantity = offer.availableQuantity;
  if (offer.availableQuantity !== null && (offer.availableQuantity < 0 || !Number.isFinite(offer.availableQuantity))) {
    add("negative_stock", "warning", String(offer.availableQuantity));
    effectiveQuantity = null;
  } else if (effectiveQuantity !== null) {
    effectiveQuantity = Math.floor(effectiveQuantity);
  }
  let effectiveMoq = offer.moq;
  if (offer.moq !== null && (!Number.isFinite(offer.moq) || offer.moq < 1 || offer.moq > MOQ_MAX || !Number.isInteger(offer.moq))) {
    add("moq_invalid", "warning", String(offer.moq));
    effectiveMoq = null;
  }
  let effectiveUrl = offer.sourceUrl?.trim() || null;
  if (effectiveUrl && !isValidHttpUrl(effectiveUrl)) {
    add("url_invalid", "warning", effectiveUrl.slice(0, 80));
    effectiveUrl = null;
  }
  const blocking = anomalies.some((a) => a.severity === "blocking");
  const valid = !blocking && effectivePrice !== null;
  const status = anomalies.length > 0 ? "suspicious" : "active";
  return {
    valid,
    anomalies,
    anomalyCodes: anomalies.map((a) => a.code),
    status,
    effectivePrice,
    priceRejected,
    effectiveQuantity,
    effectiveMoq,
    effectiveUrl
  };
}

// src/domain/sourcing/dedupe.ts
function better(a, b) {
  if (a.comparablePrice !== null && b.comparablePrice === null) return true;
  if (a.comparablePrice === null && b.comparablePrice !== null) return false;
  if (a.comparablePrice !== null && b.comparablePrice !== null && a.comparablePrice !== b.comparablePrice) return a.comparablePrice < b.comparablePrice;
  const ta = a.lastSeenAt ? Date.parse(a.lastSeenAt) : 0;
  const tb = b.lastSeenAt ? Date.parse(b.lastSeenAt) : 0;
  return ta > tb;
}
function dedupeKey(c) {
  return c.productKey ? `${c.supplierId}|${c.productKey}` : null;
}
function dedupeOffers(items) {
  const best = /* @__PURE__ */ new Map();
  const counts = /* @__PURE__ */ new Map();
  const order = [];
  for (const item of items) {
    const key2 = dedupeKey(item);
    if (!key2) {
      order.push(item);
      continue;
    }
    const current = best.get(key2);
    if (!current) {
      best.set(key2, item);
      order.push(key2);
      continue;
    }
    counts.set(key2, (counts.get(key2) ?? 0) + 1);
    if (better(item, current)) best.set(key2, item);
  }
  const kept = [];
  const collapsed = /* @__PURE__ */ new Map();
  for (const entry of order) {
    if (typeof entry === "string") {
      const item = best.get(entry);
      kept.push(item);
      const n = counts.get(entry) ?? 0;
      if (n > 0) collapsed.set(item.id, n);
    } else kept.push(entry);
  }
  return { kept, collapsed };
}

// src/services/sourcing/ecb-parser.ts
import { XMLParser as XMLParser4 } from "npm:fast-xml-parser@5.11.2";
import { z as z22 } from "npm:zod@4.6.5";
var cubeSchema = z22.object({ "@_currency": z22.string().length(3), "@_rate": z22.coerce.number().positive() });
function parseEcbXml(xml) {
  const parser2 = new XMLParser4({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true });
  const doc = parser2.parse(xml);
  const envelope = doc.Envelope ?? doc;
  const outer = envelope.Cube;
  const dated = outer?.Cube;
  const day = Array.isArray(dated) ? dated[0] : dated;
  if (!day || typeof day !== "object") throw new Error("Flux BCE illisible : structure Cube absente.");
  const date = String(day["@_time"] ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Flux BCE illisible : date absente.");
  const inner = day.Cube;
  const list = Array.isArray(inner) ? inner : inner ? [inner] : [];
  const rates = { EUR: 1 };
  for (const c of list) {
    const parsed = cubeSchema.safeParse(c);
    if (parsed.success) rates[parsed.data["@_currency"].toUpperCase()] = parsed.data["@_rate"];
  }
  if (Object.keys(rates).length <= 1) throw new Error("Flux BCE illisible : aucun taux.");
  return { date, rates };
}
function crossRate(rates, from, to) {
  const f = rates[from.toUpperCase()];
  const t = rates[to.toUpperCase()];
  if (!f || !t) return null;
  return Math.round(t / f * 1e6) / 1e6;
}

// src/services/sourcing/fx-rates.ts
var log5 = createLogger("FX_RATES");
var ECB_DAILY_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
var CACHE_TTL_MS = 60 * 60 * 1e3;
var cache3 = null;
async function refreshFxRates(options = {}) {
  const doFetch = options.fetchImpl ?? fetch;
  const res = await doFetch(ECB_DAILY_URL, { headers: { Accept: "application/xml,text/xml", ...options.userAgent ? { "User-Agent": options.userAgent } : {} } });
  if (!res.ok) throw new Error(`BCE : HTTP ${res.status}`);
  const xml = await res.text();
  const parsed = parseEcbXml(xml);
  const admin = createAdminSupabaseClient();
  const rows = Object.entries(parsed.rates).filter(([cur]) => cur !== "EUR").map(([cur, rate]) => ({ base_currency: "EUR", quote_currency: cur, rate, rate_date: parsed.date, source: "ecb", fetched_at: (/* @__PURE__ */ new Date()).toISOString() }));
  const { error } = await admin.from("fx_rates").upsert(rows, { onConflict: "base_currency,quote_currency,rate_date" });
  if (error) throw new Error(`fx_rates : ${error.message}`);
  cache3 = { loadedAt: Date.now(), date: parsed.date, rates: parsed.rates };
  log5.info("fx rates refreshed", { date: parsed.date, count: rows.length });
  return { date: parsed.date, count: rows.length };
}
async function loadLatestRates() {
  if (cache3 && Date.now() - cache3.loadedAt < CACHE_TTL_MS) return { date: cache3.date, rates: cache3.rates };
  const admin = createAdminSupabaseClient();
  const { data: latest } = await admin.from("fx_rates").select("rate_date").eq("base_currency", "EUR").order("rate_date", { ascending: false }).limit(1).maybeSingle();
  if (!latest) return null;
  const { data: rows } = await admin.from("fx_rates").select("quote_currency, rate").eq("base_currency", "EUR").eq("rate_date", latest.rate_date);
  const rates = { EUR: 1 };
  for (const r of rows ?? []) rates[r.quote_currency.toUpperCase()] = Number(r.rate);
  cache3 = { loadedAt: Date.now(), date: latest.rate_date, rates };
  return { date: latest.rate_date, rates };
}
async function getFxRate(from, to) {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return { rate: 1, date: null };
  const latest = await loadLatestRates();
  if (!latest) return null;
  const rate = crossRate(latest.rates, f, t);
  return rate === null ? null : { rate, date: latest.date };
}

// src/domain/sourcing/matching.ts
var MATCH_HIGH_THRESHOLD = 0.9;
var MATCH_AMBIGUOUS_THRESHOLD = 0.6;
function cleanId2(s) {
  return (s ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
}
function levelOf(confidence) {
  if (confidence >= MATCH_HIGH_THRESHOLD) return "high";
  if (confidence >= MATCH_AMBIGUOUS_THRESHOLD) return "ambiguous";
  return null;
}
function tokenSet(s) {
  return new Set(
    normalizeText(s).split(" ").filter((t) => t.length >= 2 && !NOISE_TOKENS.has(t))
  );
}
function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}
function normalizeCandidate(c) {
  return normalizeProduct(`${c.brand ?? ""} ${c.productName} ${c.variantName ?? ""}`, {
    brand: c.brand,
    storage: c.attributes.storage ?? null,
    color: c.attributes.color ?? null,
    grade: c.attributes.grade ?? c.grade ?? null,
    condition: c.condition,
    ean: c.ean,
    mpn: c.mpn
  });
}
function compareAttributes(o, c) {
  let score = 0;
  let cap2 = 0.95;
  const reasons = [];
  const UNKNOWN_CAP = MATCH_HIGH_THRESHOLD - 0.01;
  const cmp = (label, a, b, equalPts, unknownPts, mismatchCap, unknownCap) => {
    if (a && b) {
      if (a === b) {
        score += equalPts;
        reasons.push(`${label} identique (${a})`);
      } else {
        cap2 = Math.min(cap2, mismatchCap);
        reasons.push(`${label} diff\xE9rent (${a} vs ${b})`);
      }
    } else {
      score += unknownPts;
      cap2 = Math.min(cap2, unknownCap);
      reasons.push(`${label} non renseign\xE9${!a && !b ? " des deux c\xF4t\xE9s" : !a ? " c\xF4t\xE9 offre" : " c\xF4t\xE9 SKU"}`);
    }
  };
  cmp("Marque", o.brand, c.brand, 0.2, 0.1, 0.2, UNKNOWN_CAP);
  const oModel = o.inferred.includes("model") ? null : o.model;
  const cModel = c.inferred.includes("model") ? null : c.model;
  cmp("Mod\xE8le", oModel, cModel, 0.45, 0.15, 0.2, 0.55);
  cmp("Stockage", o.storage, c.storage, 0.15, 0.07, 0.5, UNKNOWN_CAP);
  cmp("Couleur", o.color, c.color, 0.1, 0.05, 0.75, UNKNOWN_CAP);
  cmp("Grade", o.grade, c.grade, 0.07, 0.035, 0.8, UNKNOWN_CAP);
  const oCond = o.condition === "unknown" ? null : o.condition;
  const cCond = c.condition === "unknown" ? null : c.condition;
  cmp("\xC9tat", oCond, cCond, 0.03, 0.015, 0.8, 0.95);
  return { score: Math.min(score, cap2), cap: cap2, reasons };
}
function matchOfferToSkus(offer, candidates) {
  const normalizedOffer = offer.normalized ?? normalizeProduct(offer.title, { ean: offer.ean, mpn: offer.mpn });
  const offerEan = cleanId2(offer.ean ?? normalizedOffer.ean);
  const offerMpn = cleanId2(offer.mpn ?? normalizedOffer.mpn);
  const offerSku = cleanId2(offer.supplierSku);
  const offerTokens = tokenSet(offer.title);
  const results = [];
  for (const c of candidates) {
    let best = null;
    const push = (r) => {
      if (!best || r.confidence > best.confidence) best = r;
    };
    if (offerEan && (cleanId2(c.ean) === offerEan || cleanId2(c.barcode) === offerEan)) {
      push({ skuId: c.skuId, code: c.code, confidence: 1, method: "ean", level: "high", reasons: [`EAN identique (${offer.ean ?? normalizedOffer.ean})`], autoConfirmable: true });
    }
    if (offerMpn && cleanId2(c.mpn) === offerMpn) {
      push({ skuId: c.skuId, code: c.code, confidence: 0.97, method: "mpn", level: "high", reasons: [`R\xE9f\xE9rence fabricant identique (${offer.mpn ?? normalizedOffer.mpn})`], autoConfirmable: true });
    }
    if (offerSku && (cleanId2(c.code) === offerSku || c.barcode && cleanId2(c.barcode) === offerSku)) {
      push({ skuId: c.skuId, code: c.code, confidence: 0.95, method: "supplier_sku", level: "high", reasons: [`R\xE9f\xE9rence fournisseur identique au code SKU (${c.code})`], autoConfirmable: true });
    }
    if (!best) {
      const normalizedCandidate = normalizeCandidate(c);
      const attr2 = compareAttributes(normalizedOffer, normalizedCandidate);
      const attrLevel = levelOf(attr2.score);
      if (attrLevel) {
        push({ skuId: c.skuId, code: c.code, confidence: round3(attr2.score), method: "attributes", level: attrLevel, reasons: attr2.reasons, autoConfirmable: false });
      }
      const sim = jaccard(offerTokens, tokenSet(`${c.brand ?? ""} ${c.productName} ${c.variantName ?? ""}`));
      const textScore = round3(sim * 0.8);
      const textLevel = levelOf(textScore);
      if (textLevel && (!best || textScore > best.confidence)) {
        push({ skuId: c.skuId, code: c.code, confidence: textScore, method: "text", level: textLevel, reasons: [`Similarit\xE9 textuelle ${(sim * 100).toFixed(0)} %`], autoConfirmable: false });
      }
    }
    if (best) results.push(best);
  }
  return results.sort((a, b) => b.confidence - a.confidence);
}
function round3(n) {
  return Math.round(n * 1e3) / 1e3;
}

// src/services/sourcing/matching-service.ts
var log6 = createLogger("SOURCING_MATCHING");
var MATCH_CANDIDATE_LIMIT = 300;
function toCandidate(r) {
  if (!r.product || !r.variant) return null;
  const attrs = r.variant.attributes ?? {};
  const s = (k) => typeof attrs[k] === "string" ? attrs[k] : null;
  return {
    skuId: r.id,
    code: r.code,
    productName: r.product.name,
    brand: r.product.brand,
    variantName: r.variant.name,
    attributes: { storage: s("storage"), color: s("color"), grade: s("grade") },
    condition: r.variant.condition,
    grade: r.variant.grade,
    ean: r.variant.ean,
    mpn: r.variant.mpn,
    barcode: r.barcode
  };
}
var SELECT = "id, code, barcode, product:products!inner(name, brand), variant:product_variants!inner(name, attributes, condition, grade, ean, mpn)";
async function loadMatchCandidates(client, organizationId, hints, limit = MATCH_CANDIDATE_LIMIT) {
  const out = /* @__PURE__ */ new Map();
  const add = (rows) => {
    for (const r of rows ?? []) {
      const c = toCandidate(r);
      if (c && !out.has(c.skuId)) out.set(c.skuId, c);
    }
  };
  const base = () => client.from("skus").select(SELECT).eq("organization_id", organizationId).eq("is_active", true);
  if (hints.ean) {
    const [{ data: byEan }, { data: byBarcode }] = await Promise.all([base().eq("variant.ean", hints.ean).limit(20), base().eq("barcode", hints.ean).limit(20)]);
    add(byEan);
    add(byBarcode);
  }
  if (hints.mpn) {
    const { data } = await base().ilike("variant.mpn", escapeLike(hints.mpn)).limit(20);
    add(data);
  }
  if (hints.supplierSku) {
    const { data } = await base().ilike("code", escapeLike(hints.supplierSku)).limit(5);
    add(data);
  }
  if (hints.brand && out.size < limit) {
    const { data } = await base().ilike("product.brand", escapeLike(hints.brand)).limit(limit);
    add(data);
  }
  if (out.size === 0 && hints.text) {
    const term = hints.text.split(" ").filter((t) => t.length >= 3)[0];
    if (term) {
      const { data } = await base().ilike("product.name", `%${escapeLike(term)}%`).limit(limit);
      add(data);
    }
  }
  return Array.from(out.values()).slice(0, limit);
}
async function suggestMatchesForOffer(client, organizationId, offer, options = {}) {
  const normalized = normalizeProduct(offer.title_original, { ean: offer.ean, mpn: offer.mpn, brand: offer.brand });
  const candidates = await loadMatchCandidates(client, organizationId, { ean: normalized.ean, mpn: normalized.mpn, supplierSku: offer.external_product_id, brand: normalized.brandDisplay ?? normalized.brand, text: normalized.remainingText || offer.title_original });
  if (candidates.length === 0) return { suggestions: [], confirmedSkuId: null };
  const matches = matchOfferToSkus({ title: offer.title_original, normalized, ean: offer.ean, mpn: offer.mpn, supplierSku: offer.external_product_id }, candidates);
  const top = matches.slice(0, 3);
  if (top.length === 0) return { suggestions: [], confirmedSkuId: null };
  const { data: existing } = await client.from("product_matches").select("id, sku_id, status").eq("organization_id", organizationId).eq("offer_id", offer.id);
  const existingBySku = new Map((existing ?? []).map((m) => [m.sku_id, m]));
  let confirmedSkuId = null;
  for (const m of top) {
    const prior = existingBySku.get(m.skuId);
    const autoConfirm = Boolean(options.autoConfirmExact) && m.autoConfirmable && !offer.sku_id && !confirmedSkuId;
    if (prior) {
      if (prior.status === "rejected") continue;
      if (autoConfirm && prior.status === "suggested") {
        await client.from("product_matches").update({ status: "confirmed", decided_at: (/* @__PURE__ */ new Date()).toISOString(), confidence: m.confidence, method: m.method, reasons: m.reasons }).eq("id", prior.id);
        confirmedSkuId = m.skuId;
      }
      continue;
    }
    const { error } = await client.from("product_matches").insert({
      organization_id: organizationId,
      offer_id: offer.id,
      sourcing_product_id: offer.normalized_product_id,
      sku_id: m.skuId,
      confidence: m.confidence,
      method: m.method,
      reasons: m.reasons,
      status: autoConfirm ? "confirmed" : "suggested",
      created_by: options.createdBy ?? null,
      decided_at: autoConfirm ? (/* @__PURE__ */ new Date()).toISOString() : null
    });
    if (error) {
      log6.warn("product match not recorded", { offerId: offer.id, skuId: m.skuId, error: error.message });
      continue;
    }
    if (autoConfirm) confirmedSkuId = m.skuId;
  }
  if (confirmedSkuId) await applyConfirmedMatch(client, organizationId, { offerId: offer.id, skuId: confirmedSkuId, sourcingProductId: offer.normalized_product_id });
  return { suggestions: top, confirmedSkuId };
}
async function applyConfirmedMatch(client, organizationId, link) {
  if (link.offerId) await client.from("sourcing_offers").update({ sku_id: link.skuId }).eq("id", link.offerId).eq("organization_id", organizationId);
  if (link.sourcingProductId) {
    await client.from("sourcing_products").update({ sku_id: link.skuId }).eq("id", link.sourcingProductId).eq("organization_id", organizationId).is("sku_id", null);
  }
}

// src/services/sourcing/offer-storage.ts
var log7 = createLogger("OFFER_STORAGE");
function stockStatusOf(raw, quantity) {
  if (raw.stockStatus && raw.stockStatus !== "unknown") return raw.stockStatus;
  if (quantity === null) return raw.stockStatus ?? "unknown";
  return quantity > 0 ? "in_stock" : "out_of_stock";
}
function conditionOf(raw, normalized) {
  if (raw.condition === "new" || raw.condition === "refurbished" || raw.condition === "used") return raw.condition;
  return normalized.condition;
}
async function getOrCreateSourcingProduct(ctx, normalized) {
  const { supabase, organizationId } = ctx;
  const { data: existing } = await supabase.from("sourcing_products").select("id, sku_id").eq("organization_id", organizationId).eq("normalized_key", normalized.normalizedKey).maybeSingle();
  if (existing) return { id: existing.id, skuId: existing.sku_id };
  const { data: inserted, error } = await supabase.from("sourcing_products").insert({
    organization_id: organizationId,
    normalized_key: normalized.normalizedKey,
    brand: normalized.brand,
    model: normalized.model,
    storage: normalized.storage,
    color: normalized.color,
    condition: normalized.condition,
    grade: normalized.grade,
    variant: normalized.variant,
    ean: normalized.ean,
    mpn: normalized.mpn,
    title_display: normalized.displayTitle.slice(0, 300),
    attributes: { inferred: normalized.inferred, confidence: normalized.confidence }
  }).select("id, sku_id").single();
  if (inserted) return { id: inserted.id, skuId: inserted.sku_id };
  const { data: again } = await supabase.from("sourcing_products").select("id, sku_id").eq("organization_id", organizationId).eq("normalized_key", normalized.normalizedKey).maybeSingle();
  if (again) return { id: again.id, skuId: again.sku_id };
  throw new Error(`Produit normalis\xE9 non enregistrable : ${error?.message ?? "inconnu"}`);
}
async function storeOffer(ctx, raw) {
  const { supabase, organizationId } = ctx;
  const now = ctx.now ?? /* @__PURE__ */ new Date();
  const nowIso = now.toISOString();
  const currency = (raw.currency ?? ctx.defaultCurrency ?? "").toUpperCase() || null;
  const normalized = normalizeProduct(raw.title, { brand: raw.brand, model: raw.model, storage: raw.storage, color: raw.color, grade: raw.grade, condition: typeof raw.condition === "string" ? raw.condition : null, ean: raw.ean, mpn: raw.mpn });
  const { data: existing } = await supabase.from("sourcing_offers").select("id, original_price, original_currency, sku_id, normalized_product_id, status").eq("organization_id", organizationId).eq("source_id", ctx.sourceId).eq("external_offer_id", raw.externalOfferId).maybeSingle();
  let prices30d = [];
  if (existing && currency && existing.original_currency === currency) {
    const since = new Date(now.getTime() - 30 * 864e5).toISOString();
    const { data: hist } = await supabase.from("supplier_price_history").select("original_price").eq("offer_id", existing.id).eq("original_currency", currency).gte("recorded_at", since).order("recorded_at", { ascending: false }).limit(200);
    prices30d = (hist ?? []).map((h) => Number(h.original_price)).filter((n) => Number.isFinite(n) && n > 0);
  }
  const previousPrice = existing && currency && existing.original_currency === currency ? Number(existing.original_price) : null;
  const validation = validateOffer(
    { title: raw.title, price: raw.price, currency, moq: raw.moq ?? null, availableQuantity: raw.availableQuantity ?? null, sourceUrl: raw.url ?? null },
    { previousPrice, prices30d }
  );
  if (!validation.valid || validation.effectivePrice === null || !currency) {
    if (existing) {
      await supabase.from("sourcing_offers").update({ status: "suspicious", anomalies: validation.anomalyCodes, last_seen_at: nowIso }).eq("id", existing.id);
    }
    return { outcome: "rejected", offerId: existing?.id ?? null, created: false, validation, normalized, fxUnavailable: false, matchedSkuId: null };
  }
  const fx = await getFxRate(currency, ctx.organizationCurrency);
  const fxUnavailable = fx === null;
  const normalizedPrice = fx ? Math.round(validation.effectivePrice * fx.rate * 1e4) / 1e4 : null;
  const product = await getOrCreateSourcingProduct(ctx, normalized);
  const quantity = validation.effectiveQuantity;
  const stockStatus = stockStatusOf(raw, quantity);
  const condition = conditionOf(raw, normalized);
  const taxType = raw.taxType && raw.taxType !== "unknown" ? raw.taxType : ctx.defaultTaxType ?? "unknown";
  const confidence = {
    product: normalized.confidence,
    price: validation.priceRejected ? 0.3 : validation.anomalyCodes.includes("price_too_low") || validation.anomalyCodes.includes("price_too_high") ? 0.5 : 1,
    stock: quantity !== null ? 0.9 : stockStatus !== "unknown" ? 0.6 : 0,
    grade: raw.grade ? 1 : normalized.grade ? 0.8 : 0,
    condition: raw.condition === "new" || raw.condition === "refurbished" || raw.condition === "used" ? 1 : normalized.inferred.includes("condition") ? 0.6 : condition !== "unknown" ? 0.9 : 0,
    delivery: raw.deliveryMaxDays !== null && raw.deliveryMaxDays !== void 0 ? 0.9 : 0,
    tax: taxType === "unknown" ? 0 : raw.taxType && raw.taxType !== "unknown" ? 1 : 0.7
  };
  const row = {
    organization_id: organizationId,
    supplier_id: ctx.supplierId,
    source_id: ctx.sourceId,
    feed_id: ctx.feedId ?? null,
    source_type: ctx.sourceType,
    external_product_id: raw.externalProductId ?? raw.supplierSku ?? null,
    external_offer_id: raw.externalOfferId,
    title_original: raw.title.slice(0, 500),
    normalized_product_id: product.id,
    sku_id: existing?.sku_id ?? product.skuId ?? null,
    brand: normalized.brand,
    model: normalized.model,
    storage: normalized.storage,
    color: normalized.color,
    condition,
    grade: normalized.grade,
    ean: normalized.ean,
    mpn: normalized.mpn,
    original_price: validation.effectivePrice,
    original_currency: currency,
    normalized_price: normalizedPrice,
    normalized_currency: fx ? ctx.organizationCurrency.toUpperCase() : null,
    fx_rate: fx?.rate ?? null,
    fx_rate_date: fx?.date ?? null,
    tax_type: taxType,
    vat_rate: raw.vatRate ?? null,
    moq: validation.effectiveMoq,
    minimum_order_value: raw.minimumOrderValue ?? null,
    available_quantity: quantity,
    stock_status: stockStatus,
    shipping_cost: raw.shippingCost ?? null,
    shipping_currency: raw.shippingCost !== null && raw.shippingCost !== void 0 ? (raw.shippingCurrency ?? currency).toUpperCase() : null,
    delivery_min_days: raw.deliveryMinDays ?? null,
    delivery_max_days: raw.deliveryMaxDays ?? null,
    country: raw.country?.toUpperCase().slice(0, 2) ?? ctx.defaultCountry ?? null,
    source_url: validation.effectiveUrl,
    confidence,
    anomalies: validation.anomalyCodes,
    status: validation.status,
    last_seen_at: nowIso,
    expired_at: null,
    raw: raw.raw ?? null
  };
  if (!existing) {
    row.first_seen_at = nowIso;
    row.last_price_at = nowIso;
    row.last_stock_at = quantity !== null || stockStatus !== "unknown" ? nowIso : null;
  }
  const { data: saved, error } = await supabase.from("sourcing_offers").upsert(row, { onConflict: "organization_id,source_id,external_offer_id" }).select("id, sku_id").single();
  if (error || !saved) {
    log7.error("offer upsert failed", { externalOfferId: raw.externalOfferId, error: error?.message });
    throw new Error(`Offre non enregistr\xE9e (${raw.externalOfferId}) : ${error?.message ?? "inconnu"}`);
  }
  let matchedSkuId = saved.sku_id;
  if (ctx.suggestMatches !== false && !saved.sku_id) {
    try {
      const r = await suggestMatchesForOffer(supabase, organizationId, { id: saved.id, title_original: raw.title, ean: normalized.ean, mpn: normalized.mpn, external_product_id: row.external_product_id ?? null, brand: normalized.brand, normalized_product_id: product.id, sku_id: null }, { autoConfirmExact: true, createdBy: ctx.createdBy ?? null });
      matchedSkuId = r.confirmedSkuId;
    } catch (e) {
      log7.warn("match suggestion failed", { offerId: saved.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { outcome: "stored", offerId: saved.id, created: !existing, validation, normalized, fxUnavailable, matchedSkuId };
}
async function expireUnseenOffers(ctx, since) {
  const { data, error } = await ctx.supabase.from("sourcing_offers").update({ status: "expired", expired_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("organization_id", ctx.organizationId).eq("source_id", ctx.sourceId).in("status", ["active", "suspicious"]).lt("last_seen_at", since.toISOString()).select("id");
  if (error) {
    log7.warn("expire unseen offers failed", { sourceId: ctx.sourceId, error: error.message });
    return 0;
  }
  return data?.length ?? 0;
}

// src/integrations/suppliers/core.ts
var DEFAULT_CONFIG = { baseUrl: null, settings: {}, defaultCurrency: null, defaultTaxType: "unknown", defaultCountry: null };
function accessConditionsOf(adapter) {
  return `Acc\xE8s r\xE9serv\xE9 aux titulaires d'un compte ${adapter.label.replace(/\s*\(.*\)$/, "")} : identifiants fournis par le vendeur, chiffr\xE9s c\xF4t\xE9 serveur, utilis\xE9s uniquement pour l'API officielle (${adapter.method === "official_api" ? "API officielle" : "compte fournisseur"}). ${adapter.verification === "fixtures" ? "Connecteur impl\xE9ment\xE9 d'apr\xE8s la documentation publique et v\xE9rifi\xE9 sur fixtures uniquement : non exerc\xE9 en conditions r\xE9elles depuis cet environnement." : ""}`.trim();
}
function createConnector(adapter, config, base) {
  let credentials = null;
  const ctx = () => ({ userAgent: base.userAgent ?? "MonStockBot/0.1", ...base, credentials: credentials ?? void 0 });
  return {
    key: adapter.key,
    async connect(creds) {
      credentials = creds;
    },
    async testConnection() {
      if (!credentials) return { ok: false, message: "Connexion non initialis\xE9e (identifiants absents)." };
      return adapter.testConnection(config, ctx());
    },
    async fetchCatalog(options = {}) {
      if (!credentials) throw new Error("Connexion non initialis\xE9e (identifiants absents).");
      if (!adapter.fetchCatalog) return { offers: [], nextCursor: null };
      const page2 = await adapter.fetchCatalog(config, options.cursor ?? null, ctx());
      return { offers: options.limit ? page2.offers.slice(0, options.limit) : page2.offers, nextCursor: page2.nextCursor };
    },
    async fetchOffers(query) {
      if (!credentials) throw new Error("Connexion non initialis\xE9e (identifiants absents).");
      if (!query?.trim()) return [];
      const result = await adapter.search(config, parseQuery2(query), query, ctx());
      return result.offers;
    },
    async getAccountInfo() {
      return { accountId: null, name: null, currency: null };
    }
  };
}
function toDescriptor(adapter) {
  return {
    key: adapter.key,
    label: adapter.label,
    description: adapter.description,
    accessConditions: accessConditionsOf(adapter),
    credentialFields: adapter.credentialFields,
    configFields: adapter.configFields,
    verification: adapter.verification,
    adapter,
    create: (config = DEFAULT_CONFIG, ctx = {}) => createConnector(adapter, config, ctx)
  };
}
var SUPPLIER_CONNECTORS = listAccountAdapters().map(toDescriptor);

// src/services/sourcing/sync-runs.ts
var log8 = createLogger("SYNC_RUNS");
var MAX_SYNC_ERRORS_RECORDED = 200;
var RUNNING_STALE_MINUTES = 30;
async function failStaleRuns(admin, sourceRef) {
  const threshold = new Date(Date.now() - RUNNING_STALE_MINUTES * 6e4).toISOString();
  const { error } = await admin.from("sync_runs").update({ status: "failed", finished_at: (/* @__PURE__ */ new Date()).toISOString(), error_summary: `Run interrompu (aucune fin enregistr\xE9e apr\xE8s ${RUNNING_STALE_MINUTES} min).` }).eq("source_ref", sourceRef).eq("status", "running").lt("started_at", threshold);
  if (error) log8.warn("stale runs not cleaned", { sourceRef, error: error.message });
}
async function startSyncRun(admin, input) {
  const startedAt = /* @__PURE__ */ new Date();
  if (input.sourceRef) await failStaleRuns(admin, input.sourceRef);
  const { data, error } = await admin.from("sync_runs").insert({ organization_id: input.organizationId, source_kind: input.sourceKind, source_ref: input.sourceRef ?? null, provider: input.provider, trigger: input.trigger, status: "running", started_at: startedAt.toISOString(), created_by: input.createdBy ?? null }).select("id").single();
  if (error?.code === "23505") throw new Error("Une synchronisation est d\xE9j\xE0 en cours pour cette source. Patientez avant d'en relancer une.");
  if (error || !data) throw new Error(`Impossible d'ouvrir le journal de synchronisation : ${error?.message ?? "inconnu"}`);
  return { id: data.id, organizationId: input.organizationId, startedAt };
}
async function finishSyncRun(admin, run, result) {
  const finishedAt = /* @__PURE__ */ new Date();
  const { error } = await admin.from("sync_runs").update({
    status: result.status,
    finished_at: finishedAt.toISOString(),
    duration_ms: finishedAt.getTime() - run.startedAt.getTime(),
    records_processed: result.recordsProcessed,
    error_count: result.errorCount,
    stats: result.stats ?? {},
    error_summary: result.errorSummary ?? null
  }).eq("id", run.id);
  if (error) log8.warn("sync run not closed", { runId: run.id, error: error.message });
}
async function recordSyncErrors(admin, run, errors) {
  if (errors.length === 0) return;
  const rows = errors.slice(0, MAX_SYNC_ERRORS_RECORDED).map((e) => ({
    organization_id: run.organizationId,
    sync_run_id: run.id,
    code: e.code,
    message: e.message.slice(0, 2e3),
    entity_type: e.entityType ?? null,
    entity_ref: e.entityRef ?? null,
    details: e.details ?? {}
  }));
  const { error } = await admin.from("sync_errors").insert(rows);
  if (error) log8.warn("sync errors not recorded", { runId: run.id, error: error.message });
}
var FREQUENCY_MS = {
  manual: null,
  hourly: 36e5,
  every_6_hours: 6 * 36e5,
  daily: 24 * 36e5
};
function isDue(frequency, lastSyncAt, now) {
  const interval = FREQUENCY_MS[frequency];
  if (interval === null) return false;
  if (!lastSyncAt) return true;
  return now.getTime() - new Date(lastSyncAt).getTime() >= interval;
}
async function recordCompletedSyncRun(admin, input) {
  const { data, error } = await admin.from("sync_runs").insert({
    organization_id: input.organizationId,
    source_kind: input.sourceKind,
    source_ref: input.sourceRef,
    provider: input.provider,
    trigger: input.trigger,
    status: input.status,
    started_at: input.startedAt.toISOString(),
    finished_at: input.finishedAt.toISOString(),
    duration_ms: Math.max(0, input.finishedAt.getTime() - input.startedAt.getTime()),
    records_processed: input.recordsProcessed,
    error_count: input.errorCount,
    stats: input.stats ?? {},
    error_summary: input.errorSummary ?? null,
    created_by: input.createdBy ?? null
  }).select("id").single();
  if (error || !data) {
    log8.warn("completed sync run not recorded", { sourceRef: input.sourceRef, error: error?.message });
    return null;
  }
  return data.id;
}

// src/services/sourcing/supplier-connectors.ts
var log9 = createLogger("SUPPLIER_CONNECTORS");
async function loadConnectionCredentials(connectionId) {
  const admin = createAdminSupabaseClient();
  const { data } = await admin.from("supplier_connection_secrets").select("credentials_enc").eq("connection_id", connectionId).maybeSingle();
  if (!data?.credentials_enc) return null;
  return JSON.parse(decryptSecret(data.credentials_enc));
}

// src/services/sourcing/live-search.ts
var log10 = createLogger("LIVE_SEARCH");
var LIVE_SEARCH_SOURCE_TYPES = ["PUBLIC_WEB", "API", "JSON", "XML", "CSV", "SUPPLIER_ACCOUNT"];
var LIVE_SEARCH_CACHE_TTL_MS = 10 * 6e4;
var LIVE_SEARCH_DEFAULT_TIMEOUT_MS = 8e3;
var LIVE_SEARCH_MAX_SOURCES = 10;
var LIVE_SEARCH_PARALLELISM = 10;
var LIVE_SEARCH_PUBLIC_MIN_DELAY_MS = 2e3;
var LIVE_SEARCH_ACCOUNT_MIN_DELAY_MS = 500;
var LIVE_SEARCH_MAX_VARIANTS_PER_SOURCE = 2;
var LIVE_SEARCH_MIN_VARIANT_BUDGET_MS = 1e3;
function liveSearchVariants(input, max = LIVE_SEARCH_MAX_VARIANTS_PER_SOURCE) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const text2 of [...input.variants ?? [], ...input.variants && input.variants.length > 0 ? [] : [input.rawQuery]]) {
    const t = text2.replace(/\s+/g, " ").trim();
    const key2 = normalizeText(t);
    if (!t || seen.has(key2)) continue;
    seen.add(key2);
    out.push({ text: t, parsed: t === input.rawQuery.trim() ? input.parsed : parseQuery2(t) });
    if (out.length >= Math.max(1, max)) break;
  }
  if (out.length === 0) out.push({ text: input.rawQuery, parsed: input.parsed });
  return out;
}
var liveSearchCache = /* @__PURE__ */ new Map();
function liveSearchCacheKey(sourceId, rawQuery) {
  return `${sourceId}|${normalizeText(rawQuery)}`;
}
function attestationRequired(method) {
  return method === "public_html" || method === "public_json";
}
function report(c, status, message, extra = {}, now = /* @__PURE__ */ new Date()) {
  return {
    sourceId: c.sourceId,
    sourceName: c.sourceName,
    supplierId: c.supplierId,
    supplierName: c.supplierName,
    adapterKey: c.adapterKey,
    method: c.adapter?.method ?? null,
    status,
    message,
    found: 0,
    stored: 0,
    rejected: 0,
    durationMs: 0,
    requests: [],
    queries: [],
    checkedAt: now.toISOString(),
    ...extra
  };
}
function withTimeout(promise, ms) {
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve("timeout"), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
function preflight(c) {
  if (!c.adapter) return { ok: false, status: "no_search", message: "Aucun adaptateur associ\xE9 \xE0 cette source : elle n'est pas interrogeable en direct (synchronisation de flux / crawl uniquement)." };
  if (!c.adapter.capabilities.search) return { ok: false, status: "no_search", message: `L'adaptateur \xAB ${c.adapter.label} \xBB ne propose pas de recherche en direct (catalogue synchronis\xE9 uniquement).` };
  if (c.adapter.access === "public" && attestationRequired(c.adapter.method) && !c.attested) return { ok: false, status: "not_attested", message: "Acc\xE8s automatis\xE9 non attest\xE9 : confirmez que les conditions d'utilisation du site autorisent la lecture automatis\xE9e." };
  if (c.adapter.access === "account" && !c.connectionId) return { ok: false, status: "account_required", message: "Compte fournisseur requis : connectez vos identifiants pour interroger cette source." };
  return { ok: true };
}
async function querySource(c, input, rt, scheduler) {
  const startedAt = rt.now();
  const t0 = Date.now();
  const pre = preflight(c);
  if (!pre.ok) return report(c, pre.status, pre.message, {}, startedAt);
  const adapter = c.adapter;
  const key2 = liveSearchCacheKey(c.sourceId, input.rawQuery);
  const cached2 = rt.cache.get(key2);
  if (cached2 && startedAt.getTime() - cached2.at < LIVE_SEARCH_CACHE_TTL_MS) {
    return { ...cached2.report, status: "cached", message: `R\xE9sultat r\xE9cent r\xE9utilis\xE9 (interrog\xE9e il y a ${Math.round((startedAt.getTime() - cached2.at) / 1e3)} s).`, durationMs: 0, checkedAt: startedAt.toISOString() };
  }
  const variants = liveSearchVariants(input);
  let disallowedUrls = [];
  if (adapter.access === "public" && attestationRequired(adapter.method)) {
    const urls = Array.from(new Set(variants.flatMap((v2) => adapter.urlsForQuery?.(c.config, v2.parsed, v2.text) ?? [])));
    if (urls.length === 0) return report(c, "no_search", "Aucune URL de recherche configur\xE9e pour cette source : recherche en direct impossible.", {}, startedAt);
    const robots = await rt.checkRobots(c, urls);
    if (rt.recordRobots) await rt.recordRobots(c, robots).catch((e) => log10.warn("robots status not recorded", { sourceId: c.sourceId, error: e instanceof Error ? e.message : String(e) }));
    if (!robots.allowed) return report(c, "robots_disallowed", `robots.txt : ${robots.details}`, { durationMs: Date.now() - t0 }, startedAt);
    disallowedUrls = robots.disallowedUrls;
  }
  let credentials;
  if (adapter.access === "account") {
    const creds = await rt.loadCredentials(c.connectionId);
    if (!creds || Object.keys(creds).length === 0) return report(c, "account_required", "Identifiants du compte fournisseur introuvables : reconnectez le compte.", {}, startedAt);
    credentials = creds;
  }
  const fetchImpl = scheduler.wrapFetch(rt.fetchImpl);
  const budgetMs = Math.max(rt.perSourceTimeoutMs, adapter.searchBudgetMs ?? 0);
  const deadline = t0 + budgetMs;
  const minVariantBudget = Math.min(LIVE_SEARCH_MIN_VARIANT_BUDGET_MS, budgetMs / 4);
  const collected = [];
  const seenOfferIds = /* @__PURE__ */ new Set();
  const requests = [];
  const errors = [];
  const sent = [];
  let method = adapter.method;
  let truncated = false;
  let firstVariantFailed = false;
  for (const [i, v2] of variants.entries()) {
    const remaining = deadline - Date.now();
    if (i > 0) {
      if (firstVariantFailed) break;
      if (remaining < minVariantBudget) {
        truncated = true;
        break;
      }
    }
    sent.push(v2.text);
    const ctx = {
      userAgent: rt.userAgent,
      fetchImpl,
      resolver: rt.resolver,
      sleep: rt.sleep,
      credentials,
      minDelayMs: adapter.access === "public" ? rt.publicMinDelayMs : rt.accountMinDelayMs,
      timeoutMs: Math.max(1, remaining),
      disallowedUrls,
      now: rt.now
    };
    let result;
    try {
      result = await withTimeout(adapter.search(c.config, v2.parsed, v2.text, ctx), Math.max(1, remaining) + 500);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (i === 0) {
        const r2 = report(c, "error", message, { durationMs: Date.now() - t0, queries: sent }, startedAt);
        await rt.recordRun(c, r2, startedAt);
        return r2;
      }
      errors.push(`reformulation \xAB ${v2.text} \xBB : ${message}`);
      break;
    }
    if (result === "timeout") {
      if (i === 0) {
        const r2 = report(c, "timeout", `D\xE9lai d\xE9pass\xE9 (${Math.round(budgetMs / 1e3)} s) : la source n'a pas r\xE9pondu \xE0 temps.`, { durationMs: Date.now() - t0, queries: sent }, startedAt);
        await rt.recordRun(c, r2, startedAt);
        return r2;
      }
      truncated = true;
      errors.push(`reformulation \xAB ${v2.text} \xBB interrompue : budget de ${Math.round(budgetMs / 1e3)} s atteint`);
      break;
    }
    method = result.method;
    requests.push(...result.requests);
    truncated = truncated || result.truncated;
    if (result.error) {
      errors.push(result.error);
      if (i === 0 && result.offers.length === 0) firstVariantFailed = true;
    }
    const requestUrl = result.requests.find((q) => q.offers > 0)?.url ?? result.requests[0]?.url ?? null;
    for (const o of result.offers) {
      if (seenOfferIds.has(o.externalOfferId)) continue;
      seenOfferIds.add(o.externalOfferId);
      collected.push({ offer: o, requestUrl });
    }
  }
  if (firstVariantFailed && collected.length === 0) {
    const r2 = report(c, "error", errors.join(" \xB7 "), { durationMs: Date.now() - t0, requests, queries: sent }, startedAt);
    await rt.recordRun(c, r2, startedAt);
    return r2;
  }
  const retrievedAt = rt.now();
  const traced = collected.map(({ offer: o, requestUrl }) => withProvenance(o, { adapterKey: adapter.key, method, retrievedAt: retrievedAt.toISOString(), requestUrl, sourceUrl: o.url ?? null }));
  let stored = 0;
  let rejected = 0;
  let offerIds = [];
  let storeError = null;
  try {
    const s = await rt.storeOffers(c, traced, retrievedAt);
    stored = s.stored;
    rejected = s.rejected;
    offerIds = s.offerIds;
  } catch (e) {
    storeError = e instanceof Error ? e.message : String(e);
  }
  const messageParts = [`${collected.length} offre(s) trouv\xE9e(s), ${stored} enregistr\xE9e(s), ${rejected} rejet\xE9e(s)`];
  if (sent.length > 1) messageParts.push(`${sent.length} reformulations`);
  if (truncated) messageParts.push("r\xE9sultat partiel (limite de pages ou de temps atteinte)");
  for (const err of errors) messageParts.push(err);
  if (storeError) messageParts.push(`enregistrement : ${storeError}`);
  const r = report(c, storeError && stored === 0 ? "error" : "ok", `${messageParts.join(" \xB7 ")}.`, { found: collected.length, stored, rejected, durationMs: Date.now() - t0, requests, queries: sent }, startedAt);
  await rt.recordRun(c, r, startedAt);
  rt.cache.set(key2, { at: retrievedAt.getTime(), report: r, offerIds });
  return r;
}
async function executeLiveSearch(candidates, input, rt) {
  const startedAt = rt.now();
  const scheduler = new HostScheduler(rt.publicMinDelayMs, rt.sleep);
  const reports = new Array(candidates.length);
  const offerIds = /* @__PURE__ */ new Set();
  const maxSources = Math.max(0, input.maxSources ?? rt.maxSources);
  const queue = candidates.map((c, index) => ({ c, index }));
  const runOne = async ({ c, index }) => {
    const pre = preflight(c);
    if (!pre.ok) {
      reports[index] = report(c, pre.status, pre.message, {}, rt.now());
      return;
    }
    if (index >= maxSources) {
      reports[index] = report(c, "skipped", `Hors budget : au plus ${maxSources} source(s) interrog\xE9e(s) par recherche.`, {}, rt.now());
      return;
    }
    try {
      reports[index] = await querySource(c, input, rt, scheduler);
    } catch (e) {
      reports[index] = report(c, "error", e instanceof Error ? e.message : String(e), {}, rt.now());
    }
    const entry = rt.cache.get(liveSearchCacheKey(c.sourceId, input.rawQuery));
    if (entry && (reports[index].status === "ok" || reports[index].status === "cached")) for (const id of entry.offerIds) offerIds.add(id);
  };
  const workers = Array.from({ length: Math.max(1, Math.min(rt.parallelism, queue.length)) }, async () => {
    for (; ; ) {
      const next = queue.shift();
      if (!next) return;
      await runOne(next);
    }
  });
  await Promise.all(workers);
  const finishedAt = rt.now();
  const queried = reports.filter((r) => r.status === "ok" || r.status === "error" || r.status === "timeout").length;
  return {
    query: input.rawQuery,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    sources: reports,
    queried,
    found: reports.reduce((a, r) => a + r.found, 0),
    stored: reports.reduce((a, r) => a + r.stored, 0),
    offerIds: Array.from(offerIds)
  };
}
function resolveContext(ctx) {
  if ("organization" in ctx) return { organizationId: ctx.organization.id, admin: createAdminSupabaseClient(), userId: ctx.user.id };
  return { organizationId: ctx.organizationId, admin: ctx.admin, userId: ctx.userId ?? null };
}
async function ensureConnectionSource(admin, organizationId, connection, adapterLabel) {
  if (connection.source_id) return connection.source_id;
  const { data, error } = await admin.from("supplier_sources").insert({ organization_id: organizationId, supplier_id: connection.supplier_id, name: adapterLabel, source_type: "SUPPLIER_ACCOUNT", automated_access_confirmed: true, access_conditions: "Compte fournisseur connect\xE9 par le vendeur (API officielle, identifiants chiffr\xE9s).", status: "active", sync_frequency: "manual", config: { adapter: connection.connector_key } }).select("id").single();
  if (error || !data) {
    log10.warn("connection source not created", { connectionId: connection.id, error: error?.message });
    return null;
  }
  await admin.from("supplier_connections").update({ source_id: data.id }).eq("id", connection.id);
  return data.id;
}
async function loadCandidates(admin, organizationId) {
  const [{ data: org }, { data: sources }, { data: connections }] = await Promise.all([
    admin.from("organizations").select("default_currency").eq("id", organizationId).maybeSingle(),
    admin.from("supplier_sources").select("*, supplier:suppliers(id, name, is_archived)").eq("organization_id", organizationId).neq("status", "paused").in("source_type", [...LIVE_SEARCH_SOURCE_TYPES]).order("created_at").limit(100),
    admin.from("supplier_connections").select("id, supplier_id, source_id, connector_key, status").eq("organization_id", organizationId).neq("status", "disconnected").limit(50)
  ]);
  const organizationCurrency = org?.default_currency ?? "EUR";
  const bySource = new Map((sources ?? []).map((s) => [s.id, s]));
  const connectionBySource = /* @__PURE__ */ new Map();
  const out = [];
  for (const conn of connections ?? []) {
    const adapter = getSourceAdapter(conn.connector_key);
    if (!adapter || adapter.access !== "account") continue;
    let sourceId = conn.source_id && bySource.has(conn.source_id) ? conn.source_id : null;
    if (!sourceId) {
      sourceId = await ensureConnectionSource(admin, organizationId, { ...conn, source_id: conn.source_id && bySource.has(conn.source_id) ? conn.source_id : null }, adapter.label);
      if (!sourceId) continue;
      if (!bySource.has(sourceId)) {
        const { data: created } = await admin.from("supplier_sources").select("*, supplier:suppliers(id, name, is_archived)").eq("id", sourceId).maybeSingle();
        if (created) bySource.set(created.id, created);
      }
    }
    connectionBySource.set(sourceId, { id: conn.id, connector_key: conn.connector_key });
  }
  for (const s of bySource.values()) {
    if (s.supplier?.is_archived) continue;
    if (isUnvalidatedDiscovered(s.config, s.automated_access_confirmed)) continue;
    const connection = connectionBySource.get(s.id) ?? null;
    const adapterKey = connection?.connector_key ?? adapterKeyOf(s.config);
    const adapter = getSourceAdapter(adapterKey);
    out.push({
      candidate: {
        sourceId: s.id,
        sourceName: s.name,
        supplierId: s.supplier_id,
        supplierName: s.supplier?.name ?? "Fournisseur",
        sourceType: s.source_type,
        adapter,
        adapterKey: adapter ? adapter.key : adapterKey,
        config: adapterConfigFromSource({ base_url: s.base_url, config: s.config, default_currency: s.default_currency, default_tax_type: s.default_tax_type, country: s.country }),
        attested: s.automated_access_confirmed,
        connectionId: connection?.id ?? null
      },
      organizationCurrency,
      defaultCurrency: s.default_currency,
      defaultTaxType: s.default_tax_type,
      defaultCountry: s.country,
      robotsAllowed: s.robots_allowed,
      robotsCheckedAt: s.robots_checked_at
    });
  }
  return out;
}
function isUnvalidatedDiscovered(config, attested) {
  const c = config && typeof config === "object" && !Array.isArray(config) ? config : {};
  return c.discovered === true && !attested;
}
async function runLiveSearch(ctx, input, overrides = {}) {
  const { admin, organizationId, userId } = resolveContext(ctx);
  const userAgent = serverEnv().SOURCING_USER_AGENT;
  const now = overrides.now ?? (() => /* @__PURE__ */ new Date());
  const loaded = await loadCandidates(admin, organizationId);
  const bySourceId = new Map(loaded.map((l) => [l.candidate.sourceId, l]));
  const fetchImpl = overrides.fetchImpl ?? fetch;
  const runtime = {
    userAgent,
    now,
    fetchImpl,
    resolver: overrides.resolver,
    sleep: overrides.sleep,
    cache: overrides.cache ?? liveSearchCache,
    perSourceTimeoutMs: input.timeoutMs ?? LIVE_SEARCH_DEFAULT_TIMEOUT_MS,
    maxSources: input.maxSources ?? LIVE_SEARCH_MAX_SOURCES,
    parallelism: LIVE_SEARCH_PARALLELISM,
    publicMinDelayMs: LIVE_SEARCH_PUBLIC_MIN_DELAY_MS,
    accountMinDelayMs: LIVE_SEARCH_ACCOUNT_MIN_DELAY_MS,
    checkRobots: (c, urls) => checkRobotsForUrls(c.config.baseUrl ?? urls[0], urls, userAgent, fetchImpl),
    recordRobots: async (c, robots) => {
      await admin.from("supplier_sources").update({ robots_checked_at: now().toISOString(), robots_allowed: robots.allowed, ...robots.crawlDelay !== null ? { crawl_delay_seconds: Math.ceil(robots.crawlDelay) } : {} }).eq("id", c.sourceId);
    },
    loadCredentials: (connectionId) => loadConnectionCredentials(connectionId),
    storeOffers: async (c, offers, retrievedAt) => {
      const l = bySourceId.get(c.sourceId);
      const storage = {
        supabase: admin,
        organizationId,
        organizationCurrency: l?.organizationCurrency ?? "EUR",
        supplierId: c.supplierId,
        sourceId: c.sourceId,
        sourceType: c.sourceType,
        defaultCurrency: l?.defaultCurrency ?? c.config.defaultCurrency,
        defaultTaxType: l?.defaultTaxType ?? c.config.defaultTaxType,
        defaultCountry: l?.defaultCountry ?? c.config.defaultCountry,
        createdBy: userId,
        now: retrievedAt
      };
      const offerIds = [];
      let stored = 0;
      let rejected = 0;
      for (const offer of offers) {
        try {
          const r = await storeOffer(storage, offer);
          if (r.outcome === "stored" && r.offerId) {
            stored++;
            offerIds.push(r.offerId);
          } else rejected++;
        } catch (e) {
          rejected++;
          log10.warn("live offer not stored", { sourceId: c.sourceId, externalOfferId: offer.externalOfferId, error: e instanceof Error ? e.message : String(e) });
        }
      }
      if (stored > 0) await admin.from("supplier_sources").update({ status: "active", last_sync_at: retrievedAt.toISOString(), last_successful_sync_at: now().toISOString(), last_error: null }).eq("id", c.sourceId);
      return { offerIds, stored, rejected };
    },
    recordRun: async (c, r, startedAt) => {
      const status = r.status === "ok" ? r.rejected > 0 || r.requests.some((q) => q.error) ? "partial" : "success" : "failed";
      await recordCompletedSyncRun(admin, {
        organizationId,
        sourceKind: c.connectionId ? "supplier_connection" : "supplier_source",
        sourceRef: c.connectionId ?? c.sourceId,
        provider: c.adapterKey ?? "live_search",
        trigger: "manual",
        status,
        startedAt,
        finishedAt: now(),
        recordsProcessed: r.found,
        errorCount: r.status === "ok" ? r.rejected + r.requests.filter((q) => q.error).length : 1,
        stats: { kind: "live_search", query: input.rawQuery, skuId: input.skuId ?? null, status: r.status, found: r.found, stored: r.stored, rejected: r.rejected, requests: r.requests, method: r.method, adapter: r.adapterKey },
        errorSummary: r.status === "ok" ? null : r.message,
        createdBy: userId
      });
      if (r.status !== "ok" && r.status !== "cached") await admin.from("supplier_sources").update({ last_sync_at: startedAt.toISOString(), last_error: r.message }).eq("id", c.sourceId);
      if (c.connectionId) await admin.from("supplier_connections").update({ last_sync_at: startedAt.toISOString(), last_error: r.status === "ok" ? null : r.message, ...r.status === "ok" ? { status: "connected" } : {} }).eq("id", c.connectionId);
    }
  };
  const summary = await executeLiveSearch(
    loaded.map((l) => l.candidate),
    input,
    runtime
  );
  log10.info("live search finished", { organizationId, query: input.rawQuery, queried: summary.queried, found: summary.found, stored: summary.stored, durationMs: summary.durationMs });
  return summary;
}

// src/domain/sourcing/query-expansion.ts
var DEFAULT_MAX_EXPANSIONS = 6;
var DEFAULT_MAX_DISCOVERY = 3;
var MIN_DISCOVERY_SLOTS = 2;
var CATEGORY_PATTERNS = [
  { category: "tablet", re: /^(ipad|galaxy tab|surface pro|surface go)\b/ },
  { category: "computer", re: /^(macbook|imac|mac mini|surface laptop|surface book)\b/ },
  { category: "audio", re: /^(airpods|galaxy buds)\b/ },
  { category: "wearable", re: /^(apple watch|galaxy watch)\b/ },
  { category: "console", re: /^(playstation|nintendo switch|xbox)\b/ },
  { category: "smartphone", re: /^(iphone|galaxy (s|a|m|note|z|xcover)|pixel|redmi|poco|nord|reno|find|p\d|mate|nova|magic|\d{1,2}( |$))/ }
];
var BRAND_CATEGORY = {
  dyson: "appliance",
  philips: "appliance",
  bosch: "appliance",
  jbl: "audio",
  bose: "audio",
  garmin: "wearable",
  lenovo: "computer",
  dell: "computer",
  hp: "computer",
  asus: "computer",
  acer: "computer"
};
function detectCategory(parsed) {
  const model = parsed.criteria.model;
  if (model) {
    for (const p of CATEGORY_PATTERNS) if (p.re.test(model)) return p.category;
  }
  const brand = parsed.criteria.brand;
  if (brand && BRAND_CATEGORY[brand]) return BRAND_CATEGORY[brand];
  return "other";
}
var COLOR_FR = {
  gray: "Gris",
  black: "Noir",
  white: "Blanc",
  midnight: "Minuit",
  starlight: "Lumi\xE8re stellaire",
  blue: "Bleu",
  red: "Rouge",
  green: "Vert",
  silver: "Argent",
  gold: "Or",
  purple: "Violet",
  pink: "Rose",
  yellow: "Jaune",
  orange: "Orange",
  titanium: "Titane",
  brown: "Marron",
  beige: "Beige"
};
var CONDITION_WORD = {
  new: { en: "new", fr: "neuf" },
  refurbished: { en: "refurbished", fr: "reconditionn\xE9" },
  used: { en: "used", fr: "occasion" }
};
function storageEn(storage) {
  return storage;
}
function storageFr(storage) {
  if (!storage) return null;
  const m = storage.match(/^(\d+)(GB|TB)$/);
  if (!m) return storage;
  return `${m[1]} ${m[2] === "TB" ? "To" : "Go"}`;
}
function variantParts(variant, lang) {
  if (!variant) return [];
  const out = [];
  const ram = variant.match(/(\d+)(gb|tb) ram/);
  if (ram) out.push(lang === "fr" ? `${ram[1]} ${ram[2] === "tb" ? "To" : "Go"} RAM` : `${ram[1]}${ram[2].toUpperCase()} RAM`);
  if (/\bwifi\b/.test(variant)) out.push("Wi-Fi");
  if (/\bcellular\b/.test(variant)) out.push("Cellular");
  if (/\bdual sim\b/.test(variant)) out.push("Dual SIM");
  return out;
}
function modelLabel(parsed) {
  const display = parsed.normalized.modelDisplay;
  if (!parsed.criteria.model || !display) return null;
  return display.replace(/"/g, "").replace(/\s+/g, " ").trim();
}
function brandLabel(parsed, model) {
  const brand = parsed.normalized.brandDisplay;
  if (!brand || !parsed.criteria.brand) return null;
  if (model && normalizeText(model).startsWith(normalizeText(brand))) return null;
  return brand;
}
function join(parts) {
  return parts.filter((p) => typeof p === "string" && p.trim().length > 0).join(" ").replace(/\s+/g, " ").trim();
}
function discoveryTemplates(category, secondHand) {
  if (category === "smartphone" || category === "tablet") {
    return secondHand ? [
      { purpose: "b2b_intent", language: "fr", build: (b) => `${b.fr} grossiste reconditionn\xE9` },
      { purpose: "b2b_intent", language: "en", build: (b) => `${b.en} wholesale refurbished B2B` },
      { purpose: "liquidation", language: "fr", build: (b) => `lot ${b.fr} d\xE9stockage` }
    ] : [
      { purpose: "b2b_intent", language: "fr", build: (b) => `${b.fr} grossiste` },
      { purpose: "b2b_intent", language: "en", build: (b) => `${b.en} wholesale B2B` },
      { purpose: "liquidation", language: "fr", build: (b) => `lot ${b.fr} d\xE9stockage` }
    ];
  }
  if (category === "computer") {
    return [
      { purpose: "b2b_intent", language: "fr", build: (b) => `${b.fr} grossiste B2B` },
      { purpose: "b2b_intent", language: "en", build: (b) => `${b.en} wholesale bulk` },
      { purpose: "liquidation", language: "en", build: (b) => `${b.en} surplus liquidation` }
    ];
  }
  if (category === "console" || category === "audio" || category === "wearable" || category === "appliance") {
    return [
      { purpose: "b2b_intent", language: "fr", build: (b) => `${b.fr} grossiste` },
      { purpose: "b2b_intent", language: "en", build: (b) => `${b.en} wholesale bulk` },
      { purpose: "liquidation", language: "fr", build: (b) => `${b.fr} d\xE9stockage lot` }
    ];
  }
  return [
    { purpose: "b2b_intent", language: "fr", build: (b) => `${b.fr} grossiste` },
    { purpose: "b2b_intent", language: "en", build: (b) => `${b.en} wholesale` }
  ];
}
function dedupeKey2(text2) {
  return normalizeText(text2).split(" ").filter(Boolean).sort().join(" ");
}
function expandQuery(parsed, options = {}) {
  if (parsed.kind === "empty") return [];
  const max = Math.max(1, Math.floor(options.max ?? DEFAULT_MAX_EXPANSIONS));
  const maxDiscovery = options.includeDiscovery === false ? 0 : Math.max(0, Math.floor(options.maxDiscovery ?? DEFAULT_MAX_DISCOVERY));
  const adapter = [];
  const discovery = [];
  if (parsed.ean) adapter.push({ text: parsed.ean, purpose: "identifier", useFor: "adapter_search", language: "neutral" });
  if (parsed.mpn) adapter.push({ text: parsed.mpn, purpose: "identifier", useFor: "adapter_search", language: "neutral" });
  const model = modelLabel(parsed);
  const brand = brandLabel(parsed, model);
  const { storage, grade, color } = parsed.criteria;
  const variantEn = variantParts(parsed.normalized.variant, "en");
  const variantFr = variantParts(parsed.normalized.variant, "fr");
  const gradeLabel = grade ? `Grade ${grade}` : null;
  const condition = parsed.criteria.condition !== "unknown" ? parsed.criteria.condition : parsed.normalized.condition;
  let discoveryBase = null;
  if (model) {
    const colorEn = color ? parsed.normalized.colorDisplay : null;
    const colorFr = color ? COLOR_FR[color] ?? parsed.normalized.colorDisplay : null;
    const exactEn = join([brand, model, storageEn(storage), ...variantEn, colorEn, gradeLabel]);
    const exactFr = join([model, storageFr(storage), ...variantFr, colorFr, gradeLabel]);
    adapter.push({ text: exactEn, purpose: "exact", useFor: "adapter_search", language: "en" });
    adapter.push({ text: exactFr, purpose: "exact", useFor: "adapter_search", language: "fr" });
    if (condition !== "unknown") {
      const word = CONDITION_WORD[condition];
      adapter.push({ text: join([brand, model, storageEn(storage), word.en]), purpose: "condition", useFor: "adapter_search", language: "en" });
      adapter.push({ text: join([model, storageFr(storage), word.fr]), purpose: "condition", useFor: "adapter_search", language: "fr" });
    }
    discoveryBase = { en: join([brand, model]), fr: model };
  } else {
    const text2 = parsed.raw.replace(/\s+/g, " ").trim();
    const isIdentifierOnly = parsed.kind === "ean" || parsed.kind === "mpn";
    if (!isIdentifierOnly) adapter.push({ text: text2, purpose: "exact", useFor: "adapter_search", language: "neutral" });
    discoveryBase = { en: text2, fr: text2 };
  }
  if (discoveryBase && maxDiscovery > 0) {
    const secondHand = condition === "refurbished" || condition === "used" || grade !== null;
    for (const t of discoveryTemplates(detectCategory(parsed), secondHand)) {
      discovery.push({ text: t.build(discoveryBase).replace(/\s+/g, " ").trim(), purpose: t.purpose, useFor: "discovery", language: t.language });
    }
  }
  const seen = /* @__PURE__ */ new Set();
  const uniq = (list) => list.filter((d) => {
    if (!d.text) return false;
    const k = dedupeKey2(d.text);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const adapterU = uniq(adapter);
  const discoveryU = uniq(discovery);
  const reserved = Math.min(MIN_DISCOVERY_SLOTS, discoveryU.length, maxDiscovery, max);
  const adapterBudget = Math.min(adapterU.length, max - reserved);
  const discoveryBudget = Math.min(discoveryU.length, maxDiscovery, max - adapterBudget);
  const picked = [...adapterU.slice(0, adapterBudget), ...discoveryU.slice(0, discoveryBudget)];
  return picked.map((d, i) => ({ ...d, priority: i + 1 }));
}
function queriesFor(expanded, use) {
  return expanded.filter((q) => q.useFor === use).map((q) => q.text);
}

// src/domain/sourcing/offer-filter.ts
var STALE_OFFER_DAYS = 30;
var LOW_PRICE_RATIO = 0.4;
var HIGH_PRICE_RATIO = 2.5;
var MIN_PRICES_FOR_OUTLIER = 3;
var SUSPICIOUS_ANOMALY_CODES = /* @__PURE__ */ new Set(["price_zero", "price_negative", "price_missing", "price_too_low", "price_too_high", "currency_unknown", "negative_stock"]);
function criteriaFromParsedQuery(parsed, rawQuery) {
  const intent = rawQuery ? queryItemIntent(rawQuery) : { kind: "device", label: null };
  return { ...parsed.criteria, itemKind: intent.kind, itemLabel: intent.label };
}
function queryItemIntent(rawQuery) {
  const q = ` ${normalizeText(rawQuery)} `;
  if (/\blots?\b|\ben gros\b|\bwholesale\b|\bbulk\b|\bdestockage\b|\bpalettes?\b|\bretours?\b|\bsurplus\b/.test(q)) return { kind: "lot", label: null };
  for (const rule of TITLE_RULES) {
    if (rule.issue !== "spare_part" && rule.issue !== "accessory") continue;
    if (rule.re.test(q)) return { kind: rule.issue, label: rule.label };
  }
  return { kind: "device", label: null };
}
function gradeRank(grade) {
  if (!grade) return null;
  const parts = grade.toUpperCase().replace(/\s+/g, "").split("/").map((p) => {
    const m = p.match(/^([ABC])(\+)?$/);
    if (!m) return null;
    const base = m[1] === "A" ? 1 : m[1] === "B" ? 2 : 3;
    return m[2] ? base - 0.5 : base;
  });
  if (parts.length === 0 || parts.some((p) => p === null)) return null;
  return Math.max(...parts);
}
var w = (pattern) => new RegExp(`(?<![a-z0-9])(?:${pattern})(?![a-z0-9])`);
var TITLE_RULES = [
  { issue: "empty_box", label: "bo\xEEte vide", re: w("boite vide|empty box|box only|boite seule"), anywhere: true },
  { issue: "defective", label: "pour pi\xE8ces", re: w("pour pieces|for parts|parts only|pieces detachees uniquement"), anywhere: true },
  { issue: "defective", label: "HS", re: w("hs|hors service|en panne|ne fonctionne pas|not working|defectueux|faulty|broken|casse"), anywhere: true },
  { issue: "locked", label: "verrouillage iCloud", re: w("icloud lock|icloud locked|icloud bloque|bloque icloud|verrouille icloud|activation lock|blacklist|blackliste|blacklisted"), anywhere: true },
  { issue: "locked", label: "bloqu\xE9", re: w("bloque|locked|verrouille"), anywhere: true },
  { issue: "accessory", label: "coque", re: w("coque|coques|etui|housse|case|cover|bumper|protection ecran|protege ecran|screen protector|verre trempe|tempered glass"), anywhere: true },
  { issue: "accessory", label: "compatible", re: w("compatible avec|compatible with|compatible"), anywhere: false },
  { issue: "spare_part", label: "\xE9cran", re: w("ecran|screen|display|lcd|oled de remplacement"), anywhere: false },
  { issue: "spare_part", label: "vitre", re: w("vitre|vitre arriere|back glass|glass"), anywhere: false },
  { issue: "spare_part", label: "batterie", re: w("batterie|battery"), anywhere: false },
  { issue: "spare_part", label: "nappe / connecteur", re: w("nappe|flex|connecteur|connector|camera arriere|back camera|chassis|housing"), anywhere: false },
  { issue: "accessory", label: "c\xE2ble / chargeur", re: w("cable|cables|chargeur|charger|adaptateur|adapter|support voiture|car mount"), anywhere: false }
];
var PRODUCT_HEAD_TOKENS = ["iphone", "ipad", "galaxy", "pixel", "redmi", "poco", "macbook", "airpods", "playstation", "xbox", "switch", "surface", "oneplus", "xiaomi", "huawei", "honor", "oppo", "dyson"];
function productMentionIndex(title, model) {
  const candidates = new Set(PRODUCT_HEAD_TOKENS);
  const head = model?.split(" ")[0];
  if (head && head.length >= 2) candidates.add(head);
  let best = -1;
  for (const tok of candidates) {
    const m = title.match(w(tok));
    if (m && m.index !== void 0 && (best === -1 || m.index < best)) best = m.index;
  }
  return best;
}
function detectTitleIssue(rawTitle, model = null) {
  const title = ` ${normalizeText(rawTitle)} `;
  const mention = productMentionIndex(title, model);
  for (const rule of TITLE_RULES) {
    const m = title.match(rule.re);
    if (!m || m.index === void 0) continue;
    if (rule.anywhere) return { issue: rule.issue, label: rule.label };
    if (mention === -1 || m.index < mention) return { issue: rule.issue, label: rule.label };
  }
  return null;
}
var TITLE_ISSUE_MESSAGE = {
  accessory: (l) => `Accessoire d\xE9tect\xE9 dans le titre (\xAB ${l} \xBB) : ce n'est pas le produit recherch\xE9`,
  spare_part: (l) => `Pi\xE8ce d\xE9tach\xE9e d\xE9tect\xE9e dans le titre (\xAB ${l} \xBB) : ce n'est pas le produit recherch\xE9`,
  defective: (l) => `Appareil d\xE9fectueux / vendu pour pi\xE8ces (\xAB ${l} \xBB)`,
  locked: (l) => `Appareil verrouill\xE9 (\xAB ${l} \xBB) : inutilisable en l'\xE9tat`,
  empty_box: () => "Bo\xEEte vide : aucun appareil inclus"
};
function toDate(d) {
  if (!d) return null;
  const x = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(x.getTime()) ? null : x;
}
function sameText(a, b) {
  return normalizeText(a) === normalizeText(b);
}
function displayModel(m) {
  return m.replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/^Iphone/, "iPhone").replace(/^Ipad/, "iPad");
}
function pct(n) {
  return `${Math.round(n * 100)} %`;
}
function checkOffer(criteria, o, now, staleDays) {
  const reasons = [];
  const warnings = [];
  const expiresAt = toDate(o.expiresAt);
  if (o.status === "expired" || expiresAt && expiresAt.getTime() < now.getTime()) reasons.push({ code: "expired", message: "Offre expir\xE9e" });
  if (o.status === "rejected") reasons.push({ code: "status_rejected", message: "Offre rejet\xE9e par la validation des donn\xE9es" });
  const seen = toDate(o.lastSeenAt);
  if (!seen) warnings.push({ code: "last_seen_unknown", message: "Date de derni\xE8re v\xE9rification inconnue" });
  else {
    const days = (now.getTime() - seen.getTime()) / 864e5;
    if (days > staleDays) reasons.push({ code: "stale", message: `Donn\xE9e trop ancienne : vue il y a ${Math.floor(days)} jours (maximum ${staleDays} jours)` });
  }
  for (const a of o.anomalies) {
    const detail = a.message ?? a.code;
    if (a.severity === "blocking" || SUSPICIOUS_ANOMALY_CODES.has(a.code)) reasons.push({ code: "suspicious", message: `Anomalie suspecte : ${detail}` });
    else warnings.push({ code: "anomaly_warning", message: `\xC0 v\xE9rifier : ${detail}` });
  }
  if (o.status === "suspicious" && o.anomalies.length === 0) reasons.push({ code: "suspicious", message: "Offre marqu\xE9e suspecte par la validation des donn\xE9es" });
  const kind = criteria.itemKind ?? "device";
  const issue = detectTitleIssue(o.title, criteria.model ?? o.model);
  if (issue) {
    const wanted = (issue.issue === "spare_part" || issue.issue === "accessory") && issue.issue === kind && (!criteria.itemLabel || issue.label === criteria.itemLabel);
    const otherPiece = (issue.issue === "spare_part" || issue.issue === "accessory") && (kind === "spare_part" || kind === "accessory") && !wanted;
    if (!wanted) reasons.push({ code: issue.issue, message: otherPiece ? `${issue.issue === "spare_part" ? "Pi\xE8ce" : "Accessoire"} diff\xE9rent(e) de celle recherch\xE9e (\xAB ${issue.label} \xBB)` : TITLE_ISSUE_MESSAGE[issue.issue](issue.label) });
  } else if (kind === "spare_part" || kind === "accessory") {
    reasons.push({ code: kind, message: `Ce n'est pas ${kind === "spare_part" ? "la pi\xE8ce" : "l'accessoire"} recherch\xE9(e) (\xAB ${criteria.itemLabel ?? ""} \xBB)` });
  }
  if (criteria.brand && o.brand && !sameText(criteria.brand, o.brand)) {
    if (kind === "device" || kind === "lot") reasons.push({ code: "brand_mismatch", message: `Marque diff\xE9rente : ${o.brand} au lieu de ${criteria.brand}` });
    else warnings.push({ code: "brand_mismatch", message: `Marque de la pi\xE8ce : ${o.brand} (compatibilit\xE9 ${criteria.brand} \xE0 v\xE9rifier)` });
  }
  if (criteria.model) {
    if (!o.model || o.modelInferred) warnings.push({ code: "model_unknown", message: "Mod\xE8le non identifi\xE9 dans l'offre : correspondance \xE0 v\xE9rifier" });
    else if (!sameText(criteria.model, o.model)) reasons.push({ code: "model_mismatch", message: `Mod\xE8le diff\xE9rent : ${displayModel(o.model)} au lieu de ${displayModel(criteria.model)}` });
  }
  if (criteria.storage) {
    if (!o.storage) warnings.push({ code: "storage_unknown", message: "Stockage non communiqu\xE9" });
    else if (criteria.storage.toUpperCase() !== o.storage.toUpperCase()) reasons.push({ code: "storage_mismatch", message: `Stockage diff\xE9rent : ${o.storage} au lieu de ${criteria.storage}` });
  }
  if (criteria.color && o.color && !sameText(criteria.color, o.color)) warnings.push({ code: "color_mismatch", message: `Couleur diff\xE9rente : ${o.color} au lieu de ${criteria.color}` });
  if (criteria.condition !== "unknown") {
    if (o.condition === "unknown") warnings.push({ code: "condition_unknown", message: "\xC9tat non communiqu\xE9" });
    else if (o.condition !== criteria.condition) reasons.push({ code: "condition_mismatch", message: `\xC9tat diff\xE9rent : ${CONDITION_LABEL_FR[o.condition]} au lieu de ${CONDITION_LABEL_FR[criteria.condition]}` });
  }
  if (criteria.grade) {
    const wanted = gradeRank(criteria.grade);
    const got = gradeRank(o.grade);
    if (o.condition === "new" && !o.grade) warnings.push({ code: "grade_not_applicable", message: "Produit neuf : grade non applicable" });
    else if (got === null || wanted === null) warnings.push({ code: "grade_unknown", message: o.grade ? `Grade non reconnu (\xAB ${o.grade} \xBB)` : "Grade non communiqu\xE9" });
    else if (got > wanted) reasons.push({ code: "grade_lower", message: `Grade inf\xE9rieur : ${o.grade} au lieu de ${criteria.grade} minimum` });
  }
  if (o.price === null || !Number.isFinite(o.price) || o.price <= 0) warnings.push({ code: "price_unknown", message: "Prix non communiqu\xE9 : offre non comparable" });
  return { reasons, warnings };
}
function filterOffers(criteria, offers, options = {}) {
  const now = options.now ?? /* @__PURE__ */ new Date();
  const staleDays = options.staleDays ?? STALE_OFFER_DAYS;
  const lowRatio = options.lowPriceRatio ?? LOW_PRICE_RATIO;
  const highRatio = options.highPriceRatio ?? HIGH_PRICE_RATIO;
  const checked = offers.map((offer) => ({ offer, ...checkOffer(criteria, offer, now, staleDays) }));
  const referencePrices = checked.filter((c) => c.reasons.length === 0 && c.offer.price !== null && Number.isFinite(c.offer.price) && c.offer.price > 0).map((c) => c.offer.price);
  const referenceMedian = referencePrices.length >= MIN_PRICES_FOR_OUTLIER ? median(referencePrices) : null;
  if (referenceMedian !== null && referenceMedian > 0) {
    for (const c of checked) {
      const p = c.offer.price;
      if (p === null || !Number.isFinite(p) || p <= 0) continue;
      const ratio = p / referenceMedian;
      if (ratio < lowRatio) {
        if (c.offer.supplierVerified) c.warnings.push({ code: "price_low_verified", message: `Prix anormalement bas, \xE0 v\xE9rifier : ${pct(ratio)} de la m\xE9diane du r\xE9sultat` });
        else c.reasons.push({ code: "price_low_unverified", message: `Prix anormalement bas (${pct(ratio)} de la m\xE9diane du r\xE9sultat) chez un fournisseur non v\xE9rifi\xE9` });
      } else if (ratio > highRatio) {
        c.reasons.push({ code: "price_high", message: `Prix anormalement \xE9lev\xE9 : ${pct(ratio)} de la m\xE9diane du r\xE9sultat` });
      }
    }
  }
  const kept = [];
  const rejected = [];
  const rejectionCounts = {};
  for (const c of checked) {
    if (c.reasons.length === 0) kept.push({ offer: c.offer, warnings: c.warnings });
    else {
      rejected.push({ offer: c.offer, reasons: c.reasons, warnings: c.warnings });
      for (const code of new Set(c.reasons.map((r) => r.code))) rejectionCounts[code] = (rejectionCounts[code] ?? 0) + 1;
    }
  }
  return { kept, rejected, referenceMedian, rejectionCounts };
}
var FILTER_REASON_LABEL = {
  brand_mismatch: "Marque diff\xE9rente",
  model_mismatch: "Mod\xE8le diff\xE9rent",
  model_unknown: "Mod\xE8le non identifi\xE9",
  storage_mismatch: "Stockage diff\xE9rent",
  storage_unknown: "Stockage non communiqu\xE9",
  grade_lower: "Grade inf\xE9rieur",
  grade_unknown: "Grade non communiqu\xE9",
  grade_not_applicable: "Neuf (pas de grade)",
  condition_mismatch: "\xC9tat diff\xE9rent",
  condition_unknown: "\xC9tat non communiqu\xE9",
  color_mismatch: "Couleur diff\xE9rente",
  accessory: "Accessoire",
  spare_part: "Pi\xE8ce d\xE9tach\xE9e",
  defective: "D\xE9fectueux / pour pi\xE8ces",
  locked: "Appareil verrouill\xE9",
  empty_box: "Bo\xEEte vide",
  expired: "Offre expir\xE9e",
  status_rejected: "Offre rejet\xE9e",
  suspicious: "Anomalie suspecte",
  anomaly_warning: "Anomalie \xE0 v\xE9rifier",
  stale: "Donn\xE9e trop ancienne",
  last_seen_unknown: "Date de v\xE9rification inconnue",
  price_unknown: "Prix non communiqu\xE9",
  price_low_verified: "Prix anormalement bas, \xE0 v\xE9rifier",
  price_low_unverified: "Prix anormalement bas (fournisseur non v\xE9rifi\xE9)",
  price_high: "Prix anormalement \xE9lev\xE9",
  confirmed_link: "Associ\xE9e manuellement au SKU"
};

// src/domain/sourcing/ranking.ts
var RANKING_WEIGHTS = { price: 30, quality: 15, moq: 15, reliability: 15, delivery: 10, stock: 5, freshness: 5, data: 5 };
var AWARD_META = {
  best_opportunity: { emoji: "\u{1F947}", label: "Meilleure opportunit\xE9" },
  best_value: { emoji: "\u{1F948}", label: "Meilleur rapport qualit\xE9 / prix" },
  most_reliable: { emoji: "\u{1F949}", label: "Fournisseur le plus fiable" },
  lowest_price: { emoji: "\u{1F4B6}", label: "Prix le plus bas" },
  fastest_delivery: { emoji: "\u{1F69A}", label: "Livraison la plus rapide" },
  lowest_moq: { emoji: "\u{1F4E6}", label: "MOQ le plus faible" }
};
var NOT_AWARDED = "non attribu\xE9 : donn\xE9es insuffisantes";
function qualityFactor(condition, grade) {
  if (condition === "new") return 1;
  const r = gradeRank(grade);
  if (r === null) return null;
  if (r <= 0.5) return 0.97;
  if (r <= 1) return 0.95;
  if (r <= 1.5) return 0.9;
  if (r <= 2) return 0.85;
  if (r <= 2.5) return 0.8;
  return 0.75;
}
function round23(n) {
  return Math.round(n * 100) / 100;
}
function known(n) {
  return n !== null && n !== void 0 && Number.isFinite(n);
}
function formatMoney(amount, currency = "EUR") {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
function computeProcurement(offer, requestedQuantity, currentUnitCost = null, currency = "EUR") {
  const n = Math.max(1, Math.floor(requestedQuantity));
  const notes = [];
  const moq = known(offer.moq) && offer.moq >= 1 ? Math.floor(offer.moq) : null;
  const moqFeasible = moq === null ? null : moq <= n;
  let unitsForMov = null;
  if (known(offer.minimumOrderValue) && offer.minimumOrderValue > 0 && known(offer.unitPrice) && offer.unitPrice > 0) {
    unitsForMov = Math.ceil(round23(offer.minimumOrderValue / offer.unitPrice));
  }
  const unitsToBuy = Math.max(n, moq ?? 1, unitsForMov ?? 1);
  const overstockUnits = unitsToBuy - n;
  if (moq !== null && moq > n) notes.push(`MOQ ${moq} sup\xE9rieur \xE0 la quantit\xE9 demand\xE9e (${n}) : achat de ${moq} unit\xE9s, ${moq - n} en surplus`);
  if (unitsForMov !== null && unitsForMov > Math.max(n, moq ?? 1)) notes.push(`Minimum de commande de ${formatMoney(offer.minimumOrderValue, currency)} : achat de ${unitsForMov} unit\xE9s minimum`);
  if (known(offer.minimumOrderValue) && offer.minimumOrderValue > 0 && !known(offer.unitPrice)) notes.push(`Minimum de commande de ${formatMoney(offer.minimumOrderValue, currency)} (prix inconnu : impact non calculable)`);
  if (moq === null) notes.push("MOQ non communiqu\xE9");
  const goodsCost = known(offer.unitPrice) ? round23(unitsToBuy * offer.unitPrice) : null;
  const shipping = known(offer.shippingPerOrder) ? offer.shippingPerOrder : 0;
  const totalCost = known(offer.landedUnitCost) ? round23(unitsToBuy * offer.landedUnitCost + shipping) : null;
  if (!known(offer.landedUnitCost)) notes.push("Co\xFBt rendu inconnu : co\xFBt total non calculable");
  const overstockCost = overstockUnits > 0 && known(offer.landedUnitCost) ? round23(overstockUnits * offer.landedUnitCost) : null;
  let stockSufficient = null;
  if (offer.stockKnown && known(offer.availableQuantity)) {
    stockSufficient = offer.availableQuantity >= unitsToBuy;
    if (!stockSufficient) notes.push(`Stock insuffisant : ${offer.availableQuantity} disponible(s) pour ${unitsToBuy} \xE0 acheter`);
  } else notes.push("Stock non communiqu\xE9");
  const current = known(offer.currentUnitCost) ? offer.currentUnitCost : currentUnitCost;
  let savings = null;
  if (known(current) && known(offer.landedUnitCost)) {
    const perUnitWithShipping = offer.landedUnitCost + shipping / unitsToBuy;
    savings = round23((current - perUnitWithShipping) * n);
  }
  let expectedProfit = null;
  if (known(offer.marginPerUnit)) {
    const served = stockSufficient === false && known(offer.availableQuantity) ? Math.min(n, offer.availableQuantity) : n;
    expectedProfit = round23(offer.marginPerUnit * served);
  }
  return { requestedQuantity: n, unitsToBuy, overstockUnits, moqFeasible, unitsForMinimumOrderValue: unitsForMov, goodsCost, totalCost, overstockCost, stockSufficient, savings, expectedProfit, notes };
}
function relative2(value, min, max, points) {
  if (max === min) return points;
  const ratio = (value - min) / (max - min);
  return round1(points * (0.2 + 0.8 * Math.max(0, Math.min(1, 1 - ratio))));
}
function round1(n) {
  return Math.round(n * 10) / 10;
}
function freshnessPoints(hours) {
  if (hours <= 24) return 5;
  if (hours <= 48) return 4;
  if (hours <= 24 * 7) return 2;
  if (hours <= 24 * 30) return 1;
  return 0;
}
function ageLabel(hours) {
  if (hours < 1) return "il y a moins d'une heure";
  if (hours < 24) return `il y a ${Math.round(hours)} h`;
  const d = Math.round(hours / 24);
  return `il y a ${d} jour${d > 1 ? "s" : ""}`;
}
function conditionLabel(o) {
  if (o.condition === "new") return "Neuf";
  if (o.grade) return `${o.condition === "used" ? "Occasion" : "Reconditionn\xE9"} grade ${o.grade}`;
  return null;
}
function isOutOfStock(o) {
  return o.outOfStock === true || o.stockKnown && o.availableQuantity === 0;
}
function rankOpportunities(offers, context) {
  const n = Math.max(1, Math.floor(context.requestedQuantity));
  const currency = context.currency ?? "EUR";
  const currentUnitCost = known(context.currentUnitCost) ? context.currentUnitCost : null;
  const priced = offers.filter((o) => known(o.unitPrice) && o.unitPrice > 0);
  const priceBasis = priced.length > 0 && priced.every((o) => known(o.landedUnitCost)) ? "landed" : "unit";
  const priceBasisNote = priceBasis === "landed" ? "Comparaison sur le co\xFBt rendu (prix + frais connus)" : "Comparaison sur le prix unitaire : co\xFBt rendu inconnu pour au moins une offre";
  const effective = (o) => {
    const v2 = priceBasis === "landed" ? o.landedUnitCost : o.unitPrice;
    return known(v2) && v2 > 0 ? v2 : null;
  };
  const costs = offers.map(effective).filter(known);
  const minC = Math.min(...costs);
  const maxC = Math.max(...costs);
  const days = offers.map((o) => o.deliveryDays).filter(known);
  const minD = Math.min(...days);
  const maxD = Math.max(...days);
  const items = offers.map((o) => {
    const procurement = computeProcurement(o, n, currentUnitCost, currency);
    const cost = effective(o);
    const unknownFactors = [];
    const why = [];
    const price = cost !== null ? { points: relative2(cost, minC, maxC, RANKING_WEIGHTS.price), max: RANKING_WEIGHTS.price, known: true, note: cost === minC ? "Meilleur prix du r\xE9sultat" : `${Math.round((cost / minC - 1) * 100)} % au-dessus du meilleur prix` } : { points: 0, max: RANKING_WEIGHTS.price, known: false, note: "Prix non comparable" };
    if (!price.known) unknownFactors.push("prix");
    const qf = qualityFactor(o.condition, o.grade);
    const quality = qf !== null ? { points: round1(RANKING_WEIGHTS.quality * Math.max(0, (qf - 0.7) / 0.3)), max: RANKING_WEIGHTS.quality, known: true, note: conditionLabel(o) ?? "Qualit\xE9 connue" } : { points: 0, max: RANKING_WEIGHTS.quality, known: false, note: "\xC9tat / grade non communiqu\xE9" };
    if (!quality.known) unknownFactors.push("\xE9tat / grade");
    const moq = procurement.moqFeasible === null ? { points: 0, max: RANKING_WEIGHTS.moq, known: false, note: "MOQ non communiqu\xE9" } : procurement.moqFeasible ? { points: RANKING_WEIGHTS.moq, max: RANKING_WEIGHTS.moq, known: true, note: `MOQ ${o.moq} \u2264 ${n} demand\xE9(s)` } : { points: round1(RANKING_WEIGHTS.moq * (n / o.moq)), max: RANKING_WEIGHTS.moq, known: true, note: `MOQ ${o.moq} > ${n} demand\xE9(s)` };
    if (!moq.known) unknownFactors.push("MOQ");
    const reliability = known(o.supplierReliability) ? { points: round1(Math.max(0, Math.min(100, o.supplierReliability)) / 100 * RANKING_WEIGHTS.reliability), max: RANKING_WEIGHTS.reliability, known: true, note: `Score fournisseur ${Math.round(o.supplierReliability)}/100` } : { points: 0, max: RANKING_WEIGHTS.reliability, known: false, note: "Fiabilit\xE9 fournisseur inconnue (donn\xE9es insuffisantes)" };
    if (!reliability.known) unknownFactors.push("fiabilit\xE9 fournisseur");
    const delivery = known(o.deliveryDays) ? { points: relative2(o.deliveryDays, minD, maxD, RANKING_WEIGHTS.delivery), max: RANKING_WEIGHTS.delivery, known: true, note: `Livraison sous ${o.deliveryDays} j${o.deliveryDays === minD ? " (la plus rapide)" : ""}` } : { points: 0, max: RANKING_WEIGHTS.delivery, known: false, note: "D\xE9lai non communiqu\xE9" };
    if (!delivery.known) unknownFactors.push("d\xE9lai");
    const stock = procurement.stockSufficient === null ? { points: 0, max: RANKING_WEIGHTS.stock, known: false, note: "Stock non communiqu\xE9" } : procurement.stockSufficient ? { points: RANKING_WEIGHTS.stock, max: RANKING_WEIGHTS.stock, known: true, note: `${o.availableQuantity} en stock` } : { points: round1(RANKING_WEIGHTS.stock * Math.min(1, o.availableQuantity / procurement.unitsToBuy)), max: RANKING_WEIGHTS.stock, known: true, note: `Stock insuffisant (${o.availableQuantity})` };
    if (!stock.known) unknownFactors.push("stock");
    const freshness2 = known(o.freshnessHours) ? { points: freshnessPoints(o.freshnessHours), max: RANKING_WEIGHTS.freshness, known: true, note: `V\xE9rifi\xE9 ${ageLabel(o.freshnessHours)}` } : { points: 0, max: RANKING_WEIGHTS.freshness, known: false, note: "Date de v\xE9rification inconnue" };
    if (!freshness2.known) unknownFactors.push("fra\xEEcheur");
    const completeness = Math.max(0, Math.min(1, o.dataCompleteness));
    const data = { points: round1(completeness * RANKING_WEIGHTS.data), max: RANKING_WEIGHTS.data, known: true, note: `${Math.round(completeness * 100)} % des donn\xE9es renseign\xE9es` };
    const components = { price, quality, moq, reliability, delivery, stock, freshness: freshness2, data };
    const score = round1(Object.values(components).reduce((s, c) => s + c.points, 0));
    if (procurement.expectedProfit !== null) why.push(`B\xE9n\xE9fice estim\xE9 de ${formatMoney(procurement.expectedProfit, currency)} pour ${n} unit\xE9(s) (${formatMoney(o.marginPerUnit, currency)} par unit\xE9)`);
    if (procurement.savings !== null) {
      why.push(procurement.savings >= 0 ? `\xC9conomie de ${formatMoney(procurement.savings, currency)} pour ${n} unit\xE9(s) par rapport \xE0 votre co\xFBt actuel` : `Surco\xFBt de ${formatMoney(-procurement.savings, currency)} pour ${n} unit\xE9(s) par rapport \xE0 votre co\xFBt actuel`);
    }
    if (price.known) why.push(price.note);
    if (quality.known) why.push(quality.note);
    else why.push("\xC9tat / grade non communiqu\xE9");
    if (procurement.moqFeasible === false) {
      why.push(`MOQ ${o.moq} > ${n} demand\xE9(s) : achat de ${procurement.unitsToBuy} unit\xE9s (${procurement.overstockUnits} en surplus${procurement.overstockCost !== null ? `, ${formatMoney(procurement.overstockCost, currency)} immobilis\xE9s` : ""})`);
    } else if (procurement.moqFeasible === true) why.push(`MOQ ${o.moq} compatible avec ${n} unit\xE9(s)`);
    else why.push("MOQ non communiqu\xE9");
    if (procurement.totalCost !== null) why.push(`Co\xFBt total pour ${procurement.unitsToBuy} unit\xE9(s) : ${formatMoney(procurement.totalCost, currency)}`);
    if (reliability.known) why.push(o.supplierReliability >= 70 ? `Fournisseur fiable (score ${Math.round(o.supplierReliability)}/100)` : reliability.note);
    else why.push("Fiabilit\xE9 fournisseur inconnue");
    if (delivery.known) why.push(delivery.note);
    if (isOutOfStock(o)) why.unshift("Rupture de stock annonc\xE9e par la source : class\xE9e apr\xE8s les offres disponibles");
    else if (procurement.stockSufficient === false) why.push(`Stock insuffisant : ${o.availableQuantity} disponible(s)`);
    else if (procurement.stockSufficient === null) why.push("Stock non communiqu\xE9");
    if (freshness2.known) why.push(freshness2.note);
    const qualityAdjustedPrice = cost !== null && qf !== null ? round23(cost / qf) : null;
    return { offer: o, rank: 0, score, components, unknownFactors, procurement, effectiveUnitCost: cost, qualityAdjustedPrice, why, awards: [] };
  });
  const byId = (a, b) => a.offer.id < b.offer.id ? -1 : a.offer.id > b.offer.id ? 1 : 0;
  const nullsLast = (get, asc) => (a, b) => {
    const va = get(a);
    const vb = get(b);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return asc ? va - vb : vb - va;
  };
  const chain = (...cmps) => (a, b) => {
    for (const c of cmps) {
      const r = c(a, b);
      if (r !== 0) return r;
    }
    return 0;
  };
  const availableFirst = (a, b) => (isOutOfStock(a.offer) ? 1 : 0) - (isOutOfStock(b.offer) ? 1 : 0);
  const tieBreak = chain(availableFirst, nullsLast((r) => r.score, false), nullsLast((r) => r.procurement.expectedProfit, false), nullsLast((r) => r.effectiveUnitCost, true), byId);
  items.sort(tieBreak);
  items.forEach((r, i) => r.rank = i + 1);
  const distinct = context.distinctPodium !== false;
  const podiumTaken = /* @__PURE__ */ new Set();
  const award = (key2, winner, reason, basis) => {
    if (winner) {
      winner.awards.push(key2);
      return { key: key2, ...AWARD_META[key2], offerId: winner.offer.id, reason, ...basis ? { basis } : {} };
    }
    return { key: key2, ...AWARD_META[key2], offerId: null, reason, ...basis ? { basis } : {} };
  };
  const pick = (candidates, cmp, podium2) => {
    const pool = podium2 && distinct ? candidates.filter((c) => !podiumTaken.has(c.offer.id)) : candidates;
    const sorted = [...pool].sort(chain(cmp, tieBreak));
    const w2 = sorted[0] ?? null;
    if (w2 && podium2) podiumTaken.add(w2.offer.id);
    return { winner: w2, hadCandidates: candidates.length > 0 };
  };
  const notAwarded = (detail, hadCandidates) => hadCandidates ? "non attribu\xE9 : aucune autre offre \xE9ligible" : `${NOT_AWARDED} (${detail})`;
  const feasibleFirst = (a, b) => availableFirst(a, b) || (a.procurement.moqFeasible === false ? 1 : 0) - (b.procurement.moqFeasible === false ? 1 : 0);
  const podium = [];
  const withProfit = items.filter((r) => r.procurement.expectedProfit !== null);
  if (withProfit.length > 0) {
    const { winner } = pick(withProfit, chain(feasibleFirst, nullsLast((r) => r.procurement.expectedProfit, false)), true);
    podium.push(award("best_opportunity", winner, winner ? `B\xE9n\xE9fice estim\xE9 le plus \xE9lev\xE9 : ${formatMoney(winner.procurement.expectedProfit, currency)} pour ${n} unit\xE9(s)${winner.procurement.moqFeasible === false ? ` (MOQ ${winner.offer.moq} : ${winner.procurement.overstockUnits} unit\xE9(s) en surplus)` : ""}` : NOT_AWARDED, "profit"));
  } else {
    const eligible = items.filter((r) => r.components.price.known);
    const { winner, hadCandidates } = pick(eligible, chain(availableFirst, nullsLast((r) => r.score, false)), true);
    podium.push(award("best_opportunity", winner, winner ? `Meilleur score global (${winner.score}/100) \u2014 marge inconnue : b\xE9n\xE9fice non calculable` : notAwarded("aucun prix comparable", hadCandidates), "composite"));
  }
  {
    const eligible = items.filter((r) => r.qualityAdjustedPrice !== null);
    const { winner, hadCandidates } = pick(eligible, chain(feasibleFirst, nullsLast((r) => r.qualityAdjustedPrice, true)), true);
    podium.push(
      award(
        "best_value",
        winner,
        winner ? `Prix pond\xE9r\xE9 par la qualit\xE9 le plus bas : ${formatMoney(winner.qualityAdjustedPrice, currency)} (${conditionLabel(winner.offer) ?? "qualit\xE9 connue"}, ${formatMoney(winner.effectiveUnitCost, currency)})${winner.procurement.moqFeasible === false ? ` \u2014 MOQ ${winner.offer.moq} sup\xE9rieur au besoin` : ""}` : notAwarded("prix ou \xE9tat / grade inconnus", hadCandidates)
      )
    );
  }
  {
    const eligible = items.filter((r) => known(r.offer.supplierReliability));
    const reliabilityScore = (r) => r.offer.supplierReliability * 0.7 + r.components.freshness.points / RANKING_WEIGHTS.freshness * 20 + (r.procurement.stockSufficient !== null ? 10 : 0);
    const { winner, hadCandidates } = pick(eligible, chain(availableFirst, nullsLast(reliabilityScore, false)), true);
    podium.push(
      award(
        "most_reliable",
        winner,
        winner ? `Score fournisseur ${Math.round(winner.offer.supplierReliability)}/100${winner.components.freshness.known ? `, ${winner.components.freshness.note.toLowerCase()}` : ""}${winner.procurement.stockSufficient !== null ? ", stock communiqu\xE9" : ""}` : notAwarded("aucun fournisseur avec un score de fiabilit\xE9", hadCandidates)
      )
    );
  }
  const highlights = [];
  {
    const eligible = items.filter((r) => r.effectiveUnitCost !== null);
    const { winner } = pick(eligible, nullsLast((r) => r.effectiveUnitCost, true), false);
    highlights.push(award("lowest_price", winner, winner ? `${formatMoney(winner.effectiveUnitCost, currency)} par unit\xE9 (${priceBasis === "landed" ? "co\xFBt rendu" : "prix unitaire"})` : `${NOT_AWARDED} (aucun prix comparable)`));
  }
  {
    const eligible = items.filter((r) => known(r.offer.deliveryDays));
    const { winner } = pick(eligible, nullsLast((r) => r.offer.deliveryDays, true), false);
    highlights.push(award("fastest_delivery", winner, winner ? `Livraison sous ${winner.offer.deliveryDays} j` : `${NOT_AWARDED} (aucun d\xE9lai communiqu\xE9)`));
  }
  {
    const eligible = items.filter((r) => known(r.offer.moq) && r.offer.moq >= 1);
    const { winner } = pick(eligible, nullsLast((r) => r.offer.moq, true), false);
    highlights.push(award("lowest_moq", winner, winner ? `MOQ de ${winner.offer.moq} unit\xE9(s)` : `${NOT_AWARDED} (aucun MOQ communiqu\xE9)`));
  }
  return { ranked: items, podium, highlights, priceBasis, priceBasisNote };
}

// src/domain/sourcing/search-pipeline.ts
var CONFIRMED_LINK_OVERRIDABLE = /* @__PURE__ */ new Set(["brand_mismatch", "model_mismatch", "storage_mismatch"]);
function filterWithConfirmedLinks(criteria, offers, options = {}) {
  const base = filterOffers(criteria, offers, options);
  const kept = [...base.kept];
  const rejected = [];
  for (const r of base.rejected) {
    if (r.offer.linkedToTarget && r.reasons.every((x) => CONFIRMED_LINK_OVERRIDABLE.has(x.code))) {
      kept.push({ offer: r.offer, warnings: [{ code: "confirmed_link", message: `Associ\xE9e manuellement \xE0 ce SKU malgr\xE9 : ${r.reasons.map((x) => x.message.toLowerCase()).join(" ; ")}` }, ...r.warnings] });
    } else rejected.push(r);
  }
  const rejectionCounts = {};
  for (const r of rejected) for (const code of new Set(r.reasons.map((x) => x.code))) rejectionCounts[code] = (rejectionCounts[code] ?? 0) + 1;
  const order = new Map(offers.map((o, i) => [o, i]));
  kept.sort((a, b) => (order.get(a.offer) ?? 0) - (order.get(b.offer) ?? 0));
  return { kept, rejected, referenceMedian: base.referenceMedian, rejectionCounts };
}
function summarizeRejections(rejected) {
  const counts = /* @__PURE__ */ new Map();
  for (const r of rejected) for (const code of new Set(r.reasons.map((x) => x.code))) counts.set(code, (counts.get(code) ?? 0) + 1);
  const groups = Array.from(counts.entries()).map(([code, count]) => ({ code, label: FILTER_REASON_LABEL[code] ?? code, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fr"));
  return { count: rejected.length, groups };
}
function round24(n) {
  return Math.round(n * 100) / 100;
}
function savingsOf(r, currentUnitCost) {
  const n = r.procurement.requestedQuantity;
  if (r.procurement.savings !== null) return { amount: r.procurement.savings, perUnit: round24(r.procurement.savings / n), quantity: n, basis: "landed" };
  if (currentUnitCost === null || !Number.isFinite(currentUnitCost) || r.offer.unitPrice === null || !Number.isFinite(r.offer.unitPrice) || r.offer.unitPrice <= 0) return null;
  const perUnit = round24(currentUnitCost - r.offer.unitPrice);
  return { amount: round24(perUnit * n), perUnit, quantity: n, basis: "unit" };
}
function bestSavings(ranked, currentUnitCost) {
  let best = null;
  for (const r of ranked) {
    const s = savingsOf(r, currentUnitCost);
    if (!s || s.amount <= 0) continue;
    if (!best || s.amount > best.amount) best = { ...s, offerId: r.offer.id };
  }
  return best;
}
function runOfferPipeline(criteria, offers, options) {
  const now = options.now ?? /* @__PURE__ */ new Date();
  const filter = filterWithConfirmedLinks(criteria, offers, { now });
  const kept = filter.kept.map((k) => k.offer);
  const deduped = options.dedupe ? options.dedupe(kept) : kept;
  const unique = Array.isArray(deduped) ? deduped : deduped.kept;
  const collapsed = Array.isArray(deduped) ? /* @__PURE__ */ new Map() : deduped.collapsed;
  const currentUnitCost = options.currentUnitCost ?? null;
  const ranking = rankOpportunities(unique, { requestedQuantity: options.requestedQuantity, currentUnitCost, currency: options.currency ?? "EUR" });
  const warnings = /* @__PURE__ */ new Map();
  for (const k of filter.kept) warnings.set(k.offer.id, k.warnings);
  return { filter, unique, collapsed, ranking, rejection: summarizeRejections(filter.rejected), bestSavings: bestSavings(ranking.ranked, currentUnitCost), warnings };
}

// src/domain/sourcing/confidence.ts
var CONFIDENCE_META = {
  verified_recently: { emoji: "\u{1F7E2}", label: "V\xE9rifi\xE9 r\xE9cemment" },
  unconfirmed: { emoji: "\u26AA", label: "\xC0 confirmer" },
  stock_uncertain: { emoji: "\u{1F7E0}", label: "Stock incertain" },
  stale: { emoji: "\u{1F7E1}", label: "Donn\xE9e ancienne" },
  expired: { emoji: "\u{1F534}", label: "Offre expir\xE9e" }
};
var FRESH_HOURS = 24;
var STALE_AFTER_HOURS = 48;
var EXPIRED_AFTER_DAYS = 30;
var MIN_PRICE_CONFIDENCE = 0.9;
var MIN_STOCK_CONFIDENCE = 0.6;
function toDate2(d) {
  if (!d) return null;
  const x = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(x.getTime()) ? null : x;
}
function plural2(n, word) {
  return `${n} ${word}${n > 1 ? "s" : ""}`;
}
function formatRelativeFr(ms) {
  const safe = Math.max(0, ms);
  const minutes = Math.floor(safe / 6e4);
  if (minutes < 1) return "\xE0 l'instant";
  if (minutes < 60) return `il y a ${plural2(minutes, "minute")}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${plural2(hours, "heure")}`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `il y a ${plural2(days, "jour")}`;
  const months = Math.floor(days / 30);
  return `il y a ${months} mois`;
}
function formatLastChecked(lastSeenAt, now = /* @__PURE__ */ new Date()) {
  const d = toDate2(lastSeenAt);
  if (!d) return "Derni\xE8re v\xE9rification : date inconnue";
  return `Derni\xE8re v\xE9rification : ${formatRelativeFr(now.getTime() - d.getTime())}`;
}
function assessOfferConfidence(input, now = /* @__PURE__ */ new Date()) {
  const seen = toDate2(input.lastSeenAt);
  const ageMs = seen ? Math.max(0, now.getTime() - seen.getTime()) : null;
  const ageHours = ageMs !== null ? ageMs / 36e5 : null;
  const lastCheckedLabel = formatLastChecked(input.lastSeenAt, now);
  const expired2 = [];
  const stale = [];
  const stock = [];
  const unconfirmed = [];
  const expiresAt = toDate2(input.expiresAt);
  if (input.status === "expired") expired2.push("Offre marqu\xE9e expir\xE9e par la source");
  if (input.status === "rejected") expired2.push("Offre rejet\xE9e par la validation des donn\xE9es");
  if (expiresAt && expiresAt.getTime() < now.getTime()) expired2.push("Date d'expiration d\xE9pass\xE9e");
  if (ageHours !== null && ageHours > EXPIRED_AFTER_DAYS * 24) expired2.push(`Non revue depuis plus de ${EXPIRED_AFTER_DAYS} jours`);
  if (ageHours === null) stale.push("Date de derni\xE8re v\xE9rification inconnue");
  else if (ageHours > STALE_AFTER_HOURS) stale.push(`Vue ${formatRelativeFr(ageMs)} (plus de ${STALE_AFTER_HOURS} h)`);
  if (!input.stockKnown) stock.push("Stock non communiqu\xE9 par la source");
  else if (input.stockConfidence !== null && input.stockConfidence < MIN_STOCK_CONFIDENCE) stock.push(`Confiance stock faible (${Math.round(input.stockConfidence * 100)} %)`);
  if (input.sourceDiscovered && !input.sourceValidated) stock.push("Source d\xE9couverte automatiquement, pas encore valid\xE9e");
  else if (input.sourceValidated === false) stock.push("Source non valid\xE9e");
  if (ageHours !== null && ageHours > FRESH_HOURS && ageHours <= STALE_AFTER_HOURS) unconfirmed.push(`Vue ${formatRelativeFr(ageMs)} (plus de ${FRESH_HOURS} h)`);
  if (input.priceConfidence === null) unconfirmed.push("Confiance prix inconnue");
  else if (input.priceConfidence < MIN_PRICE_CONFIDENCE) unconfirmed.push(`Confiance prix ${Math.round(input.priceConfidence * 100)} % (< ${Math.round(MIN_PRICE_CONFIDENCE * 100)} %)`);
  if (input.status === "suspicious") unconfirmed.push("Offre signal\xE9e suspecte par la validation");
  const build = (level, reasons) => ({ level, ...CONFIDENCE_META[level], reasons, ageMinutes: ageMs !== null ? Math.floor(ageMs / 6e4) : null, lastCheckedLabel });
  if (expired2.length > 0) return build("expired", expired2);
  if (stale.length > 0) return build("stale", [...stale, ...stock]);
  if (stock.length > 0) return build("stock_uncertain", [...stock, ...unconfirmed]);
  if (unconfirmed.length === 0 && input.status === "active" && ageHours !== null && ageHours <= FRESH_HOURS) {
    return build("verified_recently", [`Vue ${formatRelativeFr(ageMs)}`, `Confiance prix ${Math.round(input.priceConfidence * 100)} %`]);
  }
  return build("unconfirmed", unconfirmed.length > 0 ? unconfirmed : ["Donn\xE9es \xE0 confirmer"]);
}

// src/domain/sourcing/price-insights.ts
var INSIGHT_MIN_POINTS = 5;
var INSIGHT_MIN_SPAN_DAYS = 14;
var INSIGHT_MIN_SOURCES = 1;
var OPPORTUNITY_MIN_PERCENT = 5;
var ABNORMAL_LOW_PERCENT = 35;
var TREND_STABLE_PERCENT = 3;
function round25(n) {
  return Math.round(n * 100) / 100;
}
function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * Math.max(0, Math.min(1, p));
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
function medianOf(values) {
  return percentile([...values].sort((a, b) => a - b), 0.5);
}
function formatAmount(n) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n);
}
function currencySymbol(currency) {
  return currency === "EUR" ? "\u20AC" : currency === "USD" ? "$" : currency === "GBP" ? "\xA3" : currency;
}
function computePriceInsights(points, currentPrice, options = {}) {
  const now = options.now ?? /* @__PURE__ */ new Date();
  const currency = options.currency ?? "EUR";
  const sym = currencySymbol(currency);
  const windowDays = options.windowDays ?? 90;
  const minPoints = options.minPoints ?? INSIGHT_MIN_POINTS;
  const minSpan = options.minSpanDays ?? INSIGHT_MIN_SPAN_DAYS;
  const minSources = options.minSources ?? INSIGHT_MIN_SOURCES;
  const oppMin = options.opportunityMinPercent ?? OPPORTUNITY_MIN_PERCENT;
  const abnormal = options.abnormalLowPercent ?? ABNORMAL_LOW_PERCENT;
  const stableThreshold = options.stableThresholdPercent ?? TREND_STABLE_PERCENT;
  const cutoff = now.getTime() - windowDays * 864e5;
  const clean = points.map((p) => ({ price: p.price, at: typeof p.recordedAt === "string" ? new Date(p.recordedAt) : p.recordedAt, source: p.sourceId ?? "__unknown__" })).filter((p) => Number.isFinite(p.price) && p.price > 0 && !Number.isNaN(p.at.getTime()) && p.at.getTime() >= cutoff && p.at.getTime() <= now.getTime()).sort((a, b) => a.at.getTime() - b.at.getTime());
  const pointCount = clean.length;
  const spanDays = pointCount > 1 ? round25((clean[pointCount - 1].at.getTime() - clean[0].at.getTime()) / 864e5) : 0;
  const sourceCount = new Set(clean.map((p) => p.source)).size;
  const cp = currentPrice !== null && Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : null;
  const best = clean.length > 0 ? clean.reduce((b, p) => p.price < b.price ? p : b, clean[0]) : null;
  const bestObserved = best ? { price: best.price, recordedAt: best.at.toISOString(), label: `Meilleur prix observ\xE9 : ${formatAmount(best.price)} ${sym} le ${best.at.toLocaleDateString("fr-FR", { timeZone: "UTC" })}` } : null;
  const base = { reliable: false, reason: null, pointCount, spanDays, sourceCount, usualRange: null, trend: null, bestObserved, currentPrice: cp, vsUsualPercent: null, opportunity: null, abnormalLow: null };
  if (pointCount < minPoints || spanDays < minSpan || sourceCount < minSources) {
    return { ...base, reason: `Historique insuffisant : ${pointCount} relev\xE9(s) sur ${Math.floor(spanDays)} jour(s) (minimum ${minPoints} relev\xE9s sur ${minSpan} jours)` };
  }
  const sorted = clean.map((p) => p.price).sort((a, b) => a - b);
  const p25 = round25(percentile(sorted, 0.25));
  const med = round25(percentile(sorted, 0.5));
  const p75 = round25(percentile(sorted, 0.75));
  const usualRange = { p25, median: med, p75, label: `${formatAmount(p25)}\u2013${formatAmount(p75)} ${sym}` };
  const mid = clean[0].at.getTime() + (clean[pointCount - 1].at.getTime() - clean[0].at.getTime()) / 2;
  const early = clean.filter((p) => p.at.getTime() <= mid).map((p) => p.price);
  const late = clean.filter((p) => p.at.getTime() > mid).map((p) => p.price);
  let trend = null;
  const em = medianOf(early);
  const lm = medianOf(late);
  if (em !== null && lm !== null && em > 0) {
    const change = round25((lm - em) / em * 100);
    const direction = Math.abs(change) < stableThreshold ? "stable" : change > 0 ? "hausse" : "baisse";
    const label = direction === "stable" ? "Prix stable sur la p\xE9riode" : `Tendance \xE0 la ${direction} : ${change > 0 ? "+" : "\u2212"}${formatAmount(Math.abs(change))} % sur la p\xE9riode`;
    trend = { direction, changePercent: change, label };
  }
  let vsUsualPercent = null;
  let opportunity = null;
  let abnormalLow = null;
  if (cp !== null && med > 0) {
    vsUsualPercent = round25((cp - med) / med * 100);
    const below = -vsUsualPercent;
    if (below > abnormal) {
      abnormalLow = { percentBelow: below, message: `\u26A0\uFE0F Prix anormalement bas \u2014 ${formatAmount(Math.round(below))} % sous le prix habituel observ\xE9 (${usualRange.label}) : \xE0 v\xE9rifier avant d'acheter` };
    } else if (cp < p25 && below >= oppMin) {
      opportunity = { percentBelow: below, message: `\u{1F525} Opportunit\xE9 d\xE9tect\xE9e \u2014 prix inf\xE9rieur de ${formatAmount(Math.round(below))} % au prix habituel observ\xE9 (${usualRange.label})` };
    }
  }
  return { ...base, reliable: true, usualRange, trend, vsUsualPercent, opportunity, abnormalLow };
}

// src/domain/sourcing/price-history.ts
function groupPriceHistory(rows, orgCurrency) {
  const map = /* @__PURE__ */ new Map();
  const cur = orgCurrency.toUpperCase();
  for (const r of rows) {
    const price = r.normalized_price !== null && (r.normalized_currency ?? "").toUpperCase() === cur ? Number(r.normalized_price) : r.original_currency.toUpperCase() === cur ? Number(r.original_price) : null;
    if (price === null || !Number.isFinite(price) || price <= 0) continue;
    const list = map.get(r.offer_id) ?? [];
    list.push({ price, recordedAt: r.recorded_at, offerId: r.offer_id });
    map.set(r.offer_id, list);
  }
  for (const list of map.values()) list.sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
  return map;
}

// src/services/sourcing/price-history-query.ts
var PRICE_HISTORY_POINTS_PER_OFFER = 200;
var POSTGREST_MAX_ROWS = 1e3;
var PRICE_HISTORY_CONCURRENCY = 8;
var PRICE_HISTORY_COLUMNS = "offer_id, original_price, original_currency, normalized_price, normalized_currency, recorded_at";
async function loadRecentPriceHistory(supabase, organizationId, offerIds, since, options = {}) {
  const perOffer = Math.max(1, Math.min(options.perOffer ?? PRICE_HISTORY_POINTS_PER_OFFER, POSTGREST_MAX_ROWS - 1));
  const concurrency = Math.max(1, options.concurrency ?? PRICE_HISTORY_CONCURRENCY);
  const ids = [...new Set(offerIds)];
  const out = { rows: [], failedOfferIds: [], cappedOfferIds: [] };
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const offerId = ids[next++];
      const { data, error } = await supabase.from("supplier_price_history").select(PRICE_HISTORY_COLUMNS).eq("organization_id", organizationId).eq("offer_id", offerId).gte("recorded_at", since).order("recorded_at", { ascending: false }).limit(perOffer);
      if (error) {
        out.failedOfferIds.push(offerId);
        continue;
      }
      const rows = data ?? [];
      if (rows.length >= perOffer) out.cappedOfferIds.push(offerId);
      out.rows.push(...rows);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
  return out;
}

// src/services/sourcing/discovery/candidate-analyzer.ts
var SUPPLIER_TYPE_LABEL = {
  wholesaler: "Grossiste",
  distributor: "Distributeur",
  refurbisher: "Reconditionneur",
  liquidation: "D\xE9stockage / liquidation",
  broker: "Broker",
  b2b_marketplace: "Marketplace B2B",
  unknown: "Type inconnu"
};
var ACCESS_LABEL = {
  public: "Acc\xE8s public",
  account: "Compte requis",
  protected: "Compte requis / prot\xE9g\xE9",
  unknown: "Acc\xE8s non v\xE9rifi\xE9"
};
var PRICE_VISIBILITY_LABEL = {
  public: "Prix publics",
  after_login: "Prix apr\xE8s connexion",
  unknown: "Visibilit\xE9 des prix inconnue"
};
var MULTI_PART_SUFFIXES = /* @__PURE__ */ new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "me.uk",
  "ltd.uk",
  "plc.uk",
  "com.au",
  "net.au",
  "org.au",
  "co.nz",
  "co.za",
  "co.jp",
  "ne.jp",
  "or.jp",
  "co.kr",
  "co.in",
  "co.il",
  "com.br",
  "com.mx",
  "com.ar",
  "com.tr",
  "com.cn",
  "com.hk",
  "com.sg",
  "com.tw",
  "com.my",
  "com.ph",
  "com.vn",
  "com.ua",
  "com.pl",
  "com.es",
  "com.pt",
  "com.gr",
  "com.ro",
  "com.eg",
  "com.sa",
  "gouv.fr",
  "asso.fr",
  "com.fr",
  "nom.fr",
  "co.at",
  "or.at",
  "co.it"
]);
function registrableDomain(hostOrUrl) {
  let host = hostOrUrl.trim().toLowerCase();
  if (!host) return null;
  if (host.includes("/") || host.includes(":")) {
    try {
      host = new URL(host.includes("://") ? host : `https://${host}`).hostname;
    } catch {
      return null;
    }
  }
  host = host.replace(/\.$/, "").replace(/^www\d*\./, "");
  if (/^[\d.]+$/.test(host) || host.includes("[") || !host.includes(".")) return null;
  const labels = host.split(".");
  const lastTwo = labels.slice(-2).join(".");
  if (MULTI_PART_SUFFIXES.has(lastTwo) && labels.length >= 3) return labels.slice(-3).join(".");
  return lastTwo;
}
function domainLabel(domain) {
  return domain.split(".")[0] ?? domain;
}
var EXCLUDED_DOMAIN_RULES = [
  { labels: ["amazon", "ebay", "backmarket", "cdiscount", "fnac", "darty", "boulanger", "rakuten", "aliexpress", "temu", "wish", "shein", "vinted", "leboncoin", "rueducommerce", "ldlc", "materiel", "carrefour", "auchan", "leclerc", "e-leclerc", "walmart", "bestbuy", "mediamarkt", "saturn", "currys", "argos", "otto", "zalando", "etsy", "allegro", "bol", "kaufland", "manomano", "veepee", "showroomprive", "ubaldi", "son-video", "electrodepot", "conforama", "but"], reason: "Marketplace / enseigne grand public" },
  { labels: ["idealo", "ledenicheur", "pricerunner", "kelkoo", "twenga", "pricespy", "geizhals", "billiger", "shopping", "lesnumeriques", "dealabs", "pricegrabber", "camelcamelcamel", "keepa", "touslesprix", "monsieurprix"], reason: "Comparateur de prix / bons plans" },
  { labels: ["google", "bing", "yahoo", "duckduckgo", "qwant", "ecosia", "brave", "baidu", "yandex"], reason: "Moteur de recherche" },
  { labels: ["facebook", "instagram", "youtube", "tiktok", "twitter", "x", "linkedin", "pinterest", "reddit", "snapchat", "telegram", "whatsapp", "quora", "threads", "discord"], reason: "R\xE9seau social / plateforme de contenu" },
  { labels: ["wikipedia", "wikimedia", "01net", "frandroid", "numerama", "clubic", "lemonde", "lefigaro", "bfmtv", "zdnet", "macg", "igen", "iphonesoft", "journaldugeek", "cnet", "theverge", "gsmarena", "trustpilot", "avis-verifies", "pagesjaunes", "societe", "pappers", "infogreffe", "verif"], reason: "M\xE9dia / annuaire / encyclop\xE9die" },
  { labels: ["apple", "samsung", "xiaomi", "huawei", "sony", "microsoft", "lenovo", "dell", "hp", "oneplus", "oppo", "nintendo", "playstation", "xbox"], reason: "Site officiel de fabricant (grand public)" }
];
var B2B_HOST_EXCEPTIONS = [/^pro\.backmarket\.[a-z.]+$/];
function exclusionReason(hostOrUrl) {
  let host = hostOrUrl.toLowerCase();
  try {
    if (host.includes("/")) host = new URL(host).hostname;
  } catch {
    return "URL invalide";
  }
  host = host.replace(/^www\d*\./, "");
  if (B2B_HOST_EXCEPTIONS.some((re) => re.test(host))) return null;
  const domain = registrableDomain(host);
  if (!domain) return "H\xF4te invalide";
  const label = domainLabel(domain);
  for (const rule of EXCLUDED_DOMAIN_RULES) if (rule.labels.includes(label)) return rule.reason;
  if (/(^|\.)blogspot\.|(^|\.)wordpress\.com$|(^|\.)medium\.com$/.test(host)) return "Blog / plateforme de contenu";
  return null;
}
var TYPE_KEYWORDS = [
  { type: "b2b_marketplace", words: ["marketplace b2b", "b2b marketplace", "place de marche b2b", "plateforme b2b", "b2b platform", "trading platform"] },
  { type: "liquidation", words: ["destockage", "liquidation", "surplus", "overstock", "stock lots", "lots", "lot de", "palette", "palettes", "pallets", "clearance", "fin de serie", "invendus", "returns pallets"] },
  { type: "broker", words: ["broker", "brokers", "courtier", "trader", "traders", "trading"] },
  { type: "refurbisher", words: ["reconditionneur", "refurbisher", "refurbishers", "reconditionnement", "refurbishment", "reconditionne", "reconditionnes", "refurbished"] },
  { type: "distributor", words: ["distributeur", "distributeurs", "distributor", "distributors", "distribution", "grossiste distributeur"] },
  { type: "wholesaler", words: ["grossiste", "grossistes", "wholesale", "wholesaler", "wholesalers", "vente en gros", "en gros", "achat en gros", "bulk"] }
];
var B2B_SIGNALS = ["b2b", "professionnels", "professionnel", "pro uniquement", "reserve aux professionnels", "revendeur", "revendeurs", "resellers", "reseller", "tarifs pro", "moq", "minimum de commande", "minimum order", "tva intracommunautaire", "devis", "business"];
function normalizeForMatch(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function hasWord(text2, word) {
  return new RegExp(`(?:^| )${word}(?: |$)`).test(text2);
}
function classifySupplierType(title, description, url) {
  let path = url;
  try {
    const u = new URL(url);
    path = `${u.hostname} ${u.pathname}`;
  } catch {
  }
  const text2 = ` ${normalizeForMatch(`${title} ${description ?? ""} ${path.replace(/[-_/.]/g, " ")}`)} `.trim();
  const scores = /* @__PURE__ */ new Map();
  for (const { type, words } of TYPE_KEYWORDS) {
    const found = words.filter((w2) => hasWord(text2, w2));
    if (found.length > 0) scores.set(type, found);
  }
  const b2b = B2B_SIGNALS.filter((w2) => hasWord(text2, w2));
  let best = null;
  let bestCount = 0;
  for (const { type } of TYPE_KEYWORDS) {
    const n = scores.get(type)?.length ?? 0;
    if (n > bestCount) {
      best = type;
      bestCount = n;
    }
  }
  const signals = [.../* @__PURE__ */ new Set([...[...scores.values()].flat(), ...b2b])];
  if (!best) {
    return { type: "unknown", confidence: b2b.length > 0 ? Math.min(0.4, 0.2 + 0.1 * b2b.length) : 0, signals, b2bRelevant: b2b.length > 0 };
  }
  const weakOnly = best === "refurbisher" && scores.get("refurbisher").every((w2) => w2 === "reconditionne" || w2 === "reconditionnes" || w2 === "refurbished") && b2b.length === 0;
  const confidence = Math.min(0.95, Math.round((0.45 + 0.15 * (bestCount - 1) + 0.1 * Math.min(3, b2b.length) + (weakOnly ? -0.15 : 0)) * 100) / 100);
  return { type: best, confidence, signals, b2bRelevant: !weakOnly };
}
function nameFromDomain(domain) {
  const label = domainLabel(domain);
  return label.split(/[-_]+/).filter(Boolean).map((w2) => w2[0].toUpperCase() + w2.slice(1)).join(" ");
}
function candidateName(title, domain) {
  const label = normalizeForMatch(domainLabel(domain)).replace(/ /g, "");
  const parts = title.split(/\s[|–—-]\s|\s·\s/).map((p) => p.trim()).filter(Boolean);
  for (const p of parts) {
    const n = normalizeForMatch(p).replace(/ /g, "");
    if (n && label && (n.includes(label) || label.includes(n)) && p.length <= 60) return p;
  }
  return nameFromDomain(domain);
}
function screenSearchResults(results) {
  const byDomain = /* @__PURE__ */ new Map();
  const rejected = [];
  const rejectedDomains = /* @__PURE__ */ new Set();
  for (const r of results) {
    let u;
    try {
      u = new URL(r.url);
    } catch {
      rejected.push({ domain: null, url: r.url, title: r.title, query: r.query, reason: "URL invalide" });
      continue;
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") continue;
    const host = u.hostname.toLowerCase();
    const domain = registrableDomain(host);
    if (!domain) {
      rejected.push({ domain: null, url: r.url, title: r.title, query: r.query, reason: "H\xF4te invalide" });
      continue;
    }
    const excluded = exclusionReason(host);
    const key2 = B2B_HOST_EXCEPTIONS.some((re) => re.test(host.replace(/^www\d*\./, ""))) ? host.replace(/^www\d*\./, "") : domain;
    if (excluded) {
      if (!rejectedDomains.has(key2)) rejected.push({ domain: key2, url: r.url, title: r.title, query: r.query, reason: `Exclu : ${excluded}` });
      rejectedDomains.add(key2);
      continue;
    }
    const cls = classifySupplierType(r.title, r.description, r.url);
    const existing = byDomain.get(key2);
    if (!cls.b2bRelevant) {
      if (!existing && !rejectedDomains.has(key2)) {
        rejected.push({ domain: key2, url: r.url, title: r.title, query: r.query, reason: "Aucun indice B2B (grossiste, distributeur, reconditionneur, d\xE9stockage, broker\u2026)" });
        rejectedDomains.add(key2);
      }
      continue;
    }
    if (rejectedDomains.has(key2)) {
      rejectedDomains.delete(key2);
      const idx = rejected.findIndex((x) => x.domain === key2);
      if (idx >= 0) rejected.splice(idx, 1);
    }
    if (existing && existing.typeConfidence >= cls.confidence) continue;
    byDomain.set(key2, {
      domain: key2,
      host,
      origin: u.origin,
      name: candidateName(r.title, key2),
      sampleUrl: u.toString(),
      title: r.title,
      description: r.description,
      query: r.query,
      supplierType: cls.type,
      typeConfidence: cls.confidence,
      signals: cls.signals
    });
  }
  return { candidates: [...byDomain.values()], rejected };
}
var CHALLENGE_PATTERNS = [
  [/cf-challenge|challenge-platform|cf_chl_|attention required! \| cloudflare|<title>\s*just a moment\.\.\./i, "d\xE9fi Cloudflare"],
  [/captcha-delivery\.com|geo\.captcha-delivery|datadome/i, "DataDome"],
  [/px-captcha|perimeterx/i, "PerimeterX"],
  [/<title>[^<]*(?:captcha|are you a robot|vérification de sécurité|security check)[^<]*<\/title>/i, "page CAPTCHA"]
];
var CAPTCHA_WIDGET_PATTERNS = [
  [/g-recaptcha|recaptcha\/api|grecaptcha/i, "reCAPTCHA"],
  [/hcaptcha\.com|h-captcha/i, "hCaptcha"],
  [/\bcaptcha\b/i, "CAPTCHA"]
];
var THIN_PAGE_CHARS = 1500;
var LOGIN_PRICE_PATTERNS = [
  /connectez[- ]vous pour (?:voir|afficher|consulter|acc[ée]der aux) (?:les |nos )?(?:prix|tarifs)/i,
  /identifiez[- ]vous pour (?:voir|afficher) (?:les |nos )?(?:prix|tarifs)/i,
  /(?:prix|tarifs) (?:visibles|affich[ée]s|disponibles) (?:apr[èe]s|uniquement apr[èe]s) (?:connexion|inscription)/i,
  /(?:prix|tarifs) r[ée]serv[ée]s aux (?:professionnels|membres|clients)/i,
  /(?:log ?in|sign ?in|register) to (?:see|view) (?:the )?(?:prices|pricing)/i,
  /prices? (?:are )?(?:visible|available|shown) (?:only )?(?:after|upon) (?:login|log in|registration|sign ?in)/i,
  /create an account to (?:see|view) (?:prices|pricing)/i
];
var LOGIN_WALL_PATTERNS = [
  /acc[èe]s r[ée]serv[ée] aux (?:professionnels|membres|clients)/i,
  /(?:members|trade customers|registered (?:users|customers)) only/i,
  /veuillez vous connecter|please (?:log ?in|sign ?in) to (?:continue|access)/i
];
function looksLikeShopifyProductsJson(json2) {
  if (!json2 || typeof json2 !== "object") return false;
  const products = json2.products;
  return Array.isArray(products) && products.length > 0 && products.every((p) => p && typeof p === "object" && "handle" in p && Array.isArray(p.variants));
}
function looksLikeWooStoreJson(json2) {
  return Array.isArray(json2) && json2.length > 0 && json2.every((p) => p && typeof p === "object" && "prices" in p && "permalink" in p);
}
function hasJsonLdProduct(html) {
  let product = false;
  let price = false;
  const visit = (node2, depth) => {
    if (!node2 || typeof node2 !== "object" || depth > 6) return;
    if (Array.isArray(node2)) {
      for (const n of node2) visit(n, depth + 1);
      return;
    }
    const obj = node2;
    const t = obj["@type"];
    const types = Array.isArray(t) ? t : [t];
    if (types.some((x) => x === "Product" || x === "ProductGroup")) {
      product = true;
      const offers = obj.offers;
      const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
      for (const o of list) {
        if (o && typeof o === "object" && ("price" in o || "lowPrice" in o || "priceSpecification" in o)) price = true;
      }
    }
    for (const v2 of Object.values(obj)) if (v2 && typeof v2 === "object") visit(v2, depth + 1);
  };
  for (const block of extractJsonLdBlocks(html)) visit(block, 0);
  return { product, price };
}
function analyzePage(res) {
  const signals = [];
  const body = res.text.slice(0, 2 * 1024 * 1024);
  const isJson = (res.contentType ?? "").includes("json") || /^\s*[[{]/.test(body.slice(0, 10));
  const text2 = body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const protectedResult = (label) => {
    signals.push(`Protection d\xE9tect\xE9e : ${label} (aucun contournement)`);
    return { platform: "unknown", access: "protected", priceVisibility: "unknown", jsonLdProduct: false, signals };
  };
  for (const [re, label] of CHALLENGE_PATTERNS) if (re.test(body)) return protectedResult(label);
  for (const [re, label] of CAPTCHA_WIDGET_PATTERNS) {
    if (!re.test(body)) continue;
    if (!isJson && text2.length < THIN_PAGE_CHARS && !/application\/ld\+json/i.test(body)) return protectedResult(label);
    signals.push(`${label} pr\xE9sent sur la page (formulaire)`);
    break;
  }
  if (res.status === 401 || res.status === 407) {
    signals.push(`HTTP ${res.status} : authentification requise`);
    return { platform: "unknown", access: "account", priceVisibility: "unknown", jsonLdProduct: false, signals };
  }
  if (res.status === 403 || res.status === 429 || res.status === 503) {
    signals.push(`HTTP ${res.status} : acc\xE8s refus\xE9 ou limit\xE9 (protection probable)`);
    return { platform: "unknown", access: "protected", priceVisibility: "unknown", jsonLdProduct: false, signals };
  }
  let platform = "unknown";
  let jsonPrices = false;
  if (isJson) {
    try {
      const json2 = JSON.parse(body);
      if (looksLikeShopifyProductsJson(json2)) {
        platform = "shopify";
        jsonPrices = true;
        signals.push("Format /products.json (Shopify)");
      } else if (looksLikeWooStoreJson(json2)) {
        platform = "woocommerce";
        jsonPrices = true;
        signals.push("Format Store API (WooCommerce)");
      }
    } catch {
    }
  }
  if (platform === "unknown") {
    if (/cdn\.shopify\.com|window\.Shopify\b|Shopify\.theme|myshopify\.com/i.test(body)) {
      platform = "shopify";
      signals.push("Ressources cdn.shopify.com (Shopify)");
    } else if (/\/wp-json\/wc\/store|wp-content\/plugins\/woocommerce|class="[^"]*\bwoocommerce\b/i.test(body)) {
      platform = "woocommerce";
      signals.push("WooCommerce d\xE9tect\xE9 (wp-json/wc/store ou extension)");
    }
  }
  const jsonLd = isJson ? { product: false, price: false } : hasJsonLdProduct(body);
  if (jsonLd.product) {
    signals.push("Donn\xE9es structur\xE9es JSON-LD Product pr\xE9sentes");
    if (platform === "unknown") platform = "jsonld";
  }
  let access = "public";
  let priceVisibility = "unknown";
  if (LOGIN_PRICE_PATTERNS.some((re) => re.test(text2))) {
    priceVisibility = "after_login";
    access = "account";
    signals.push("Prix affich\xE9s apr\xE8s connexion");
  } else if (LOGIN_WALL_PATTERNS.some((re) => re.test(text2)) || /type=["']?password/i.test(body) && !jsonLd.product && !/itemprop=["']?price/i.test(body)) {
    access = "account";
    signals.push("Page de connexion / acc\xE8s r\xE9serv\xE9");
  } else if (jsonPrices || jsonLd.price || /itemprop=["']?price["']?|property=["'](?:og:price:amount|product:price:amount)["']/i.test(body)) {
    priceVisibility = "public";
  }
  if (!res.status || res.status >= 400) {
    signals.push(`HTTP ${res.status}`);
  }
  return { platform, access, priceVisibility, jsonLdProduct: jsonLd.product, signals };
}
function suggestAdapter(platform, access) {
  if (access !== "public") return null;
  if (platform === "shopify") return "shopify-storefront";
  if (platform === "woocommerce") return "woocommerce-store";
  if (platform === "jsonld") return "jsonld-public";
  return null;
}
async function readRobots(origin, deps) {
  try {
    const res = await fetchText(`${origin}/robots.txt`, { userAgent: deps.userAgent, accept: "text/plain", timeoutMs: deps.timeoutMs ?? 8e3, maxBytes: 512 * 1024, fetchImpl: deps.fetchImpl, resolver: deps.resolver });
    if (res.status === 404 || res.status === 410) return { verdict: "missing", text: "", detail: "Aucun robots.txt : aucune restriction d\xE9clar\xE9e (les CGU restent \xE0 v\xE9rifier)." };
    if (!res.ok) return { verdict: "error", text: "", detail: `robots.txt inaccessible (HTTP ${res.status}) : page non sond\xE9e par prudence.` };
    return { verdict: "ok", text: res.text, detail: "robots.txt lu." };
  } catch (e) {
    return { verdict: "error", text: "", detail: `robots.txt inaccessible (${e instanceof Error ? e.message : "erreur r\xE9seau"}) : page non sond\xE9e par prudence.` };
  }
}
async function probeCandidate(candidate, deps) {
  const base = {
    ...candidate,
    robots: "not_checked",
    robotsDetail: "",
    crawlDelaySeconds: null,
    probed: false,
    httpStatus: null,
    platform: "unknown",
    access: "unknown",
    priceVisibility: "unknown",
    suggestedAdapter: null,
    probeSignals: [],
    probeError: null
  };
  const robots = await readRobots(candidate.origin, deps);
  if (robots.verdict === "error") return { ...base, robots: "error", robotsDetail: robots.detail };
  let crawlDelay = null;
  let robotsVerdict = "missing";
  if (robots.verdict === "ok") {
    const u = new URL(candidate.sampleUrl);
    const decision = evaluateRobots(parseRobotsTxt(robots.text.slice(0, 512 * 1024)), deps.userAgent, u.pathname + u.search);
    crawlDelay = decision.crawlDelay;
    if (!decision.allowed) return { ...base, robots: "disallowed", robotsDetail: `robots.txt interdit${decision.rule ? ` (${decision.rule})` : ""} : aucune requ\xEAte effectu\xE9e.`, crawlDelaySeconds: crawlDelay };
    robotsVerdict = "allowed";
  }
  if (crawlDelay !== null && crawlDelay > 0) {
    const waitMs = crawlDelay * 1e3;
    const maxWait = deps.maxCrawlDelayMs ?? 1e4;
    if (waitMs > maxWait) {
      return { ...base, robots: robotsVerdict, robotsDetail: `Crawl-delay de ${crawlDelay} s demand\xE9 : sonde report\xE9e (non effectu\xE9e).`, crawlDelaySeconds: crawlDelay };
    }
    await (deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(waitMs);
  }
  try {
    const res = await fetchText(candidate.sampleUrl, { userAgent: deps.userAgent, timeoutMs: deps.timeoutMs ?? 1e4, maxBytes: 3 * 1024 * 1024, fetchImpl: deps.fetchImpl, resolver: deps.resolver });
    const analysis = analyzePage(res);
    return {
      ...base,
      robots: robotsVerdict,
      robotsDetail: robots.detail,
      crawlDelaySeconds: crawlDelay,
      probed: true,
      httpStatus: res.status,
      platform: analysis.platform,
      access: analysis.access,
      priceVisibility: analysis.priceVisibility,
      suggestedAdapter: suggestAdapter(analysis.platform, analysis.access),
      probeSignals: analysis.signals
    };
  } catch (e) {
    return { ...base, robots: robotsVerdict, robotsDetail: robots.detail, crawlDelaySeconds: crawlDelay, probeError: e instanceof Error ? e.message : "Erreur r\xE9seau." };
  }
}

// src/services/sourcing/discovery/web-search-providers.ts
import { z as z23 } from "npm:zod@4.6.5";
var DISCOVERY_DISABLED_MESSAGE = "D\xE9couverte d\xE9sactiv\xE9e : aucune API de recherche configur\xE9e";
var MAX_DISCOVERY_QUERIES = 6;
var DISCOVERY_CACHE_TTL_MS = 24 * 60 * 60 * 1e3;
var BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
var BRAVE_RESULT_COUNT = 20;
var BRAVE_MIN_INTERVAL_MS = 1100;
var discoveryEnvSchema = z23.object({
  SOURCING_DISCOVERY_PROVIDER: z23.preprocess((v2) => typeof v2 === "string" && v2.trim() ? v2.trim().toLowerCase() : void 0, z23.enum(["brave", "none"]).default("none")),
  BRAVE_SEARCH_API_KEY: z23.preprocess((v2) => typeof v2 === "string" && v2.trim() ? v2.trim() : void 0, z23.string().min(8).optional())
});
function readDiscoveryConfig(env = process.env) {
  const parsed = discoveryEnvSchema.safeParse(env);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { enabled: false, provider: "none", apiKey: null, message: `${DISCOVERY_DISABLED_MESSAGE} (configuration invalide : ${issue?.path.join(".") ?? "?"})` };
  }
  const { SOURCING_DISCOVERY_PROVIDER: provider, BRAVE_SEARCH_API_KEY: key2 } = parsed.data;
  if (provider === "none") return { enabled: false, provider: "none", apiKey: null, message: DISCOVERY_DISABLED_MESSAGE };
  if (!key2) return { enabled: false, provider: "brave", apiKey: null, message: `${DISCOVERY_DISABLED_MESSAGE} (BRAVE_SEARCH_API_KEY manquante)` };
  return { enabled: true, provider: "brave", apiKey: key2, message: "D\xE9couverte via l'API Brave Search" };
}
var braveResultSchema = z23.object({
  url: z23.string(),
  title: z23.string().optional().default(""),
  description: z23.string().nullable().optional()
});
var braveResponseSchema = z23.object({
  web: z23.object({
    results: z23.array(z23.unknown()).optional().default([])
  }).optional()
});
function cleanSnippet(s) {
  return s.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}
function parseBraveResponse(json2) {
  const parsed = braveResponseSchema.safeParse(json2);
  if (!parsed.success) throw new Error("R\xE9ponse Brave Search inattendue (format non reconnu).");
  const out = [];
  for (const raw of parsed.data.web?.results ?? []) {
    const r = braveResultSchema.safeParse(raw);
    if (!r.success) continue;
    let url;
    try {
      url = new URL(r.data.url);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    out.push({ url: url.toString(), title: cleanSnippet(r.data.title), description: r.data.description ? cleanSnippet(r.data.description) : null });
  }
  return out;
}
function createBraveProvider(apiKey, options = {}) {
  return {
    key: "brave",
    label: "Brave Search API",
    async search(query) {
      const url = new URL(BRAVE_ENDPOINT);
      url.searchParams.set("q", query);
      url.searchParams.set("count", String(options.count ?? BRAVE_RESULT_COUNT));
      url.searchParams.set("country", options.country ?? "fr");
      const res = await fetchText(url.toString(), {
        userAgent: options.userAgent ?? "MonStockBot/0.1",
        accept: "application/json",
        headers: { "X-Subscription-Token": apiKey },
        timeoutMs: options.timeoutMs ?? 1e4,
        maxBytes: 2 * 1024 * 1024,
        fetchImpl: options.fetchImpl,
        resolver: options.resolver
      });
      if (res.status === 401 || res.status === 403) throw new Error(`Brave Search : cl\xE9 API refus\xE9e (HTTP ${res.status}).`);
      if (res.status === 429) throw new Error("Brave Search : limite de requ\xEAtes atteinte (HTTP 429), r\xE9essayez plus tard.");
      if (!res.ok) throw new Error(`Brave Search : HTTP ${res.status}.`);
      let json2;
      try {
        json2 = JSON.parse(res.text);
      } catch {
        throw new Error("R\xE9ponse Brave Search non JSON.");
      }
      return parseBraveResponse(json2);
    }
  };
}
function createWebSearchProvider(env = process.env, options = {}) {
  const config = readDiscoveryConfig(env);
  if (!config.enabled || !config.apiKey) return { provider: null, config };
  return { provider: createBraveProvider(config.apiKey, options), config };
}
var cache4 = /* @__PURE__ */ new Map();
function cacheKey(provider, query) {
  return `${provider}::${query.trim().toLowerCase().replace(/\s+/g, " ")}`;
}
async function runDiscoverySearches(provider, queries, options = {}) {
  const now = options.now ?? (() => /* @__PURE__ */ new Date());
  const sleep3 = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const max = Math.min(options.maxQueries ?? MAX_DISCOVERY_QUERIES, MAX_DISCOVERY_QUERIES);
  const interval = options.minIntervalMs ?? BRAVE_MIN_INTERVAL_MS;
  const ttl = options.ttlMs ?? DISCOVERY_CACHE_TTL_MS;
  const unique = [];
  const seen = /* @__PURE__ */ new Set();
  for (const q of queries) {
    const k = cacheKey(provider.key, q);
    if (!q.trim() || seen.has(k)) continue;
    seen.add(k);
    unique.push(q.trim());
    if (unique.length >= max) break;
  }
  const runs = [];
  let calledBefore = false;
  let halted = null;
  for (const query of unique) {
    const k = cacheKey(provider.key, query);
    const hit = cache4.get(k);
    if (hit && now().getTime() - hit.at < ttl) {
      runs.push({ query, results: hit.results, cached: true, error: null });
      continue;
    }
    if (halted) {
      runs.push({ query, results: [], cached: false, error: halted });
      continue;
    }
    if (calledBefore && interval > 0) await sleep3(interval);
    calledBefore = true;
    try {
      const results = await provider.search(query);
      cache4.set(k, { at: now().getTime(), results });
      runs.push({ query, results, cached: false, error: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur de recherche.";
      if (/clé API refusée|limite de requêtes/.test(message)) halted = message;
      runs.push({ query, results: [], cached: false, error: message });
    }
  }
  return runs;
}

// src/services/sourcing/discovery/discovery-service.ts
var log11 = createLogger("SOURCING_DISCOVERY");
var MAX_PROBED_CANDIDATES = 10;
function domainsFrom(values) {
  const out = [];
  for (const v2 of values) {
    if (!v2 || typeof v2 !== "string") continue;
    const d = registrableDomain(v2);
    if (d) out.push(d);
    try {
      const host = new URL(v2.includes("://") ? v2 : `https://${v2}`).hostname.replace(/^www\d*\./, "");
      if (d && host !== d) out.push(host);
    } catch {
    }
  }
  return out;
}
function createSupabaseDiscoveryStore(supabase) {
  return {
    async listKnownDomains(organizationId) {
      const [suppliers, sources] = await Promise.all([
        supabase.from("suppliers").select("website").eq("organization_id", organizationId),
        supabase.from("supplier_sources").select("base_url, config").eq("organization_id", organizationId)
      ]);
      if (suppliers.error) throw new Error(`Lecture des fournisseurs impossible : ${suppliers.error.message}`);
      if (sources.error) throw new Error(`Lecture des sources impossible : ${sources.error.message}`);
      const values = [];
      for (const s of suppliers.data ?? []) values.push(s.website);
      for (const s of sources.data ?? []) {
        values.push(s.base_url);
        const cfg = s.config ?? {};
        if (typeof cfg.sample_url === "string") values.push(cfg.sample_url);
        if (Array.isArray(cfg.urls)) {
          for (const u of cfg.urls) if (typeof u === "string") values.push(u);
        }
      }
      return new Set(domainsFrom(values));
    },
    async createDiscoveredSource(organizationId, { candidate: c, provider, discoveredAt }) {
      const { data: supplier, error: supplierError } = await supabase.from("suppliers").insert({
        organization_id: organizationId,
        name: c.name.slice(0, 200) || c.domain,
        website: c.origin,
        notes: `D\xE9couvert automatiquement (${provider}) pour la recherche \xAB ${c.query.slice(0, 120)} \xBB. Fournisseur non v\xE9rifi\xE9 \u2014 \xE0 valider.`
      }).select("id").single();
      if (supplierError || !supplier) throw new Error(`Fournisseur non cr\xE9\xE9 : ${supplierError?.message ?? "inconnu"}`);
      const config = {
        discovered: true,
        discovered_at: discoveredAt,
        discovered_via: provider,
        discovery_query: c.query,
        supplier_type: c.supplierType,
        supplier_type_confidence: c.typeConfidence,
        supplier_type_signals: c.signals,
        platform: c.platform,
        suggested_adapter: c.suggestedAdapter,
        access: c.access,
        access_label: ACCESS_LABEL[c.access],
        price_visibility: c.priceVisibility,
        robots_allowed: c.robots === "allowed" || c.robots === "missing" ? true : c.robots === "disallowed" ? false : null,
        robots_status: c.robots,
        robots_detail: c.robotsDetail,
        sample_url: c.sampleUrl,
        probe_signals: c.probeSignals,
        probe_error: c.probeError,
        validation: "pending"
      };
      const robotsChecked = c.robots === "allowed" || c.robots === "missing" || c.robots === "disallowed";
      const { data: source, error: sourceError } = await supabase.from("supplier_sources").insert({
        organization_id: organizationId,
        supplier_id: supplier.id,
        name: `${c.name.slice(0, 160)} \u2014 d\xE9couverte \xE0 valider`,
        source_type: "PUBLIC_WEB",
        base_url: c.origin,
        status: "not_connected",
        automated_access_confirmed: false,
        robots_checked_at: robotsChecked ? discoveredAt : null,
        robots_allowed: robotsChecked ? c.robots !== "disallowed" : null,
        crawl_delay_seconds: c.crawlDelaySeconds !== null ? Math.ceil(c.crawlDelaySeconds) : null,
        config
      }).select("id").single();
      if (sourceError || !source) {
        await supabase.from("suppliers").delete().eq("organization_id", organizationId).eq("id", supplier.id);
        throw new Error(`Source non cr\xE9\xE9e : ${sourceError?.message ?? "inconnu"}`);
      }
      return { supplierId: supplier.id, sourceId: source.id };
    }
  };
}
function newReason(c) {
  const parts = [`${SUPPLIER_TYPE_LABEL[c.supplierType]} (confiance ${Math.round(c.typeConfidence * 100)} %)`];
  if (c.robots === "disallowed") parts.push("robots.txt interdit : aucune collecte automatique");
  else if (c.robots === "error") parts.push("robots.txt inaccessible : page non sond\xE9e");
  else if (!c.probed) parts.push(c.probeError ? `sonde impossible (${c.probeError})` : c.robotsDetail || "page non sond\xE9e");
  else {
    parts.push(ACCESS_LABEL[c.access]);
    parts.push(PRICE_VISIBILITY_LABEL[c.priceVisibility]);
    if (c.suggestedAdapter) parts.push(`adaptateur sugg\xE9r\xE9 : ${c.suggestedAdapter}`);
  }
  parts.push("D\xE9couverte \u2014 \xE0 valider avant toute interrogation");
  return parts.join(" \xB7 ");
}
function reportFromCandidate(c, status, reason, ids = null) {
  return {
    domain: c.domain,
    name: c.name,
    type: c.supplierType,
    typeLabel: SUPPLIER_TYPE_LABEL[c.supplierType],
    typeConfidence: c.typeConfidence,
    platform: c.platform,
    access: c.access,
    accessLabel: ACCESS_LABEL[c.access],
    priceVisibility: c.priceVisibility,
    priceVisibilityLabel: PRICE_VISIBILITY_LABEL[c.priceVisibility],
    robots: c.robots,
    suggestedAdapter: c.suggestedAdapter,
    sampleUrl: c.sampleUrl,
    query: c.query,
    status,
    reason,
    supplierId: ids?.supplierId ?? null,
    sourceId: ids?.sourceId ?? null
  };
}
function unprobed(c) {
  return { ...c, robots: "not_checked", robotsDetail: "", crawlDelaySeconds: null, probed: false, httpStatus: null, platform: "unknown", access: "unknown", priceVisibility: "unknown", suggestedAdapter: null, probeSignals: [], probeError: null };
}
function countStatuses(list) {
  const counts = { new: 0, already_known: 0, rejected: 0, skipped: 0 };
  for (const c of list) counts[c.status]++;
  return counts;
}
async function discoverSources(ctx, parsedQuery) {
  const now = ctx.now ?? (() => /* @__PURE__ */ new Date());
  const startedAt = now().toISOString();
  const finish = (partial) => ({ ...partial, counts: countStatuses(partial.candidates), startedAt, finishedAt: now().toISOString() });
  let provider;
  let message;
  const userAgent = ctx.userAgent ?? serverEnv().SOURCING_USER_AGENT;
  if (ctx.provider !== void 0) {
    provider = ctx.provider;
    message = provider ? `D\xE9couverte via ${provider.label}` : "D\xE9couverte d\xE9sactiv\xE9e : aucune API de recherche configur\xE9e";
  } else {
    const created = createWebSearchProvider(ctx.env ?? process.env, { fetchImpl: ctx.fetchImpl, resolver: ctx.resolver, userAgent });
    provider = created.provider;
    message = created.config.message;
  }
  if (!provider) return finish({ enabled: false, provider: null, message, queries: [], candidates: [] });
  const queries = expandQuery(parsedQuery).filter((q) => q.useFor === "discovery").map((q) => q.text);
  if (queries.length === 0) return finish({ enabled: true, provider: provider.key, message: "Aucune requ\xEAte de d\xE9couverte pour cette recherche.", queries: [], candidates: [] });
  const runs = await runDiscoverySearches(provider, queries, { now, sleep: ctx.sleep, ...ctx.searchIntervalMs !== void 0 ? { minIntervalMs: ctx.searchIntervalMs } : {} });
  const queryReport = runs.map((r) => ({ query: r.query, results: r.results.length, cached: r.cached, error: r.error }));
  const { candidates, rejected } = screenSearchResults(runs.flatMap((r) => r.results.map((x) => ({ ...x, query: r.query }))));
  const report2 = [];
  for (const r of rejected) {
    if (!r.domain) continue;
    report2.push({ domain: r.domain, name: r.domain, type: "unknown", typeLabel: SUPPLIER_TYPE_LABEL.unknown, typeConfidence: 0, platform: "unknown", access: "unknown", accessLabel: ACCESS_LABEL.unknown, priceVisibility: "unknown", priceVisibilityLabel: PRICE_VISIBILITY_LABEL.unknown, robots: "not_checked", suggestedAdapter: null, sampleUrl: r.url, query: r.query, status: "rejected", reason: r.reason, supplierId: null, sourceId: null });
  }
  const store = ctx.store ?? createSupabaseDiscoveryStore(createAdminSupabaseClient());
  const known2 = await store.listKnownDomains(ctx.organizationId);
  const fresh = [];
  for (const c of candidates) {
    if (known2.has(c.domain) || known2.has(c.host.replace(/^www\d*\./, ""))) report2.push(reportFromCandidate(unprobed(c), "already_known", "Fournisseur ou source d\xE9j\xE0 enregistr\xE9 dans votre organisation"));
    else fresh.push(c);
  }
  const max = ctx.maxCandidates ?? MAX_PROBED_CANDIDATES;
  const discoveredAt = now().toISOString();
  for (const [i, c] of fresh.entries()) {
    if (i >= max) {
      report2.push(reportFromCandidate(unprobed(c), "skipped", `Non analys\xE9 : limite de ${max} candidats par recherche`));
      continue;
    }
    const probed = await probeCandidate(c, { userAgent, fetchImpl: ctx.fetchImpl, resolver: ctx.resolver, sleep: ctx.sleep });
    try {
      const ids = await store.createDiscoveredSource(ctx.organizationId, { candidate: probed, provider: provider.key, discoveredAt });
      known2.add(probed.domain);
      report2.push(reportFromCandidate(probed, "new", newReason(probed), ids));
    } catch (e) {
      log11.warn("discovered source not stored", { orgId: ctx.organizationId, domain: probed.domain, error: e instanceof Error ? e.message : String(e) });
      report2.push(reportFromCandidate(probed, "skipped", `Non enregistr\xE9 : ${e instanceof Error ? e.message : "erreur inconnue"}`));
    }
  }
  log11.info("discovery done", { orgId: ctx.organizationId, provider: provider.key, queries: runs.length, new: report2.filter((r) => r.status === "new").length });
  const failed = runs.filter((r) => r.error).length;
  const summary = failed === runs.length ? `Recherche web en \xE9chec : ${runs[0]?.error ?? "erreur inconnue"}` : `${message} \u2014 ${runs.length} requ\xEAte(s)${failed ? `, ${failed} en \xE9chec` : ""}`;
  return finish({ enabled: true, provider: provider.key, message: summary, queries: queryReport, candidates: report2 });
}

// src/services/sourcing/discovery/search-discovery.ts
var SEARCH_DISCOVERY_TIMEOUT_MS = 12e3;
function discoveryDecision(input) {
  const base = { configured: input.config.enabled, provider: input.config.enabled ? input.config.provider : null, isAdmin: input.isAdmin, report: null };
  if (!input.config.enabled) return { run: false, panel: { ...base, state: "disabled", message: input.config.message || DISCOVERY_DISABLED_MESSAGE } };
  if (!input.canWrite) return { run: false, panel: { ...base, state: "not_allowed", message: "D\xE9couverte r\xE9serv\xE9e aux membres avec droit d'\xE9criture (elle enregistre des fournisseurs \xE0 valider)." } };
  if (input.parsed.kind === "empty") return { run: false, panel: { ...base, state: "skipped", message: "Saisissez un produit pour d\xE9couvrir de nouvelles sources." } };
  if (!input.live) return { run: false, panel: { ...base, state: "skipped", message: "Recherche sans interrogation en direct : d\xE9couverte non lanc\xE9e." } };
  return { run: true };
}
async function runDiscoveryWithTimeout(run, opts) {
  const timeoutMs = opts.timeoutMs ?? SEARCH_DISCOVERY_TIMEOUT_MS;
  const base = { configured: true, provider: opts.provider, isAdmin: opts.isAdmin };
  let timer = null;
  const promise = run();
  try {
    const outcome = await Promise.race([promise.then((report2) => ({ kind: "report", report: report2 })), new Promise((resolve) => timer = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs))]);
    if (outcome.kind === "timeout") {
      promise.catch((e) => opts.onLateError?.(e));
      return { ...base, state: "timeout", message: `D\xE9couverte toujours en cours apr\xE8s ${Math.round(timeoutMs / 1e3)} s : elle se poursuit en arri\xE8re-plan, les nouvelles sources appara\xEEtront dans \xAB D\xE9couvertes \u2014 \xE0 valider \xBB.`, report: null };
    }
    return { ...base, provider: outcome.report.provider ?? opts.provider, state: "done", message: outcome.report.message, report: outcome.report };
  } catch (e) {
    return { ...base, state: "error", message: `D\xE9couverte en \xE9chec : ${e instanceof Error ? e.message : String(e)}`, report: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function currentDiscoveryConfig(env = process.env) {
  return readDiscoveryConfig(env);
}

// src/services/sourcing/search.ts
var log12 = createLogger("SOURCING_SEARCH");
var SEARCH_PAGE_SIZE = 20;
var REJECTED_LIST_LIMIT = 100;
var SKU_TOP_OFFERS = 3;
function provenanceOf(offer) {
  const stored = parseStoredProvenance(offer.raw);
  if (!stored) return null;
  return { method: stored.method, adapterKey: stored.adapterKey, retrievedAt: stored.retrievedAt, requestUrl: stored.requestUrl, sourceUrl: offer.source_url };
}
function liveQueryText(query, sku) {
  if (query.trim()) return query.trim();
  if (!sku) return "";
  return `${sku.brand ?? ""} ${sku.productName} ${sku.variantName && sku.variantName !== "Standard" ? sku.variantName : ""}`.replace(/\s+/g, " ").trim();
}
async function loadSku(ctx, code) {
  const { data: row } = await ctx.supabase.from("v_stock_overview").select("sku_id, code, product_name, brand, variant_name, variant_id, condition, grade, cost_price, sale_price, avg_sale_price_30d, currency").eq("organization_id", ctx.organization.id).ilike("code", escapeLike(code)).maybeSingle();
  if (!row || !row.sku_id) return null;
  const { data: variant } = await ctx.supabase.from("product_variants").select("attributes, ean, mpn").eq("id", row.variant_id ?? "").maybeSingle();
  const attrs = variant?.attributes ?? {};
  const attributes = {};
  for (const [k, v2] of Object.entries(attrs)) if (typeof v2 === "string") attributes[k] = v2;
  return {
    id: row.sku_id,
    code: row.code ?? code,
    productName: row.product_name ?? "",
    brand: row.brand,
    variantName: row.variant_name,
    attributes,
    condition: row.condition,
    grade: row.grade,
    ean: variant?.ean ?? null,
    mpn: variant?.mpn ?? null,
    costPrice: row.cost_price,
    salePrice: row.sale_price,
    avgSalePrice30d: row.avg_sale_price_30d,
    currency: row.currency ?? ctx.organization.default_currency
  };
}
function parsedFromSku(sku) {
  const n = normalizeProduct(`${sku.brand ?? ""} ${sku.productName} ${sku.variantName ?? ""}`, { brand: sku.brand, storage: sku.attributes.storage, color: sku.attributes.color, grade: sku.attributes.grade ?? sku.grade, condition: sku.condition, ean: sku.ean, mpn: sku.mpn });
  const base = parseQuery2(`${sku.brand ?? ""} ${sku.productName} ${sku.variantName ?? ""}`);
  return {
    ...base,
    raw: sku.code,
    kind: n.ean ? "ean" : n.model && !n.inferred.includes("model") ? "structured" : base.kind,
    ean: n.ean,
    mpn: n.mpn,
    criteria: { brand: n.brand, model: n.inferred.includes("model") ? null : n.model, storage: n.storage, color: n.color, grade: n.grade, condition: n.inferred.includes("condition") ? "unknown" : n.condition },
    normalized: n
  };
}
async function listSourceStatuses(ctx) {
  const orgId = ctx.organization.id;
  const [{ data: sources }, { data: feeds }, { data: connections }] = await Promise.all([
    ctx.supabase.from("supplier_sources").select("id, name, source_type, status, last_sync_at, last_error, supplier:suppliers(name)").eq("organization_id", orgId).order("created_at").limit(200),
    ctx.supabase.from("supplier_feeds").select("id, format, status, last_sync_at, last_error, url, supplier:suppliers(name), source:supplier_sources(name)").eq("organization_id", orgId).order("created_at").limit(200),
    ctx.supabase.from("supplier_connections").select("id, connector_key, status, last_sync_at, last_error, supplier:suppliers(name)").eq("organization_id", orgId).limit(100)
  ]);
  const items = [];
  for (const s of sources ?? []) {
    if (s.source_type === "CSV" || s.source_type === "XML" || s.source_type === "JSON") continue;
    items.push({ id: s.id, kind: "source", name: s.name, supplierName: s.supplier?.name ?? "", sourceType: s.source_type, status: s.status, connected: s.status === "active", lastSyncAt: s.last_sync_at, lastError: s.last_error });
  }
  for (const f of feeds ?? []) {
    items.push({ id: f.id, kind: "feed", name: f.source?.name ?? `Flux ${f.format.toUpperCase()}`, supplierName: f.supplier?.name ?? "", sourceType: f.format.toUpperCase(), status: f.status, connected: f.status === "active", lastSyncAt: f.last_sync_at, lastError: f.last_error });
  }
  for (const c of connections ?? []) {
    items.push({ id: c.id, kind: "connection", name: c.connector_key, supplierName: c.supplier?.name ?? "", sourceType: "SUPPLIER_ACCOUNT", status: c.status, connected: c.status === "connected", lastSyncAt: c.last_sync_at, lastError: c.last_error });
  }
  return items;
}
async function searchOffers(ctx, input) {
  const orgId = ctx.organization.id;
  const orgCurrency = ctx.organization.default_currency;
  const settings = ctx.organization.settings ?? {};
  const vatRate = typeof settings.vat_rate === "number" ? settings.vat_rate : null;
  const sku = input.skuCode ? await loadSku(ctx, input.skuCode) : null;
  const parsed = input.query.trim() ? parseQuery2(input.query) : sku ? parsedFromSku(sku) : parseQuery2("");
  const filters = input.filters;
  const requestedQuantity = Math.max(1, filters.quantity ?? 1);
  let skuIdsForCategory = null;
  if (filters.category) {
    const { data } = await ctx.supabase.from("v_stock_overview").select("sku_id").eq("organization_id", orgId).ilike("category", escapeLike(filters.category)).limit(1e3);
    skuIdsForCategory = (data ?? []).map((d) => d.sku_id).filter((x) => Boolean(x));
  }
  const expandedQueries = parsed.kind !== "empty" ? expandQuery(parsed) : [];
  const variants = queriesFor(expandedQueries, "adapter_search");
  const liveQuery = liveQueryText(input.query, sku);
  const liveWanted = input.live !== false && Boolean(liveQuery) && (parsed.kind !== "empty" || Boolean(sku));
  const discoveryConfig = currentDiscoveryConfig();
  const admin = isAdmin(ctx.role);
  const decision = discoveryDecision({ config: discoveryConfig, canWrite: canWrite(ctx.role), isAdmin: admin, parsed, live: input.live !== false && input.discover !== false });
  const discoveryPromise = decision.run ? runDiscoveryWithTimeout(() => discoverSources({ organizationId: orgId }, parsed), { isAdmin: admin, provider: discoveryConfig.provider, onLateError: (e) => log12.warn("late discovery failed", { orgId, error: e instanceof Error ? e.message : String(e) }) }) : Promise.resolve(decision.panel);
  let live = null;
  if (liveWanted) {
    try {
      const summary = await runLiveSearch(ctx, { rawQuery: liveQuery, parsed, variants, skuId: sku?.id ?? null });
      live = summary.sources.length > 0 ? summary : null;
    } catch (e) {
      log12.warn("live search failed", { orgId, error: e instanceof Error ? e.message : String(e) });
    }
  }
  const [{ offers, stage }, marginCtx, sources] = await Promise.all([findOffers(ctx.supabase, orgId, parsed, filters, { skuIdsForCategory, includeSkuId: sku?.id ?? null }), getMarginContext(ctx), listSourceStatuses(ctx)]);
  if (live && live.offerIds.length > 0) {
    const known2 = new Set(offers.map((o) => o.id));
    const missing = live.offerIds.filter((id) => !known2.has(id)).slice(0, 200);
    if (missing.length > 0) {
      const { data: extra } = await baseOfferQuery(ctx.supabase, orgId, filters, skuIdsForCategory).in("id", missing).limit(200);
      for (const o of extra ?? []) if (!known2.has(o.id)) offers.push(o);
    }
  }
  const linkedSkuIds = Array.from(new Set(offers.map((o) => o.sku_id).filter((x) => Boolean(x))));
  const salePrices = /* @__PURE__ */ new Map();
  if (linkedSkuIds.length > 0) {
    const { data } = await ctx.supabase.from("v_stock_overview").select("sku_id, sale_price, avg_sale_price_30d, cost_price").eq("organization_id", orgId).in("sku_id", linkedSkuIds.slice(0, 500));
    for (const r of data ?? []) if (r.sku_id) salePrices.set(r.sku_id, { sale: r.sale_price, avg: r.avg_sale_price_30d, cost: r.cost_price });
  }
  const now = /* @__PURE__ */ new Date();
  const prelim = offers.map((o) => {
    const supplier = o.supplier;
    const fxUnavailable = o.normalized_price === null && o.original_currency.toUpperCase() !== orgCurrency.toUpperCase();
    const normalizedUnitPrice = o.normalized_price ?? (o.original_currency.toUpperCase() === orgCurrency.toUpperCase() ? Number(o.original_price) : null);
    let comparableUnitPrice = null;
    let comparableNote = null;
    if (normalizedUnitPrice !== null) {
      const t = normalizeTax(normalizedUnitPrice, o.tax_type, "ht", vatRate);
      comparableUnitPrice = t.amount;
      comparableNote = t.note;
    } else comparableNote = fxUnavailable ? "Conversion indisponible : prix original conserv\xE9" : null;
    const comparable = comparableUnitPrice !== null ? comparablePrice({ unitPrice: comparableUnitPrice, moq: o.moq, minimumOrderValue: o.minimum_order_value }) : null;
    const landedQuantity = Math.max(requestedQuantity, o.moq ?? 1);
    const landedCost = comparableUnitPrice !== null ? computeLandedCost({ unitPrice: comparableUnitPrice, quantity: landedQuantity, shippingCost: o.shipping_cost, importFees: null }) : null;
    let margin = null;
    let marginUnavailableReason = null;
    const saleInfo = sku && (o.sku_id === sku.id || !o.sku_id) ? { sale: sku.salePrice, avg: sku.avgSalePrice30d, cost: sku.costPrice } : o.sku_id ? salePrices.get(o.sku_id) ?? null : null;
    const salePrice = saleInfo?.sale ?? saleInfo?.avg ?? null;
    if (comparableUnitPrice === null) marginUnavailableReason = fxUnavailable ? "Conversion de devise indisponible" : "Prix non comparable";
    else if (salePrice === null) marginUnavailableReason = sku || o.sku_id ? "Aucun prix de vente connu pour ce SKU" : "Marge non calculable : offre non associ\xE9e \xE0 un SKU avec prix de vente";
    else {
      const cost = landedCost?.determinable || landedCost && landedCost.unitLandedCost !== null ? landedCost.unitLandedCost : comparableUnitPrice;
      const result = computeMargin({ salePrice, costPrice: cost, feePercent: marginCtx.feePercent, paymentFeePercent: marginCtx.paymentFeePercent, paymentFeeFixed: marginCtx.paymentFeeFixed, shippingCost: marginCtx.shippingCost });
      const parts = [`${salePrice.toFixed(2)} (vente)`, `\u2212 ${cost.toFixed(2)} (co\xFBt${landedCost && landedCost.unitLandedCost !== null ? " rendu" : ""})`];
      if (result.marketplaceFee !== null) parts.push(`\u2212 ${result.marketplaceFee.toFixed(2)} (commission)`);
      if (result.paymentFee !== null) parts.push(`\u2212 ${result.paymentFee.toFixed(2)} (paiement)`);
      if (result.shippingCost !== null) parts.push(`\u2212 ${result.shippingCost.toFixed(2)} (exp\xE9dition)`);
      margin = { salePrice, salePriceSource: saleInfo?.sale !== null && saleInfo?.sale !== void 0 ? "sku" : "average_30d", cost, costLabel: landedCost && landedCost.unitLandedCost !== null ? "co\xFBt rendu / unit\xE9" : "prix unitaire", result, formula: `${parts.join(" ")} = ${result.netProfit === null ? "\u2014" : result.netProfit.toFixed(2)} ${orgCurrency}` };
    }
    const dataCompleteness = computeDataCompleteness({
      price: o.original_price,
      currency: o.original_currency,
      tax: o.tax_type,
      moq: o.moq,
      stock: o.available_quantity ?? (o.stock_status !== "unknown" ? o.stock_status : null),
      shipping: o.shipping_cost,
      delivery: o.delivery_max_days ?? o.delivery_min_days,
      country: o.country ?? supplier?.country ?? null,
      grade: o.grade,
      condition: o.condition
    });
    const savingsPerUnit = sku && sku.costPrice !== null && comparableUnitPrice !== null ? Math.round((sku.costPrice - comparableUnitPrice) * 100) / 100 : null;
    const sourceConfig = o.source?.config ?? {};
    const sourceDiscovered = sourceConfig.discovered === true;
    const sourceAttested = o.source?.automated_access_confirmed ?? false;
    const conf = o.confidence ?? {};
    const confNum = (k) => typeof conf[k] === "number" && Number.isFinite(conf[k]) ? conf[k] : null;
    const stockKnown = o.available_quantity !== null || o.stock_status !== "unknown";
    const lastSeenMs = Date.parse(o.last_seen_at);
    return {
      id: o.id,
      offer: o,
      provenance: provenanceOf(o),
      supplierId: o.supplier_id,
      productKey: o.normalized_product_id,
      lastSeenAt: o.last_seen_at,
      supplierName: supplier?.name ?? "Fournisseur",
      supplierCountry: o.country ?? supplier?.country ?? null,
      supplierScore: supplier?.internal_score ?? null,
      normalizedUnitPrice,
      comparableUnitPrice,
      comparableNote,
      comparable,
      fxUnavailable,
      landedCost,
      landedQuantity,
      margin,
      marginUnavailableReason,
      freshness: freshness(o.last_seen_at, now),
      dataCompleteness,
      savingsPerUnit,
      comparablePrice: comparableUnitPrice,
      moq: o.moq,
      deliveryDays: o.delivery_max_days ?? o.delivery_min_days,
      potentialMargin: margin?.result.netProfit ?? null,
      sourceDiscovered,
      // --- champs du pipeline (filtre de pertinence + classement)
      title: o.title_original,
      brand: o.brand,
      model: o.model,
      modelInferred: modelIsInferred(o.model),
      storage: o.storage,
      color: o.color,
      grade: o.grade,
      condition: o.condition,
      price: comparableUnitPrice,
      status: o.status,
      anomalies: (o.anomalies ?? []).map((code) => ({ code, severity: "warning", message: ANOMALY_LABEL[code] ?? code })),
      expiresAt: null,
      supplierVerified: !(sourceDiscovered && !sourceAttested) && (o.source_type !== "PUBLIC_WEB" || sourceAttested),
      linkedToTarget: Boolean(sku && o.sku_id === sku.id),
      unitPrice: comparableUnitPrice,
      landedUnitCost: landedCost?.unitLandedCost ?? null,
      shippingPerOrder: null,
      minimumOrderValue: o.minimum_order_value,
      stockKnown,
      availableQuantity: o.available_quantity,
      outOfStock: o.stock_status === "out_of_stock",
      supplierReliability: supplier?.internal_score ?? null,
      freshnessHours: Number.isFinite(lastSeenMs) ? Math.max(0, (now.getTime() - lastSeenMs) / 36e5) : null,
      marginPerUnit: margin?.result.netProfit ?? null,
      confidenceBadge: assessOfferConfidence({ lastSeenAt: o.last_seen_at, status: o.status, expiresAt: null, priceConfidence: confNum("price"), stockConfidence: confNum("stock"), stockKnown, sourceDiscovered, sourceValidated: sourceDiscovered || o.source_type === "PUBLIC_WEB" ? sourceAttested : void 0 }, now)
    };
  });
  const currentUnitCost = sku?.costPrice ?? null;
  const pipeline = runOfferPipeline(criteriaFromParsedQuery(parsed, input.query), prelim, { now, requestedQuantity, currentUnitCost, currency: orgCurrency, dedupe: dedupeOffers });
  const unique = pipeline.unique;
  const scores = scoreOffers(unique);
  const sort = filters.sort ?? "best_offer";
  const rankedById = new Map(pipeline.ranking.ranked.map((r) => [r.offer.id, r]));
  const ranked = sort === "best_offer" ? pipeline.ranking.ranked.map((r) => r.offer) : rankOffers(unique, sort, scores);
  const total = ranked.length;
  const page2 = Math.max(1, filters.page ?? 1);
  const slice = ranked.slice((page2 - 1) * SEARCH_PAGE_SIZE, page2 * SEARCH_PAGE_SIZE);
  const insights = await loadPriceInsights(ctx, slice.map((p) => ({ id: p.id, currentPrice: p.normalizedUnitPrice })), orgCurrency, now);
  const views = slice.map((p) => {
    const r = rankedById.get(p.id);
    return {
      ...p,
      score: scores.get(p.id),
      duplicatesCollapsed: pipeline.collapsed.get(p.id) ?? 0,
      ranking: { rank: r.rank, score: r.score, components: r.components, unknownFactors: r.unknownFactors, why: r.why, awards: r.awards, procurement: r.procurement },
      filterWarnings: pipeline.warnings.get(p.id) ?? [],
      priceInsights: insights.get(p.id) ?? null,
      savings: currentUnitCost !== null ? savingsOf(r, currentUnitCost) : null
    };
  });
  const byId = new Map(prelim.map((p) => [p.id, p]));
  const awardOffers = {};
  for (const a of [...pipeline.ranking.podium, ...pipeline.ranking.highlights]) {
    const p = a.offerId ? byId.get(a.offerId) : null;
    if (p) awardOffers[p.id] = { title: p.offer.title_original, supplierName: p.supplierName, comparableUnitPrice: p.comparableUnitPrice };
  }
  const rejected = {
    count: pipeline.rejection.count,
    groups: pipeline.rejection.groups,
    referenceMedian: pipeline.filter.referenceMedian,
    offers: pipeline.filter.rejected.slice(0, REJECTED_LIST_LIMIT).map((r) => ({ id: r.offer.id, title: r.offer.offer.title_original, supplierId: r.offer.supplierId, supplierName: r.offer.supplierName, comparableUnitPrice: r.offer.comparableUnitPrice, sourceUrl: r.offer.offer.source_url, reasons: r.reasons }))
  };
  const prices = unique.map((p) => p.comparableUnitPrice).filter((x) => x !== null);
  const margins = unique.map((p) => p.potentialMargin).filter((x) => x !== null);
  const aggregates = {
    count: total,
    bestPrice: prices.length ? Math.min(...prices) : null,
    bestOfferScore: pipeline.ranking.ranked.length ? Math.max(...pipeline.ranking.ranked.map((r) => r.score)) : null,
    bestMargin: margins.length ? Math.max(...margins) : null,
    averagePrice: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length * 100) / 100 : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    currency: orgCurrency
  };
  if (parsed.kind !== "empty" || sku) {
    const { error } = await ctx.supabase.from("sourcing_searches").insert({ organization_id: orgId, user_id: ctx.user.id, query_text: input.query || sku?.code || "", parsed: { kind: parsed.kind, ean: parsed.ean, mpn: parsed.mpn, criteria: parsed.criteria, tokens: parsed.tokens }, filters, result_count: total });
    if (error) log12.debug("search not recorded", { error: error.message });
  }
  const skuTopOffers = sku ? pipeline.ranking.ranked.filter((r) => r.offer.comparableUnitPrice !== null).slice(0, SKU_TOP_OFFERS).map((r) => ({
    id: r.offer.id,
    title: r.offer.offer.title_original,
    supplierId: r.offer.supplierId,
    supplierName: r.offer.supplierName,
    comparableUnitPrice: r.offer.comparableUnitPrice,
    deltaPerUnit: currentUnitCost !== null ? Math.round((r.offer.comparableUnitPrice - currentUnitCost) * 100) / 100 : null,
    savings: savingsOf(r, currentUnitCost),
    rank: r.rank,
    score: r.score,
    awards: r.awards,
    why: r.why,
    confidence: r.offer.confidenceBadge
  })) : [];
  const discovery = await discoveryPromise;
  return {
    parsed,
    stage,
    sku,
    views,
    page: page2,
    pageSize: SEARCH_PAGE_SIZE,
    total,
    aggregates,
    sources,
    connectedSources: sources.filter((s) => s.connected).length,
    vatRate,
    requestedQuantity,
    live,
    expandedQueries,
    rejected,
    podium: pipeline.ranking.podium,
    highlights: pipeline.ranking.highlights,
    priceBasisNote: pipeline.ranking.priceBasisNote,
    awardOffers,
    currentUnitCost,
    bestSavings: pipeline.bestSavings,
    discovery,
    skuTopOffers
  };
}
function modelIsInferred(model) {
  if (!model) return false;
  const n = normalizeProduct(model);
  return !n.model || n.inferred.includes("model");
}
var PRICE_INSIGHT_WINDOW_DAYS = 90;
async function loadPriceInsights(ctx, offers, orgCurrency, now) {
  const out = /* @__PURE__ */ new Map();
  if (offers.length === 0) return out;
  const since = new Date(now.getTime() - PRICE_INSIGHT_WINDOW_DAYS * 864e5).toISOString();
  const history = await loadRecentPriceHistory(ctx.supabase, ctx.organization.id, offers.map((o) => o.id), since);
  if (history.failedOfferIds.length > 0) log12.debug("price history not loaded", { offers: history.failedOfferIds.length });
  const failed = new Set(history.failedOfferIds);
  const byOffer = groupPriceHistory(history.rows, orgCurrency);
  for (const o of offers) {
    if (failed.has(o.id)) continue;
    out.set(o.id, computePriceInsights(byOffer.get(o.id) ?? [], o.currentPrice, { now, currency: orgCurrency, windowDays: PRICE_INSIGHT_WINDOW_DAYS }));
  }
  return out;
}

// src/features/mobile-api/service.ts
function sourcingOfferDTO(v2) {
  const o = v2.offer;
  return {
    id: o.id,
    title: o.title_original,
    supplierId: o.supplier_id,
    supplierName: v2.supplierName,
    supplierCountry: v2.supplierCountry,
    sourceUrl: o.source_url,
    price: o.original_price,
    currency: o.original_currency,
    comparableUnitPrice: v2.comparableUnitPrice,
    comparableNote: v2.comparableNote,
    landedUnitCost: v2.landedCost?.unitLandedCost ?? null,
    shippingCost: o.shipping_cost,
    shippingCurrency: o.shipping_currency,
    taxType: o.tax_type,
    lastSeenAt: o.last_seen_at,
    quantityAvailable: o.available_quantity,
    stockStatus: o.stock_status,
    moq: o.moq,
    deliveryDays: o.delivery_max_days,
    condition: o.condition,
    grade: o.grade,
    rank: v2.ranking.rank,
    score: v2.ranking.score,
    why: v2.ranking.why,
    unknownFactors: v2.ranking.unknownFactors,
    awards: v2.ranking.awards,
    confidence: v2.confidenceBadge,
    freshnessLabel: v2.freshness.label,
    procurement: v2.ranking.procurement,
    savings: v2.savings,
    marginNetProfit: v2.margin?.result.netProfit ?? null,
    marginUnavailableReason: v2.marginUnavailableReason,
    warnings: v2.filterWarnings,
    provenance: v2.provenance ? { method: v2.provenance.method, adapterKey: v2.provenance.adapterKey, retrievedAt: v2.provenance.retrievedAt } : null,
    usualPriceNote: v2.priceInsights?.opportunity?.message ?? v2.priceInsights?.reason ?? null,
    duplicatesCollapsed: v2.duplicatesCollapsed
  };
}
async function sourcingSearch(ctx, q) {
  const params = sourcingSearchParamsSchema.parse({ q: q.q, sku: q.sku, qty: q.qty, max_price: q.max_price, page: q.page, live: q.live });
  const live = params.live !== "0";
  const r = await searchOffers(ctx, { query: params.q ?? "", skuCode: params.sku ?? null, filters: toOfferFilters(params), live });
  return {
    query: params.q ?? "",
    sku: r.sku ? { id: r.sku.id, code: r.sku.code, label: skuLabel({ product_name: `${r.sku.brand ? `${r.sku.brand} ` : ""}${r.sku.productName}`, variant_name: r.sku.variantName }), costPrice: r.sku.costPrice, currency: r.sku.currency } : null,
    requestedQuantity: r.requestedQuantity,
    currency: ctx.organization.default_currency,
    offers: r.views.map(sourcingOfferDTO),
    total: r.total,
    page: r.page,
    pageSize: r.pageSize,
    podium: r.podium,
    highlights: r.highlights,
    awardOffers: r.awardOffers,
    currentUnitCost: r.currentUnitCost,
    bestSavings: r.bestSavings,
    priceBasisNote: r.priceBasisNote,
    rejected: { count: r.rejected.count, groups: r.rejected.groups.map((g) => ({ code: g.code, label: g.label, count: g.count })) },
    connectedSources: r.connectedSources,
    live: r.live ? {
      queried: r.live.queried,
      found: r.live.found,
      stored: r.live.stored,
      durationMs: r.live.durationMs,
      sources: r.live.sources.map((s) => ({ name: s.sourceName, supplierName: s.supplierName, status: s.status, message: s.message, found: s.found }))
    } : null,
    discovery: { state: r.discovery.state, message: r.discovery.message }
  };
}
async function sourcingStatus(ctx) {
  const s = await loadSourcingStatus(ctx);
  return { items: s.items.map((i) => ({ key: i.key, label: i.label, value: i.value, scope: i.scope, hint: i.detail })), offerCountsIncomplete: s.offerCountsIncomplete };
}
async function integrations(ctx) {
  const o = await getIntegrationsOverview(ctx);
  if (o.queryError) throw new AppError("INTERNAL", o.queryError);
  return {
    ebay: { configured: o.ebay.configured, environment: o.ebay.environment },
    connections: o.connections.map(({ connection: c, channelName, lastRun }) => ({
      connectionId: c.id,
      provider: c.provider,
      channelName,
      status: c.status,
      environment: c.environment,
      externalUsername: c.external_username,
      lastSyncAt: c.last_sync_at,
      lastSuccessfulSyncAt: c.last_successful_sync_at,
      lastError: c.last_error,
      autoSync: c.auto_sync,
      lastRun: lastRun ? { id: lastRun.id, status: lastRun.status, startedAt: lastRun.started_at, finishedAt: lastRun.finished_at, errorCount: lastRun.error_count } : null
    })),
    unmappedCount: o.unmappedCount,
    comingSoon: o.catalog.filter((c) => !c.available).map((c) => c.label)
  };
}

// src/integrations/ebay/cursor.ts
var ORDERS_OVERLAP_HOURS = 3;
var ORDERS_INITIAL_LOOKBACK_DAYS = 90;
function computeOrdersWindow(lastCursor, now = /* @__PURE__ */ new Date(), options = {}) {
  const overlapMs = (options.overlapHours ?? ORDERS_OVERLAP_HOURS) * 36e5;
  const lookbackMs = (options.initialLookbackDays ?? ORDERS_INITIAL_LOOKBACK_DAYS) * 864e5;
  const cursor = lastCursor ? new Date(lastCursor) : null;
  if (!cursor || Number.isNaN(cursor.getTime())) {
    return { since: new Date(now.getTime() - lookbackMs), until: now, initial: true };
  }
  const since = new Date(Math.min(cursor.getTime() - overlapMs, now.getTime()));
  return { since, until: now, initial: false };
}
function nextOrdersCursor(window, maxModifiedSeen) {
  if (!maxModifiedSeen) return window.until;
  return new Date(Math.min(maxModifiedSeen.getTime(), window.until.getTime()));
}
var ORDERS_SLICE_HOURS = 7 * 24;
function splitOrdersWindow(window, sliceHours = ORDERS_SLICE_HOURS) {
  const sliceMs = Math.max(1, sliceHours) * 36e5;
  const slices = [];
  let start = window.since.getTime();
  const end = window.until.getTime();
  if (end <= start) return [{ since: new Date(start), until: new Date(end), initial: window.initial }];
  while (start < end) {
    const stop = Math.min(end, start + sliceMs);
    slices.push({ since: new Date(start), until: new Date(stop), initial: window.initial });
    start = stop;
  }
  return slices;
}
function resolveOrdersCursor(window, progress, previousCursor) {
  if (progress.failedWithoutDate) return null;
  let candidate = progress.windowComplete ? nextOrdersCursor(window, progress.maxModifiedSeen) : progress.completedUntil;
  if (progress.minFailedModified) {
    candidate = candidate ? new Date(Math.min(candidate.getTime(), progress.minFailedModified.getTime())) : null;
    return candidate;
  }
  if (!candidate) return null;
  const previous = previousCursor ? new Date(previousCursor) : null;
  if (previous && !Number.isNaN(previous.getTime()) && candidate.getTime() < previous.getTime()) return null;
  return candidate;
}

// src/services/sync/alerts.ts
var log13 = createLogger("ALERTS");
async function upsertAlert(admin, input) {
  const { data: existing } = await admin.from("alerts").select("id").eq("organization_id", input.organizationId).eq("dedupe_key", input.dedupeKey).neq("status", "resolved").maybeSingle();
  if (existing) {
    const { error: error2 } = await admin.from("alerts").update({ title: input.title, message: input.message, severity: input.severity, action_href: input.actionHref ?? null }).eq("id", existing.id);
    if (error2) log13.warn("mise \xE0 jour d'alerte impossible", { dedupeKey: input.dedupeKey, error: error2.message });
    return;
  }
  const { error } = await admin.from("alerts").insert({
    organization_id: input.organizationId,
    type: input.type,
    severity: input.severity,
    title: input.title,
    message: input.message,
    dedupe_key: input.dedupeKey,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    action_href: input.actionHref ?? null,
    status: "open"
  });
  if (error && error.code !== "23505") log13.warn("cr\xE9ation d'alerte impossible", { dedupeKey: input.dedupeKey, error: error.message });
}
async function resolveAlerts(admin, organizationId, dedupeKeys) {
  if (dedupeKeys.length === 0) return;
  const { error } = await admin.from("alerts").update({ status: "resolved", resolved_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("organization_id", organizationId).in("dedupe_key", dedupeKeys).neq("status", "resolved");
  if (error) log13.warn("r\xE9solution d'alertes impossible", { dedupeKeys, error: error.message });
}
var connectionExpiredKey = (connectionId) => `connection_expired:${connectionId}`;
var syncFailedKey = (connectionId) => `sync_failed:${connectionId}`;

// src/services/sync/context.ts
function sanitizeDetails(details) {
  if (!details) return {};
  const cleaned = scrubDeep(details);
  const json2 = JSON.stringify(cleaned);
  if (json2.length <= 4e3) return cleaned;
  return { truncated: true, preview: json2.slice(0, 3900) };
}
function sanitizeMessage(message, max = 2e3) {
  return scrubSecrets(message).slice(0, max);
}
function chunk2(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// src/services/channels/connection-store.ts
var log14 = createLogger("CONNECTIONS");
var PROVIDER_LABEL = { ebay: "eBay", amazon: "Amazon", shopify: "Shopify", woocommerce: "WooCommerce", manual: "Ventes manuelles" };
async function loadConnection(connectionId) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("channel_connections").select("*").eq("id", connectionId).maybeSingle();
  if (error) throw fromPostgrestError(error);
  return data ?? null;
}
async function listDueConnections(now = /* @__PURE__ */ new Date()) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("channel_connections").select("*").in("status", ["connected", "error"]).eq("auto_sync", true).order("last_sync_at", { ascending: true, nullsFirst: true }).limit(200);
  if (error) throw fromPostgrestError(error);
  return (data ?? []).filter((c) => {
    if (!c.last_sync_at) return true;
    const due = new Date(c.last_sync_at).getTime() + c.sync_interval_minutes * 6e4;
    return due <= now.getTime();
  });
}
async function findConnectionsByExternalAccount(provider, account) {
  const admin = createAdminSupabaseClient();
  const found = /* @__PURE__ */ new Map();
  if (account.userId) {
    const { data, error } = await admin.from("channel_connections").select("*").eq("provider", provider).eq("external_account_id", account.userId);
    if (error) throw fromPostgrestError(error);
    for (const c of data ?? []) found.set(c.id, c);
  }
  if (account.username) {
    const { data, error } = await admin.from("channel_connections").select("*").eq("provider", provider).eq("external_username", account.username);
    if (error) throw fromPostgrestError(error);
    for (const c of data ?? []) found.set(c.id, c);
  }
  return Array.from(found.values());
}
async function saveConnectionTokens(connectionId, tokens) {
  const admin = createAdminSupabaseClient();
  const { error: secretsError } = await admin.from("channel_connection_secrets").upsert(
    {
      connection_id: connectionId,
      access_token_enc: encryptSecret(tokens.accessToken),
      ...tokens.refreshToken ? { refresh_token_enc: encryptSecret(tokens.refreshToken) } : {},
      key_version: 1,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    },
    { onConflict: "connection_id" }
  );
  if (secretsError) throw fromPostgrestError(secretsError);
  const { error } = await admin.from("channel_connections").update({
    token_expires_at: tokens.accessTokenExpiresAt.toISOString(),
    ...tokens.refreshTokenExpiresAt ? { refresh_token_expires_at: tokens.refreshTokenExpiresAt.toISOString() } : {}
  }).eq("id", connectionId);
  if (error) throw fromPostgrestError(error);
}
async function upsertOAuthConnection(input) {
  const admin = createAdminSupabaseClient();
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const label = PROVIDER_LABEL[input.provider];
  const { data: existingList, error: listError } = await admin.from("channel_connections").select("*").eq("organization_id", input.organizationId).eq("provider", input.provider).order("created_at", { ascending: true });
  if (listError) throw fromPostgrestError(listError);
  const existing = (existingList ?? []).find((c) => c.external_account_id === input.account.externalAccountId) ?? (existingList ?? []).find((c) => !c.external_account_id && c.status === "pending") ?? null;
  const patch = {
    status: "connected",
    environment: input.environment,
    external_account_id: input.account.externalAccountId,
    external_username: input.account.username,
    scopes: input.scopes,
    connected_at: nowIso,
    disconnected_at: null,
    last_error: null,
    token_expires_at: input.tokens.accessTokenExpiresAt.toISOString(),
    refresh_token_expires_at: input.tokens.refreshTokenExpiresAt?.toISOString() ?? null
  };
  let connection;
  let isNew = false;
  if (existing) {
    const { data, error } = await admin.from("channel_connections").update(patch).eq("id", existing.id).select("*").single();
    if (error) throw fromPostgrestError(error);
    connection = data;
    await admin.from("sales_channels").update({ name: `${label} \xB7 ${input.account.username}`, is_active: true }).eq("id", existing.sales_channel_id);
  } else {
    const { data: org } = await admin.from("organizations").select("default_currency").eq("id", input.organizationId).maybeSingle();
    const { data: channel, error: channelError } = await admin.from("sales_channels").insert({ organization_id: input.organizationId, provider: input.provider, name: `${label} \xB7 ${input.account.username}`, currency: org?.default_currency ?? "EUR" }).select("*").single();
    if (channelError) throw fromPostgrestError(channelError);
    const { data, error } = await admin.from("channel_connections").insert({ organization_id: input.organizationId, sales_channel_id: channel.id, provider: input.provider, ...patch }).select("*").single();
    if (error) throw fromPostgrestError(error);
    connection = data;
    isNew = true;
  }
  await saveConnectionTokens(connection.id, input.tokens);
  await resolveAlerts(admin, input.organizationId, [connectionExpiredKey(connection.id), syncFailedKey(connection.id)]);
  log14.info("connexion enregistr\xE9e", { provider: input.provider, connectionId: connection.id, orgId: input.organizationId, isNew, username: input.account.username });
  return { connection, isNew };
}
async function markConnectionExpired(connectionId, reason) {
  const admin = createAdminSupabaseClient();
  const cleanReason = sanitizeMessage(reason, 500);
  const { data } = await admin.from("channel_connections").update({ status: "expired", last_error: cleanReason }).eq("id", connectionId).neq("status", "disconnected").select("organization_id, provider, external_username").maybeSingle();
  if (data) {
    await upsertAlert(admin, {
      organizationId: data.organization_id,
      type: "connection_expired",
      severity: "critical",
      title: `Connexion ${PROVIDER_LABEL[data.provider]} expir\xE9e`,
      message: `${cleanReason} Reconnectez votre compte ${PROVIDER_LABEL[data.provider]}${data.external_username ? ` (${data.external_username})` : ""} pour reprendre la synchronisation.`,
      dedupeKey: connectionExpiredKey(connectionId),
      entityType: "channel_connection",
      entityId: connectionId,
      actionHref: "/settings/integrations"
    });
    log14.warn("connexion marqu\xE9e expir\xE9e", { connectionId, reason: cleanReason });
  }
}
function expired(connectionId, message, details = {}) {
  return new ConnectorError("AUTH_EXPIRED", "ebay", message, { details: { connectionId, ...details }, retryable: false });
}
var ACCESS_TOKEN_REFRESH_MARGIN_MS = 5 * 6e4;
var inflightRefresh = /* @__PURE__ */ new Map();
async function loadTokenState(connectionId) {
  const admin = createAdminSupabaseClient();
  const connection = await loadConnection(connectionId);
  if (!connection) throw new AppError("NOT_FOUND", "Connexion introuvable.");
  const { data: secrets, error } = await admin.from("channel_connection_secrets").select("access_token_enc, refresh_token_enc").eq("connection_id", connectionId).maybeSingle();
  if (error) throw fromPostgrestError(error);
  return { connection, secrets: secrets ?? null };
}
function accessTokenIsFresh(state, now) {
  const expiresAt = state.connection.token_expires_at ? new Date(state.connection.token_expires_at).getTime() : 0;
  return Boolean(state.secrets?.access_token_enc) && expiresAt - now > ACCESS_TOKEN_REFRESH_MARGIN_MS;
}
async function getValidAccessToken(connectionId, options = {}) {
  const state = await loadTokenState(connectionId);
  const { connection, secrets } = state;
  if (connection.status === "disconnected") {
    throw expired(connectionId, "Cette connexion a \xE9t\xE9 d\xE9connect\xE9e : reconnectez votre compte pour reprendre la synchronisation.");
  }
  if (!secrets || !secrets.access_token_enc && !secrets.refresh_token_enc) {
    await markConnectionExpired(connectionId, "Aucun token enregistr\xE9 pour cette connexion.");
    throw expired(connectionId, "Impossible de synchroniser : aucun token d'autorisation enregistr\xE9. Reconnectez votre compte.");
  }
  const now = Date.now();
  if (!options.forceRefresh && accessTokenIsFresh(state, now) && secrets.access_token_enc) {
    return safeDecrypt(connectionId, secrets.access_token_enc);
  }
  if (!secrets.refresh_token_enc) {
    await markConnectionExpired(connectionId, "Le token d'acc\xE8s a expir\xE9 et aucun refresh token n'est disponible.");
    throw expired(connectionId, "Impossible de synchroniser eBay : le token d'autorisation a expir\xE9.");
  }
  if (connection.refresh_token_expires_at && new Date(connection.refresh_token_expires_at).getTime() <= now) {
    await markConnectionExpired(connectionId, "L'autorisation eBay (refresh token, validit\xE9 ~18 mois) a expir\xE9.");
    throw expired(connectionId, "Impossible de synchroniser eBay : l'autorisation accord\xE9e a expir\xE9 (refresh token de 18 mois). Reconnectez votre compte.");
  }
  const pending = inflightRefresh.get(connectionId);
  if (pending) return pending;
  const refreshEnc = secrets.refresh_token_enc;
  const promise = refreshAndStore(connection, refreshEnc).finally(() => inflightRefresh.delete(connectionId));
  inflightRefresh.set(connectionId, promise);
  return promise;
}
async function refreshAndStore(connection, refreshEnc) {
  const admin = createAdminSupabaseClient();
  const connectionId = connection.id;
  const connector = getConnector(connection.provider);
  const refreshToken = await safeDecrypt(connectionId, refreshEnc);
  let tokens;
  try {
    tokens = await connector.refreshToken(refreshToken);
  } catch (e) {
    if (isConnectorError(e) && e.code === "AUTH_EXPIRED") {
      const latest = await loadTokenState(connectionId).catch(() => null);
      if (latest?.secrets?.refresh_token_enc && latest.secrets.refresh_token_enc !== refreshEnc && latest.connection.status !== "disconnected") {
        log14.info("refresh token remplac\xE9 pendant le rafra\xEEchissement (reconnexion) : la connexion n'est pas marqu\xE9e expir\xE9e", { connectionId });
        if (latest.secrets.access_token_enc && accessTokenIsFresh(latest, Date.now())) return safeDecrypt(connectionId, latest.secrets.access_token_enc);
        throw e;
      }
      await markConnectionExpired(connectionId, e.message);
    }
    throw e;
  }
  const { data: outcome, error } = await admin.rpc("store_refreshed_access_token", {
    p_connection_id: connectionId,
    p_access_token_enc: encryptSecret(tokens.accessToken),
    p_expires_at: tokens.accessTokenExpiresAt.toISOString(),
    p_refresh_token_enc_used: refreshEnc
  });
  if (error) {
    log14.error("token rafra\xEEchi mais non enregistr\xE9", { connectionId, error: error.message });
    return tokens.accessToken;
  }
  if (outcome === "disconnected") {
    throw expired(connectionId, "La connexion a \xE9t\xE9 d\xE9connect\xE9e pendant la synchronisation : aucun token n'a \xE9t\xE9 conserv\xE9.");
  }
  if (outcome === "stale") {
    const latest = await loadTokenState(connectionId);
    if (latest.secrets?.access_token_enc && accessTokenIsFresh(latest, Date.now())) {
      log14.info("token plus r\xE9cent d\xE9j\xE0 enregistr\xE9 par un autre processus", { connectionId });
      return safeDecrypt(connectionId, latest.secrets.access_token_enc);
    }
    return tokens.accessToken;
  }
  log14.info("access token rafra\xEEchi", { connectionId, provider: connection.provider, expiresAt: tokens.accessTokenExpiresAt.toISOString() });
  return tokens.accessToken;
}
async function safeDecrypt(connectionId, payload) {
  try {
    return decryptSecret(payload);
  } catch {
    const message = "Les tokens eBay enregistr\xE9s ne peuvent pas \xEAtre d\xE9chiffr\xE9s (la cl\xE9 TOKEN_ENCRYPTION_KEY du serveur a probablement chang\xE9). Reconnectez votre compte eBay.";
    await markConnectionExpired(connectionId, message);
    throw new ConnectorError("AUTH_EXPIRED", "ebay", message, { details: { connectionId, reason: "decrypt_failed" }, retryable: false });
  }
}
function connectorAuthFor(connectionId) {
  return { getAccessToken: (options) => getValidAccessToken(connectionId, options) };
}

// src/services/sync/matching.ts
var STOPWORDS = /* @__PURE__ */ new Set(["de", "la", "le", "les", "et", "en", "pour", "avec", "du", "des", "un", "une", "the", "and", "with", "for", "of", "a", "an", "neuf", "new", "lot"]);
var COLORS2 = {
  noir: "black",
  black: "black",
  blanc: "white",
  white: "white",
  bleu: "blue",
  blue: "blue",
  rouge: "red",
  red: "red",
  vert: "green",
  green: "green",
  gris: "gray",
  gray: "gray",
  grey: "gray",
  argent: "silver",
  silver: "silver",
  or: "gold",
  gold: "gold",
  rose: "pink",
  pink: "pink",
  violet: "purple",
  purple: "purple",
  jaune: "yellow",
  yellow: "yellow",
  orange: "orange",
  marron: "brown",
  brown: "brown",
  graphite: "graphite",
  minuit: "midnight",
  midnight: "midnight"
};
function stripAccents(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function tokenize(text2) {
  const lower = stripAccents(text2.toLowerCase()).replace(/(\d+)\s*(go|gb|gib)\b/g, "$1gb").replace(/(\d+)\s*(to|tb|tib)\b/g, "$1tb").replace(/(\d+)\s*(mo|mb)\b/g, "$1mb");
  const out = [];
  for (const raw of lower.split(/[^a-z0-9]+/)) {
    if (!raw || STOPWORDS.has(raw)) continue;
    if (raw.length < 2 && !/^\d$/.test(raw)) continue;
    out.push(COLORS2[raw] ?? raw);
  }
  return out;
}
function diceCoefficient(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return 2 * inter / (a.size + b.size);
}
var STORAGE_RE = /^\d+(gb|tb|mb)$/;
var EAN_RE = /^\d{8,14}$/;
function normalizeSku(s) {
  return stripAccents(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
}
var candidateTokenCache = /* @__PURE__ */ new WeakMap();
function candidateTokens(c) {
  const cached2 = candidateTokenCache.get(c);
  if (cached2) return cached2;
  const parts = [c.brand ?? "", c.productName, c.variantName ?? "", ...Object.values(c.attributes), c.mpn ?? ""];
  const set = new Set(tokenize(parts.join(" ")));
  candidateTokenCache.set(c, set);
  return set;
}
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function listingTokens(l) {
  return new Set(tokenize([l.title, ...Object.values(l.variationAttributes)].join(" ")));
}
function storageTokens(tokens) {
  return new Set([...tokens].filter((t) => STORAGE_RE.test(t)));
}
function colorTokens(tokens) {
  const known2 = new Set(Object.values(COLORS2));
  return new Set([...tokens].filter((t) => known2.has(t)));
}
function round32(n) {
  return Math.round(n * 1e3) / 1e3;
}
function scoreCandidate(listing, candidate) {
  const reasons = [];
  const listingEan = listing.ean?.trim() || (listing.externalSku && EAN_RE.test(listing.externalSku.trim()) ? listing.externalSku.trim() : null);
  if (listingEan && (candidate.ean === listingEan || candidate.barcode === listingEan)) {
    return { skuId: candidate.skuId, confidence: 0.95, method: "ean", reasons: [`EAN identique (${listingEan})`] };
  }
  if (listing.externalSku) {
    const a = normalizeSku(listing.externalSku);
    const b = normalizeSku(candidate.code);
    const shorter = Math.min(a.length, b.length);
    if (a && b && shorter >= 4 && a !== b && (a.includes(b) || b.includes(a))) {
      const closeness = Math.abs(a.length - b.length) <= 3 ? 0.85 : 0.7;
      return { skuId: candidate.skuId, confidence: closeness, method: "sku_partial", reasons: [`SKU eBay \xAB ${listing.externalSku} \xBB proche du code \xAB ${candidate.code} \xBB`] };
    }
  }
  const lt = listingTokens(listing);
  const ct = candidateTokens(candidate);
  const dice = diceCoefficient(lt, ct);
  if (dice === 0) return null;
  let bonus = 0;
  let penalty = 0;
  let attributeMatches = 0;
  const lStorage = storageTokens(lt);
  const cStorage = storageTokens(ct);
  if (cStorage.size > 0 && lStorage.size > 0) {
    const common = [...cStorage].some((t) => lStorage.has(t));
    if (common) {
      attributeMatches++;
      bonus += 0.08;
      reasons.push("capacit\xE9 identique");
    } else {
      penalty += 0.35;
      reasons.push("capacit\xE9 diff\xE9rente");
    }
  }
  const lColor = colorTokens(lt);
  const cColor = colorTokens(ct);
  if (cColor.size > 0 && lColor.size > 0) {
    const common = [...cColor].some((t) => lColor.has(t));
    if (common) {
      attributeMatches++;
      bonus += 0.06;
      reasons.push("couleur identique");
    } else {
      penalty += 0.25;
      reasons.push("couleur diff\xE9rente");
    }
  }
  const grade = candidate.attributes.grade ?? candidate.attributes.Grade;
  if (grade && lt.has(stripAccents(grade.toLowerCase())) && new RegExp(`grade\\s*${escapeRegExp(grade)}`, "i").test(listing.title)) {
    attributeMatches++;
    bonus += 0.04;
    reasons.push(`grade ${grade} mentionn\xE9`);
  }
  if (candidate.brand && lt.has(tokenize(candidate.brand)[0] ?? "")) reasons.push("marque pr\xE9sente dans le titre");
  const confidence = round32(Math.max(0, Math.min(0.9, dice + Math.min(bonus, 0.15) - penalty)));
  if (confidence <= 0) return null;
  reasons.unshift(`similarit\xE9 du titre ${Math.round(dice * 100)} %`);
  return { skuId: candidate.skuId, confidence, method: attributeMatches > 0 && penalty === 0 ? "attributes" : "title_similarity", reasons };
}
function suggestSkusForListing(listing, candidates, options = {}) {
  const limit = options.limit ?? 3;
  const min = options.minConfidence ?? 0.5;
  const scored = [];
  for (const c of candidates) {
    const s = scoreCandidate(listing, c);
    if (s && s.confidence >= min) scored.push(s);
  }
  scored.sort((a, b) => b.confidence - a.confidence || a.skuId.localeCompare(b.skuId));
  return scored.slice(0, limit);
}

// src/services/sync/listings.ts
var UPSERT_CHUNK = 200;
var MAX_LISTINGS_TO_SCORE = 500;
var MAX_SKU_CANDIDATES = 5e3;
function listingKey(externalListingId, externalVariationId) {
  return `${externalListingId}\0${externalVariationId}`;
}
function listingToRows(ctx, l, nowIso) {
  const base = {
    organization_id: ctx.organizationId,
    sales_channel_id: ctx.salesChannelId,
    connection_id: ctx.connection.id,
    provider: ctx.connection.provider,
    external_listing_id: l.externalListingId,
    external_product_id: l.externalProductId,
    status: l.status,
    listing_url: l.listingUrl,
    image_url: l.imageUrl,
    last_synced_at: nowIso,
    ended_at: null
  };
  if (l.variations.length === 0) {
    return [
      {
        ...base,
        external_variation_id: "",
        external_sku: l.sku,
        title: l.title,
        price: l.price,
        currency: l.currency,
        quantity_listed: l.quantityListed,
        quantity_available: l.quantityAvailable,
        quantity_sold: l.quantitySold,
        variation_attributes: {}
      }
    ];
  }
  return l.variations.map((v2, index) => {
    const key2 = variationKey({ sku: v2.sku, aspects: v2.specifics }) || `#${index + 1}`;
    const specificsLabel = Object.values(v2.specifics).join(" / ");
    return {
      ...base,
      external_variation_id: key2,
      // Une variation sans SKU propre n'hérite PAS du SKU parent : l'associer automatiquement
      // ferait pointer toutes les variations vers le même SKU interne (double décrément).
      external_sku: v2.sku ?? null,
      title: specificsLabel ? `${l.title} \u2013 ${specificsLabel}` : l.title,
      price: v2.price ?? l.price,
      currency: v2.currency ?? l.currency,
      quantity_listed: v2.quantityListed,
      quantity_available: v2.quantityAvailable,
      quantity_sold: v2.quantitySold,
      variation_attributes: v2.specifics
    };
  });
}
function emptyListingsResult() {
  return { fetched: 0, upserted: 0, ended: 0, autoMapped: 0, suggestionsCreated: 0, invalid: 0, complete: false };
}
async function syncListings(ctx, result = emptyListingsResult()) {
  const { admin, log: log24 } = ctx;
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const seen = /* @__PURE__ */ new Set();
  let truncated = false;
  for await (const page2 of ctx.connector.getListings(ctx.auth)) {
    result.fetched += page2.listings.length;
    result.invalid += page2.invalid.length;
    for (const inv of page2.invalid) ctx.recordError({ code: "INVALID_LISTING", message: inv.message, entityType: "listing", entityRef: inv.ref });
    for (const w2 of page2.warnings) log24.warn("avertissement eBay (GetMyeBaySelling)", { warning: w2 });
    if (page2.truncated) truncated = true;
    const rows = page2.listings.flatMap((l) => listingToRows(ctx, l, nowIso));
    for (const r of rows) seen.add(listingKey(r.external_listing_id, r.external_variation_id ?? ""));
    for (const part of chunk2(rows, UPSERT_CHUNK)) {
      const { data, error } = await admin.from("channel_listings").upsert(part, { onConflict: "sales_channel_id,external_listing_id,external_variation_id" }).select("id");
      if (error) throw fromPostgrestError(error);
      result.upserted += data?.length ?? 0;
    }
  }
  result.complete = !truncated;
  if (truncated) {
    ctx.recordError({ code: "LISTINGS_TRUNCATED", message: "Liste d'annonces incompl\xE8te (limite de pages atteinte) : aucune annonce n'a \xE9t\xE9 marqu\xE9e termin\xE9e lors de ce run.", entityType: "phase", entityRef: "listings" });
    log24.warn("liste d'annonces tronqu\xE9e : \xE9tape \xAB annonces termin\xE9es \xBB ignor\xE9e", { fetched: result.fetched });
  }
  const active = result.complete ? await fetchAllRows(
    (from, to) => admin.from("channel_listings").select("id, external_listing_id, external_variation_id").eq("sales_channel_id", ctx.salesChannelId).eq("organization_id", ctx.organizationId).eq("status", "active").order("id").range(from, to)
  ).catch((e) => {
    throw fromPostgrestError(e);
  }) : [];
  const toEnd = active.filter((r) => !seen.has(listingKey(r.external_listing_id, r.external_variation_id))).map((r) => r.id);
  for (const ids of chunk2(toEnd, 500)) {
    const { error } = await admin.from("channel_listings").update({ status: "ended", ended_at: nowIso, last_synced_at: nowIso }).in("id", ids).eq("organization_id", ctx.organizationId);
    if (error) throw fromPostgrestError(error);
    result.ended += ids.length;
  }
  result.autoMapped = await autoMapBySku(ctx);
  result.suggestionsCreated = await computeSuggestions(ctx);
  return result;
}
async function autoMapBySku(ctx) {
  const { admin } = ctx;
  const toAppError = (e) => {
    throw fromPostgrestError(e);
  };
  const unmapped = await fetchAllRows(
    (from, to) => admin.from("channel_listings").select("id, external_sku").eq("sales_channel_id", ctx.salesChannelId).eq("organization_id", ctx.organizationId).eq("status", "active").in("mapping_status", ["unmapped", "suggested"]).not("external_sku", "is", null).order("id").range(from, to)
  ).catch(toAppError);
  const candidates = unmapped.filter((l) => l.external_sku && l.external_sku.trim().length > 0);
  if (candidates.length === 0) return 0;
  const skus = await fetchAllRows((from, to) => admin.from("skus").select("id, code").eq("organization_id", ctx.organizationId).eq("is_active", true).order("id").range(from, to)).catch(toAppError);
  const byCode = /* @__PURE__ */ new Map();
  for (const s of skus) byCode.set(s.code.trim().toUpperCase(), s.id);
  let mapped = 0;
  for (const l of candidates) {
    const skuId = byCode.get((l.external_sku ?? "").trim().toUpperCase());
    if (!skuId) continue;
    const { error: mapError } = await admin.rpc("map_listing_to_sku", { p_listing_id: l.id, p_sku_id: skuId, p_source: "auto_sku_match" });
    if (mapError) {
      ctx.recordError({ code: "AUTO_MAP_FAILED", message: mapError.message, entityType: "listing", entityRef: l.id });
      continue;
    }
    mapped++;
  }
  return mapped;
}
async function computeSuggestions(ctx) {
  const { admin } = ctx;
  const { data: listings, error } = await admin.from("channel_listings").select("id, title, external_sku, variation_attributes").eq("sales_channel_id", ctx.salesChannelId).eq("organization_id", ctx.organizationId).eq("status", "active").in("mapping_status", ["unmapped", "suggested"]).order("first_seen_at", { ascending: false }).limit(MAX_LISTINGS_TO_SCORE);
  if (error) throw fromPostgrestError(error);
  if (!listings || listings.length === 0) return 0;
  const { data: skus, error: skuError } = await admin.from("skus").select("id, code, barcode, product:products(name, brand), variant:product_variants(name, attributes, ean, mpn)").eq("organization_id", ctx.organizationId).eq("is_active", true).limit(MAX_SKU_CANDIDATES);
  if (skuError) throw fromPostgrestError(skuError);
  const candidates = (skus ?? []).map((s) => {
    const attrs = s.variant?.attributes;
    const attributes = {};
    if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
      for (const [k, v2] of Object.entries(attrs)) if (typeof v2 === "string" || typeof v2 === "number") attributes[k] = String(v2);
    }
    return {
      skuId: s.id,
      code: s.code,
      barcode: s.barcode,
      productName: s.product?.name ?? "",
      brand: s.product?.brand ?? null,
      variantName: s.variant?.name ?? null,
      attributes,
      ean: s.variant?.ean ?? null,
      mpn: s.variant?.mpn ?? null
    };
  });
  if (candidates.length === 0) return 0;
  const rows = [];
  const suggestedListingIds = /* @__PURE__ */ new Set();
  for (const l of listings) {
    const attrs = l.variation_attributes;
    const variationAttributes = {};
    if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
      for (const [k, v2] of Object.entries(attrs)) if (typeof v2 === "string") variationAttributes[k] = v2;
    }
    const scores = suggestSkusForListing({ title: l.title, externalSku: l.external_sku, variationAttributes }, candidates);
    for (const s of scores) {
      rows.push({ organization_id: ctx.organizationId, listing_id: l.id, sku_id: s.skuId, confidence: s.confidence, method: s.method, reasons: s.reasons, status: "pending" });
    }
    if (scores.length > 0) suggestedListingIds.add(l.id);
  }
  let created = 0;
  for (const part of chunk2(rows, 500)) {
    const { data, error: insError } = await admin.from("mapping_suggestions").upsert(part, { onConflict: "listing_id,sku_id", ignoreDuplicates: true }).select("id");
    if (insError) throw fromPostgrestError(insError);
    created += data?.length ?? 0;
  }
  for (const ids of chunk2([...suggestedListingIds], 500)) {
    const { error: updError } = await admin.from("channel_listings").update({ mapping_status: "suggested" }).in("id", ids).eq("mapping_status", "unmapped");
    if (updError) throw fromPostgrestError(updError);
  }
  return created;
}

// src/services/sync/orders.ts
import { z as z24 } from "npm:zod@4.6.5";
function emptyOrdersResult() {
  return {
    fetched: 0,
    created: 0,
    updated: 0,
    itemsUnmapped: 0,
    movements: 0,
    invalid: 0,
    failed: 0,
    pages: 0,
    maxModifiedSeen: null,
    minFailedModified: null,
    failedWithoutDate: false,
    completedUntil: null,
    windowComplete: false,
    truncated: false
  };
}
var ORDERS_MIN_SLICE_HOURS = 1;
var ORDERS_MAX_PAGES_PER_RUN = 200;
var ingestResultSchema = z24.object({
  order_id: z24.string(),
  created: z24.boolean(),
  status_changed: z24.boolean().optional(),
  items_mapped: z24.number().int().optional(),
  items_unmapped: z24.number().int().optional(),
  movements: z24.number().int().optional()
});
function orderToRpcPayload(order) {
  return {
    p_order: {
      external_order_id: order.externalOrderId,
      order_number: order.orderNumber,
      status: order.status,
      payment_status: order.paymentStatus,
      fulfillment_status: order.fulfillmentStatus,
      buyer_username: order.buyerUsername,
      currency: order.currency,
      subtotal: order.subtotal,
      shipping_total: order.shippingTotal,
      tax_total: order.taxTotal,
      fee_total: order.feeTotal,
      total: order.total,
      placed_at: order.placedAt,
      external_modified_at: order.externalModifiedAt,
      payload_hash: order.payloadHash
    },
    p_items: order.items.map((i) => ({
      external_line_item_id: i.externalLineItemId,
      external_listing_id: i.externalListingId,
      external_variation_id: i.externalVariationId,
      external_sku: i.externalSku,
      title: i.title,
      quantity: i.quantity,
      unit_price: i.unitPrice,
      currency: i.currency,
      total: i.total
    }))
  };
}
async function syncOrders(ctx, window, result = emptyOrdersResult(), options = {}) {
  const sliceHours = options.sliceHours ?? ORDERS_SLICE_HOURS;
  const minSliceMs = (options.minSliceHours ?? ORDERS_MIN_SLICE_HOURS) * 36e5;
  let budget = options.maxPages ?? ORDERS_MAX_PAGES_PER_RUN;
  const queue = splitOrdersWindow(window, sliceHours);
  const seen = { orders: /* @__PURE__ */ new Map(), invalid: /* @__PURE__ */ new Set() };
  while (queue.length > 0) {
    if (budget <= 0) {
      result.truncated = true;
      break;
    }
    const slice = queue.shift();
    let sliceTruncated = false;
    let outOfBudget = false;
    for await (const page2 of ctx.connector.getOrders(ctx.auth, { since: slice.since, until: slice.until })) {
      if (budget <= 0) {
        outOfBudget = true;
        break;
      }
      budget--;
      result.pages++;
      await ingestOrdersPage(ctx, page2, result, seen);
      if (page2.truncated) sliceTruncated = true;
      if (budget <= 0 && !sliceTruncated && page2.hasMore !== false) {
        outOfBudget = true;
        break;
      }
    }
    if (outOfBudget) {
      result.truncated = true;
      break;
    }
    if (sliceTruncated) {
      const span = slice.until.getTime() - slice.since.getTime();
      if (span > minSliceMs && budget > 0) {
        const mid = new Date(slice.since.getTime() + Math.floor(span / 2));
        queue.unshift({ since: slice.since, until: mid, initial: slice.initial }, { since: mid, until: slice.until, initial: slice.initial });
        continue;
      }
      result.truncated = true;
      break;
    }
    result.completedUntil = slice.until;
  }
  result.windowComplete = !result.truncated && queue.length === 0;
  if (result.truncated) {
    const resumeFrom = result.completedUntil ?? window.since;
    ctx.recordError({
      code: "ORDERS_TRUNCATED",
      message: `Import des commandes incomplet (limite de pages atteinte) : les commandes modifi\xE9es apr\xE8s le ${resumeFrom.toISOString()} seront reprises au prochain run.`,
      entityType: "phase",
      entityRef: "orders"
    });
  }
  return result;
}
async function ingestOrdersPage(ctx, page2, result, seen) {
  const { admin } = ctx;
  const noteFailed = (modifiedAt) => {
    if (!modifiedAt) {
      result.failedWithoutDate = true;
      return;
    }
    const d = new Date(modifiedAt);
    if (!result.minFailedModified || d < result.minFailedModified) result.minFailedModified = d;
  };
  for (const inv of page2.invalid) {
    if (inv.ref) {
      if (seen.invalid.has(inv.ref)) continue;
      seen.invalid.add(inv.ref);
    }
    result.invalid++;
    ctx.recordError({ code: "INVALID_ORDER", message: `${inv.message} Cette commande n'a pas \xE9t\xE9 import\xE9e : v\xE9rifiez-la dans eBay.`, entityType: "order", entityRef: inv.ref });
  }
  for (const order of page2.orders) {
    const prev = seen.orders.get(order.externalOrderId);
    const modifiedAt = order.externalModifiedAt ?? null;
    if (prev?.ingested && prev.payloadHash === order.payloadHash && prev.modifiedAt === modifiedAt) continue;
    if (!prev) result.fetched++;
    const entry = prev ?? { payloadHash: order.payloadHash, modifiedAt, ingested: false, counted: false, failedCounted: false, itemsUnmapped: 0 };
    entry.payloadHash = order.payloadHash;
    entry.modifiedAt = modifiedAt;
    seen.orders.set(order.externalOrderId, entry);
    const fail = (code, message, details) => {
      if (!entry.failedCounted) result.failed++;
      entry.failedCounted = true;
      entry.ingested = false;
      noteFailed(order.externalModifiedAt ?? order.placedAt);
      ctx.recordError({ code, message, entityType: "order", entityRef: order.externalOrderId, ...details ? { details } : {} });
    };
    const payload = orderToRpcPayload(order);
    const { data, error } = await admin.rpc("ingest_external_order", {
      p_organization_id: ctx.organizationId,
      p_sales_channel_id: ctx.salesChannelId,
      p_connection_id: ctx.connection.id,
      p_provider: ctx.connection.provider,
      p_order: payload.p_order,
      p_items: payload.p_items
    });
    if (error) {
      fail("ORDER_INGEST_FAILED", `Commande ${order.orderNumber ?? order.externalOrderId} non import\xE9e : ${error.message}`, { pgCode: error.code ?? null });
      continue;
    }
    const parsed = ingestResultSchema.safeParse(data);
    if (!parsed.success) {
      fail("ORDER_INGEST_UNEXPECTED", "R\xE9sultat inattendu de ingest_external_order.");
      continue;
    }
    entry.ingested = true;
    if (!entry.counted) {
      if (parsed.data.created) result.created++;
      else result.updated++;
      entry.counted = true;
    }
    const unmapped = parsed.data.items_unmapped ?? 0;
    result.itemsUnmapped += unmapped - entry.itemsUnmapped;
    entry.itemsUnmapped = unmapped;
    result.movements += parsed.data.movements ?? 0;
    if (order.externalModifiedAt) {
      const d = new Date(order.externalModifiedAt);
      if (!result.maxModifiedSeen || d > result.maxModifiedSeen) result.maxModifiedSeen = d;
    }
  }
}

// src/services/sync/inventory-push.ts
var log15 = createLogger("SYNC");
var MAX_PUSH_PER_RUN = 200;
function listingRefOf(row) {
  if (!row.external_variation_id) return { externalListingId: row.external_listing_id, variationSku: null };
  if (!row.external_sku) return null;
  return { externalListingId: row.external_listing_id, variationSku: row.external_sku };
}
async function pushQuantityToChannel(admin, connector, auth, listing, quantity) {
  const ref = listingRefOf(listing);
  if (!ref) {
    throw new AppError("VALIDATION", `L'annonce \xAB ${listing.title} \xBB est une variation sans SKU eBay : eBay ne permet pas d'en modifier la quantit\xE9 sans SKU.`);
  }
  const qty = Math.max(0, Math.trunc(quantity));
  const result = await connector.updateListingInventory(auth, ref, qty);
  const { error } = await admin.from("channel_listings").update({ quantity_available: qty, last_synced_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", listing.id);
  if (error) throw fromPostgrestError(error);
  log15.info("quantit\xE9 envoy\xE9e au canal", { listingId: listing.id, externalListingId: listing.external_listing_id, variation: listing.external_variation_id || null, quantity: qty, warnings: result.warnings.length });
  return { quantity: qty, warnings: result.warnings };
}
async function pushInventory(ctx) {
  const { admin } = ctx;
  const result = { checked: 0, changed: 0, pushed: 0, failed: 0 };
  const listings = await fetchAllRows(
    (from, to) => admin.from("channel_listings").select("id, external_listing_id, external_variation_id, external_sku, sku_id, quantity_available, title").eq("sales_channel_id", ctx.salesChannelId).eq("organization_id", ctx.organizationId).eq("status", "active").eq("mapping_status", "mapped").not("sku_id", "is", null).order("id").range(from, to)
  ).catch((e) => {
    throw fromPostgrestError(e);
  });
  const rows = listings;
  result.checked = rows.length;
  if (rows.length === 0) return result;
  const skuIds = [...new Set(rows.map((r) => r.sku_id).filter((x) => Boolean(x)))];
  const available = /* @__PURE__ */ new Map();
  for (let i = 0; i < skuIds.length; i += 500) {
    const { data: inv, error: invError } = await admin.from("inventory").select("sku_id, quantity_available").eq("organization_id", ctx.organizationId).in("sku_id", skuIds.slice(i, i + 500));
    if (invError) throw fromPostgrestError(invError);
    for (const r of inv ?? []) if (r.quantity_available !== null) available.set(r.sku_id, r.quantity_available);
  }
  let budget = MAX_PUSH_PER_RUN;
  for (const row of rows) {
    if (!row.sku_id) continue;
    const target = available.get(row.sku_id);
    if (target === void 0) continue;
    const clamped = Math.max(0, target);
    if (row.quantity_available === clamped) continue;
    result.changed++;
    if (budget <= 0) continue;
    budget--;
    try {
      await pushQuantityToChannel(admin, ctx.connector, ctx.auth, row, clamped);
      result.pushed++;
    } catch (e) {
      const d = describeError(e);
      if (d.code === "AUTH_EXPIRED") throw e;
      result.failed++;
      ctx.recordError({ code: `INVENTORY_PUSH_${d.code}`, message: d.message, entityType: "listing", entityRef: row.external_listing_id + (row.external_variation_id ? ` / ${row.external_variation_id}` : ""), details: d.details });
      if (d.code === "RATE_LIMITED") {
        ctx.recordError({ code: "INVENTORY_PUSH_STOPPED", message: "Envoi des quantit\xE9s interrompu : quota d'appels eBay atteint. Les annonces restantes seront mises \xE0 jour au prochain run.", entityType: "channel" });
        break;
      }
    }
  }
  if (result.changed > MAX_PUSH_PER_RUN) {
    ctx.recordError({ code: "INVENTORY_PUSH_LIMIT", message: `${result.changed} annonces \xE0 mettre \xE0 jour, ${MAX_PUSH_PER_RUN} envoy\xE9es sur ce run : la suite sera trait\xE9e au prochain run.`, entityType: "channel" });
  }
  return result;
}

// src/services/sync/engine.ts
var log16 = createLogger("SYNC");
var RUNNING_STALE_MINUTES2 = 15;
function emptyStats() {
  return {
    listings_fetched: 0,
    listings_upserted: 0,
    listings_ended: 0,
    listings_auto_mapped: 0,
    suggestions_created: 0,
    orders_fetched: 0,
    orders_created: 0,
    orders_updated: 0,
    items_unmapped: 0,
    inventory_changes: 0,
    inventory_pushed: 0,
    errors: 0
  };
}
var PROVIDER_LABEL2 = { ebay: "eBay", amazon: "Amazon", shopify: "Shopify", woocommerce: "WooCommerce", manual: "Ventes manuelles" };
async function runChannelSync(connectionId, options) {
  const admin = createAdminSupabaseClient();
  const scope = options.scope ?? "full";
  const startedAt = /* @__PURE__ */ new Date();
  const { data: connection, error: connError } = await admin.from("channel_connections").select("*").eq("id", connectionId).maybeSingle();
  if (connError) throw fromPostgrestError(connError);
  if (!connection) throw new AppError("NOT_FOUND", "Connexion introuvable.");
  const label = PROVIDER_LABEL2[connection.provider] ?? connection.provider;
  if (connection.status === "disconnected") {
    throw new AppError("CONNECTION_EXPIRED", `Cette connexion ${label} a \xE9t\xE9 d\xE9connect\xE9e. Reconnectez votre compte pour synchroniser.`, { action: RECONNECT_ACTION });
  }
  if (connection.status === "expired") {
    throw new AppError("CONNECTION_EXPIRED", `Impossible de synchroniser ${label} : le token d'autorisation a expir\xE9.`, { action: RECONNECT_ACTION });
  }
  if (connection.status === "pending") {
    throw new AppError("CONNECTION_EXPIRED", `La connexion ${label} n'a pas \xE9t\xE9 finalis\xE9e. Relancez la connexion.`, { action: RECONNECT_ACTION });
  }
  await guardConcurrency(admin, connection);
  const connector = getConnector(connection.provider);
  if (!connector.available) throw new AppError("NOT_IMPLEMENTED", `Le connecteur ${label} n'est pas encore disponible.`);
  if (!connector.isConfigured()) {
    throw new AppError("NOT_CONFIGURED", `Int\xE9gration ${label} non configur\xE9e sur ce serveur : ${connector.configurationIssues().join(" ; ")}`);
  }
  const { data: run, error: runError } = await admin.from("sync_runs").insert({ organization_id: connection.organization_id, source_kind: "channel", source_ref: connection.id, provider: connection.provider, trigger: options.trigger, status: "running", created_by: options.userId ?? null, stats: {} }).select("id").single();
  if (runError) {
    if (runError.code === "23505") throw new AppError("CONFLICT", `Une synchronisation ${label} est d\xE9j\xE0 en cours pour cette connexion. Patientez avant d'en relancer une.`);
    throw fromPostgrestError(runError);
  }
  const runId = run.id;
  log16.info(`${label} sync started`, { runId, connectionId, orgId: connection.organization_id, trigger: options.trigger, scope, username: connection.external_username });
  const stats = emptyStats();
  const errors = [];
  const state = { fatal: null, authExpired: false, phasesCompleted: 0, newCursor: null };
  const ctx = {
    admin,
    connection,
    organizationId: connection.organization_id,
    salesChannelId: connection.sales_channel_id,
    connector,
    auth: connectorAuthFor(connection.id),
    log: log16,
    recordError: (e) => {
      errors.push(e);
      log16.warn("erreur de synchronisation", { runId, code: e.code, entity: e.entityRef ?? null, message: e.message });
    }
  };
  const runPhase = async (name, fn) => {
    if (state.fatal) return false;
    try {
      await fn();
      state.phasesCompleted++;
      return true;
    } catch (e) {
      const d = describeError(e);
      const entry = { code: d.code, message: d.message, entityType: "phase", entityRef: name, details: d.details };
      errors.push(entry);
      if (isConnectorError(e) && (e.code === "AUTH_EXPIRED" || e.code === "NOT_CONFIGURED" || e.code === "NOT_IMPLEMENTED")) {
        state.fatal = entry;
        state.authExpired = e.code === "AUTH_EXPIRED";
      } else if (!isConnectorError(e) && !(e instanceof AppError)) {
        state.fatal = entry;
      }
      log16.error(`phase ${name} \xE9chou\xE9e`, { runId, code: d.code, message: d.message, fatal: state.fatal !== null });
      return false;
    }
  };
  if (scope === "full" || scope === "listings") {
    const r = emptyListingsResult();
    await runPhase("listings", async () => {
      await syncListings(ctx, r);
      log16.info(`${label} listings synced`, { runId, fetched: r.fetched, upserted: r.upserted, ended: r.ended, autoMapped: r.autoMapped, suggestions: r.suggestionsCreated, invalid: r.invalid });
    });
    stats.listings_fetched = r.fetched;
    stats.listings_upserted = r.upserted;
    stats.listings_ended = r.ended;
    stats.listings_auto_mapped = r.autoMapped;
    stats.suggestions_created = r.suggestionsCreated;
  }
  if (scope === "full" || scope === "orders") {
    const window = computeOrdersWindow(connection.last_orders_cursor, startedAt);
    const r = emptyOrdersResult();
    log16.info(`${label} orders window`, { runId, since: window.since.toISOString(), until: window.until.toISOString(), initial: window.initial });
    await runPhase("orders", async () => {
      await syncOrders(ctx, window, r, options.orders);
      log16.info(`${label} orders synced`, { runId, fetched: r.fetched, created: r.created, updated: r.updated, itemsUnmapped: r.itemsUnmapped, movements: r.movements, failed: r.failed, invalid: r.invalid, truncated: r.truncated, pages: r.pages });
    });
    stats.orders_fetched = r.fetched;
    stats.orders_created = r.created;
    stats.orders_updated = r.updated;
    stats.items_unmapped = r.itemsUnmapped;
    stats.inventory_changes = r.movements;
    state.newCursor = resolveOrdersCursor(window, r, connection.last_orders_cursor);
  }
  if (scope === "full" && connection.push_inventory) {
    await runPhase("inventory_push", async () => {
      const r = await pushInventory(ctx);
      stats.inventory_pushed = r.pushed;
      log16.info(`${label} inventory pushed`, { runId, checked: r.checked, changed: r.changed, pushed: r.pushed, failed: r.failed });
    });
  }
  stats.errors = errors.length;
  const finishedAt = /* @__PURE__ */ new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();
  const status = state.fatal || state.phasesCompleted === 0 ? "failed" : errors.length > 0 ? "partial" : "success";
  const errorSummary = errors.length === 0 ? null : sanitizeMessage(`${errors[0]?.message ?? "Erreur"}${errors.length > 1 ? ` (+${errors.length - 1} autre(s))` : ""}`, 1e3);
  for (const part of chunk2(errors, 200)) {
    const { error } = await admin.from("sync_errors").insert(
      part.map((e) => ({
        organization_id: connection.organization_id,
        sync_run_id: runId,
        code: e.code,
        message: sanitizeMessage(e.message),
        entity_type: e.entityType ?? null,
        entity_ref: e.entityRef ?? null,
        details: sanitizeDetails(e.details)
      }))
    );
    if (error) log16.error("impossible d'enregistrer les erreurs de sync", { runId, error: error.message });
  }
  const { error: finishError } = await admin.from("sync_runs").update({
    status,
    finished_at: finishedAt.toISOString(),
    duration_ms: durationMs,
    records_processed: stats.listings_fetched + stats.orders_fetched,
    error_count: errors.length,
    error_summary: errorSummary,
    stats
  }).eq("id", runId);
  if (finishError) log16.error("impossible de finaliser le run", { runId, error: finishError.message });
  const connectionPatch = { last_error: errorSummary };
  if (options.trigger !== "webhook") connectionPatch.last_sync_at = finishedAt.toISOString();
  if (status === "success") connectionPatch.last_successful_sync_at = finishedAt.toISOString();
  if (state.newCursor) connectionPatch.last_orders_cursor = state.newCursor.toISOString();
  if (state.authExpired) {
    await markConnectionExpired(connection.id, state.fatal?.message ?? "Token d'autorisation expir\xE9.");
  }
  const { data: patched, error: patchError } = await admin.from("channel_connections").update(connectionPatch).eq("id", connection.id).neq("status", "disconnected").select("id").maybeSingle();
  if (patchError) log16.error("impossible de mettre \xE0 jour la connexion", { connectionId, error: patchError.message });
  const stillActive = Boolean(patched) || Boolean(patchError);
  if (stillActive && !state.authExpired) {
    const nextStatus = status === "failed" ? "error" : "connected";
    const { error: statusError } = await admin.from("channel_connections").update({ status: nextStatus }).eq("id", connection.id).in("status", ["connected", "error"]);
    if (statusError) log16.error("impossible de mettre \xE0 jour le statut de la connexion", { connectionId, error: statusError.message });
  }
  if (!stillActive) {
    log16.warn("connexion d\xE9connect\xE9e pendant le run : \xE9tat et alertes inchang\xE9s", { runId, connectionId });
  } else if (status === "success") {
    await resolveAlerts(admin, connection.organization_id, [connectionExpiredKey(connection.id), syncFailedKey(connection.id)]);
  } else if (status === "partial") {
    await resolveAlerts(admin, connection.organization_id, [connectionExpiredKey(connection.id)]);
  } else if (!state.authExpired) {
    await upsertAlert(admin, {
      organizationId: connection.organization_id,
      type: "sync_failed",
      severity: "warning",
      title: `Synchronisation ${label} \xE9chou\xE9e`,
      message: errorSummary ?? "La synchronisation a \xE9chou\xE9 sans d\xE9tail.",
      dedupeKey: syncFailedKey(connection.id),
      entityType: "channel_connection",
      entityId: connection.id,
      actionHref: `/settings/sync/${runId}`
    });
  }
  log16.info(`${label} sync finished`, { runId, status, durationMs, ...stats });
  return { runId, status, stats, durationMs, errorSummary, connectionId: connection.id };
}
async function guardConcurrency(admin, connection) {
  const { data: running, error } = await admin.from("sync_runs").select("id, started_at").eq("source_ref", connection.id).eq("status", "running").order("started_at", { ascending: false }).limit(5);
  if (error) throw fromPostgrestError(error);
  const now = Date.now();
  const staleIds = [];
  for (const r of running ?? []) {
    const ageMin = (now - new Date(r.started_at).getTime()) / 6e4;
    if (ageMin < RUNNING_STALE_MINUTES2) {
      throw new AppError("CONFLICT", `Une synchronisation est d\xE9j\xE0 en cours pour cette connexion (d\xE9marr\xE9e il y a ${Math.max(1, Math.round(ageMin))} min). Patientez avant d'en relancer une.`);
    }
    staleIds.push(r.id);
  }
  if (staleIds.length > 0) {
    await admin.from("sync_runs").update({ status: "failed", finished_at: (/* @__PURE__ */ new Date()).toISOString(), error_summary: `Run interrompu (aucune fin enregistr\xE9e apr\xE8s ${RUNNING_STALE_MINUTES2} min).` }).in("id", staleIds);
    log16.warn("runs interrompus marqu\xE9s en \xE9chec", { connectionId: connection.id, count: staleIds.length });
  }
}

// src/lib/format.ts
var UNKNOWN2 = "\u2014";
function formatNumber(value, decimals = 0) {
  if (value === null || value === void 0 || !Number.isFinite(value)) return UNKNOWN2;
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

// src/features/integrations/format.ts
var SYNC_STATUS_LABEL = { running: "En cours", success: "R\xE9ussie", partial: "Partielle", failed: "\xC9chou\xE9e" };
function readStats(stats) {
  const s = stats && typeof stats === "object" && !Array.isArray(stats) ? stats : {};
  const num = (k) => {
    const v2 = s[k];
    return typeof v2 === "number" && Number.isFinite(v2) ? v2 : 0;
  };
  return {
    listings_fetched: num("listings_fetched"),
    listings_upserted: num("listings_upserted"),
    listings_ended: num("listings_ended"),
    listings_auto_mapped: num("listings_auto_mapped"),
    suggestions_created: num("suggestions_created"),
    orders_fetched: num("orders_fetched"),
    orders_created: num("orders_created"),
    orders_updated: num("orders_updated"),
    items_unmapped: num("items_unmapped"),
    inventory_changes: num("inventory_changes"),
    inventory_pushed: num("inventory_pushed"),
    errors: num("errors")
  };
}
function plural3(n, singular, pluralForm = `${singular}s`) {
  return `${formatNumber(n)} ${n > 1 ? pluralForm : singular}`;
}
function formatRunSummary(run) {
  const stats = readStats(run.stats);
  const icon = run.status === "success" ? "\u2713" : run.status === "partial" ? "\u26A0" : run.status === "failed" ? "\u2717" : "\u2026";
  const errors = run.error_count ?? stats.errors;
  const parts = [
    `${icon} ${SYNC_STATUS_LABEL[run.status] ?? run.status}`,
    `${plural3(stats.listings_fetched, "listing analys\xE9", "listings analys\xE9s")}`,
    `${plural3(stats.orders_fetched, "commande r\xE9cup\xE9r\xE9e", "commandes r\xE9cup\xE9r\xE9es")}`,
    `${plural3(stats.inventory_changes, "stock modifi\xE9", "stocks modifi\xE9s")}`,
    `${plural3(errors, "erreur")}`
  ];
  return parts.join(" \xB7 ");
}

// src/features/integrations/sync-service.ts
async function syncConnectionNow(ctx, connectionId, options) {
  const { data: connection } = await ctx.supabase.from("channel_connections").select("id").eq("id", connectionId).eq("organization_id", ctx.organization.id).maybeSingle();
  if (!connection) throw new AppError("NOT_FOUND", "Connexion introuvable dans votre organisation.");
  const result = await runChannelSync(connection.id, { trigger: options.trigger, userId: ctx.user.id, scope: options.scope });
  const summary = formatRunSummary({ status: result.status, stats: result.stats, error_count: result.stats.errors });
  return { result, summary };
}

// src/features/integrations/oauth-flow.ts
function oauthErrorCodeFor(e) {
  const code = typeof e === "object" && e !== null && "code" in e ? String(e.code) : "";
  switch (code) {
    case "AUTH_EXPIRED":
      return "exchange_denied";
    case "NOT_CONFIGURED":
      return "app_credentials";
    case "RATE_LIMITED":
      return "rate_limited";
    case "API_ERROR":
    case "INVALID_RESPONSE":
      return "ebay_unavailable";
    default:
      return "internal";
  }
}
var OAUTH_STATE_TTL_SECONDS = 15 * 60;

// src/integrations/ebay/webhook-verify.ts
import { createHash as createHash6, createVerify } from "node:crypto";
import { z as z25 } from "npm:zod@4.6.5";
function computeChallengeResponse(challengeCode, verificationToken, endpointUrl) {
  return createHash6("sha256").update(challengeCode).update(verificationToken).update(endpointUrl).digest("hex");
}
var ebaySignatureHeaderSchema = z25.object({
  alg: z25.string().optional(),
  kid: z25.string().min(1),
  signature: z25.string().min(1),
  digest: z25.string().optional()
});
function parseSignatureHeader(header) {
  if (!header) return null;
  try {
    const json2 = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    const parsed = ebaySignatureHeaderSchema.safeParse(json2);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
var ebayPublicKeySchema = z25.object({
  key: z25.string().min(1),
  algorithm: z25.string().optional(),
  digest: z25.string().optional()
});
function formatPem(key2) {
  const trimmed = key2.trim();
  if (trimmed.includes("\n")) return trimmed;
  const m = /^-----BEGIN ([A-Z ]+)-----(.+?)-----END ([A-Z ]+)-----$/.exec(trimmed);
  if (!m) return trimmed;
  const body = (m[2] ?? "").replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${m[1]}-----
${lines.join("\n")}
-----END ${m[3]}-----
`;
}
function digestAlgorithm(name) {
  switch ((name ?? "").toUpperCase()) {
    case "SHA1":
      return "sha1";
    case "SHA384":
      return "sha384";
    case "SHA512":
      return "sha512";
    case "SHA256":
    default:
      return "sha256";
  }
}
function verifyNotificationSignature(rawBody, header, publicKey) {
  try {
    const algo = digestAlgorithm(publicKey.digest ?? header.digest);
    const verifier = createVerify(algo);
    verifier.update(rawBody);
    const key2 = typeof publicKey.key === "string" ? formatPem(publicKey.key) : publicKey.key;
    return verifier.verify(key2, header.signature, "base64");
  } catch {
    return false;
  }
}
var ebayNotificationSchema = z25.object({
  metadata: z25.object({ topic: z25.string().min(1), schemaVersion: z25.string().optional(), deprecated: z25.boolean().optional() }),
  notification: z25.object({
    notificationId: z25.string().min(1).optional(),
    eventDate: z25.string().optional(),
    publishDate: z25.string().optional(),
    publishAttemptCount: z25.number().optional(),
    data: z25.record(z25.string(), z25.unknown()).optional()
  })
});
function notificationEventId(notification, payloadHash) {
  return notification.notification.notificationId ?? `${notification.metadata.topic}:${payloadHash}`;
}

// src/integrations/ebay/notification-keys.ts
var PublicKeyNotFoundError = class extends Error {
  constructor(kid) {
    super(`Cl\xE9 de signature eBay inconnue (kid=${kid.slice(0, 64)}).`);
    this.kid = kid;
    this.name = "PublicKeyNotFoundError";
  }
  kid;
};
var POSITIVE_TTL_MS = 12 * 36e5;
var NEGATIVE_TTL_MS = 10 * 6e4;
var MAX_KID_LENGTH = 200;
function isUnknownKeyError(body) {
  if (!body || typeof body !== "object") return false;
  const errors = body.errors;
  if (!Array.isArray(errors)) return false;
  return errors.some((e) => {
    if (!e || typeof e !== "object") return false;
    const err = e;
    const params = Array.isArray(err.parameters) ? err.parameters : [];
    if (params.some((p) => p && typeof p === "object" && /^public_?key_?id$/i.test(String(p.name ?? "")))) return true;
    const text2 = `${typeof err.message === "string" ? err.message : ""} ${typeof err.longMessage === "string" ? err.longMessage : ""}`;
    return /public[ _]?key/i.test(text2) && /(invalid|not found|unknown|does not exist)/i.test(text2) && !/token|authoriz|authentic/i.test(text2);
  });
}
var EbayNotificationKeyStore = class {
  constructor(config) {
    this.config = config;
  }
  config;
  cache = /* @__PURE__ */ new Map();
  appToken = null;
  async getAppToken(config) {
    if (this.appToken && this.appToken.expiresAt - Date.now() > 6e4) return this.appToken.accessToken;
    const t = await getApplicationAccessToken(config);
    this.appToken = { accessToken: t.accessToken, expiresAt: t.expiresAt.getTime() };
    return t.accessToken;
  }
  async getPublicKey(kid) {
    if (!kid || kid.length > MAX_KID_LENGTH || !/^[A-Za-z0-9._:-]+$/.test(kid)) throw new PublicKeyNotFoundError(kid);
    const now = Date.now();
    const cached2 = this.cache.get(kid);
    if (cached2 && cached2.expiresAt > now) {
      if (!cached2.key) throw new PublicKeyNotFoundError(kid);
      return cached2.key;
    }
    const config = this.config();
    if (!config) throw new ConnectorError("NOT_CONFIGURED", EBAY_PROVIDER, "Int\xE9gration eBay non configur\xE9e : signature inv\xE9rifiable.", { retryable: false });
    const token = await this.getAppToken(config);
    const res = await fetchWithRetry(
      `${config.apiBase}/commerce/notification/v1/public_key/${encodeURIComponent(kid)}`,
      { method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
      { provider: EBAY_PROVIDER, label: "notification:public_key", retries: 2, timeoutMs: 1e4 }
    );
    const json2 = await readJson(res, EBAY_PROVIDER);
    if (res.status === 404 || res.status === 400 && isUnknownKeyError(json2)) {
      this.cache.set(kid, { key: null, expiresAt: now + NEGATIVE_TTL_MS });
      throw new PublicKeyNotFoundError(kid);
    }
    if (res.status === 400 || res.status === 401) this.appToken = null;
    const parsed = ebayPublicKeySchema.safeParse(json2);
    if (!res.ok || !parsed.success) {
      throw new ConnectorError("API_ERROR", EBAY_PROVIDER, `Cl\xE9 publique eBay indisponible pour le moment (HTTP ${res.status}).`, { httpStatus: res.status, details: { label: "notification:public_key" } });
    }
    this.cache.set(kid, { key: parsed.data, expiresAt: now + POSITIVE_TTL_MS });
    return parsed.data;
  }
};

// src/services/sync/ebay-webhook.ts
var log17 = createLogger("EBAY_WEBHOOK");
var WEBHOOK_MAX_BODY_BYTES = 64 * 1024;
var WEBHOOK_STALE_RECEIVED_MS = 5 * 6e4;
var WEBHOOK_ROUTE_MAX_DURATION_S = 60;
var WEBHOOK_PROCESSING_BUDGET_MS = (WEBHOOK_ROUTE_MAX_DURATION_S - 10) * 1e3;
var WEBHOOK_CONFLICT_RETRIES = 2;
var WEBHOOK_CONFLICT_WAIT_MS = 1e4;
var WEBHOOK_ORDERS_MAX_PAGES = 20;
var WEBHOOK_ABANDONED_MS = 10 * 6e4;
var WEBHOOK_DEADLINE_MESSAGE = `Traitement interrompu : d\xE9lai maximal de ${WEBHOOK_ROUTE_MAX_DURATION_S} s atteint avant la fin de la synchronisation. Les commandes et annonces concern\xE9es seront reprises par la prochaine synchronisation planifi\xE9e (le curseur de commandes n\u2019avance que sur des donn\xE9es lues).`;
var DELETED_ACCOUNT_LABEL = "[compte eBay supprim\xE9]";
function json(body, status = 200) {
  return Response.json(body, { status });
}
async function readBodyLimited(request, limit) {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => void 0);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
function redactedDeletionPayload(n) {
  return {
    metadata: n.metadata,
    notification: { notificationId: n.notification.notificationId ?? null, eventDate: n.notification.eventDate ?? null, publishDate: n.notification.publishDate ?? null, data: { redacted: true } }
  };
}
async function markEvent(admin, id, patch) {
  const { error } = await admin.from("webhook_events").update({ status: patch.status, processed_at: patch.status === "received" ? null : (/* @__PURE__ */ new Date()).toISOString(), error: patch.error ? sanitizeMessage(patch.error, 1e3) : null, ...patch.payload !== void 0 ? { payload: patch.payload } : {} }).eq("id", id);
  if (error) log17.error("mise \xE0 jour de la notification impossible", { eventRowId: id, error: error.message });
}
async function claimForRetry(admin, eventId) {
  const { data: failed } = await admin.from("webhook_events").update({ status: "received", error: null, processed_at: null }).eq("provider", "ebay").eq("event_id", eventId).eq("status", "failed").select("id").maybeSingle();
  if (failed) return failed.id;
  const cutoff = new Date(Date.now() - WEBHOOK_STALE_RECEIVED_MS).toISOString();
  const { data: stale } = await admin.from("webhook_events").update({ status: "received", error: null, received_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("provider", "ebay").eq("event_id", eventId).eq("status", "received").lt("received_at", cutoff).select("id").maybeSingle();
  return stale?.id ?? null;
}
async function handleEbayNotification(request, deps) {
  const { admin } = deps;
  const clock = deps.now ?? Date.now;
  const deadlineAt = clock() + (deps.processingBudgetMs ?? WEBHOOK_PROCESSING_BUDGET_MS);
  const raw = await readBodyLimited(request, WEBHOOK_MAX_BODY_BYTES);
  if (raw === null) {
    log17.warn("notification refus\xE9e : corps trop volumineux", { limit: WEBHOOK_MAX_BODY_BYTES });
    return json({ error: `Notification trop volumineuse (limite ${Math.round(WEBHOOK_MAX_BODY_BYTES / 1024)} Ko).` }, 413);
  }
  if (!deps.isConfigured()) {
    return json({ error: "Int\xE9gration eBay non configur\xE9e sur ce serveur : signature inv\xE9rifiable." }, 503);
  }
  const payloadHash = sha256Hex(raw);
  let parsedBody;
  try {
    parsedBody = JSON.parse(raw.toString("utf8"));
  } catch {
    return json({ error: "Corps JSON invalide." }, 400);
  }
  const notification = ebayNotificationSchema.safeParse(parsedBody);
  if (!notification.success) return json({ error: "Notification eBay au format inattendu." }, 400);
  const topic = notification.data.metadata.topic;
  const eventId = notificationEventId(notification.data, payloadHash);
  const isDeletion = topic === "MARKETPLACE_ACCOUNT_DELETION";
  const header = parseSignatureHeader(request.headers.get("x-ebay-signature"));
  let signatureValid = false;
  let signatureError = null;
  if (!header) {
    signatureError = "En-t\xEAte x-ebay-signature absent ou illisible.";
  } else {
    try {
      const key2 = await deps.getPublicKey(header.kid);
      signatureValid = verifyNotificationSignature(raw, header, key2);
      if (!signatureValid) signatureError = "Signature invalide.";
    } catch (e) {
      if (e instanceof PublicKeyNotFoundError) {
        signatureError = "Cl\xE9 de signature inconnue d'eBay (kid).";
      } else {
        log17.warn("v\xE9rification de signature impossible, nouvelle tentative attendue", { eventId, topic, reason: toUserMessage(e) });
        return json({ status: "retry", error: "V\xE9rification de signature temporairement impossible : r\xE9essayez plus tard." }, 503);
      }
    }
  }
  if (!signatureValid) {
    const { error } = await admin.from("webhook_events").insert({
      provider: "ebay",
      event_id: `rejected:${payloadHash.slice(0, 32)}`,
      event_type: topic.slice(0, 200),
      payload_hash: payloadHash,
      payload: null,
      signature_valid: false,
      status: "failed",
      error: signatureError
    });
    if (error && error.code !== "23505") log17.error("impossible de journaliser la notification rejet\xE9e", { error: error.message });
    log17.warn("notification eBay rejet\xE9e", { topic, reason: signatureError, duplicate: error?.code === "23505" });
    return json({ status: error?.code === "23505" ? "duplicate" : "rejected", error: signatureError }, 401);
  }
  const data = notification.data.notification.data ?? {};
  const username = typeof data.username === "string" && data.username ? data.username : null;
  const userId = typeof data.userId === "string" && data.userId ? data.userId : null;
  let connections;
  try {
    connections = await deps.findConnections({ userId, username });
  } catch (e) {
    log17.error("recherche des connexions impossible", { eventId, topic, reason: toUserMessage(e) });
    return json({ status: "retry", error: "Traitement temporairement impossible." }, 503);
  }
  const primary = connections[0] ?? null;
  const { data: inserted, error: insertError } = await admin.from("webhook_events").insert({
    provider: "ebay",
    event_id: eventId,
    event_type: topic.slice(0, 200),
    organization_id: primary?.organization_id ?? null,
    connection_id: primary?.id ?? null,
    payload_hash: payloadHash,
    payload: isDeletion ? redactedDeletionPayload(notification.data) : parsedBody,
    signature_valid: true,
    status: "received",
    error: null
  }).select("id").maybeSingle();
  let eventRowId = inserted?.id ?? null;
  if (insertError) {
    if (insertError.code !== "23505") {
      log17.error("impossible d'enregistrer la notification", { eventId, error: insertError.message });
      return json({ error: "Enregistrement impossible." }, 500);
    }
    eventRowId = await claimForRetry(admin, eventId);
    if (!eventRowId) {
      log17.info("notification dupliqu\xE9e ignor\xE9e", { eventId, topic });
      return json({ status: "duplicate" }, 200);
    }
    log17.info("notification d\xE9j\xE0 re\xE7ue mais non trait\xE9e : reprise", { eventId, topic });
  }
  if (!eventRowId) return json({ error: "Enregistrement impossible." }, 500);
  if (isDeletion) {
    try {
      const result = await handleAccountDeletion(admin, { username, userId }, connections);
      await markEvent(admin, eventRowId, { status: "processed" });
      log17.info("demande de suppression de compte eBay trait\xE9e", { eventId, ...result });
      return json({ status: "processed", topic, ...result });
    } catch (e) {
      await markEvent(admin, eventRowId, { status: "failed", error: `Suppression de compte non appliqu\xE9e : ${toUserMessage(e)}` });
      log17.error("suppression de compte eBay non appliqu\xE9e : eBay red\xE9livrera la notification", { eventId, reason: toUserMessage(e) });
      return json({ status: "retry", error: "Traitement de la suppression impossible pour le moment." }, 500);
    }
  }
  const active = connections.filter((c) => c.status === "connected" || c.status === "error");
  if (active.length > 0 && /ORDER|ITEM|LISTING|OFFER|INVENTORY/i.test(topic)) {
    const scope = /ORDER/i.test(topic) ? "orders" : "listings";
    const rowId = eventRowId;
    deps.schedule(async () => {
      const work = (async () => {
        const failures = [];
        for (const c of active) {
          const outcome2 = await runWithConflictRetry(deps, c.id, scope, deadlineAt);
          if (!outcome2.ok) failures.push(outcome2.message);
          else log17.info("synchronisation d\xE9clench\xE9e par webhook", { eventId, connectionId: c.id, runId: outcome2.runId, status: outcome2.status });
        }
        return failures;
      })().catch((e) => [toUserMessage(e)]);
      const outcome = await withDeadline(work, deadlineAt - clock());
      if (outcome === DEADLINE) {
        log17.warn("traitement de la notification interrompu (d\xE9lai maximal atteint)", { eventId, topic });
        await markEvent(admin, rowId, { status: "failed", error: WEBHOOK_DEADLINE_MESSAGE });
        return;
      }
      if (outcome.length === 0) await markEvent(admin, rowId, { status: "processed" });
      else await markEvent(admin, rowId, { status: "failed", error: outcome.join(" ; ") });
    });
    return json({ status: "accepted", topic, connections: active.length });
  }
  await markEvent(admin, eventRowId, { status: "ignored", error: connections.length === 0 ? "Aucune connexion MON STOCK pour ce compte eBay." : active.length === 0 ? "Connexion inactive (expir\xE9e ou d\xE9connect\xE9e)." : null });
  return json({ status: "ignored", topic });
}
var DEADLINE = /* @__PURE__ */ Symbol("deadline");
async function withDeadline(work, ms) {
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve(DEADLINE), Math.max(0, ms));
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
var CONFLICT_MESSAGE = "Une synchronisation \xE9tait d\xE9j\xE0 en cours : cette notification sera prise en compte par la prochaine synchronisation (planifi\xE9e ou manuelle), aucune commande n'est perdue.";
async function runWithConflictRetry(deps, connectionId, scope, deadlineAt) {
  const sleep3 = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const clock = deps.now ?? Date.now;
  const wait = deps.conflictWaitMs ?? WEBHOOK_CONFLICT_WAIT_MS;
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await deps.runSync(connectionId, { trigger: "webhook", scope, ...scope === "orders" ? { orders: { maxPages: WEBHOOK_ORDERS_MAX_PAGES } } : {} });
      return { ok: true, runId: r.runId, status: r.status };
    } catch (e) {
      const conflict = e instanceof AppError && e.code === "CONFLICT";
      if (conflict && attempt < WEBHOOK_CONFLICT_RETRIES && deadlineAt - clock() > 2 * wait) {
        await sleep3(wait);
        continue;
      }
      if (conflict) return { ok: false, conflict: true, message: CONFLICT_MESSAGE };
      return { ok: false, conflict: false, message: toUserMessage(e) };
    }
  }
}
async function handleAccountDeletion(admin, account, connections) {
  const fail = (step, message) => {
    throw new Error(`${step} : ${message}`);
  };
  let ordersAnonymized = 0;
  let eventsPurged = 0;
  if (account.username) {
    const { data, error } = await admin.from("orders").update({ buyer_username: DELETED_ACCOUNT_LABEL }).eq("provider", "ebay").eq("buyer_username", account.username).select("id");
    if (error) fail("anonymisation des commandes", error.message);
    ordersAnonymized = data?.length ?? 0;
    const { data: purged, error: purgeError } = await admin.from("webhook_events").update({ payload: null }).eq("provider", "ebay").eq("payload->notification->data->>username", account.username).select("id");
    if (purgeError) fail("purge des notifications", purgeError.message);
    eventsPurged += purged?.length ?? 0;
  }
  if (account.userId) {
    const { data: purged, error: purgeError } = await admin.from("webhook_events").update({ payload: null }).eq("provider", "ebay").eq("payload->notification->data->>userId", account.userId).select("id");
    if (purgeError) fail("purge des notifications", purgeError.message);
    eventsPurged += purged?.length ?? 0;
  }
  for (const c of connections) {
    const { error: secretsError } = await admin.from("channel_connection_secrets").delete().eq("connection_id", c.id);
    if (secretsError) fail("suppression des tokens", secretsError.message);
    const { error: connError } = await admin.from("channel_connections").update({ status: "disconnected", disconnected_at: (/* @__PURE__ */ new Date()).toISOString(), external_username: DELETED_ACCOUNT_LABEL, external_account_id: null, token_expires_at: null, refresh_token_expires_at: null, last_error: "Compte eBay supprim\xE9 par son titulaire (notification eBay)." }).eq("id", c.id);
    if (connError) fail("d\xE9connexion", connError.message);
    const { error: channelError } = await admin.from("sales_channels").update({ name: `eBay \xB7 ${DELETED_ACCOUNT_LABEL}` }).eq("id", c.sales_channel_id);
    if (channelError) fail("anonymisation du canal", channelError.message);
    const { error: alertsError } = await admin.from("alerts").update({ message: "Message anonymis\xE9 : le compte eBay concern\xE9 a \xE9t\xE9 supprim\xE9 par son titulaire." }).eq("organization_id", c.organization_id).eq("entity_type", "channel_connection").eq("entity_id", c.id);
    if (alertsError) fail("anonymisation des alertes", alertsError.message);
    await upsertAlert(admin, {
      organizationId: c.organization_id,
      type: "connection_expired",
      severity: "critical",
      title: "Compte eBay supprim\xE9",
      // Aucun pseudo dans l'alerte : la donnée personnelle ne doit pas survivre à la suppression.
      message: "eBay nous a notifi\xE9 la suppression du compte vendeur connect\xE9. La connexion a \xE9t\xE9 ferm\xE9e et ses tokens supprim\xE9s. Les annonces et commandes d\xE9j\xE0 import\xE9es sont conserv\xE9es ; connectez un autre compte eBay pour reprendre la synchronisation.",
      dedupeKey: connectionExpiredKey(c.id),
      entityType: "channel_connection",
      entityId: c.id,
      actionHref: "/settings/integrations"
    });
  }
  return { ordersAnonymized, eventsPurged, connectionsDisconnected: connections.length };
}

// src/services/sourcing/feed-ingestion.ts
var MAX_ROWS_PER_RUN = 5e3;
var log18 = createLogger("FEED_INGESTION");
var FEED_ACCEPT = {
  csv: "text/csv,text/plain,application/csv;q=0.9,*/*;q=0.5",
  xml: "application/xml,text/xml,application/rss+xml;q=0.9,*/*;q=0.5",
  json: "application/json,text/json;q=0.9,*/*;q=0.5"
};
function parseFeedConfig(feed) {
  const mapping = fieldMappingSchema.safeParse(feed.field_mapping ?? {});
  const options = feedOptionsSchema.safeParse(feed.options ?? {});
  return { mapping: mapping.success ? mapping.data : {}, options: options.success ? options.data : {} };
}
async function fetchFeedContent(url, format, encoding, fetchImpl) {
  const res = await fetchText(url, { userAgent: serverEnv().SOURCING_USER_AGENT, accept: FEED_ACCEPT[format], encoding, fetchImpl });
  if (!res.ok) throw new Error(`Le flux a r\xE9pondu HTTP ${res.status}.`);
  return res.text;
}
async function ingestFeed(feedId, options = { trigger: "manual" }) {
  const admin = options.admin ?? createAdminSupabaseClient();
  const { data: feed, error: feedErr } = await admin.from("supplier_feeds").select("*, source:supplier_sources(id, source_type, default_currency, default_tax_type, country, status), organization:organizations(default_currency)").eq("id", feedId).maybeSingle();
  if (feedErr || !feed) return { feedId, runId: null, status: "failed", processed: 0, stored: 0, rejected: 0, invalidRows: 0, expired: 0, fxUnavailable: 0, message: "Flux introuvable." };
  const source = feed.source;
  const organizationCurrency = feed.organization?.default_currency ?? "EUR";
  if (!source) return { feedId, runId: null, status: "failed", processed: 0, stored: 0, rejected: 0, invalidRows: 0, expired: 0, fxUnavailable: 0, message: "Source du flux introuvable." };
  const run = await startSyncRun(admin, { organizationId: feed.organization_id, sourceKind: "supplier_feed", sourceRef: feed.id, provider: feed.format, trigger: options.trigger, createdBy: options.createdBy ?? null });
  const { mapping, options: feedOptions } = parseFeedConfig(feed);
  const defaults = { currency: source.default_currency, taxType: source.default_tax_type, country: source.country };
  const errors = [];
  let processed = 0;
  let stored = 0;
  let rejected = 0;
  let invalidRows = 0;
  let fxUnavailable = 0;
  let expired2 = 0;
  try {
    let content = options.content ?? null;
    if (!content) {
      if (!feed.url) throw new Error("Ce flux n'a pas d'URL : importez un fichier manuellement.");
      content = await fetchFeedContent(feed.url, feed.format, feedOptions.encoding, options.fetchImpl);
    }
    const parsed = parseFeedContent(content, feed.format, feedOptions);
    for (const w2 of parsed.warnings) log18.info("feed warning", { feedId, warning: w2 });
    const ctx = {
      supabase: admin,
      organizationId: feed.organization_id,
      organizationCurrency,
      supplierId: feed.supplier_id,
      sourceId: source.id,
      sourceType: source.source_type,
      feedId: feed.id,
      defaultCurrency: source.default_currency,
      defaultTaxType: source.default_tax_type,
      defaultCountry: source.country,
      createdBy: options.createdBy ?? null,
      now: run.startedAt
    };
    const truncated = parsed.rows.length > MAX_ROWS_PER_RUN;
    if (truncated) {
      errors.push({ code: "FEED_TRUNCATED", message: `Le flux contient ${parsed.rows.length} lignes : seules les ${MAX_ROWS_PER_RUN} premi\xE8res ont \xE9t\xE9 trait\xE9es lors de ce run. Scindez le flux ou filtrez-le c\xF4t\xE9 fournisseur.`, entityType: "feed", entityRef: feed.id });
    }
    for (const [index, row] of parsed.rows.slice(0, MAX_ROWS_PER_RUN).entries()) {
      processed++;
      const mapped = mapRow(row, mapping, defaults);
      if (!mapped.offer) {
        invalidRows++;
        errors.push({ code: "ROW_INVALID", message: mapped.errors.join(" "), entityType: "feed_row", entityRef: String(index + 1) });
        continue;
      }
      try {
        const result = await storeOffer(ctx, mapped.offer);
        if (result.outcome === "stored") {
          stored++;
          if (result.fxUnavailable) fxUnavailable++;
        } else {
          rejected++;
          errors.push({ code: "OFFER_REJECTED", message: result.validation.anomalies.map((a) => a.message).join(" ; "), entityType: "offer", entityRef: mapped.offer.externalOfferId });
        }
      } catch (e) {
        rejected++;
        errors.push({ code: "OFFER_STORE_FAILED", message: e instanceof Error ? e.message : String(e), entityType: "offer", entityRef: mapped.offer.externalOfferId });
      }
    }
    if (stored > 0 && !truncated) expired2 = await expireUnseenOffers(ctx, run.startedAt);
    const status = stored === 0 && processed > 0 ? "failed" : errors.length > 0 ? "partial" : "success";
    const message = processed === 0 ? "Le flux ne contient aucune ligne." : `${stored} offre(s) enregistr\xE9e(s), ${invalidRows} ligne(s) illisible(s), ${rejected} offre(s) rejet\xE9e(s), ${expired2} offre(s) expir\xE9e(s).`;
    await recordSyncErrors(admin, run, errors);
    await finishSyncRun(admin, run, { status, recordsProcessed: processed, errorCount: errors.length, stats: { stored, rejected, invalidRows, expired: expired2, fxUnavailable, truncated, totalRows: parsed.rows.length, columns: parsed.columns.slice(0, 50) }, errorSummary: status === "failed" ? message : null });
    await admin.from("supplier_feeds").update({ last_sync_at: run.startedAt.toISOString(), last_successful_sync_at: status !== "failed" ? (/* @__PURE__ */ new Date()).toISOString() : feed.last_successful_sync_at, last_record_count: processed, last_error: status === "failed" ? message : null, status: status === "failed" ? "error" : "active" }).eq("id", feed.id);
    if (status !== "failed") await admin.from("supplier_sources").update({ status: "active", last_sync_at: run.startedAt.toISOString(), last_successful_sync_at: (/* @__PURE__ */ new Date()).toISOString(), last_error: null }).eq("id", source.id);
    return { feedId, runId: run.id, status, processed, stored, rejected, invalidRows, expired: expired2, fxUnavailable, message };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    log18.error("feed ingestion failed", { feedId, error: message });
    await recordSyncErrors(admin, run, [...errors, { code: "FEED_FAILED", message }]);
    await finishSyncRun(admin, run, { status: "failed", recordsProcessed: processed, errorCount: errors.length + 1, errorSummary: message });
    await admin.from("supplier_feeds").update({ last_sync_at: run.startedAt.toISOString(), last_error: message, status: "error" }).eq("id", feed.id);
    await admin.from("supplier_sources").update({ status: "error", last_sync_at: run.startedAt.toISOString(), last_error: message }).eq("id", source.id);
    return { feedId, runId: run.id, status: "failed", processed, stored, rejected, invalidRows, expired: expired2, fxUnavailable, message };
  }
}
async function runDueFeeds(now = /* @__PURE__ */ new Date(), admin = createAdminSupabaseClient()) {
  const { data: feeds } = await admin.from("supplier_feeds").select("id, sync_frequency, last_sync_at, status, url").not("url", "is", null).neq("sync_frequency", "manual").neq("status", "paused").limit(500);
  const due = (feeds ?? []).filter((f) => isDue(f.sync_frequency, f.last_sync_at, now));
  const results = [];
  for (const f of due) results.push(await ingestFeed(f.id, { trigger: "scheduled", admin }));
  return results;
}

// src/services/sourcing/crawler/parsers/registry.ts
var DEFAULT_PARSER_KEY = jsonLdParser.key;
function listParsers() {
  const out = [jsonLdParser];
  for (const p of listAdapterHtmlParsers()) if (!out.some((x) => x.key === p.key)) out.push(p);
  return out;
}
function getParser(key2) {
  const k = key2 && key2.trim() ? key2.trim() : DEFAULT_PARSER_KEY;
  return listParsers().find((p) => p.key === k) ?? null;
}

// src/services/sourcing/crawler/source-crawler.ts
import { z as z26 } from "npm:zod@4.6.5";
var crawlConfigSchema = z26.object({
  urls: z26.array(z26.string().url()).max(50).default([]),
  parser: z26.string().max(60).optional(),
  max_pages: z26.number().int().min(1).max(50).optional(),
  delay_seconds: z26.number().min(0).max(120).optional()
});
var MIN_DELAY_SECONDS = 2;
var DEFAULT_MAX_PAGES2 = 20;
function parseCrawlConfig(raw) {
  const parsed = crawlConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { urls: [] };
}
function allowedHost(baseUrl, urls) {
  const first = baseUrl ?? urls[0];
  if (!first) return null;
  try {
    return new URL(first).host.toLowerCase();
  } catch {
    return null;
  }
}
var defaultSleep3 = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function crawlSource(params) {
  const sleep3 = params.sleep ?? defaultSleep3;
  const host = allowedHost(params.baseUrl, params.config.urls);
  const delaySeconds = Math.max(MIN_DELAY_SECONDS, params.robotsCrawlDelay ?? 0, params.config.delay_seconds ?? 0);
  const maxPages = Math.min(params.config.max_pages ?? DEFAULT_MAX_PAGES2, 50);
  const disallowed = new Set(params.disallowedUrls ?? []);
  const pages = [];
  const skippedUrls = [];
  const offers = [];
  const seen = /* @__PURE__ */ new Set();
  const targets = [];
  for (const u of params.config.urls) {
    let parsed;
    try {
      parsed = new URL(u);
    } catch {
      skippedUrls.push(u);
      continue;
    }
    if (!host || parsed.host.toLowerCase() !== host || disallowed.has(u)) {
      skippedUrls.push(u);
      continue;
    }
    if (targets.length < maxPages) targets.push(u);
    else skippedUrls.push(u);
  }
  for (const [i, url] of targets.entries()) {
    if (i > 0) await sleep3(delaySeconds * 1e3);
    try {
      const res = await fetchText(url, { userAgent: params.userAgent, fetchImpl: params.fetchImpl, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" });
      if (!res.ok) {
        pages.push({ url, status: res.status, offers: 0, error: `HTTP ${res.status}` });
        continue;
      }
      const found = params.parser.parse(res.text, res.finalUrl || url);
      let added = 0;
      for (const o of found) {
        if (seen.has(o.externalOfferId)) continue;
        seen.add(o.externalOfferId);
        offers.push(o);
        added++;
      }
      pages.push({ url, status: res.status, offers: added, error: null });
    } catch (e) {
      pages.push({ url, status: null, offers: 0, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { offers, pages, skippedUrls, delaySeconds };
}

// src/services/sourcing/crawler/crawler-manager.ts
var log19 = createLogger("CRAWLER");
async function runSourceCrawl(sourceId, options = { trigger: "manual" }) {
  const admin = options.admin ?? createAdminSupabaseClient();
  const userAgent = serverEnv().SOURCING_USER_AGENT;
  const { data: source } = await admin.from("supplier_sources").select("*, organization:organizations(default_currency)").eq("id", sourceId).maybeSingle();
  if (!source) return { sourceId, runId: null, status: "failed", pages: 0, found: 0, stored: 0, rejected: 0, expired: 0, message: "Source introuvable." };
  if (source.source_type !== "PUBLIC_WEB") return { sourceId, runId: null, status: "failed", pages: 0, found: 0, stored: 0, rejected: 0, expired: 0, message: "Cette source n'est pas une page publique." };
  if (!source.automated_access_confirmed) {
    return { sourceId, runId: null, status: "refused", pages: 0, found: 0, stored: 0, rejected: 0, expired: 0, message: "Acc\xE8s automatis\xE9 non attest\xE9 : le crawl est refus\xE9 tant que vous n'avez pas confirm\xE9 que les conditions d'utilisation l'autorisent." };
  }
  const config = parseCrawlConfig(source.config);
  const adapterKey = adapterKeyOf(source.config);
  const adapter = adapterKey ? getSourceAdapter(adapterKey) : null;
  if (adapterKey && !adapter) return { sourceId, runId: null, status: "failed", pages: 0, found: 0, stored: 0, rejected: 0, expired: 0, message: `Adaptateur \xAB ${adapterKey} \xBB inconnu.` };
  const adapterConfig2 = adapter ? adapterConfigFromSource(source) : null;
  const useAdapterCatalog = Boolean(adapter && adapterConfig2 && adapter.capabilities.catalog && adapter.fetchCatalog);
  const robotsUrls = Array.from(/* @__PURE__ */ new Set([...adapter && adapterConfig2 && useAdapterCatalog ? adapter.urlsForCatalog?.(adapterConfig2) ?? [] : [], ...config.urls]));
  if (robotsUrls.length === 0) return { sourceId, runId: null, status: "failed", pages: 0, found: 0, stored: 0, rejected: 0, expired: 0, message: "Aucune URL configur\xE9e pour cette source." };
  const parser2 = useAdapterCatalog ? null : adapter?.htmlParser ?? getParser(config.parser);
  if (!useAdapterCatalog && !parser2) return { sourceId, runId: null, status: "failed", pages: 0, found: 0, stored: 0, rejected: 0, expired: 0, message: `Parser \xAB ${config.parser} \xBB inconnu.` };
  const run = await startSyncRun(admin, { organizationId: source.organization_id, sourceKind: "supplier_source", sourceRef: source.id, provider: adapter?.key ?? "public_web", trigger: options.trigger, createdBy: options.createdBy ?? null });
  const errors = [];
  try {
    const robots = await checkRobotsForUrls(source.base_url ?? robotsUrls[0], robotsUrls, userAgent, options.fetchImpl);
    await admin.from("supplier_sources").update({ robots_checked_at: (/* @__PURE__ */ new Date()).toISOString(), robots_allowed: robots.allowed, crawl_delay_seconds: robots.crawlDelay === null ? source.crawl_delay_seconds : Math.ceil(robots.crawlDelay) }).eq("id", source.id);
    if (!robots.allowed) {
      const message2 = `robots.txt : ${robots.details}`;
      await recordSyncErrors(admin, run, [{ code: "ROBOTS_DISALLOW", message: message2, details: { disallowed: robots.disallowedUrls } }]);
      await finishSyncRun(admin, run, { status: "failed", recordsProcessed: 0, errorCount: 1, errorSummary: message2 });
      await admin.from("supplier_sources").update({ status: "error", last_sync_at: run.startedAt.toISOString(), last_error: message2 }).eq("id", source.id);
      return { sourceId, runId: run.id, status: "refused", pages: 0, found: 0, stored: 0, rejected: 0, expired: 0, message: message2 };
    }
    const crawl = useAdapterCatalog && adapter && adapterConfig2 ? await crawlWithAdapter(adapter, adapterConfig2, { userAgent, fetchImpl: options.fetchImpl, sleep: options.sleep, robotsCrawlDelay: robots.crawlDelay, configDelay: config.delay_seconds ?? 0, maxPages: config.max_pages ?? 20, disallowedUrls: robots.disallowedUrls }) : await crawlSource({ baseUrl: source.base_url, config, robotsCrawlDelay: robots.crawlDelay, parser: parser2, userAgent, fetchImpl: options.fetchImpl, sleep: options.sleep, disallowedUrls: robots.disallowedUrls });
    for (const p of crawl.pages) if (p.error) errors.push({ code: "PAGE_FAILED", message: p.error, entityType: "page", entityRef: p.url });
    for (const u of crawl.skippedUrls) errors.push({ code: "URL_SKIPPED", message: "URL ignor\xE9e (h\xF4te diff\xE9rent, interdite ou au-del\xE0 de la limite de pages).", entityType: "page", entityRef: u });
    const ctx = {
      supabase: admin,
      organizationId: source.organization_id,
      organizationCurrency: source.organization?.default_currency ?? "EUR",
      supplierId: source.supplier_id,
      sourceId: source.id,
      sourceType: source.source_type,
      defaultCurrency: source.default_currency,
      defaultTaxType: source.default_tax_type,
      defaultCountry: source.country,
      createdBy: options.createdBy ?? null,
      now: run.startedAt
    };
    let stored = 0;
    let rejected = 0;
    for (const offer of crawl.offers) {
      try {
        const r = await storeOffer(ctx, offer);
        if (r.outcome === "stored") stored++;
        else {
          rejected++;
          errors.push({ code: "OFFER_REJECTED", message: r.validation.anomalies.map((a) => a.message).join(" ; "), entityType: "offer", entityRef: offer.externalOfferId });
        }
      } catch (e) {
        rejected++;
        errors.push({ code: "OFFER_STORE_FAILED", message: e instanceof Error ? e.message : String(e), entityType: "offer", entityRef: offer.externalOfferId });
      }
    }
    const expired2 = stored > 0 ? await expireUnseenOffers(ctx, run.startedAt) : 0;
    const okPages = crawl.pages.filter((p) => !p.error).length;
    const status = okPages === 0 ? "failed" : errors.length > 0 ? "partial" : "success";
    const message = `${okPages}/${crawl.pages.length} page(s) lue(s), ${crawl.offers.length} offre(s) trouv\xE9e(s), ${stored} enregistr\xE9e(s), ${rejected} rejet\xE9e(s), ${expired2} expir\xE9e(s).`;
    await recordSyncErrors(admin, run, errors);
    await finishSyncRun(admin, run, { status, recordsProcessed: crawl.offers.length, errorCount: errors.length, stats: { pages: crawl.pages, stored, rejected, expired: expired2, delaySeconds: crawl.delaySeconds, parser: parser2?.key ?? null, adapter: adapter?.key ?? null, method: adapter?.method ?? "public_html" }, errorSummary: status === "failed" ? message : null });
    await admin.from("supplier_sources").update({ status: status === "failed" ? "error" : "active", last_sync_at: run.startedAt.toISOString(), last_successful_sync_at: status !== "failed" ? (/* @__PURE__ */ new Date()).toISOString() : source.last_successful_sync_at, last_error: status === "failed" ? message : null }).eq("id", source.id);
    return { sourceId, runId: run.id, status, pages: crawl.pages.length, found: crawl.offers.length, stored, rejected, expired: expired2, message };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    log19.error("crawl failed", { sourceId, error: message });
    await recordSyncErrors(admin, run, [...errors, { code: "CRAWL_FAILED", message }]);
    await finishSyncRun(admin, run, { status: "failed", recordsProcessed: 0, errorCount: errors.length + 1, errorSummary: message });
    await admin.from("supplier_sources").update({ status: "error", last_sync_at: run.startedAt.toISOString(), last_error: message }).eq("id", source.id);
    return { sourceId, runId: run.id, status: "failed", pages: 0, found: 0, stored: 0, rejected: 0, expired: 0, message };
  }
}
async function crawlWithAdapter(adapter, config, params) {
  const delaySeconds = Math.max(MIN_DELAY_SECONDS, params.robotsCrawlDelay ?? 0, params.configDelay);
  const scheduler = new HostScheduler(delaySeconds * 1e3, params.sleep);
  const ctx = { userAgent: params.userAgent, fetchImpl: scheduler.wrapFetch(params.fetchImpl), sleep: params.sleep, minDelayMs: delaySeconds * 1e3, disallowedUrls: params.disallowedUrls };
  const pages = [];
  const offers = [];
  const seen = /* @__PURE__ */ new Set();
  let cursor = null;
  const maxPages = Math.min(Math.max(1, params.maxPages), 50);
  for (let i = 0; i < maxPages; i++) {
    const page2 = await adapter.fetchCatalog(config, cursor, ctx);
    const retrievedAt = (/* @__PURE__ */ new Date()).toISOString();
    const requestUrl = page2.requests.find((q) => q.offers > 0)?.url ?? page2.requests[0]?.url ?? null;
    for (const q of page2.requests) pages.push({ url: q.url, status: q.status, offers: q.offers, error: q.error });
    for (const o of page2.offers) {
      if (seen.has(o.externalOfferId)) continue;
      seen.add(o.externalOfferId);
      offers.push(withProvenance(o, { adapterKey: adapter.key, method: page2.method, retrievedAt, requestUrl, sourceUrl: o.url ?? null }));
    }
    if (!page2.nextCursor) break;
    cursor = page2.nextCursor;
  }
  return { offers, pages, skippedUrls: [], delaySeconds };
}
async function runDueCrawls(now = /* @__PURE__ */ new Date(), admin = createAdminSupabaseClient()) {
  const { data: sources } = await admin.from("supplier_sources").select("id, base_url, config, sync_frequency, last_sync_at, status").eq("source_type", "PUBLIC_WEB").eq("automated_access_confirmed", true).neq("sync_frequency", "manual").neq("status", "paused").limit(200);
  const due = (sources ?? []).filter((s) => isDue(s.sync_frequency, s.last_sync_at, now));
  const byHost = /* @__PURE__ */ new Map();
  for (const s of due) {
    const cfg = parseCrawlConfig(s.config);
    let host = "unknown";
    try {
      host = new URL(s.base_url ?? cfg.urls[0] ?? "").host;
    } catch {
    }
    byHost.set(host, [...byHost.get(host) ?? [], s.id]);
  }
  const results = [];
  for (const ids of byHost.values()) {
    for (const id of ids) results.push(await runSourceCrawl(id, { trigger: "scheduled", admin }));
  }
  return results;
}

// src/services/sourcing/alerts.ts
import { z as z27 } from "npm:zod@4.6.5";

// src/domain/sourcing/opportunities.ts
var ABNORMAL_LOW_RATIO = 0.8;
var PRICE_DROP_MIN_PERCENT = 10;
var LOW_STOCK_DROP_RATIO = 0.5;
var MIN_HISTORY_POINTS = 3;
function toTime(d) {
  return (typeof d === "string" ? new Date(d) : d).getTime();
}
function fmt(n, currency) {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}
function detectOpportunities(offer, priceHistory, stockHistory, now = /* @__PURE__ */ new Date()) {
  const out = [];
  const prices = [...priceHistory].filter((p) => Number.isFinite(p.price) && p.price > 0).sort((a, b) => toTime(a.recordedAt) - toTime(b.recordedAt));
  if (offer.price !== null && offer.price > 0 && prices.length >= 2) {
    const previous = prices[prices.length - 1].price === offer.price && prices.length >= 2 ? prices[prices.length - 2].price : prices[prices.length - 1].price;
    if (previous > 0 && previous !== offer.price) {
      const drop = (previous - offer.price) / previous * 100;
      if (drop >= PRICE_DROP_MIN_PERCENT) {
        out.push({ kind: "price_drop", value: Math.round(drop * 10) / 10, message: `Baisse de prix de ${drop.toFixed(0)} % : ${fmt(previous, offer.currency)} \u2192 ${fmt(offer.price, offer.currency)}` });
      }
    }
  }
  if (offer.price !== null && offer.price > 0) {
    const cutoff = now.getTime() - 30 * 864e5;
    const usual = prices.filter((p) => toTime(p.recordedAt) >= cutoff && p.price !== offer.price).map((p) => p.price);
    const med = median(usual);
    if (med !== null && usual.length >= MIN_HISTORY_POINTS && offer.price < med * ABNORMAL_LOW_RATIO) {
      const pct2 = (med - offer.price) / med * 100;
      out.push({ kind: "abnormal_low_price", value: Math.round(pct2 * 10) / 10, message: `Prix anormalement bas : ${fmt(offer.price, offer.currency)}, soit ${pct2.toFixed(0)} % sous le prix habituel (${fmt(med, offer.currency)} sur 30 jours)` });
    }
  }
  const stocks = [...stockHistory].sort((a, b) => toTime(a.recordedAt) - toTime(b.recordedAt));
  const previousStock = stocks.length > 0 ? stocks[stocks.length - 1] : null;
  const prevUnavailable = previousStock !== null && (previousStock.stockStatus === "out_of_stock" || previousStock.availableQuantity === 0);
  const nowAvailable = offer.stockStatus === "in_stock" || offer.stockStatus === "low" || offer.availableQuantity !== null && offer.availableQuantity > 0;
  if (prevUnavailable && nowAvailable) {
    out.push({ kind: "new_stock", value: offer.availableQuantity, message: offer.availableQuantity !== null ? `Retour en stock : ${offer.availableQuantity} unit\xE9(s) disponibles` : "Retour en stock" });
  }
  if (previousStock && previousStock.availableQuantity !== null && previousStock.availableQuantity > 0 && offer.availableQuantity !== null && offer.availableQuantity >= 0) {
    const drop = (previousStock.availableQuantity - offer.availableQuantity) / previousStock.availableQuantity;
    if (drop >= LOW_STOCK_DROP_RATIO && previousStock.availableQuantity >= 10) {
      out.push({ kind: "low_stock", value: offer.availableQuantity, message: `Stock en forte baisse : ${previousStock.availableQuantity} \u2192 ${offer.availableQuantity} unit\xE9(s) (\u2212${Math.round(drop * 100)} %)` });
    }
  }
  return out;
}

// src/services/sourcing/alerts.ts
var log20 = createLogger("SOURCING_ALERTS");
var alertCriteriaSchema = z27.object({
  max_price: z27.number().positive().optional(),
  min_quantity: z27.number().int().min(0).optional(),
  countries: z27.array(z27.string().length(2)).optional(),
  max_moq: z27.number().int().min(1).optional(),
  grades: z27.array(z27.string().max(5)).optional(),
  condition: z27.enum(["new", "refurbished", "used"]).optional(),
  max_delivery_days: z27.number().int().min(0).optional(),
  supplier_id: z27.string().uuid().optional()
});
function criteriaToFilters(c) {
  return { maxPrice: c.max_price, minQuantity: c.min_quantity, countries: c.countries, maxMoq: c.max_moq, grades: c.grades, condition: c.condition, maxDeliveryDays: c.max_delivery_days, supplierId: c.supplier_id };
}
function money3(n, currency) {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}
var OPPORTUNITY_TO_EVENT = { price_drop: "price_drop", new_stock: "new_stock", low_stock: "low_stock" };
async function evaluateAlert(admin, alert, orgCurrency, now) {
  const criteria = alertCriteriaSchema.safeParse(alert.criteria ?? {});
  const c = criteria.success ? criteria.data : {};
  const parsed = parseQuery2(alert.query_text);
  const { offers } = await findOffers(admin, alert.organization_id, parsed, criteriaToFilters(c), { includeSkuId: alert.sku_id });
  const events = [];
  const since = alert.last_checked_at ?? alert.created_at;
  const considered = offers.slice(0, 200);
  const offerIds = considered.map((o) => o.id);
  const historySince = new Date(now.getTime() - 60 * 864e5).toISOString();
  const priceHistoryResult = offerIds.length ? await loadRecentPriceHistory(admin, alert.organization_id, offerIds, historySince, { perOffer: 60 }) : { rows: [], failedOfferIds: [], cappedOfferIds: [] };
  const priceByOffer = /* @__PURE__ */ new Map();
  for (const p of priceHistoryResult.rows) {
    const list = priceByOffer.get(p.offer_id) ?? [];
    list.push({ price: Number(p.original_price), recordedAt: p.recorded_at });
    priceByOffer.set(p.offer_id, list);
  }
  for (const list of priceByOffer.values()) list.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  const stockByOffer = /* @__PURE__ */ new Map();
  let nextStock = 0;
  const stockWorker = async () => {
    while (nextStock < offerIds.length) {
      const offerId = offerIds[nextStock++];
      const { data } = await admin.from("supplier_stock_history").select("available_quantity, stock_status, recorded_at").eq("organization_id", alert.organization_id).eq("offer_id", offerId).gte("recorded_at", historySince).order("recorded_at", { ascending: false }).limit(2);
      stockByOffer.set(offerId, (data ?? []).map((st) => ({ availableQuantity: st.available_quantity, stockStatus: st.stock_status, recordedAt: st.recorded_at })));
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, offerIds.length) }, stockWorker));
  for (const o of considered) {
    const price = o.normalized_price ?? (o.original_currency.toUpperCase() === orgCurrency.toUpperCase() ? Number(o.original_price) : null);
    if (c.max_price !== void 0 && price !== null && price <= c.max_price) {
      events.push({ offer_id: o.id, kind: "price_below_threshold", message: `Prix inf\xE9rieur \xE0 votre seuil de ${money3(c.max_price, orgCurrency)} : ${money3(price, orgCurrency)} chez ${o.supplier?.name ?? "un fournisseur"}` });
    } else if (new Date(o.first_seen_at).getTime() >= new Date(since).getTime()) {
      events.push({ offer_id: o.id, kind: "new_offer", message: `Nouvelle offre correspondant \xE0 votre alerte${price !== null ? ` : ${money3(price, orgCurrency)}` : ""} chez ${o.supplier?.name ?? "un fournisseur"}` });
    }
    const priceHistory = priceByOffer.get(o.id) ?? [];
    const stockHistory = (stockByOffer.get(o.id) ?? []).slice(1);
    const ops = detectOpportunities({ price: Number(o.original_price), currency: o.original_currency, availableQuantity: o.available_quantity, stockStatus: o.stock_status }, priceHistory, stockHistory, now);
    for (const op of ops) {
      const kind = OPPORTUNITY_TO_EVENT[op.kind];
      if (kind) events.push({ offer_id: o.id, kind, message: `${op.message} (${o.supplier?.name ?? "fournisseur"})` });
    }
  }
  let created = 0;
  if (events.length > 0) {
    const { data } = await admin.from("sourcing_alert_events").upsert(
      events.map((e) => ({ organization_id: alert.organization_id, alert_id: alert.id, offer_id: e.offer_id, kind: e.kind, message: e.message, triggered_at: now.toISOString() })),
      { onConflict: "alert_id,offer_id,kind", ignoreDuplicates: true }
    ).select("id");
    created = data?.length ?? 0;
  }
  await admin.from("sourcing_alerts").update({ last_checked_at: now.toISOString(), ...created > 0 ? { last_triggered_at: now.toISOString() } : {} }).eq("id", alert.id);
  return { alertId: alert.id, matched: offers.length, created };
}
async function evaluateSourcingAlerts(now = /* @__PURE__ */ new Date(), admin = createAdminSupabaseClient(), organizationId) {
  let q = admin.from("sourcing_alerts").select("id, organization_id, query_text, parsed, criteria, sku_id, created_at, last_checked_at, organization:organizations(default_currency)").eq("is_active", true).limit(1e3);
  if (organizationId) q = q.eq("organization_id", organizationId);
  const { data: alerts, error: alertsError } = await q;
  if (alertsError) throw new Error(`Impossible de charger les alertes de sourcing : ${alertsError.message}`);
  const byOrg = /* @__PURE__ */ new Map();
  for (const a of alerts ?? []) byOrg.set(a.organization_id, [...byOrg.get(a.organization_id) ?? [], a]);
  let totalEvents = 0;
  let totalAlerts = 0;
  for (const [orgId, list] of byOrg) {
    const run = await startSyncRun(admin, { organizationId: orgId, sourceKind: "sourcing_alerts", provider: "sourcing_alerts", trigger: organizationId ? "manual" : "scheduled" });
    let events = 0;
    let errors = 0;
    for (const a of list) {
      try {
        const r = await evaluateAlert(admin, a, a.organization?.default_currency ?? "EUR", now);
        events += r.created;
        totalAlerts++;
      } catch (e) {
        errors++;
        log20.warn("alert evaluation failed", { alertId: a.id, error: e instanceof Error ? e.message : String(e) });
      }
    }
    totalEvents += events;
    await finishSyncRun(admin, run, { status: errors === 0 ? "success" : errors === list.length ? "failed" : "partial", recordsProcessed: list.length, errorCount: errors, stats: { events } });
  }
  return { organizations: byOrg.size, alerts: totalAlerts, events: totalEvents };
}

// src/services/sourcing/sync.ts
var log21 = createLogger("SOURCING_SYNC");
async function runSourcingSync(now = /* @__PURE__ */ new Date()) {
  const startedAt = now.toISOString();
  let fx = { ok: false, date: null, count: 0, error: null };
  try {
    const r = await refreshFxRates();
    fx = { ok: true, date: r.date, count: r.count, error: null };
  } catch (e) {
    fx = { ok: false, date: null, count: 0, error: e instanceof Error ? e.message : String(e) };
    log21.warn("fx refresh failed", { error: fx.error });
  }
  let feeds = [];
  try {
    feeds = await runDueFeeds(now);
  } catch (e) {
    log21.error("due feeds failed", { error: e instanceof Error ? e.message : String(e) });
  }
  let crawls = [];
  try {
    crawls = await runDueCrawls(now);
  } catch (e) {
    log21.error("due crawls failed", { error: e instanceof Error ? e.message : String(e) });
  }
  let alerts;
  try {
    alerts = await evaluateSourcingAlerts(now);
  } catch (e) {
    alerts = { error: e instanceof Error ? e.message : String(e) };
    log21.error("alerts evaluation failed", { error: alerts.error });
  }
  const summary = { startedAt, finishedAt: (/* @__PURE__ */ new Date()).toISOString(), fx, feeds, crawls, alerts };
  log21.info("sourcing sync finished", { fx: fx.ok, feeds: feeds.length, crawls: crawls.length });
  return summary;
}

// src/services/sourcing/source-library.ts
var log22 = createLogger("SOURCE_LIBRARY");
var shopifyTerms = (base) => `${base}/policies/terms-of-service`;
var SOURCE_LIBRARY = [
  {
    key: "ebay-fr",
    name: "eBay France \u2014 annonces (lots, reconditionn\xE9s, pi\xE8ces)",
    website: "https://www.ebay.fr",
    baseUrl: "https://api.ebay.com",
    adapter: "ebay-browse",
    segment: "marketplace",
    country: "FR",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: "https://developer.ebay.com/join/api-license-agreement",
    access: "official_api",
    notes: "API officielle Buy Browse (cl\xE9s de l'application eBay du serveur). Offres publi\xE9es par des vendeurs pros et particuliers ; quantit\xE9 non fournie par la recherche.",
    probeQuery: "iphone 13 128"
  },
  {
    key: "foneday",
    name: "Foneday (NL) \u2014 pi\xE8ces d\xE9tach\xE9es, B2B",
    website: "https://www.foneday.shop",
    baseUrl: "https://www.foneday.shop",
    adapter: "shopify-storefront",
    segment: "parts",
    country: "NL",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: shopifyTerms("https://www.foneday.shop"),
    access: "public_json",
    notes: "Grossiste n\xE9erlandais de pi\xE8ces et accessoires pour r\xE9parateurs (client\xE8le principalement professionnelle, selon la recherche web).",
    probeQuery: "iphone 13 screen"
  },
  {
    key: "mobileparts-shop",
    name: "MobileParts.shop (2Service, NL) \u2014 pi\xE8ces",
    website: "https://www.mobileparts.shop",
    baseUrl: "https://www.mobileparts.shop",
    adapter: "shopify-storefront",
    segment: "parts",
    country: "NL",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: shopifyTerms("https://www.mobileparts.shop"),
    access: "public_json",
    notes: "Pi\xE8ces d'origine, compatibles et de r\xE9cup\xE9ration pour r\xE9parateurs, reconditionneurs et grossistes (selon la recherche web).",
    probeQuery: "iphone 13 display"
  },
  {
    key: "mobilesentrix-eu",
    name: "MobileSentrix Europe (NL) \u2014 pi\xE8ces",
    website: "https://www.mobilesentrix.eu",
    baseUrl: "https://www.mobilesentrix.eu",
    adapter: "shopify-storefront",
    segment: "parts",
    country: "NL",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: shopifyTerms("https://www.mobilesentrix.eu"),
    access: "public_json",
    notes: "Distributeur de pi\xE8ces (centre logistique aux Pays-Bas) ; plateforme \xE0 confirmer par la v\xE9rification.",
    probeQuery: "iphone 13 screen"
  },
  {
    key: "replacebase",
    name: "ReplaceBase (UK) \u2014 \xE9crans et batteries",
    website: "https://www.replacebase.co.uk",
    baseUrl: "https://www.replacebase.co.uk",
    adapter: "shopify-storefront",
    segment: "parts",
    country: "GB",
    currency: "GBP",
    taxType: "unknown",
    termsUrl: shopifyTerms("https://www.replacebase.co.uk"),
    access: "public_json",
    notes: "\xC9crans reconditionn\xE9s et batteries, exp\xE9dition depuis le Royaume-Uni (selon la recherche web) ; frais de douane possibles vers la France.",
    probeQuery: "iphone 13 screen"
  },
  {
    key: "rewa-eu",
    name: "REWA Europe \u2014 outils, \xE9crans, batteries",
    website: "https://rewa.tech",
    baseUrl: "https://rewa.tech",
    adapter: "shopify-storefront",
    segment: "parts",
    country: "EU",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: shopifyTerms("https://rewa.tech"),
    access: "public_json",
    notes: "Outillage et pi\xE8ces de r\xE9paration (pays d'exp\xE9dition \xE0 confirmer).",
    probeQuery: "iphone screen"
  },
  {
    key: "ifixit-eu-pro",
    name: "iFixit Pro Store EU \u2014 pi\xE8ces et outils",
    website: "https://eu-pro-store.ifixit.com",
    baseUrl: "https://eu-pro-store.ifixit.com",
    adapter: "shopify-storefront",
    segment: "parts",
    country: "EU",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: shopifyTerms("https://eu-pro-store.ifixit.com"),
    access: "public_json",
    notes: "Boutique professionnelle iFixit pour l'Europe (plateforme Shopify suppos\xE9e d'apr\xE8s ses URL, confirm\xE9e seulement par la v\xE9rification).",
    probeQuery: "iphone 13 battery"
  },
  {
    key: "jobalots",
    name: "Jobalots (UK/EU) \u2014 lots de retours",
    website: "https://jobalots.com",
    baseUrl: "https://jobalots.com",
    adapter: "shopify-storefront",
    segment: "lots",
    country: "GB",
    currency: "GBP",
    taxType: "unknown",
    termsUrl: shopifyTerms("https://jobalots.com"),
    access: "public_json",
    notes: "Lots de retours clients et de surplus (\xE9lectronique, t\xE9l\xE9phonie) ; prix par lot.",
    probeQuery: "phone"
  },
  {
    key: "brico-phone",
    name: "Brico-phone (FR) \u2014 pi\xE8ces d\xE9tach\xE9es",
    website: "https://www.brico-phone.com",
    baseUrl: "https://www.brico-phone.com",
    adapter: "sitemap-jsonld",
    segment: "parts",
    country: "FR",
    currency: "EUR",
    taxType: "ttc",
    termsUrl: "https://www.brico-phone.com",
    access: "public_html",
    notes: "Pi\xE8ces d\xE9tach\xE9es (\xE9crans, batteries, connecteurs) vendues en France. Lu via le plan du site publi\xE9 et les donn\xE9es structur\xE9es des fiches (prix TTC affich\xE9s au public).",
    probeQuery: "ecran iphone 13"
  },
  {
    key: "utopya",
    name: "Utopya (FR) \u2014 distributeur B2B de pi\xE8ces",
    website: "https://www.utopya.fr",
    baseUrl: "https://www.utopya.fr",
    adapter: "woocommerce-store",
    segment: "parts",
    country: "FR",
    currency: "EUR",
    taxType: "ht",
    termsUrl: "https://www.utopya.fr",
    access: "public_json",
    notes: "Distributeur B2B de pi\xE8ces et accessoires (Paris). Prix pros potentiellement r\xE9serv\xE9s aux comptes : v\xE9rification requise.",
    probeQuery: "iphone 13"
  }
];
function getLibrarySource(key2) {
  return SOURCE_LIBRARY.find((s) => s.key === key2) ?? null;
}
function adapterConfig(s) {
  return { baseUrl: s.baseUrl, settings: { adapter: s.adapter, library_key: s.key }, defaultCurrency: s.currency, defaultTaxType: s.taxType, defaultCountry: s.country.length === 2 && s.country !== "EU" ? s.country : null };
}
async function checkLibrarySource(s, runtime = {}) {
  const t0 = Date.now();
  const adapter = getSourceAdapter(s.adapter);
  const base = { key: s.key, adapter: s.adapter, robotsAllowed: null, httpStatus: null, productCount: 0, sample: [] };
  if (!adapter) return { ...base, status: "not_configured", message: `Adaptateur ${s.adapter} absent.`, durationMs: Date.now() - t0 };
  if (s.adapter === "ebay-browse" && !ebayEnv()) return { ...base, status: "not_configured", message: "Cl\xE9s de l'application eBay non configur\xE9es sur le serveur.", durationMs: Date.now() - t0 };
  const config = adapterConfig(s);
  const parsed = parseQuery2(s.probeQuery);
  const userAgent = serverEnv().SOURCING_USER_AGENT;
  if (adapter.urlsForQuery) {
    const urls = adapter.urlsForQuery(config, parsed, s.probeQuery);
    const robots = await checkRobotsForUrls(s.baseUrl, urls, userAgent, runtime.fetchImpl ?? fetch).catch((e) => ({ allowed: false, details: e instanceof Error ? e.message : String(e), crawlDelay: null }));
    base.robotsAllowed = robots.allowed;
    if (!robots.allowed) return { ...base, status: "robots_disallowed", message: robots.details, durationMs: Date.now() - t0 };
  }
  const r = await adapter.search(config, parsed, s.probeQuery, { userAgent, timeoutMs: 2e4, minDelayMs: 1500, ...runtime });
  const last = r.requests[r.requests.length - 1];
  base.httpStatus = last?.status ?? null;
  const priced = r.offers.filter((o) => o.price !== null && o.price > 0);
  base.productCount = priced.length;
  base.sample = priced.slice(0, 3).map((o) => ({ title: o.title.slice(0, 160), price: o.price, currency: o.currency ?? s.currency, url: o.url ?? null }));
  if (r.error) {
    const unreachable = !last || last.status === null;
    return { ...base, status: unreachable ? "unreachable" : "http_error", message: r.error.slice(0, 500), durationMs: Date.now() - t0 };
  }
  if (priced.length === 0) return { ...base, status: "no_products", message: `Aucun produit avec prix pour \xAB ${s.probeQuery} \xBB.`, durationMs: Date.now() - t0 };
  return { ...base, status: "ok", message: `${priced.length} produit(s) avec prix pour \xAB ${s.probeQuery} \xBB.`, durationMs: Date.now() - t0 };
}
async function checkLibrarySourceDetect(s, runtime = {}) {
  const first = await checkLibrarySource(s, runtime);
  if (first.status === "ok" || first.status === "robots_disallowed" || first.status === "not_configured" || s.access === "official_api") return first;
  const messages = [first.message];
  const order = ["shopify-storefront", "woocommerce-store", "sitemap-jsonld"];
  for (const other of order.filter((a) => a !== s.adapter)) {
    const next = await checkLibrarySource({ ...s, adapter: other }, runtime);
    if (next.status === "ok") return next;
    messages.push(`${other} : ${next.message}`);
  }
  return { ...first, message: messages.join(" | ").slice(0, 500) };
}
async function runLibraryChecks(keys) {
  const admin = createAdminSupabaseClient();
  const out = [];
  for (const s of SOURCE_LIBRARY) {
    if (keys && !keys.includes(s.key)) continue;
    let r;
    try {
      r = await checkLibrarySourceDetect(s);
    } catch (e) {
      r = { key: s.key, status: "unreachable", adapter: s.adapter, robotsAllowed: null, httpStatus: null, productCount: 0, sample: [], message: e instanceof Error ? e.message.slice(0, 500) : String(e), durationMs: 0 };
    }
    out.push(r);
    const { error } = await admin.from("sourcing_library_checks").upsert({
      key: r.key,
      checked_at: (/* @__PURE__ */ new Date()).toISOString(),
      status: r.status,
      adapter: r.adapter,
      robots_allowed: r.robotsAllowed,
      http_status: r.httpStatus,
      product_count: r.productCount,
      sample: r.sample,
      message: r.message,
      duration_ms: r.durationMs
    });
    if (error) log22.error("enregistrement de la v\xE9rification impossible", { key: r.key, error: error.message });
  }
  return out;
}
async function sourceLibrary(ctx) {
  const [checks, sources] = await Promise.all([
    ctx.supabase.from("sourcing_library_checks").select("*"),
    ctx.supabase.from("supplier_sources").select("id, config").eq("organization_id", ctx.organization.id)
  ]);
  if (checks.error) throw checks.error;
  if (sources.error) throw sources.error;
  const byKey = new Map((checks.data ?? []).map((c) => [c.key, c]));
  const activated = /* @__PURE__ */ new Map();
  for (const src of sources.data ?? []) {
    const k = src.config?.library_key;
    if (typeof k === "string") activated.set(k, src.id);
  }
  return {
    entries: SOURCE_LIBRARY.map((s) => {
      const c = byKey.get(s.key);
      return {
        key: s.key,
        name: s.name,
        website: s.website,
        segment: s.segment,
        country: s.country,
        currency: s.currency,
        access: s.access,
        termsUrl: s.termsUrl,
        notes: s.notes,
        check: c ? { status: c.status, checkedAt: c.checked_at, productCount: c.product_count, message: c.message, sample: c.sample } : null,
        activatable: c?.status === "ok",
        sourceId: activated.get(s.key) ?? null
      };
    })
  };
}
async function activateLibrarySource(ctx, key2) {
  const s = getLibrarySource(key2);
  if (!s) throw new AppError("NOT_FOUND", "Source inconnue.");
  const { data: check } = await ctx.supabase.from("sourcing_library_checks").select("status, checked_at, adapter").eq("key", key2).maybeSingle();
  if (check?.status !== "ok") throw new AppError("VALIDATION", "Cette source n'a pas pass\xE9 la v\xE9rification en direct (robots.txt + produits avec prix) : elle ne peut pas \xEAtre activ\xE9e.");
  const { data: existing } = await ctx.supabase.from("supplier_sources").select("id, supplier_id, config").eq("organization_id", ctx.organization.id);
  const found = (existing ?? []).find((r) => r.config?.library_key === key2);
  if (found) return { sourceId: found.id, supplierId: found.supplier_id, alreadyActive: true };
  const country = s.country.length === 2 && s.country !== "EU" ? s.country : null;
  const { data: supplier, error: supErr } = await ctx.supabase.from("suppliers").insert({ organization_id: ctx.organization.id, name: s.name.slice(0, 200), website: s.website, country, currency: s.currency, notes: `Ajout\xE9 depuis la biblioth\xE8que de sources MON STOCK (${s.key}). ${s.notes}` }).select("id").single();
  if (supErr || !supplier) throw supErr ?? new AppError("INTERNAL", "Fournisseur non cr\xE9\xE9.");
  const attestation = `Conditions d'utilisation (${s.termsUrl}) d\xE9clar\xE9es lues et acc\xE8s automatis\xE9 attest\xE9 par l'utilisateur ${ctx.user.email ?? ctx.user.id} le ${(/* @__PURE__ */ new Date()).toISOString()} (application mobile).`;
  const { data: source, error: srcErr } = await ctx.supabase.from("supplier_sources").insert({
    organization_id: ctx.organization.id,
    supplier_id: supplier.id,
    name: s.name.slice(0, 200),
    source_type: s.access === "official_api" ? "API" : "PUBLIC_WEB",
    base_url: s.baseUrl,
    country,
    default_currency: s.currency,
    default_tax_type: s.taxType,
    access_conditions: attestation,
    automated_access_confirmed: true,
    robots_checked_at: check.checked_at,
    robots_allowed: s.access === "official_api" ? null : true,
    sync_frequency: "manual",
    status: "active",
    // Adaptateur ayant réellement répondu lors de la vérification (détection de plateforme).
    config: { adapter: check.adapter ?? s.adapter, library_key: s.key }
  }).select("id").single();
  if (srcErr || !source) {
    await ctx.supabase.from("suppliers").delete().eq("id", supplier.id).eq("organization_id", ctx.organization.id);
    throw srcErr ?? new AppError("INTERNAL", "Source non cr\xE9\xE9e.");
  }
  log22.info("source de biblioth\xE8que activ\xE9e", { orgId: ctx.organization.id, key: key2 });
  return { sourceId: source.id, supplierId: supplier.id, alreadyActive: false };
}

// src/services/sourcing/source-scout.ts
var UA = () => process.env.SOURCING_USER_AGENT || "MonStockBot/0.1";
function detectPlatform(html) {
  if (/cdn\.shopify\.com|Shopify\.theme|shopify-section/i.test(html)) return "shopify";
  if (/woocommerce|wp-content\/plugins\/woocommerce/i.test(html)) return "woocommerce";
  if (/prestashop|var prestashop\s*=/i.test(html)) return "prestashop";
  if (/Magento_|mage\/cookies|data-mage-init/i.test(html)) return "magento";
  return "unknown";
}
function searchTemplate(platform, base) {
  switch (platform) {
    case "shopify":
      return `${base}/search?q={query}&type=product`;
    case "woocommerce":
      return `${base}/?s={query}&post_type=product`;
    case "prestashop":
      return `${base}/recherche?controller=search&s={query}`;
    case "magento":
      return `${base}/catalogsearch/result/?q={query}`;
    default:
      return null;
  }
}
var sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
async function scoutHost(host, query = "iphone") {
  const base = `https://${host.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}`;
  const report2 = { host, homeStatus: null, platform: "unknown", robots: { allowed: null, details: null }, json: null, search: null, sitemap: null, recommendation: null, error: null };
  try {
    const home = await fetchText(`${base}/`, { userAgent: UA(), timeoutMs: 12e3, maxBytes: 2e6 });
    report2.homeStatus = home.status;
    report2.platform = detectPlatform(home.text);
    const jsonUrl = report2.platform === "shopify" ? `${base}/products.json?limit=5` : report2.platform === "woocommerce" ? `${base}/wp-json/wc/store/v1/products?per_page=5&search=${encodeURIComponent(query)}` : null;
    const template = searchTemplate(report2.platform, base);
    const searchUrl = template ? template.replace("{query}", encodeURIComponent(query)) : null;
    const robots = await checkRobotsForUrls(base, [jsonUrl, searchUrl].filter((u) => Boolean(u)).concat(`${base}/`), UA());
    report2.robots = { allowed: robots.allowed, details: robots.details };
    if (!robots.allowed) return report2;
    if (jsonUrl) {
      await sleep2(1500);
      const r = await fetchText(jsonUrl, { userAgent: UA(), accept: "application/json", timeoutMs: 12e3 }).catch(() => ({ status: null, text: "" }));
      let products = [];
      try {
        const body = JSON.parse(r.text);
        if (Array.isArray(body)) products = body.map((p) => ({ title: String(p.name ?? ""), price: p.prices?.price ? `${Number(p.prices.price) / 10 ** (p.prices.currency_minor_unit ?? 2)} ${p.prices.currency_code ?? ""}` : null }));
        else products = (body.products ?? []).map((p) => ({ title: String(p.title ?? ""), price: p.variants?.[0]?.price ?? null }));
      } catch {
        products = [];
      }
      report2.json = { url: jsonUrl, status: r.status, products: products.filter((p) => p.price).length, samples: products.slice(0, 3) };
      if (report2.json.products > 0) report2.recommendation = { adapter: report2.platform === "shopify" ? "shopify-storefront" : "woocommerce-store" };
    }
    if (searchUrl && template) {
      await sleep2(1500);
      const r = await fetchText(searchUrl, { userAgent: UA(), timeoutMs: 12e3, maxBytes: 3e6 }).catch(() => null);
      const offers = r ? parseJsonLdPage(r.text, r.finalUrl || searchUrl) : [];
      report2.search = { url: searchUrl, status: r?.status ?? null, jsonLdOffers: offers.length, samples: offers.slice(0, 3).map((o) => ({ title: o.title, price: o.price ?? null, currency: o.currency ?? null })) };
      if (!report2.recommendation && offers.length > 0) report2.recommendation = { adapter: "jsonld-public", searchUrl: template };
    }
    if (!report2.recommendation) {
      const r = await sitemapJsonLdAdapter.search({ baseUrl: base, settings: {}, defaultCurrency: null, defaultTaxType: "unknown", defaultCountry: null }, parseQuery2(query), query, { userAgent: UA(), timeoutMs: 4e4, minDelayMs: 1500 });
      const priced = r.offers.filter((o) => o.price !== null && o.price > 0);
      report2.sitemap = { offers: priced.length, requests: r.requests.length, error: r.error, samples: priced.slice(0, 3).map((o) => ({ title: o.title, price: o.price, currency: o.currency ?? null, url: o.url ?? null })) };
      if (priced.length > 0) report2.recommendation = { adapter: "sitemap-jsonld" };
    }
  } catch (e) {
    report2.error = e instanceof Error ? e.message.slice(0, 300) : String(e);
  }
  return report2;
}
async function scoutHosts(hosts, query) {
  const unique = [...new Set(hosts.map((h) => h.trim().toLowerCase()).filter((h) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h)))].slice(0, 25);
  const out = [];
  for (let i = 0; i < unique.length; i += 2) out.push(...await Promise.all(unique.slice(i, i + 2).map((h) => scoutHost(h, query))));
  return out;
}

// src/services/sourcing/e2e-check.ts
async function runSearchSelfTest(query, libraryKey) {
  const admin = createAdminSupabaseClient();
  const entry = getLibrarySource(libraryKey);
  if (!entry) return { result: null, error: "Source inconnue.", cleaned: true };
  const { data: check } = await admin.from("sourcing_library_checks").select("status, adapter, checked_at").eq("key", libraryKey).maybeSingle();
  if (check?.status !== "ok") return { result: null, error: "La source n'a pas pass\xE9 la v\xE9rification en direct.", cleaned: true };
  const { data: anyMember } = await admin.from("organization_members").select("user_id").limit(1).maybeSingle();
  const slug = `verif-serveur-${Date.now().toString(36)}`;
  const { data: org, error: orgErr } = await admin.from("organizations").insert({ name: "V\xE9rification serveur (temporaire)", slug, default_currency: "EUR", country: "FR" }).select("*").single();
  if (orgErr || !org) return { result: null, error: orgErr?.message ?? "organisation non cr\xE9\xE9e", cleaned: true };
  try {
    const { data: supplier } = await admin.from("suppliers").insert({ organization_id: org.id, name: entry.name, website: entry.website, country: entry.country.length === 2 ? entry.country : null, currency: entry.currency }).select("id").single();
    if (!supplier) throw new Error("fournisseur non cr\xE9\xE9");
    const { error: srcErr } = await admin.from("supplier_sources").insert({
      organization_id: org.id,
      supplier_id: supplier.id,
      name: entry.name,
      source_type: entry.access === "official_api" ? "API" : "PUBLIC_WEB",
      base_url: entry.baseUrl,
      country: entry.country.length === 2 ? entry.country : null,
      default_currency: entry.currency,
      default_tax_type: entry.taxType,
      access_conditions: "V\xE9rification serveur temporaire (organisation supprim\xE9e apr\xE8s le test).",
      automated_access_confirmed: true,
      robots_checked_at: check.checked_at,
      robots_allowed: true,
      status: "active",
      config: { adapter: check.adapter ?? entry.adapter, library_key: entry.key }
    });
    if (srcErr) throw new Error(srcErr.message);
    const ctx = {
      supabase: admin,
      user: { id: anyMember?.user_id ?? "00000000-0000-0000-0000-000000000000" },
      profile: null,
      organization: org,
      role: "viewer",
      memberships: []
    };
    const result = await sourcingSearch(ctx, { q: query, page: 1, live: "1" });
    return { result, error: null, cleaned: await cleanup(org.id) };
  } catch (e) {
    return { result: null, error: e instanceof Error ? e.message : String(e), cleaned: await cleanup(org.id) };
  }
  async function cleanup(orgId) {
    const { error } = await admin.from("organizations").delete().eq("id", orgId);
    return !error;
  }
}

// server/edge/ebay-callback.ts
var EBAY_APP_CALLBACK = "monstock://ebay/callback";
var SAFE_CODE = /^[A-Za-z0-9._~\-#=%+/^]{1,2048}$/;
var SAFE_STATE = /^[A-Za-z0-9_-]{16,200}$/;
function ebayCallbackTarget(url) {
  const target = new URL(EBAY_APP_CALLBACK);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  if (error) {
    target.searchParams.set("error", error === "access_denied" ? "access_denied" : "ebay_error");
  } else if (code && state && SAFE_CODE.test(code) && SAFE_STATE.test(state)) {
    target.searchParams.set("code", code);
    target.searchParams.set("state", state);
  } else {
    target.searchParams.set("error", "incomplete");
  }
  if (state && SAFE_STATE.test(state) && !target.searchParams.has("state")) target.searchParams.set("state", state);
  return target.toString();
}
function ebayCallbackRedirect(url) {
  const target = ebayCallbackTarget(url);
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MON STOCK</title></head><body style="font-family:-apple-system,system-ui,sans-serif;padding:32px;text-align:center"><p>Retour vers MON STOCK\u2026</p><p><a href="${target.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">Ouvrir l'application</a></p></body></html>`;
  return new Response(html, { status: 302, headers: { Location: target, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

// server/edge/runtime-secrets.ts
var RUNTIME_SECRET_NAMES = [
  "TOKEN_ENCRYPTION_KEY",
  "CRON_SECRET",
  "EBAY_ENV",
  "EBAY_CLIENT_ID",
  "EBAY_CLIENT_SECRET",
  "EBAY_RU_NAME",
  "EBAY_WEBHOOK_VERIFICATION_TOKEN",
  "SOURCING_DISCOVERY_PROVIDER",
  "BRAVE_SEARCH_API_KEY"
];
async function loadRuntimeSecrets(env, fetchImpl = fetch) {
  const fromEnv = RUNTIME_SECRET_NAMES.filter((n) => Boolean(env[n]));
  const state = { fromEnv: [...fromEnv], fromVault: [], error: null };
  const url = env.SUPABASE_URL;
  const key2 = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key2) {
    state.error = "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absents : secrets du Vault non charg\xE9s.";
    return state;
  }
  try {
    const res = await fetchImpl(`${url.replace(/\/+$/, "")}/rest/v1/rpc/server_runtime_secrets`, {
      method: "POST",
      headers: { apikey: key2, Authorization: `Bearer ${key2}`, "Content-Type": "application/json", Accept: "application/json" },
      body: "{}"
    });
    if (!res.ok) {
      state.error = `Lecture du Vault refus\xE9e (HTTP ${res.status}).`;
      return state;
    }
    const data = await res.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) return state;
    for (const name of RUNTIME_SECRET_NAMES) {
      const value = data[name];
      if (!env[name] && typeof value === "string" && value.length > 0) {
        env[name] = value;
        state.fromVault.push(name);
      }
    }
  } catch (e) {
    state.error = `Vault injoignable : ${e instanceof Error ? e.message : String(e)}`.slice(0, 300);
  }
  return state;
}

// server/edge/api.ts
var log23 = createLogger("EDGE_API");
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-organization-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
var ebayFinalizeSchema = z28.object({ code: z28.string().min(1).max(2048), state: z28.string().min(16).max(200) });
var syncSchema = z28.object({ connectionId: uuidParam, scope: z28.enum(["full", "listings", "orders"]).default("full") });
var scoutSchema = z28.object({ hosts: z28.array(z28.string().min(3).max(120)).min(1).max(25), query: z28.string().min(2).max(80).optional() });
var activateSchema = z28.object({ key: z28.string().min(1).max(80), attest: z28.literal(true, { error: "Confirmez avoir lu les conditions d'utilisation de la source." }) });
function withCors(res) {
  const headers = new Headers(res.headers);
  for (const [k, v2] of Object.entries(CORS)) headers.set(k, v2);
  return new Response(res.body, { status: res.status, headers });
}
function routeOf(url) {
  const p = url.pathname.replace(/\/+$/, "");
  const i = p.indexOf("/api");
  const rest = i >= 0 ? p.slice(i + 4) : p;
  return rest === "" ? "/" : rest;
}
async function startEbayConnect(request) {
  const ctx = await requireMobileOrgContext(request, { admin: true });
  const connector = getEbayConnector();
  if (!connector.isConfigured()) {
    throw new AppError("VALIDATION", "Int\xE9gration eBay non configur\xE9e sur le serveur : les cl\xE9s de l'application eBay (EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_RU_NAME) doivent \xEAtre ajout\xE9es aux secrets de la fonction.");
  }
  const state = randomToken(32);
  const admin = createAdminSupabaseClient();
  await admin.from("oauth_states").delete().lt("expires_at", (/* @__PURE__ */ new Date()).toISOString());
  const { error } = await admin.from("oauth_states").insert({
    state,
    organization_id: ctx.organization.id,
    provider: "ebay",
    created_by: ctx.user.id,
    redirect_to: EBAY_APP_CALLBACK,
    expires_at: new Date(Date.now() + OAUTH_STATE_TTL_SECONDS * 1e3).toISOString()
  });
  if (error) throw new AppError("INTERNAL", "Impossible de d\xE9marrer la connexion eBay. R\xE9essayez.");
  log23.info("connexion eBay d\xE9marr\xE9e (mobile)", { orgId: ctx.organization.id, userId: ctx.user.id });
  return { authorizeUrl: connector.getAuthorizeUrl(state), callbackScheme: EBAY_APP_CALLBACK, environment: connector.config()?.environment ?? null };
}
async function finalizeEbayConnect(request) {
  const ctx = await requireMobileOrgContext(request, { admin: true });
  const { code, state } = await parseBody(request, ebayFinalizeSchema);
  const admin = createAdminSupabaseClient();
  const { data: row, error } = await admin.from("oauth_states").delete().eq("state", state).eq("provider", "ebay").select("*").maybeSingle();
  if (error) throw new AppError("INTERNAL", "V\xE9rification de la demande de connexion impossible. R\xE9essayez.");
  if (!row) throw new AppError("VALIDATION", "Demande de connexion inconnue ou d\xE9j\xE0 utilis\xE9e : relancez la connexion eBay.");
  if (row.created_by !== ctx.user.id || row.organization_id !== ctx.organization.id) {
    log23.warn("finalisation eBay refus\xE9e : \xE9tat cr\xE9\xE9 par un autre utilisateur ou une autre organisation", { orgId: ctx.organization.id });
    throw new AppError("FORBIDDEN", "Cette autorisation eBay n'a pas \xE9t\xE9 demand\xE9e depuis votre session : relancez la connexion.");
  }
  if (new Date(row.expires_at).getTime() < Date.now()) throw new AppError("VALIDATION", "La demande de connexion a expir\xE9 (15 min) : relancez la connexion eBay.");
  const connector = getEbayConnector();
  const config = connector.config();
  if (!config) throw new AppError("VALIDATION", "Int\xE9gration eBay non configur\xE9e sur le serveur.");
  try {
    const tokens = await connector.exchangeCode(code);
    const account = await connector.getAccountInfo({ getAccessToken: async () => tokens.accessToken });
    const { connection, isNew } = await upsertOAuthConnection({ organizationId: ctx.organization.id, userId: ctx.user.id, provider: "ebay", environment: config.environment, account, tokens, scopes: ebayScopeList() });
    log23.info("connexion eBay \xE9tablie (mobile)", { connectionId: connection.id, orgId: ctx.organization.id, isNew, environment: config.environment });
    return { connectionId: connection.id, isNew, username: account.username ?? null, environment: config.environment };
  } catch (e) {
    const code2 = oauthErrorCodeFor(e);
    log23.error("\xE9chec de la connexion eBay (mobile)", { orgId: ctx.organization.id, code: code2, message: scrubSecrets(e instanceof Error ? e.message : String(e)) });
    throw e;
  }
}
async function cronSync() {
  const due = await listDueConnections();
  const started = Date.now();
  const results = [];
  for (const c of due) {
    if (Date.now() - started > 1e5) {
      results.push({ connectionId: c.id, status: "deferred" });
      continue;
    }
    try {
      const r = await runChannelSync(c.id, { trigger: "scheduled" });
      results.push({ connectionId: c.id, runId: r.runId, status: r.status, durationMs: r.durationMs, errorSummary: r.errorSummary });
    } catch (e) {
      results.push({ connectionId: c.id, status: "skipped", error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { due: due.length, results };
}
var keyStore = new EbayNotificationKeyStore(() => getEbayConnector().config());
function ebayWebhookEndpoint() {
  return `${(process.env.SUPABASE_URL ?? "").replace(/\/+$/, "")}/functions/v1/api/ebay/webhook`;
}
async function ebayWebhook(request, url) {
  if (request.method === "GET") {
    const challenge = url.searchParams.get("challenge_code");
    if (!challenge) return Response.json({ ok: true, usage: "eBay envoie GET ?challenge_code=\u2026 puis des POST sign\xE9s." });
    const token = getEbayConnector().config()?.webhookVerificationToken ?? null;
    if (!token) return Response.json({ error: "EBAY_WEBHOOK_VERIFICATION_TOKEN non configur\xE9 : impossible de valider l'endpoint eBay." }, { status: 503 });
    return Response.json({ challengeResponse: computeChallengeResponse(challenge, token, ebayWebhookEndpoint()) });
  }
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const runtime = globalThis.EdgeRuntime;
  return handleEbayNotification(request, {
    admin: createAdminSupabaseClient(),
    isConfigured: () => getEbayConnector().isConfigured(),
    getPublicKey: (kid) => keyStore.getPublicKey(kid),
    findConnections: (account) => findConnectionsByExternalAccount("ebay", account),
    runSync: (connectionId, options) => runChannelSync(connectionId, options),
    schedule: (task) => {
      const p = Promise.resolve().then(task);
      if (runtime) runtime.waitUntil(p);
    }
  });
}
async function route(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(request.url);
  const path = routeOf(url);
  const m = request.method;
  try {
    if (m === "GET" && path === "/health") {
      return handle(async () => {
        const ebay2 = ebayEnv();
        const secrets = await ensureRuntimeSecrets();
        return {
          ok: true,
          ebayConfigured: Boolean(ebay2),
          ebayEnvironment: ebay2?.EBAY_ENV ?? null,
          cronConfigured: Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 16),
          encryptionConfigured: Boolean(process.env.TOKEN_ENCRYPTION_KEY && process.env.TOKEN_ENCRYPTION_KEY.length >= 32),
          // Noms uniquement (jamais les valeurs).
          secrets: { fromEnv: secrets.fromEnv, fromVault: secrets.fromVault, error: secrets.error },
          time: (/* @__PURE__ */ new Date()).toISOString()
        };
      });
    }
    if (m === "GET" && path === "/ebay/callback") return ebayCallbackRedirect(url);
    if (path === "/ebay/webhook") return ebayWebhook(request, url);
    if (path.startsWith("/cron/")) {
      const auth = authorizeCron(request);
      if (!auth.ok) return auth.response;
      if (m === "POST" && path === "/cron/sync") return handle(cronSync);
      if (m === "POST" && path === "/cron/sourcing") return handle(() => runSourcingSync());
      if (m === "POST" && path === "/cron/library-checks") return handle(() => runLibraryChecks());
      if (m === "POST" && path === "/cron/e2e-search") {
        return handle(async () => {
          const body = await parseBody(request, z28.object({ query: z28.string().min(2).max(120), source: z28.string().min(1).max(80) }));
          return runSearchSelfTest(body.query, body.source);
        });
      }
      if (m === "POST" && path === "/cron/scout") {
        return handle(async () => {
          const body = await parseBody(request, scoutSchema);
          return scoutHosts(body.hosts, body.query);
        });
      }
    }
    if (m === "GET" && path === "/sourcing/search") return handle(async () => sourcingSearch(await requireMobileOrgContext(request), parseQuery(request, sourcingSearchQuerySchema)));
    if (m === "GET" && path === "/sourcing/status") return handle(async () => sourcingStatus(await requireMobileOrgContext(request)));
    if (m === "GET" && path === "/sourcing/library") return handle(async () => sourceLibrary(await requireMobileOrgContext(request)));
    if (m === "POST" && path === "/sourcing/library/activate") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request, { write: true });
        const body = await parseBody(request, activateSchema);
        return activateLibrarySource(ctx, body.key);
      });
    }
    if (m === "GET" && path === "/integrations") return handle(async () => integrations(await requireMobileOrgContext(request)));
    if (m === "POST" && path === "/ebay/connect") return handle(() => startEbayConnect(request));
    if (m === "POST" && path === "/ebay/finalize") return handle(() => finalizeEbayConnect(request));
    if (m === "POST" && path === "/ebay/sync") {
      return handle(async () => {
        const ctx = await requireMobileOrgContext(request, { write: true });
        const body = await parseBody(request, syncSchema);
        const r = await syncConnectionNow(ctx, body.connectionId, { trigger: "manual", scope: body.scope });
        return { runId: r.result.runId, status: r.result.status, durationMs: r.result.durationMs, summary: r.summary, errorSummary: r.result.errorSummary };
      });
    }
    return errorResponse(new AppError("NOT_FOUND", `Route inconnue : ${m} ${path}`));
  } catch (e) {
    return errorResponse(e);
  }
}
var secretsLoad = null;
function ensureRuntimeSecrets() {
  secretsLoad ??= loadRuntimeSecrets(process.env).then((s) => {
    if (s.error) log23.warn("secrets d'ex\xE9cution incomplets", { error: s.error });
    return s;
  });
  return secretsLoad;
}
async function serve(request) {
  await ensureRuntimeSecrets();
  return withCors(await route(request));
}

// server/edge/main.ts
globalThis.Deno.serve(serve);
