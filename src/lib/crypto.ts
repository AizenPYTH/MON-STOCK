import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

/**
 * Chiffrement symétrique des secrets stockés en base (tokens OAuth, identifiants fournisseurs).
 * AES-256-GCM, IV aléatoire de 12 octets, tag de 16 octets, sans AAD (voir plus bas).
 *
 * Format du texte chiffré (base64) :
 *   v1:<iv>:<ciphertext>:<authTag>        clé de version 1 (tous les secrets existants)
 *   v1k<N>:<iv>:<ciphertext>:<authTag>    clé de version N ≥ 2 (après une rotation)
 * La version de clé est donc portée par CHAQUE texte chiffré : c'est elle qui fait foi, la colonne
 * `key_version` des tables de secrets n'est qu'indicative (une ligne peut mêler deux versions le
 * temps d'une rotation, ex. jeton d'accès rafraîchi mais jeton de renouvellement inchangé).
 *
 * Clés (S-28, I-25, D-05) :
 *  - TOKEN_ENCRYPTION_KEY : clé COURANTE, 32 octets encodés en base64 (`openssl rand -base64 32`,
 *    ou générée par la migration 20261009000400). Toute autre valeur est REFUSÉE (plus de dérivation
 *    SHA-256 silencieuse) ;
 *  - TOKEN_ENCRYPTION_KEY_VERSION : version de la clé courante (défaut 1) ;
 *  - TOKEN_ENCRYPTION_KEY_PREVIOUS : anciennes clés, encore utilisées pour DÉCHIFFRER :
 *    « <version>:<clé base64> » séparées par des virgules ou des espaces ;
 *  - TOKEN_ENCRYPTION_KEY_FORMAT=passphrase-sha256 : chemin de compatibilité EXPLICITE pour une clé
 *    courante historique qui n'est pas du base64 de 32 octets (la clé AES est alors le SHA-256 de la
 *    chaîne, comme avant). À n'utiliser que le temps de migrer vers une clé conforme (rotation).
 * Le chiffrement utilise toujours la clé courante ; le déchiffrement, la clé de la version indiquée.
 *
 * Pas d'AAD : les textes chiffrés existants ont été produits sans données associées ; en ajouter
 * rendrait tous les jetons enregistrés illisibles. Procédure de rotation : docs/SERVER.md.
 */
const FORMAT = "v1";
export const PASSPHRASE_KEY_FORMAT = "passphrase-sha256";
const MAX_KEY_VERSION = 999;

/** Erreur de CONFIGURATION (clé absente, non conforme, version inconnue) : jamais une donnée corrompue. */
export class EncryptionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionConfigError";
  }
}

type Env = Record<string, string | undefined>;

interface KeyRing {
  currentVersion: number;
  keys: Map<number, Buffer>;
  format: "base64-32" | typeof PASSPHRASE_KEY_FORMAT;
}

const NON_CONFORMING = "TOKEN_ENCRYPTION_KEY non conforme : 32 octets encodés en base64 attendus (openssl rand -base64 32). Une ancienne clé « phrase » n'est acceptée qu'avec TOKEN_ENCRYPTION_KEY_FORMAT=passphrase-sha256 (voir docs/SERVER.md, rotation de la clé).";

/** Clé brute de 32 octets si `raw` est du base64 de 32 octets (même décodage qu'avant : rien ne change pour une clé conforme). */
function decodeConformingKey(raw: string): Buffer | null {
  const decoded = Buffer.from(raw, "base64");
  return decoded.length === 32 ? decoded : null;
}

function parseVersion(raw: string | undefined, label: string): number {
  if (raw === undefined || raw.trim() === "") return 1;
  const v = Number(raw.trim());
  if (!Number.isInteger(v) || v < 1 || v > MAX_KEY_VERSION) throw new EncryptionConfigError(`${label} invalide : entier de 1 à ${MAX_KEY_VERSION} attendu.`);
  return v;
}

function keyRing(env: Env = process.env): KeyRing {
  const raw = env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new EncryptionConfigError("TOKEN_ENCRYPTION_KEY absente : chiffrement des secrets indisponible sur ce serveur.");
  const currentVersion = parseVersion(env.TOKEN_ENCRYPTION_KEY_VERSION, "TOKEN_ENCRYPTION_KEY_VERSION");
  const keys = new Map<number, Buffer>();
  let format: KeyRing["format"] = "base64-32";
  const conforming = decodeConformingKey(raw);
  if (conforming) keys.set(currentVersion, conforming);
  else if ((env.TOKEN_ENCRYPTION_KEY_FORMAT ?? "").trim() === PASSPHRASE_KEY_FORMAT && raw.length >= 32) {
    keys.set(currentVersion, createHash("sha256").update(raw, "utf8").digest());
    format = PASSPHRASE_KEY_FORMAT;
  } else throw new EncryptionConfigError(NON_CONFORMING);

  for (const entry of (env.TOKEN_ENCRYPTION_KEY_PREVIOUS ?? "").split(/[\s,]+/).filter(Boolean)) {
    const sep = entry.indexOf(":");
    if (sep <= 0) throw new EncryptionConfigError("TOKEN_ENCRYPTION_KEY_PREVIOUS invalide : « <version>:<clé base64> » attendu.");
    const version = parseVersion(entry.slice(0, sep), "Version de TOKEN_ENCRYPTION_KEY_PREVIOUS");
    const key = decodeConformingKey(entry.slice(sep + 1));
    if (!key) throw new EncryptionConfigError(`TOKEN_ENCRYPTION_KEY_PREVIOUS : la clé de version ${version} n'est pas du base64 de 32 octets.`);
    if (keys.has(version)) throw new EncryptionConfigError(`TOKEN_ENCRYPTION_KEY_PREVIOUS : version ${version} en double (ou égale à la version courante).`);
    keys.set(version, key);
  }
  return { currentVersion, keys, format };
}

/** Version de la clé courante (colonne indicative `key_version` des tables de secrets). */
export function currentKeyVersion(env: Env = process.env): number {
  return keyRing(env).currentVersion;
}

function prefixFor(version: number): string {
  return version === 1 ? FORMAT : `${FORMAT}k${version}`;
}

/** Version de clé d'un texte chiffré ; null si le format est inconnu. */
export function keyVersionOf(payload: string): number | null {
  const m = /^v1(?:k([1-9][0-9]{0,2}))?$/.exec(payload.split(":", 1)[0] ?? "");
  if (!m) return null;
  return m[1] ? Number(m[1]) : 1;
}

export function encryptSecret(plain: string, env: Env = process.env): string {
  const ring = keyRing(env);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ring.keys.get(ring.currentVersion)!, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [prefixFor(ring.currentVersion), iv.toString("base64"), enc.toString("base64"), tag.toString("base64")].join(":");
}

export function decryptSecret(payload: string, env: Env = process.env): string {
  const [, ivB64, encB64, tagB64] = payload.split(":");
  const version = keyVersionOf(payload);
  if (version === null || !ivB64 || !encB64 || !tagB64) {
    throw new Error("Secret chiffré illisible (format inattendu).");
  }
  const ring = keyRing(env);
  const key = ring.keys.get(version);
  if (!key) throw new EncryptionConfigError(`Clé de chiffrement de version ${version} absente du serveur : ajoutez-la à TOKEN_ENCRYPTION_KEY_PREVIOUS (« ${version}:<clé> »).`);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encB64, "base64")), decipher.final()]).toString("utf8");
}

/** Rotation : renvoie le secret chiffré avec la clé courante (inchangé s'il l'est déjà). */
export function reencryptSecret(payload: string, env: Env = process.env): string {
  if (keyVersionOf(payload) === currentKeyVersion(env)) return payload;
  return encryptSecret(decryptSecret(payload, env), env);
}

export interface EncryptionKeyStatus {
  configured: boolean;
  format: KeyRing["format"] | null;
  currentVersion: number | null;
  /** Versions disponibles pour le déchiffrement (courante comprise). */
  versions: number[];
  error: string | null;
}

/** État de la configuration (jamais la clé) : diagnostic protégé et `/health`. */
export function encryptionKeyStatus(env: Env = process.env): EncryptionKeyStatus {
  try {
    const ring = keyRing(env);
    return { configured: true, format: ring.format, currentVersion: ring.currentVersion, versions: [...ring.keys.keys()].sort((a, b) => a - b), error: null };
  } catch (e) {
    return { configured: false, format: null, currentVersion: null, versions: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("hex");
}
