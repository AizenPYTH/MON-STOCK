import { classifyOffer, sampleOf } from "~/data/sourcing-live";
import { callApi } from "~/lib/api";

jest.mock("~/lib/config", () => ({ appConfig: { ok: true, config: { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "sb_publishable_test", appEnv: "TEST" } } }));
const mockGetSession = jest.fn();
jest.mock("~/lib/supabase", () => ({ requireSupabase: () => ({ auth: { getSession: mockGetSession } }) }));

const now = new Date("2026-10-10T10:00:00Z");
const base = { quantityAvailable: null, stockStatus: "unknown", provenance: null, lastSeenAt: null } as const;

describe("classe honnête d'une offre", () => {
  it("disponibilité vérifiée : quantité fournie par la source et relevé < 24 h", () => {
    expect(classifyOffer({ ...base, quantityAvailable: 12, stockStatus: "in_stock", provenance: { method: "public_json", adapterKey: "shopify-storefront", retrievedAt: "2026-10-10T08:00:00Z" } }, now)).toBe("verified");
    // quantité mais relevé ancien → publiée tout au plus
    expect(classifyOffer({ ...base, quantityAvailable: 12, stockStatus: "in_stock", provenance: { method: "public_json", adapterKey: "x", retrievedAt: "2026-10-07T08:00:00Z" } }, now)).toBe("published");
  });
  it("offre publiée : relevée en direct (API officielle, page publique) sans quantité", () => {
    expect(classifyOffer({ ...base, provenance: { method: "official_api", adapterKey: "ebay-browse", retrievedAt: "2026-10-10T09:59:00Z" } }, now)).toBe("published");
  });
  it("prix indicatif : flux, saisie manuelle, ou relevé de plus de 7 jours", () => {
    expect(classifyOffer({ ...base, provenance: { method: "manual", adapterKey: null, retrievedAt: "2026-10-10T09:00:00Z" } }, now)).toBe("indicative");
    expect(classifyOffer({ ...base, provenance: { method: "public_html", adapterKey: "sitemap-jsonld", retrievedAt: "2026-09-01T09:00:00Z" } }, now)).toBe("indicative");
    expect(classifyOffer(base, now)).toBe("indicative");
  });
  it("exemples de vérification : uniquement des entrées bien formées", () => {
    const entry = { check: { sample: [{ title: "Ecran iPhone 13", price: 79.9, currency: "EUR" }, { nope: 1 }, null] } } as never;
    expect(sampleOf(entry)).toEqual([{ title: "Ecran iPhone 13", price: 79.9, currency: "EUR" }]);
  });
});

describe("appels au serveur MON STOCK", () => {
  beforeEach(() => mockGetSession.mockReset());

  it("jeton en Bearer, organisation en en-tête, paramètres dans la requête ; données renvoyées", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: "user-jwt" } } });
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify({ ok: true, data: { total: 1 } }), { status: 200 }));
    const r = await callApi<{ total: number }>("/sourcing/search", { organizationId: "org-1", query: { q: "iphone 13", live: "1", sku: undefined }, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).toEqual({ total: 1 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://proj.supabase.co/functions/v1/api/sourcing/search?q=iphone+13&live=1");
    expect(init.headers).toMatchObject({ Authorization: "Bearer user-jwt", "x-organization-id": "org-1", apikey: "sb_publishable_test" });
  });

  it("erreur métier du serveur → message rédigé pour l'utilisateur", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: "t" } } });
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify({ ok: false, error: { code: "FORBIDDEN", message: "Cette action est réservée aux administrateurs de l'organisation." } }), { status: 403 }));
    await expect(callApi("/ebay/connect", { method: "POST", fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toThrow(/administrateurs/);
  });

  it("sans session → reconnexion demandée, aucun appel réseau", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const fetchImpl = jest.fn();
    await expect(callApi("/integrations", { fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toThrow(/reconnectez-vous/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("réseau coupé → message hors ligne ; 5xx non JSON → serveur indisponible", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: "t" } } });
    await expect(callApi("/x", { fetchImpl: (async () => { throw new TypeError("Network request failed"); }) as unknown as typeof fetch })).rejects.toThrow(/Connexion internet indisponible/);
    await expect(callApi("/x", { fetchImpl: (async () => new Response("<html>", { status: 502 })) as unknown as typeof fetch })).rejects.toThrow(/momentanément indisponible/);
  });
});
