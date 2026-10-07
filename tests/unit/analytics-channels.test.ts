import { describe, expect, it } from "vitest";
import { buildChannelCards, deriveConnectionState } from "@/features/analytics/channels.pure";

const NOW = new Date("2026-10-07T12:00:00Z");
const conn = (over: Partial<Parameters<typeof deriveConnectionState>[1] & object> = {}) => ({
  sales_channel_id: "ch",
  status: "connected",
  refresh_token_expires_at: null,
  last_error: null,
  last_successful_sync_at: null,
  last_sync_at: null,
  external_username: "shop",
  ...over,
});

describe("deriveConnectionState", () => {
  it("ne suppose jamais un canal connecté sans connexion", () => {
    expect(deriveConnectionState("ebay", null, NOW).state).toBe("not_connected");
  });
  it("détecte un jeton de rafraîchissement expiré", () => {
    expect(deriveConnectionState("ebay", conn({ refresh_token_expires_at: "2026-10-01T00:00:00Z" }), NOW).state).toBe("expired");
    expect(deriveConnectionState("ebay", conn({ refresh_token_expires_at: "2027-10-01T00:00:00Z" }), NOW).state).toBe("connected");
  });
  it("remonte l'erreur et marque Amazon / Shopify comme à venir", () => {
    expect(deriveConnectionState("ebay", conn({ status: "error", last_error: "401" }), NOW)).toEqual({ state: "error", detail: "401" });
    expect(deriveConnectionState("amazon", conn(), NOW).state).toBe("coming_soon");
    expect(deriveConnectionState("manual", null, NOW).state).toBe("manual");
  });
});

describe("buildChannelCards", () => {
  it("ajoute eBay (non connecté) et Amazon/Shopify (prochainement) lorsqu'ils sont absents", () => {
    const cards = buildChannelCards([{ id: "m", provider: "manual", name: "Ventes manuelles", is_active: true }], [], NOW);
    expect(cards.map((c) => `${c.provider}:${c.state}`)).toEqual(["ebay:not_connected", "manual:manual", "amazon:coming_soon", "shopify:coming_soon"]);
  });
  it("classe les erreurs en premier et ignore les canaux inactifs", () => {
    const cards = buildChannelCards(
      [
        { id: "e1", provider: "ebay", name: "eBay FR", is_active: true },
        { id: "e2", provider: "ebay", name: "eBay old", is_active: false },
        { id: "m", provider: "manual", name: "Manuel", is_active: true },
      ],
      [conn({ sales_channel_id: "e1", status: "error", last_error: "token" })],
      NOW,
    );
    expect(cards[0]?.name).toBe("eBay FR");
    expect(cards[0]?.state).toBe("error");
    expect(cards.some((c) => c.name === "eBay old")).toBe(false);
    expect(cards.some((c) => c.key === "placeholder:ebay")).toBe(false);
  });
});
