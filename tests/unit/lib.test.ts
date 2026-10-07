import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { redact } from "@/lib/logger";
import { formatDays, formatMoney, formatRelative } from "@/lib/format";
import { slugify } from "@/lib/utils";

describe("logger.redact", () => {
  it("masque les clés sensibles à toute profondeur", () => {
    const out = redact({ access_token: "abc", nested: { Authorization: "Bearer x", ok: 1 }, list: [{ refreshToken: "r" }], password: "p" });
    expect(out).toEqual({ access_token: "[REDACTED]", nested: { Authorization: "[REDACTED]", ok: 1 }, list: [{ refreshToken: "[REDACTED]" }], password: "[REDACTED]" });
  });
});

describe("crypto", () => {
  const prev = { ...process.env };
  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });
  afterEach(() => {
    process.env = { ...prev };
  });

  it("chiffre et déchiffre un secret (AES-256-GCM) avec un IV aléatoire", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/crypto");
    const a = encryptSecret("v^1.1#i^1#token");
    const b = encryptSecret("v^1.1#i^1#token");
    expect(a).not.toBe(b);
    expect(a.startsWith("v1:")).toBe(true);
    expect(decryptSecret(a)).toBe("v^1.1#i^1#token");
    expect(decryptSecret(b)).toBe("v^1.1#i^1#token");
  });

  it("refuse un payload altéré", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/crypto");
    const enc = encryptSecret("secret");
    const parts = enc.split(":");
    parts[2] = Buffer.from("xx").toString("base64");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });
});

describe("format", () => {
  it("n'invente jamais une valeur", () => {
    expect(formatMoney(null)).toBe("—");
    expect(formatDays(null)).toBe("—");
    expect(formatRelative(null)).toBe("—");
  });
  it("formate les durées", () => {
    expect(formatDays(1.8)).toBe("1,8 jours");
    expect(formatDays(0.5)).toBe("0,5 jour");
    expect(formatDays(Number.POSITIVE_INFINITY)).toBe("∞");
  });
  it("formate les dates relatives en français", () => {
    const now = new Date("2026-10-07T12:00:00Z");
    expect(formatRelative(new Date("2026-10-07T11:48:00Z"), now)).toBe("il y a 12 minutes");
    expect(formatRelative(new Date("2026-10-04T12:00:00Z"), now)).toBe("il y a 3 jours");
  });
});

describe("slugify", () => {
  it("produit un slug sûr", () => {
    expect(slugify("Ma Boutique Reconditionnée !")).toBe("ma-boutique-reconditionnee");
    expect(slugify("")).toBe("org");
  });
});
