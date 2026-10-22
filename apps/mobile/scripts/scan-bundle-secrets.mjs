#!/usr/bin/env node
// Vérifie qu'aucun secret ni code serveur n'est embarqué dans le bundle exporté.
// Usage : npm run scan:bundle   (= expo export --no-bytecode, puis ce script sur dist/scan)
// Le bundle doit être exporté en JavaScript (--no-bytecode) : dans le bytecode Hermes, les chaînes
// sont concaténées sans séparateur et un motif de clé y produit des faux positifs.
// Échoue (code 1) au premier constat.
import { Buffer } from "node:buffer";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? "dist";

/**
 * Noms et motifs qui ne doivent JAMAIS apparaître dans l'application.
 * Liste alignée sur les secrets serveur : src/lib/env.ts et server/edge/runtime-secrets.ts (M-22).
 * OPENAI_API_KEY n'y figure pas : le nom apparaît légitimement dans deux messages d'interface
 * (« clé à ajouter par l'administrateur ») ; son ACCÈS par variable d'environnement est en revanche
 * détecté par SERVER_ENV_ACCESS ci-dessous, et une valeur de clé OpenAI par FORBIDDEN_REGEX.
 */
const FORBIDDEN_LITERALS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "TOKEN_ENCRYPTION_KEY",
  "EBAY_CLIENT_SECRET",
  "CRON_SECRET",
  "BRAVE_SEARCH_API_KEY",
  "EBAY_WEBHOOK_VERIFICATION_TOKEN",
  "SENDCLOUD_SECRET_KEY",
  "SENDCLOUD_PUBLIC_KEY",
  "SHIP24_API_KEY",
  "DHL_API_KEY",
  "LAPOSTE_OKAPI_KEY",
  "PACKLINK_API_KEY",
  "BOXTAL_V1_LOGIN",
  "BOXTAL_V1_PASSWORD",
  "server_runtime_secrets", // RPC réservée à service_role
  "createAdminSupabaseClient",
  "This module cannot be imported from a Client Component module", // server-only
  "-----BEGIN PRIVATE KEY-----",
  "-----BEGIN EC PRIVATE KEY-----",
  "-----BEGIN RSA PRIVATE KEY-----",
  "-----BEGIN OPENSSH PRIVATE KEY-----",
];

/** Secrets serveur dont le NOM peut apparaître dans un texte, mais jamais être lu dans l'environnement. */
const SERVER_ENV_NAMES = ["OPENAI_API_KEY", "OPENAI_MODEL", "EBAY_CLIENT_ID", "EBAY_RU_NAME", "SOURCING_USER_AGENT", "BOXTAL_CONTENT_CODE", "BOXTAL_API_URL", "SUPABASE_DB_URL"];
const SERVER_ENV_ACCESS = new RegExp(`\\b(?:process\\.env|Deno\\.env\\.get\\(|env)\\s*(?:\\.\\s*|\\[\\s*|\\(\\s*)["'\`]?(?:${SERVER_ENV_NAMES.join("|")})\\b`);

// Littéraux complets entre guillemets : les préfixes seuls peuvent apparaître dans des bibliothèques
// (ex. détection du format de clé dans supabase-js).
const Q = "[\"'`]";
const FORBIDDEN_REGEX = [
  { name: "clé secrète Supabase (sb_secret_)", re: new RegExp(`${Q}sb_secret_[A-Za-z0-9_-]{20,}${Q}`) },
  { name: "clé OpenAI (sk-…)", re: new RegExp(`${Q}sk-(?:proj-|svcacct-|admin-|None-)?[A-Za-z0-9_-]{20,}${Q}`) },
  { name: "clé OpenAI (marqueur T3BlbkFJ)", re: /[A-Za-z0-9_-]{8,}T3BlbkFJ[A-Za-z0-9_-]{8,}/ },
  { name: "clé Ship24 (apik_…)", re: new RegExp(`${Q}apik_[A-Za-z0-9]{16,}${Q}`) },
  { name: "jeton d'accès GitHub", re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/ },
  { name: "clé d'accès AWS", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: "jeton utilisateur eBay (v^1.1#)", re: /v\^1\.1#i\^1#/ },
  { name: "accès à un secret serveur par variable d'environnement", re: SERVER_ENV_ACCESS },
];
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else out.push(p);
  }
  return out;
}

function decodeJwtRole(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

const findings = [];
let scanned = 0;
for (const f of files(root)) {
  if (/\.hbc$/.test(f)) {
    console.error(`${f} : bytecode Hermes — exportez avec --no-bytecode pour une analyse fiable.`);
    process.exit(2);
  }
  if (!/\.(js|json|txt|html)$/.test(f)) continue;
  scanned++;
  const buf = readFileSync(f);
  const utf8 = buf.toString("utf8");
  const utf16 = buf.toString("utf16le");
  for (const lit of FORBIDDEN_LITERALS) {
    if (utf8.includes(lit) || utf16.includes(lit)) findings.push(`${f} : « ${lit} »`);
  }
  for (const { name, re } of FORBIDDEN_REGEX) {
    if (re.test(utf8) || re.test(utf16)) findings.push(`${f} : ${name}`);
  }
  for (const text of [utf8, utf16]) {
    for (const m of text.matchAll(JWT)) {
      const role = decodeJwtRole(m[0]);
      // La clé publique « anon » est autorisée (conçue pour être embarquée) ; service_role jamais.
      if (role && role !== "anon") findings.push(`${f} : JWT avec le rôle « ${role} »`);
    }
  }
}

if (scanned === 0) {
  console.error(`Aucun fichier de bundle trouvé dans ${root} (lancez d'abord expo export).`);
  process.exit(2);
}
if (findings.length > 0) {
  console.error(`✗ ${findings.length} constat(s) :\n- ${findings.join("\n- ")}`);
  process.exit(1);
}
console.log(`✓ ${scanned} fichier(s) analysé(s) : aucun secret ni code serveur détecté.`);
