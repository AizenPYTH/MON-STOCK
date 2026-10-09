#!/usr/bin/env node
// Vérifie qu'aucun secret ni code serveur n'est embarqué dans le bundle exporté (`expo export`).
// Usage : node scripts/scan-bundle-secrets.mjs dist
// Échoue (code 1) au premier constat. Les chaînes sont cherchées en UTF-8 ET en UTF-16 (Hermes
// stocke les chaînes non ASCII en UTF-16).
import { Buffer } from "node:buffer";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? "dist";

/** Noms et motifs qui ne doivent JAMAIS apparaître dans l'application. */
const FORBIDDEN_LITERALS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "TOKEN_ENCRYPTION_KEY",
  "EBAY_CLIENT_SECRET",
  "CRON_SECRET",
  "BRAVE_SEARCH_API_KEY",
  "EBAY_WEBHOOK_VERIFICATION_TOKEN",
  "createAdminSupabaseClient",
  "This module cannot be imported from a Client Component module", // server-only
  "-----BEGIN PRIVATE KEY-----",
  "-----BEGIN EC PRIVATE KEY-----",
];
const FORBIDDEN_REGEX = [
  // Le préfixe seul apparaît dans supabase-js (détection du format de clé) : une vraie clé a ≥ 20 caractères après.
  { name: "clé secrète Supabase (sb_secret_)", re: /sb_secret_[A-Za-z0-9_-]{20,}/ },
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
  if (!/\.(hbc|js|json|map|txt|html)$/.test(f)) continue;
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
