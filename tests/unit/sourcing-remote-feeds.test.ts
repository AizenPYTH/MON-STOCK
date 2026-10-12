import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryDb, type MemoryDb } from "./helpers/memory-db";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({ TOKEN_ENCRYPTION_KEY: "k".repeat(44), SOURCING_USER_AGENT: "MonStockBot/1.0 (+https://monstock.example)" }) }));
let db: MemoryDb;
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: () => db.client }));

const { createRemoteFeed, previewRemoteFeed, remoteFeedCreateSchema, remoteFeedPreviewSchema } = await import("@/services/sourcing/remote-feeds");
const { ingestFeed } = await import("@/services/sourcing/feed-ingestion");

const ORG = "11111111-1111-4111-8111-111111111111";
const PUBLIC = async () => [{ address: "93.184.216.34" }];
const CSV = ["SKU;Description;EAN;Price;Stock;MOQ;Grade", "TPH-1;Apple iPhone 14 128GB Midnight;0194253401018;429,00;7;2;A", "TPH-2;Samsung Galaxy S23 256GB Black;;389,00;0;1;B"].join("\n");
const ctx = () => ({ supabase: db.client, user: { id: "u1" }, organization: { id: ORG, default_currency: "EUR" }, role: "owner" }) as never;

beforeEach(() => {
  db = memoryDb({ organizations: [{ id: ORG, default_currency: "EUR" }] });
});

describe("flux distant autorisé", () => {
  it("aperçu : CSV lu avec l'en-tête d'authentification, mapping proposé, rien d'enregistré", async () => {
    const fetchImpl = vi.fn(async (_u: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe("secret-123");
      return new Response(CSV, { status: 200, headers: { "content-type": "text/csv" } });
    });
    const input = remoteFeedPreviewSchema.parse({ url: "https://feed.example.com/stocklist.csv", format: "csv", auth: { kind: "header", name: "X-Api-Key", value: "secret-123" } });
    const p = await previewRemoteFeed(ctx(), input, { fetchImpl: fetchImpl as never, resolver: PUBLIC });
    expect(p.mapping).toMatchObject({ supplier_sku: "SKU", title: "Description", ean: "EAN", price: "Price", available_quantity: "Stock", moq: "MOQ", grade: "Grade" });
    expect(p.validCount).toBe(2);
    expect(Object.keys(db.tables).filter((t) => (db.tables[t] ?? []).length > 0)).toEqual(["organizations"]);
  });

  it("refus : HTTP non chiffré, identifiants dans l'URL, adresse privée, page HTML, accès refusé", async () => {
    expect(remoteFeedPreviewSchema.safeParse({ url: "http://feed.example.com/a.csv", format: "csv" }).success).toBe(false);
    expect(remoteFeedPreviewSchema.safeParse({ url: "https://user:pw@feed.example.com/a.csv", format: "csv" }).success).toBe(false);
    expect(remoteFeedPreviewSchema.safeParse({ url: "https://127.0.0.1/a.csv", format: "csv" }).success).toBe(false);
    const ok = remoteFeedPreviewSchema.parse({ url: "https://feed.example.com/a.csv", format: "csv" });
    const never = vi.fn();
    await expect(previewRemoteFeed(ctx(), ok, { fetchImpl: never as never, resolver: async () => [{ address: "10.1.2.3" }] })).rejects.toThrow();
    expect(never).not.toHaveBeenCalled();
    await expect(previewRemoteFeed(ctx(), ok, { fetchImpl: (async () => new Response("<html></html>", { headers: { "content-type": "text/html" } })) as never, resolver: PUBLIC })).rejects.toMatchObject({ message: expect.stringMatching(/page web/) });
    await expect(previewRemoteFeed(ctx(), ok, { fetchImpl: (async () => new Response("no", { status: 401 })) as never, resolver: PUBLIC })).rejects.toMatchObject({ message: expect.stringMatching(/refuse l'accès \(HTTP 401\)/) });
    expect(remoteFeedPreviewSchema.safeParse({ url: "https://feed.example.com/a.csv", format: "csv", auth: { kind: "header", name: "Cookie: x", value: "y" } }).success).toBe(false);
  });

  it("création : attestation obligatoire, identifiants chiffrés (jamais en clair), source planifiée ; synchronisation avec l'en-tête", async () => {
    const base = { url: "https://feed.example.com/stocklist.csv", format: "csv", auth: { kind: "basic", username: "reseller", password: "p@ss" }, mapping: { supplier_sku: "SKU", title: "Description", ean: "EAN", price: "Price", available_quantity: "Stock", moq: "MOQ", grade: "Grade" }, defaults: { currency: "EUR", taxType: "ht" }, supplierName: "ThePhoneHub" };
    expect(remoteFeedCreateSchema.safeParse(base).success).toBe(false);
    const input = remoteFeedCreateSchema.parse({ ...base, attest: true });
    const r = await createRemoteFeed(ctx(), input, db.client, new Date("2026-10-13T10:00:00Z"));
    const source = db.tables.supplier_sources!.find((s) => s.id === r.sourceId)!;
    expect(source).toMatchObject({ source_type: "CSV", automated_access_confirmed: true, sync_frequency: "daily", next_run_at: "2026-10-13T10:00:00.000Z", config: { kind: "remote_feed", mode: "snapshot" } });
    expect(String(source.access_conditions)).toMatch(/Accord du fournisseur attesté par l'utilisateur u1 le 2026-10-13/);
    const secret = db.tables.supplier_feed_secrets![0]!;
    expect(String(secret.credentials_enc)).not.toContain("p@ss");
    expect(JSON.stringify(db.tables.supplier_feeds)).not.toContain("p@ss");

    const seen: string[] = [];
    const fetchImpl = vi.fn(async (_u: string, init: RequestInit) => {
      seen.push((init.headers as Record<string, string>).Authorization ?? "");
      return new Response(CSV, { status: 200, headers: { "content-type": "text/csv" } });
    });
    const res = await ingestFeed(r.feedId, { trigger: "manual", admin: db.client, fetchImpl: fetchImpl as never, resolver: PUBLIC, mode: "snapshot" });
    expect(seen[0]).toBe(`Basic ${btoa("reseller:p@ss")}`);
    expect(res).toMatchObject({ status: "success", created: 2, mode: "snapshot" });
    expect(db.tables.sourcing_offers!.find((o) => o.external_offer_id === "TPH-2")).toMatchObject({ available_quantity: 0, stock_status: "out_of_stock" });
  });
});
