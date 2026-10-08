import { createHash, createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { computeChallengeResponse, formatPem, notificationEventId, parseSignatureHeader, verifyNotificationSignature, ebayNotificationSchema } from "@/integrations/ebay/webhook-verify";

describe("computeChallengeResponse", () => {
  it("sha256(challengeCode + verificationToken + endpointUrl) en hexadécimal", () => {
    const code = "a7c3e2b1";
    const token = "monstock_verification_token_0123456789abcdef";
    const url = "https://app.example.com/api/webhooks/ebay";
    const expected = createHash("sha256").update(code + token + url).digest("hex");
    expect(computeChallengeResponse(code, token, url)).toBe(expected);
    expect(computeChallengeResponse(code, token, url)).toHaveLength(64);
    expect(computeChallengeResponse(code, token, url + "/")).not.toBe(expected);
  });
});

describe("parseSignatureHeader", () => {
  it("décode le JSON base64 et rejette les en-têtes invalides", () => {
    const header = Buffer.from(JSON.stringify({ alg: "ecdsa", kid: "kid-1", signature: "c2ln", digest: "SHA1" })).toString("base64");
    expect(parseSignatureHeader(header)).toEqual({ alg: "ecdsa", kid: "kid-1", signature: "c2ln", digest: "SHA1" });
    expect(parseSignatureHeader(null)).toBeNull();
    expect(parseSignatureHeader("pas du base64 json")).toBeNull();
    expect(parseSignatureHeader(Buffer.from(JSON.stringify({ alg: "ecdsa" })).toString("base64"))).toBeNull();
  });
});

describe("verifyNotificationSignature", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const body = JSON.stringify({ metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION", schemaVersion: "1.0" }, notification: { notificationId: "n-1", data: { username: "u", userId: "id" } } });

  function sign(digest: "sha256" | "sha1", payload: string): string {
    const signer = createSign(digest);
    signer.update(payload);
    return signer.sign(privateKey, "base64");
  }

  it("valide une signature ECDSA/SHA-256 et refuse un corps altéré", () => {
    const header = { alg: "ecdsa", kid: "k", signature: sign("sha256", body), digest: "SHA256" };
    expect(verifyNotificationSignature(body, header, { key: pem, algorithm: "ECDSA", digest: "SHA256" })).toBe(true);
    expect(verifyNotificationSignature(body + " ", header, { key: pem, digest: "SHA256" })).toBe(false);
    expect(verifyNotificationSignature(body, { ...header, signature: sign("sha256", "autre") }, { key: pem, digest: "SHA256" })).toBe(false);
  });

  it("utilise l'algorithme de hachage annoncé par la clé publique eBay (SHA1)", () => {
    const header = { alg: "ecdsa", kid: "k", signature: sign("sha1", body), digest: "SHA1" };
    expect(verifyNotificationSignature(body, header, { key: pem, algorithm: "ECDSA", digest: "SHA1" })).toBe(true);
    expect(verifyNotificationSignature(body, header, { key: pem, digest: "SHA256" })).toBe(false);
  });

  it("accepte une clé PEM fournie sur une seule ligne et ne lève jamais", () => {
    const oneLine = pem.replace(/\n/g, "");
    expect(formatPem(oneLine)).toContain("-----BEGIN PUBLIC KEY-----\n");
    const header = { alg: "ecdsa", kid: "k", signature: sign("sha256", body), digest: "SHA256" };
    expect(verifyNotificationSignature(body, header, { key: oneLine, digest: "SHA256" })).toBe(true);
    expect(verifyNotificationSignature(body, header, { key: "clé invalide", digest: "SHA256" })).toBe(false);
  });

  it("identifiant d'événement : notificationId sinon sujet + hash", () => {
    const n = ebayNotificationSchema.parse(JSON.parse(body));
    expect(notificationEventId(n, "abc")).toBe("n-1");
    const withoutId = ebayNotificationSchema.parse({ metadata: { topic: "ITEM_AVAILABILITY" }, notification: {} });
    expect(notificationEventId(withoutId, "abc")).toBe("ITEM_AVAILABILITY:abc");
  });
});
