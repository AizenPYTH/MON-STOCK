import { createHash, createVerify, type KeyObject } from "node:crypto";
import { z } from "zod";

/**
 * Vérifications des notifications eBay (Commerce Notification API).
 * https://developer.ebay.com/api-docs/commerce/notification/overview.html
 *
 * 1. Validation de l'endpoint (challenge) : GET ?challenge_code=…
 *    réponse = sha256(challengeCode + verificationToken + endpointUrl), en hexadécimal.
 * 2. Signature des notifications : en-tête `x-ebay-signature` = base64 d'un JSON
 *    { alg, kid, signature, digest } ; la clé publique est obtenue via
 *    GET /commerce/notification/v1/public_key/{kid}. La signature couvre le corps brut.
 */

export function computeChallengeResponse(challengeCode: string, verificationToken: string, endpointUrl: string): string {
  return createHash("sha256").update(challengeCode).update(verificationToken).update(endpointUrl).digest("hex");
}

export const ebaySignatureHeaderSchema = z.object({
  alg: z.string().optional(),
  kid: z.string().min(1),
  signature: z.string().min(1),
  digest: z.string().optional(),
});
export type EbaySignatureHeader = z.infer<typeof ebaySignatureHeaderSchema>;

export function parseSignatureHeader(header: string | null | undefined): EbaySignatureHeader | null {
  if (!header) return null;
  try {
    const json = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as unknown;
    const parsed = ebaySignatureHeaderSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const ebayPublicKeySchema = z.object({
  key: z.string().min(1),
  algorithm: z.string().optional(),
  digest: z.string().optional(),
});
export type EbayPublicKey = z.infer<typeof ebayPublicKeySchema>;

/** eBay renvoie parfois la clé PEM sur une seule ligne : on la remet au format attendu par OpenSSL. */
export function formatPem(key: string): string {
  const trimmed = key.trim();
  if (trimmed.includes("\n")) return trimmed;
  const m = /^-----BEGIN ([A-Z ]+)-----(.+?)-----END ([A-Z ]+)-----$/.exec(trimmed);
  if (!m) return trimmed;
  const body = (m[2] ?? "").replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${m[1]}-----\n${lines.join("\n")}\n-----END ${m[3]}-----\n`;
}

function digestAlgorithm(name: string | undefined): string {
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

/**
 * Vérifie la signature ECDSA du corps brut. L'algorithme de hachage est celui annoncé par
 * la clé publique eBay (`digest`), à défaut celui de l'en-tête, à défaut SHA-256.
 */
export function verifyNotificationSignature(rawBody: string | Buffer, header: EbaySignatureHeader, publicKey: EbayPublicKey | { key: string | KeyObject; digest?: string }): boolean {
  try {
    const algo = digestAlgorithm(publicKey.digest ?? header.digest);
    const verifier = createVerify(algo);
    verifier.update(rawBody);
    const key = typeof publicKey.key === "string" ? formatPem(publicKey.key) : publicKey.key;
    return verifier.verify(key, header.signature, "base64");
  } catch {
    return false;
  }
}

export const ebayNotificationSchema = z.object({
  metadata: z.object({ topic: z.string().min(1), schemaVersion: z.string().optional(), deprecated: z.boolean().optional() }),
  notification: z.object({
    notificationId: z.string().min(1).optional(),
    eventDate: z.string().optional(),
    publishDate: z.string().optional(),
    publishAttemptCount: z.number().optional(),
    data: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type EbayNotification = z.infer<typeof ebayNotificationSchema>;

/** Identifiant d'événement stable pour la déduplication (notificationId, sinon hash du contenu). */
export function notificationEventId(notification: EbayNotification, payloadHash: string): string {
  return notification.notification.notificationId ?? `${notification.metadata.topic}:${payloadHash}`;
}
