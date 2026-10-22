/**
 * D-04 / I-07 : un compte eBay n'alimente qu'UNE organisation (par environnement), y compris face à
 * deux callbacks OAuth concurrents ; I-02 : date limite de déduction des ventes fixée à la PREMIÈRE
 * connexion et conservée lors d'une reconnexion. upsertOAuthConnection réel contre PostgreSQL local.
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import type { AccountInfo, TokenSet } from "@/integrations/core/types";
import { AppError } from "@/lib/errors";
import { canConnect } from "./helpers";
import { closePool, createFixture, q, setTestEnv } from "./sync-harness";

setTestEnv();

vi.mock("@/lib/supabase/admin", async () => {
  const h = await import("./sync-harness");
  const client = h.createPgRestClient();
  return { createAdminSupabaseClient: () => client };
});
vi.mock("@/integrations/core/registry", async () => {
  const h = await import("./sync-harness");
  return { getConnector: () => h.fakeConnector(), getEbayConnector: () => h.fakeConnector(), listConnectorCatalog: () => [] };
});

const { upsertOAuthConnection, disconnectConnection } = await import("@/services/channels/connection-store");

const available = await canConnect();
const d = available ? describe : describe.skip;

afterAll(async () => {
  await closePool();
});

const tokens = (): TokenSet => ({ accessToken: "v^1.1#access", accessTokenExpiresAt: new Date(Date.now() + 7_200_000), refreshToken: "v^1.1#refresh", refreshTokenExpiresAt: new Date(Date.now() + 86_400_000), tokenType: "User Access Token" });
const account = (id: string): AccountInfo => ({ externalAccountId: id, username: `pseudo-${id}`, accountType: "BUSINESS", registrationMarketplaceId: "EBAY_FR" });

async function externalAccountOf(connectionId: string): Promise<string> {
  const [row] = await q<{ external_account_id: string }>("select external_account_id from public.channel_connections where id = $1", [connectionId]);
  return row!.external_account_id;
}
async function channelsOf(orgId: string): Promise<number> {
  const [row] = await q<{ n: number }>("select count(*)::int as n from public.sales_channels where organization_id = $1 and provider = 'ebay'", [orgId]);
  return row!.n;
}

d("D-04 : un compte eBay, une seule organisation", () => {
  it("compte déjà relié (même environnement) à une autre organisation : erreur métier explicite, rien n'est créé ; sandbox indépendant ; après déconnexion, la connexion est permise", async () => {
    const a = await createFixture();
    const b = await createFixture();
    const shared = await externalAccountOf(a.connectionId);
    const channelsBefore = await channelsOf(b.orgId);

    const err = await upsertOAuthConnection({ organizationId: b.orgId, userId: b.userId, provider: "ebay", environment: "production", account: account(shared), tokens: tokens(), scopes: [] }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: "CONFLICT", details: { reason: "ACCOUNT_LINKED_ELSEWHERE" } });
    expect((err as AppError).message).toMatch(/déjà relié à une autre organisation MON STOCK/);
    expect((err as AppError).message).not.toContain(a.orgId);
    expect(await channelsOf(b.orgId)).toBe(channelsBefore);

    // Le même identifiant en sandbox est un autre compte (environnement distinct) : permis.
    const sandbox = await upsertOAuthConnection({ organizationId: b.orgId, userId: b.userId, provider: "ebay", environment: "sandbox", account: account(shared), tokens: tokens(), scopes: [] });
    expect(sandbox.isNew).toBe(true);

    // L'organisation A déconnecte le compte : B peut alors le relier en production.
    await disconnectConnection(a.connectionId, a.orgId);
    const moved = await upsertOAuthConnection({ organizationId: b.orgId, userId: b.userId, provider: "ebay", environment: "production", account: account(shared), tokens: tokens(), scopes: [] });
    expect(moved.connection).toMatchObject({ organization_id: b.orgId, status: "connected", environment: "production", external_account_id: shared });
  });

  it("deux callbacks concurrents de deux organisations pour un compte neuf : exactement une connexion, l'autre reçoit l'erreur métier (sans canal orphelin)", async () => {
    const a = await createFixture();
    const b = await createFixture();
    const fresh = `race-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const before = (await channelsOf(a.orgId)) + (await channelsOf(b.orgId));
    const results = await Promise.allSettled([a, b].map((f) => upsertOAuthConnection({ organizationId: f.orgId, userId: f.userId, provider: "ebay", environment: "production", account: account(fresh), tokens: tokens(), scopes: [] })));
    const ok = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({ code: "CONFLICT", details: { reason: "ACCOUNT_LINKED_ELSEWHERE" } });
    const [count] = await q<{ n: number }>("select count(*)::int as n from public.channel_connections where external_account_id = $1 and status <> 'disconnected'", [fresh]);
    expect(count!.n).toBe(1);
    expect((await channelsOf(a.orgId)) + (await channelsOf(b.orgId))).toBe(before + 1);
  });

  it("la base elle-même refuse une seconde connexion active pour le même compte (index unique partiel)", async () => {
    const a = await createFixture();
    const b = await createFixture();
    const shared = await externalAccountOf(a.connectionId);
    await expect(q("update public.channel_connections set external_account_id = $1 where id = $2", [shared, b.connectionId])).rejects.toMatchObject({ code: "23505" });
    // Une connexion déconnectée ne compte pas.
    await q("update public.channel_connections set status = 'disconnected' where id = $1", [a.connectionId]);
    await q("update public.channel_connections set external_account_id = $1 where id = $2", [shared, b.connectionId]);
  });
});

d("I-02 : date limite de déduction des ventes", () => {
  it("fixée à la première connexion, conservée à la reconnexion (expiration) du même compte", async () => {
    const f = await createFixture();
    const id = `first-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const t0 = Date.now();
    const first = await upsertOAuthConnection({ organizationId: f.orgId, userId: f.userId, provider: "ebay", environment: "production", account: account(id), tokens: tokens(), scopes: [] });
    const cutoff = first.connection.sales_stock_cutoff_at!;
    expect(new Date(cutoff).getTime()).toBeGreaterThanOrEqual(t0 - 1000);
    await q("update public.channel_connections set status = 'expired', sales_stock_cutoff_at = $2 where id = $1", [first.connection.id, "2026-09-01T00:00:00.000Z"]);
    const again = await upsertOAuthConnection({ organizationId: f.orgId, userId: f.userId, provider: "ebay", environment: "production", account: account(id), tokens: tokens(), scopes: [] });
    expect(again.isNew).toBe(false);
    expect(again.connection.id).toBe(first.connection.id);
    expect(again.connection.status).toBe("connected");
    // Les ventes faites pendant l'expiration restent déduites : la date n'est PAS repoussée.
    expect(again.connection.sales_stock_cutoff_at).toBe("2026-09-01T00:00:00.000Z");
  });
});
