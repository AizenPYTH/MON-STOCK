import { describe, expect, it } from "vitest";
import { assessOfferConfidence, formatLastChecked, formatRelativeFr, type ConfidenceInput } from "@/domain/sourcing/confidence";

const NOW = new Date("2026-10-08T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

const good: ConfidenceInput = { lastSeenAt: minutesAgo(30), status: "active", priceConfidence: 0.95, stockConfidence: 0.9, stockKnown: true };
const assess = (p: Partial<ConfidenceInput>) => assessOfferConfidence({ ...good, ...p }, NOW);

describe("formatRelativeFr / formatLastChecked", () => {
  it("formate en français", () => {
    expect(formatRelativeFr(10_000)).toBe("à l'instant");
    expect(formatRelativeFr(60_000)).toBe("il y a 1 minute");
    expect(formatRelativeFr(5 * 60_000)).toBe("il y a 5 minutes");
    expect(formatRelativeFr(60 * 60_000)).toBe("il y a 1 heure");
    expect(formatRelativeFr(3 * 3_600_000 + 10 * 60_000)).toBe("il y a 3 heures");
    expect(formatRelativeFr(26 * 3_600_000)).toBe("il y a 1 jour");
    expect(formatRelativeFr(3 * 86_400_000)).toBe("il y a 3 jours");
    expect(formatRelativeFr(65 * 86_400_000)).toBe("il y a 2 mois");
    expect(formatRelativeFr(-5000)).toBe("à l'instant");
  });
  it("Dernière vérification", () => {
    expect(formatLastChecked(minutesAgo(12), NOW)).toBe("Dernière vérification : il y a 12 minutes");
    expect(formatLastChecked(null, NOW)).toBe("Dernière vérification : date inconnue");
    expect(formatLastChecked("pas une date", NOW)).toBe("Dernière vérification : date inconnue");
  });
});

describe("assessOfferConfidence", () => {
  it("🟢 vérifié récemment", () => {
    const c = assess({});
    expect(c).toMatchObject({ level: "verified_recently", emoji: "🟢", label: "Vérifié récemment", ageMinutes: 30, lastCheckedLabel: "Dernière vérification : il y a 30 minutes" });
    expect(c.reasons).toEqual(["Vue il y a 30 minutes", "Confiance prix 95 %"]);
  });
  it("🔴 offre expirée : statut, date d'expiration, > 30 jours, rejetée", () => {
    expect(assess({ status: "expired" })).toMatchObject({ level: "expired", emoji: "🔴", label: "Offre expirée" });
    expect(assess({ expiresAt: minutesAgo(1) }).level).toBe("expired");
    expect(assess({ lastSeenAt: minutesAgo(31 * 24 * 60) }).reasons).toContain("Non revue depuis plus de 30 jours");
    expect(assess({ status: "rejected" }).level).toBe("expired");
  });
  it("🟡 donnée ancienne (> 48 h) ou date inconnue — prioritaire sur le stock incertain", () => {
    const c = assess({ lastSeenAt: minutesAgo(49 * 60), stockKnown: false });
    expect(c).toMatchObject({ level: "stale", emoji: "🟡", label: "Donnée ancienne" });
    expect(c.reasons).toEqual(["Vue il y a 2 jours (plus de 48 h)", "Stock non communiqué par la source"]);
    expect(assess({ lastSeenAt: null }).level).toBe("stale");
  });
  it("🟠 stock incertain : stock inconnu, faible confiance stock, source découverte non validée", () => {
    expect(assess({ stockKnown: false })).toMatchObject({ level: "stock_uncertain", emoji: "🟠", label: "Stock incertain" });
    expect(assess({ stockConfidence: 0.5 }).reasons).toEqual(["Confiance stock faible (50 %)"]);
    expect(assess({ sourceDiscovered: true }).reasons).toEqual(["Source découverte automatiquement, pas encore validée"]);
    expect(assess({ sourceDiscovered: true, sourceValidated: true }).level).toBe("verified_recently");
    expect(assess({ sourceValidated: false }).level).toBe("stock_uncertain");
  });
  it("⚪ à confirmer : entre 24 et 48 h, confiance prix < 0,9 ou inconnue, offre suspecte", () => {
    expect(assess({ lastSeenAt: minutesAgo(30 * 60) })).toMatchObject({ level: "unconfirmed", emoji: "⚪", reasons: ["Vue il y a 1 jour (plus de 24 h)"] });
    expect(assess({ priceConfidence: 0.8 }).reasons).toEqual(["Confiance prix 80 % (< 90 %)"]);
    expect(assess({ priceConfidence: null }).reasons).toEqual(["Confiance prix inconnue"]);
    expect(assess({ status: "suspicious" }).level).toBe("unconfirmed");
  });
  it("seuils exacts : 24 h et 48 h inclus", () => {
    expect(assess({ lastSeenAt: minutesAgo(24 * 60) }).level).toBe("verified_recently");
    expect(assess({ lastSeenAt: minutesAgo(48 * 60) }).level).toBe("unconfirmed");
    expect(assess({ priceConfidence: 0.9 }).level).toBe("verified_recently");
    expect(assess({ stockConfidence: 0.6 }).level).toBe("verified_recently");
  });
});
