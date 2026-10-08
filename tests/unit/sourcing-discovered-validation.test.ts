import { describe, expect, it } from "vitest";
import { activatedConfig, activationCheck, dismissedConfig, isPendingDiscovered, readDiscoveredConfig } from "@/features/suppliers/discovered";
import { isUnvalidatedDiscovered } from "@/services/sourcing/live-search";

const ADAPTERS = [
  { key: "shopify-storefront", access: "public" as const },
  { key: "woocommerce-store", access: "public" as const },
  { key: "bigbuy", access: "account" as const },
];

const base = { discovered: true, access: "public", platform: "shopify", suggested_adapter: "shopify-storefront", robots_status: "allowed", robots_allowed: true, price_visibility: "public", supplier_type: "wholesaler", supplier_type_confidence: 0.8, validation: "pending", discovery_query: "iphone 13 grossiste", discovered_via: "brave" };

describe("sources découvertes : lecture et règles de validation", () => {
  it("lit la configuration enregistrée par la découverte (inconnu → valeurs prudentes)", () => {
    const info = readDiscoveredConfig(base);
    expect(info).toMatchObject({ discovered: true, dismissed: false, access: "public", accessLabel: "Accès public", suggestedAdapter: "shopify-storefront", robotsStatus: "allowed", robotsAllowed: true, validation: "pending" });
    const empty = readDiscoveredConfig(null);
    expect(empty).toMatchObject({ discovered: false, access: "unknown", robotsStatus: "not_checked", suggestedAdapter: null });
  });

  it("en attente = découverte, non attestée, non ignorée", () => {
    expect(isPendingDiscovered({ config: base, automated_access_confirmed: false })).toBe(true);
    expect(isPendingDiscovered({ config: base, automated_access_confirmed: true })).toBe(false);
    expect(isPendingDiscovered({ config: { ...base, dismissed: true }, automated_access_confirmed: false })).toBe(false);
    expect(isPendingDiscovered({ config: { adapter: "shopify-storefront" }, automated_access_confirmed: false })).toBe(false);
    expect(isUnvalidatedDiscovered(base, false)).toBe(true);
    expect(isUnvalidatedDiscovered(base, true)).toBe(false);
    expect(isUnvalidatedDiscovered({}, false)).toBe(false);
  });

  it("activation publique uniquement : compte requis / protégé / non déterminé refusés", () => {
    expect(activationCheck(readDiscoveredConfig(base), ADAPTERS, true)).toEqual({ ok: true, adapterKey: "shopify-storefront" });
    for (const access of ["account", "protected"]) {
      const r = activationCheck(readDiscoveredConfig({ ...base, access }), ADAPTERS, true);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.accountRequired).toBe(true);
        expect(r.reason).toMatch(/Compte requis/);
      }
    }
    const unknown = activationCheck(readDiscoveredConfig({ ...base, access: "unknown" }), ADAPTERS, true);
    expect(unknown.ok).toBe(false);
  });

  it("robots.txt interdit / non vérifié, adaptateur absent ou « compte » : refus explicite", () => {
    expect(activationCheck(readDiscoveredConfig(base), ADAPTERS, false).ok).toBe(false);
    expect(activationCheck(readDiscoveredConfig({ ...base, robots_status: "disallowed" }), ADAPTERS, null).ok).toBe(false);
    expect(activationCheck(readDiscoveredConfig({ ...base, robots_status: "error" }), ADAPTERS, null).ok).toBe(false);
    const noAdapter = activationCheck(readDiscoveredConfig({ ...base, suggested_adapter: null }), ADAPTERS, true);
    expect(noAdapter.ok).toBe(false);
    if (!noAdapter.ok) expect(noAdapter.reason).toMatch(/Aucun adaptateur/);
    expect(activationCheck(readDiscoveredConfig({ ...base, suggested_adapter: "inconnu" }), ADAPTERS, true).ok).toBe(false);
    expect(activationCheck(readDiscoveredConfig({ ...base, suggested_adapter: "bigbuy" }), ADAPTERS, true)).toMatchObject({ ok: false, accountRequired: true });
    expect(activationCheck(readDiscoveredConfig({ ...base, dismissed: true }), ADAPTERS, true).ok).toBe(false);
    expect(activationCheck(readDiscoveredConfig({}), ADAPTERS, true).ok).toBe(false);
  });

  it("configuration après validation / ignorance : adaptateur recopié, trace conservée, rien d'effacé", () => {
    const at = new Date("2026-10-08T10:00:00.000Z");
    const v = activatedConfig(base, "shopify-storefront", { userId: "u1", at });
    expect(v).toMatchObject({ ...base, adapter: "shopify-storefront", validation: "validated", validated_by: "u1", validated_at: at.toISOString(), dismissed: false });
    const d = dismissedConfig(base, { userId: "u1", at });
    expect(d).toMatchObject({ ...base, dismissed: true, validation: "dismissed" });
    expect(d.adapter).toBeUndefined();
  });
});
