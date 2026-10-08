/**
 * Cycle de vie des tokens eBay (connection-store) contre la base réelle :
 * rafraîchissement anticipé, forcé, invalid_grant, refresh token expiré, concurrence
 * (même processus et compare-and-set entre processus), déconnexion / reconnexion pendant
 * un rafraîchissement, secret indéchiffrable. Connecteur simulé : aucun appel eBay.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectorError, connectorErrorToAppError } from "@/integrations/core/errors";
import type { TokenSet } from "@/integrations/core/types";
import { canConnect } from "./helpers";
import { closePool, createFixture, createPgRestClient, fakeConnector, q, resetFakeConnector, setTestEnv } from "./sync-harness";

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

const { getValidAccessToken, disconnectConnection } = await import("@/services/channels/connection-store");
const { decryptSecret, encryptSecret } = await import("@/lib/crypto");

const available = await canConnect();
const d = available ? describe : describe.skip;

afterAll(async () => {
  await closePool();
});
beforeEach(() => {
  resetFakeConnector();
});

function tokens(access: string, expiresInMs = 7_200_000): TokenSet {
  return { accessToken: access, accessTokenExpiresAt: new Date(Date.now() + expiresInMs), refreshToken: null, refreshTokenExpiresAt: null, tokenType: "User Access Token" };
}

async function stored(connectionId: string) {
  const [row] = await q<{ access_token_enc: string | null; refresh_token_enc: string | null; token_expires_at: string | null; status: string; refresh_token_expires_at: string | null }>(
    `select s.access_token_enc, s.refresh_token_enc, c.token_expires_at, c.status, c.refresh_token_expires_at
       from public.channel_connections c left join public.channel_connection_secrets s on s.connection_id = c.id where c.id = $1`,
    [connectionId],
  );
  return row!;
}

async function openAlerts(orgId: string) {
  return q<{ type: string; severity: string; action_href: string; message: string }>("select type, severity, action_href, message from public.alerts where organization_id = $1 and status <> 'resolved'", [orgId]);
}

d("tokens eBay : cycle de vie", () => {
  it("token encore valide (> 5 min) : renvoyé sans rafraîchissement", async () => {
    const f = await createFixture({ secrets: { access: "access-1", refresh: "refresh-1" }, tokenExpiresAt: new Date(Date.now() + 3_600_000) });
    expect(await getValidAccessToken(f.connectionId)).toBe("access-1");
    expect(fakeConnector().calls.refresh).toBe(0);
  });

  it("rafraîchit AVANT l'expiration (marge de 5 min) et enregistre le nouveau token chiffré avec sa date", async () => {
    const f = await createFixture({ secrets: { access: "access-old", refresh: "refresh-1" }, tokenExpiresAt: new Date(Date.now() + 2 * 60_000) });
    fakeConnector().refresh = async (rt) => {
      expect(rt).toBe("refresh-1");
      return tokens("access-new");
    };
    expect(await getValidAccessToken(f.connectionId)).toBe("access-new");
    const s = await stored(f.connectionId);
    expect(s.access_token_enc).not.toContain("access-new");
    expect(decryptSecret(s.access_token_enc!)).toBe("access-new");
    expect(decryptSecret(s.refresh_token_enc!)).toBe("refresh-1");
    expect(new Date(s.token_expires_at!).getTime()).toBeGreaterThan(Date.now() + 7_000_000);
    // Appel suivant : le token enregistré est réutilisé.
    expect(await getValidAccessToken(f.connectionId)).toBe("access-new");
    expect(fakeConnector().calls.refresh).toBe(1);
  });

  it("rafraîchissement forcé (après un 401) même si le token semble valide", async () => {
    const f = await createFixture({ secrets: { access: "access-revoked", refresh: "refresh-1" }, tokenExpiresAt: new Date(Date.now() + 3_600_000) });
    fakeConnector().refresh = async () => tokens("access-forced");
    expect(await getValidAccessToken(f.connectionId, { forceRefresh: true })).toBe("access-forced");
    expect(fakeConnector().calls.refresh).toBe(1);
  });

  it("invalid_grant : statut 'expired', alerte critique « Reconnecter », erreur CONNECTION_EXPIRED avec action", async () => {
    const f = await createFixture({ secrets: { access: "a", refresh: "revoked-refresh" }, tokenExpiresAt: new Date(Date.now() - 1000) });
    fakeConnector().refresh = async () => {
      throw new ConnectorError("AUTH_EXPIRED", "ebay", "L'autorisation eBay n'est plus valide (le token a expiré ou a été révoqué). Reconnectez votre compte eBay.", { details: { oauthError: "invalid_grant" }, retryable: false });
    };
    const err = await getValidAccessToken(f.connectionId).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConnectorError);
    expect((err as ConnectorError).code).toBe("AUTH_EXPIRED");
    const app = connectorErrorToAppError(err as ConnectorError);
    expect(app.code).toBe("CONNECTION_EXPIRED");
    expect(app.action).toEqual({ label: "Reconnecter eBay", href: "/settings/integrations" });
    expect((await stored(f.connectionId)).status).toBe("expired");
    const alerts = await openAlerts(f.orgId);
    expect(alerts).toEqual([expect.objectContaining({ type: "connection_expired", severity: "critical", action_href: "/settings/integrations" })]);
    expect(alerts[0]!.message).toMatch(/Reconnectez votre compte eBay/);
  });

  it("refresh token expiré (date eBay ~18 mois dépassée) : aucun appel eBay, connexion expirée", async () => {
    const f = await createFixture({ secrets: { access: "a", refresh: "r" }, tokenExpiresAt: new Date(Date.now() - 1000), refreshExpiresAt: new Date(Date.now() - 1000) });
    await expect(getValidAccessToken(f.connectionId)).rejects.toMatchObject({ code: "AUTH_EXPIRED", message: expect.stringMatching(/18 mois/) });
    expect(fakeConnector().calls.refresh).toBe(0);
    expect((await stored(f.connectionId)).status).toBe("expired");
  });

  it("le rafraîchissement ne modifie pas la date d'expiration du refresh token", async () => {
    const refreshExpiry = new Date(Date.now() + 400 * 86_400_000);
    const f = await createFixture({ secrets: { access: "a", refresh: "r" }, tokenExpiresAt: new Date(Date.now() - 1000), refreshExpiresAt: refreshExpiry });
    fakeConnector().refresh = async () => tokens("fresh");
    await getValidAccessToken(f.connectionId);
    expect(new Date((await stored(f.connectionId)).refresh_token_expires_at!).getTime()).toBe(refreshExpiry.getTime());
  });

  it("appels simultanés dans un même processus : UN seul rafraîchissement eBay", async () => {
    const f = await createFixture({ secrets: { access: "a", refresh: "r" }, tokenExpiresAt: new Date(Date.now() - 1000) });
    let n = 0;
    fakeConnector().refresh = async () => {
      n++;
      await new Promise((r) => setTimeout(r, 100));
      return tokens(`shared-${n}`);
    };
    const results = await Promise.all(Array.from({ length: 5 }, () => getValidAccessToken(f.connectionId)));
    expect(new Set(results)).toEqual(new Set(["shared-1"]));
    expect(fakeConnector().calls.refresh).toBe(1);
  });

  it("compare-and-set entre processus : un token plus ancien n'écrase pas un plus récent ; token et date restent cohérents", async () => {
    const f = await createFixture({ secrets: { access: "a", refresh: "r" }, tokenExpiresAt: new Date(Date.now() - 1000) });
    const admin = createPgRestClient();
    const s = await stored(f.connectionId);
    const later = new Date(Date.now() + 7_200_000);
    const earlier = new Date(Date.now() + 7_000_000);
    const first = await admin.rpc("store_refreshed_access_token", { p_connection_id: f.connectionId, p_access_token_enc: encryptSecret("process-B"), p_expires_at: later.toISOString(), p_refresh_token_enc_used: s.refresh_token_enc });
    const second = await admin.rpc("store_refreshed_access_token", { p_connection_id: f.connectionId, p_access_token_enc: encryptSecret("process-A"), p_expires_at: earlier.toISOString(), p_refresh_token_enc_used: s.refresh_token_enc });
    expect([first.data, second.data]).toEqual(["stored", "stale"]);
    const after = await stored(f.connectionId);
    expect(decryptSecret(after.access_token_enc!)).toBe("process-B");
    expect(new Date(after.token_expires_at!).getTime()).toBe(later.getTime());

    // Écritures réellement simultanées (deux connexions) : toujours un couple token/date cohérent.
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        admin.rpc("store_refreshed_access_token", {
          p_connection_id: f.connectionId,
          p_access_token_enc: encryptSecret(`parallel-${i}`),
          p_expires_at: new Date(later.getTime() + (i + 1) * 1000).toISOString(),
          p_refresh_token_enc_used: s.refresh_token_enc,
        }),
      ),
    );
    expect(results.every((r) => r.error === null)).toBe(true);
    const final = await stored(f.connectionId);
    const winner = Number(decryptSecret(final.access_token_enc!).split("-")[1]);
    expect(new Date(final.token_expires_at!).getTime()).toBe(later.getTime() + (winner + 1) * 1000);
    expect(winner).toBe(7);
  });

  it("déconnexion pendant un rafraîchissement : aucun secret ressuscité, la connexion reste « déconnectée »", async () => {
    const f = await createFixture({ secrets: { access: "a", refresh: "r" }, tokenExpiresAt: new Date(Date.now() - 1000) });
    fakeConnector().refresh = async () => {
      await disconnectConnection(f.connectionId, f.orgId);
      return tokens("too-late");
    };
    await expect(getValidAccessToken(f.connectionId)).rejects.toMatchObject({ code: "AUTH_EXPIRED", message: expect.stringMatching(/déconnectée/) });
    const s = await stored(f.connectionId);
    expect(s.status).toBe("disconnected");
    expect(s.access_token_enc).toBeNull();
    expect(s.refresh_token_enc).toBeNull();
    expect(await openAlerts(f.orgId)).toEqual([]);
  });

  it("reconnexion pendant un rafraîchissement : les nouveaux tokens ne sont pas écrasés", async () => {
    const f = await createFixture({ secrets: { access: "a", refresh: "old-refresh" }, tokenExpiresAt: new Date(Date.now() - 1000) });
    fakeConnector().refresh = async () => {
      // L'utilisateur reconnecte le compte : nouveau couple de tokens enregistré.
      await q("update public.channel_connection_secrets set access_token_enc = $2, refresh_token_enc = $3 where connection_id = $1", [f.connectionId, encryptSecret("reconnect-access"), encryptSecret("reconnect-refresh")]);
      await q("update public.channel_connections set token_expires_at = now() + interval '2 hours' where id = $1", [f.connectionId]);
      return tokens("from-old-refresh");
    };
    expect(await getValidAccessToken(f.connectionId)).toBe("reconnect-access");
    const s = await stored(f.connectionId);
    expect(decryptSecret(s.access_token_enc!)).toBe("reconnect-access");
    expect(decryptSecret(s.refresh_token_enc!)).toBe("reconnect-refresh");
  });

  it("invalid_grant obtenu avec l'ANCIEN refresh token après une reconnexion : la connexion n'est pas marquée expirée", async () => {
    const f = await createFixture({ secrets: { access: "a", refresh: "old-refresh" }, tokenExpiresAt: new Date(Date.now() - 1000) });
    fakeConnector().refresh = async () => {
      await q("update public.channel_connection_secrets set access_token_enc = $2, refresh_token_enc = $3 where connection_id = $1", [f.connectionId, encryptSecret("new-access"), encryptSecret("new-refresh")]);
      await q("update public.channel_connections set token_expires_at = now() + interval '2 hours' where id = $1", [f.connectionId]);
      throw new ConnectorError("AUTH_EXPIRED", "ebay", "invalid_grant", { retryable: false });
    };
    expect(await getValidAccessToken(f.connectionId)).toBe("new-access");
    expect((await stored(f.connectionId)).status).toBe("connected");
  });

  it("secret indéchiffrable (TOKEN_ENCRYPTION_KEY changée) : message clair, connexion expirée, alerte", async () => {
    const f = await createFixture({ secrets: { access: "a", refresh: "r" }, tokenExpiresAt: new Date(Date.now() + 3_600_000) });
    // Chiffré avec une autre clé : même format, authentification GCM invalide.
    await q("update public.channel_connection_secrets set access_token_enc = $2 where connection_id = $1", [f.connectionId, "v1:AAAAAAAAAAAAAAAA:QUJDREVGRw==:AAAAAAAAAAAAAAAAAAAAAA=="]);
    const err = await getValidAccessToken(f.connectionId).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "AUTH_EXPIRED" });
    expect((err as Error).message).toMatch(/ne peuvent pas être déchiffrés.*TOKEN_ENCRYPTION_KEY.*Reconnectez/);
    expect((await stored(f.connectionId)).status).toBe("expired");
    expect((await openAlerts(f.orgId))[0]).toMatchObject({ type: "connection_expired", severity: "critical" });
  });

  it("store_refreshed_access_token est réservée au service_role", async () => {
    const f = await createFixture({ secrets: { access: "a", refresh: "r" } });
    const { connect, asUser } = await import("./helpers");
    const c = await connect();
    try {
      await c.query("begin");
      await asUser(c, f.userId);
      await expect(c.query("select public.store_refreshed_access_token($1, 'x', now(), 'y')", [f.connectionId])).rejects.toThrow(/permission denied|FORBIDDEN/);
    } finally {
      await c.query("rollback");
      await c.end();
    }
  });
});
