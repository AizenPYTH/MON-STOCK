import { runDiagnostics } from "~/data/diagnostics";
import { checkEbayListing, disconnectEbay, publishEbayListing } from "~/data/ebay";
import { fakeSupabase } from "./fake-supabase";

/** Diagnostic (états réels, aucun secret) et appels eBay du mobile (contrôle, publication confirmée, déconnexion). */
const mockCallApi = jest.fn();
jest.mock("~/lib/api", () => ({ callApi: (...a: unknown[]) => mockCallApi(...a) }));
jest.mock("expo-web-browser", () => ({}));

beforeEach(() => mockCallApi.mockReset());

const ctx = { organizationId: "org-1", organizationName: "Boutique", role: "owner", email: "vendeur@example.test" };

it("diagnostic : chaque service contrôlé ; IA et eBay non configurés signalés, aucun nom ni valeur de secret affiché", async () => {
  mockCallApi.mockImplementation((path: string) => {
    if (path === "/health") return Promise.resolve({ ok: true, ebayConfigured: false, ebayEnvironment: null, cronConfigured: true, aiConfigured: false, encryptionConfigured: true, secrets: { fromVault: ["TOKEN_ENCRYPTION_KEY", "CRON_SECRET"] }, time: "x" });
    if (path === "/sourcing/status") return Promise.resolve({ items: [{ key: "sources_active", label: "Sources actives", value: 1, scope: "org", hint: null }], offerCountsIncomplete: false });
    if (path === "/integrations") return Promise.resolve({ ebay: { configured: false, environment: null }, connections: [], unmappedCount: 0, comingSoon: [] });
    return Promise.reject(new Error("inattendu"));
  });
  const { client } = fakeSupabase({ organizations: { data: [{ id: "org-1" }] } });
  const checks = await runDiagnostics(client, ctx);
  expect(checks.map((c) => [c.key, c.state])).toEqual([
    ["db", "ok"],
    ["account", "ok"],
    ["server", "ok"],
    ["ai", "warning"],
    ["sourcing", "ok"],
    ["ebay", "warning"],
  ]);
  const text = JSON.stringify(checks);
  expect(text).not.toMatch(/TOKEN_ENCRYPTION_KEY|CRON_SECRET|service_role|Bearer/);
  expect(checks.find((c) => c.key === "ebay")!.detail).toMatch(/non configurées/);
});

it("diagnostic : serveur injoignable → erreur affichée, les autres contrôles continuent", async () => {
  mockCallApi.mockRejectedValue(new Error("Network request failed"));
  const { client } = fakeSupabase({ organizations: { data: [] } });
  const checks = await runDiagnostics(client, ctx);
  expect(checks.find((c) => c.key === "server")!.state).toBe("error");
  expect(checks.find((c) => c.key === "db")!.state).toBe("ok");
});

it("eBay : contrôle sans confirmation, publication avec confirmation explicite, déconnexion ciblée", async () => {
  mockCallApi.mockResolvedValue({});
  const draft = { sku: "A", marketplaceId: "EBAY_FR", title: "t", description: "d", categoryId: "9355", condition: "USED_GOOD", price: 10, currency: "EUR", quantity: 1, imageUrls: [], aspects: {} } as never;
  await checkEbayListing("org-1", draft);
  expect(mockCallApi).toHaveBeenLastCalledWith("/ebay/listings/check", expect.objectContaining({ method: "POST", body: { draft } }));
  await publishEbayListing("org-1", draft);
  expect(mockCallApi).toHaveBeenLastCalledWith("/ebay/listings/publish", expect.objectContaining({ body: { draft, confirm: true } }));
  await disconnectEbay("org-1", "conn-1");
  expect(mockCallApi).toHaveBeenLastCalledWith("/ebay/disconnect", expect.objectContaining({ method: "POST", organizationId: "org-1", body: { connectionId: "conn-1" } }));
});
