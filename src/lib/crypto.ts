import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { serverEnv } from "@/lib/env";

/**
 * Chiffrement symétrique des secrets stockés en base (tokens OAuth, credentials).
 * Format : v1:<iv>:<ciphertext>:<authTag> (base64). AES-256-GCM.
 */
const VERSION = "v1";

function key(): Buffer {
  const raw = serverEnv().TOKEN_ENCRYPTION_KEY;
  // Accepte une clé base64 de 32 octets, ou toute chaîne (dérivée par SHA-256).
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) return decoded;
  return createHash("sha256").update(raw, "utf8").digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), enc.toString("base64"), tag.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const [version, ivB64, encB64, tagB64] = payload.split(":");
  if (version !== VERSION || !ivB64 || !encB64 || !tagB64) {
    throw new Error("Secret chiffré illisible (format inattendu).");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encB64, "base64")), decipher.final()]).toString("utf8");
}

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("hex");
}
