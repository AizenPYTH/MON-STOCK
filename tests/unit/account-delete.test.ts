import { describe, expect, it, vi } from "vitest";
import { deleteAccount, soleOwnerBlockers, type AccountDeletionPlanRow, type AccountDeletionPorts } from "@/services/account/delete-account";
import { dbErrorCode, supabaseAccountDeletionPorts } from "@/services/account/supabase-ports";
import { ACCOUNT_DELETE_CONFIRMATION, accountDeleteInputSchema } from "@/features/mobile-api/contract";
import { isAppError } from "@/lib/errors";
import { route } from "../../server/edge/api";

const USER = "11111111-1111-4111-8111-111111111111";

function row(p: Partial<AccountDeletionPlanRow> & { organizationId: string }): AccountDeletionPlanRow {
  return { organizationName: `Org ${p.organizationId}`, role: "owner", isDemo: false, otherMembers: 0, otherOwners: 0, hasOrders: false, activeChannelConnectionIds: [], activeSupplierConnections: 0, ...p };
}

/** Ports simulés : chaque appel est enregistré dans l'ordre. */
function fakePorts(plan: AccountDeletionPlanRow[], overrides: Partial<AccountDeletionPorts> = {}) {
  const calls: string[] = [];
  const ports: AccountDeletionPorts = {
    plan: vi.fn(async () => {
      calls.push("plan");
      return plan;
    }),
    deleteOrganizationAsUser: vi.fn(async (id: string) => {
      calls.push(`rpc:${id}`);
      return { ok: true } as const;
    }),
    disconnectChannel: vi.fn(async (id: string) => {
      calls.push(`disconnect:${id}`);
      return { revoked: true };
    }),
    deleteOrganizationForAccount: vi.fn(async (_u: string, id: string) => {
      calls.push(`procedure:${id}`);
      return { deleted: true, channelConnectionsDisconnected: 0 };
    }),
    deleteAccountData: vi.fn(async () => {
      calls.push("data");
      return { membershipsRemoved: 1, profileDeleted: true };
    }),
    deleteAuthUser: vi.fn(async () => {
      calls.push("auth");
    }),
    ...overrides,
  };
  return { ports, calls };
}

const log = () => ({ info: vi.fn(), warn: vi.fn() });

describe("contrat POST /account/delete", () => {
  it("exige le mot de confirmation exact (espaces autour tolérés)", () => {
    expect(accountDeleteInputSchema.safeParse({ confirmation: ` ${ACCOUNT_DELETE_CONFIRMATION} ` }).success).toBe(true);
    for (const bad of [undefined, "", "supprimer", "SUPPRIMER MON COMPTE", "OUI"]) {
      expect(accountDeleteInputSchema.safeParse({ confirmation: bad }).success, String(bad)).toBe(false);
    }
  });
});

describe("deleteAccount (orchestration, ports simulés)", () => {
  it("sans confirmation explicite : refus, aucun appel", async () => {
    const { ports, calls } = fakePorts([row({ organizationId: "a" })]);
    await expect(deleteAccount(ports, { userId: USER, confirmation: "oui" })).rejects.toMatchObject({ code: "VALIDATION" });
    expect(calls).toEqual([]);
  });

  it("seul propriétaire d'une organisation partagée : refus clair, RIEN n'est supprimé", async () => {
    const plan = [row({ organizationId: "solo" }), row({ organizationId: "shared", organizationName: "Boutique Lyon", otherMembers: 2, otherOwners: 0 })];
    const { ports, calls } = fakePorts(plan);
    const l = log();
    const err = await deleteAccount(ports, { userId: USER, confirmation: "SUPPRIMER" }, l).catch((e) => e);
    expect(isAppError(err)).toBe(true);
    expect(err.code).toBe("CONFLICT");
    expect(err.message).toContain("« Boutique Lyon »");
    expect(err.message).toContain("Rien n'a été supprimé");
    expect(calls).toEqual(["plan"]);
    // Journal : compteur seulement, jamais le nom de l'organisation ni l'identifiant.
    expect(JSON.stringify(l.info.mock.calls)).not.toMatch(/Boutique|1111/);
  });

  it("copropriétaire ou simple membre d'une organisation partagée : il la quitte, elle n'est pas supprimée", () => {
    expect(soleOwnerBlockers([row({ organizationId: "x", otherMembers: 3, otherOwners: 1 }), row({ organizationId: "y", role: "member", otherMembers: 1 })])).toEqual([]);
  });

  it("organisations dont il est le seul membre : RPC delete_organization (nom exact), puis données, puis compte Auth", async () => {
    const plan = [row({ organizationId: "a", organizationName: "Atelier" }), row({ organizationId: "shared", role: "member", otherMembers: 1 })];
    const { ports, calls } = fakePorts(plan);
    const r = await deleteAccount(ports, { userId: USER, confirmation: "SUPPRIMER" });
    expect(calls).toEqual(["plan", "rpc:a", "data", "auth"]);
    expect(ports.deleteOrganizationAsUser).toHaveBeenCalledWith("a", "Atelier");
    expect(ports.deleteAccountData).toHaveBeenCalledWith(USER);
    expect(ports.deleteAuthUser).toHaveBeenCalledWith(USER);
    expect(r).toEqual({ deleted: true, organizationsDeleted: 1, organizationsLeft: 1, channelConnectionsDisconnected: 0, remoteRevocationIncomplete: false });
  });

  it("garde-fous de la RPC (commandes, connexion) : révocation distante tentée puis procédure dédiée ; échec de révocation signalé, pas bloquant", async () => {
    const plan = [row({ organizationId: "shop", hasOrders: true, activeChannelConnectionIds: ["c1", "c2"] })];
    const { ports, calls } = fakePorts(plan, {
      deleteOrganizationAsUser: vi.fn(async () => ({ ok: false as const, code: "ORGANIZATION_HAS_ORDERS", message: "ORGANIZATION_HAS_ORDERS" })),
      disconnectChannel: vi.fn(async (id: string) => {
        calls.push(`disconnect:${id}`);
        if (id === "c2") throw new Error("eBay injoignable");
        return { revoked: false };
      }),
      deleteOrganizationForAccount: vi.fn(async (_u: string, id: string) => {
        calls.push(`procedure:${id}`);
        return { deleted: true, channelConnectionsDisconnected: 1 };
      }),
    });
    const l = log();
    const r = await deleteAccount(ports, { userId: USER, confirmation: "SUPPRIMER" }, l);
    expect(calls).toEqual(["plan", "disconnect:c1", "disconnect:c2", "procedure:shop", "data", "auth"]);
    expect(ports.deleteOrganizationForAccount).toHaveBeenCalledWith(USER, "shop");
    expect(r).toMatchObject({ organizationsDeleted: 1, channelConnectionsDisconnected: 2, remoteRevocationIncomplete: true });
    const logged = JSON.stringify(l.info.mock.calls);
    expect(logged).toContain("viaProcedure");
    expect(logged).not.toContain(USER);
    expect(logged).not.toContain("shop");
  });

  it("refus inattendu de la RPC : arrêt, ni données ni compte Auth supprimés", async () => {
    const { ports, calls } = fakePorts([row({ organizationId: "a" })], {
      deleteOrganizationAsUser: vi.fn(async () => ({ ok: false as const, code: null, message: "network down" })),
    });
    await expect(deleteAccount(ports, { userId: USER, confirmation: "SUPPRIMER" })).rejects.toMatchObject({ code: "INTERNAL" });
    expect(calls).toEqual(["plan"]);
    expect(ports.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("membre ajouté entre-temps : refus explicite", async () => {
    const { ports } = fakePorts([row({ organizationId: "a", organizationName: "Atelier" })], {
      deleteOrganizationAsUser: vi.fn(async () => ({ ok: false as const, code: "ORGANIZATION_HAS_MEMBERS", message: "ORGANIZATION_HAS_MEMBERS" })),
    });
    await expect(deleteAccount(ports, { userId: USER, confirmation: "SUPPRIMER" })).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("Atelier") });
    expect(ports.deleteOrganizationForAccount).not.toHaveBeenCalled();
  });

  it("compte sans organisation : profil et compte Auth supprimés", async () => {
    const { ports, calls } = fakePorts([]);
    const r = await deleteAccount(ports, { userId: USER, confirmation: "SUPPRIMER" });
    expect(calls).toEqual(["plan", "data", "auth"]);
    expect(r.organizationsDeleted).toBe(0);
  });
});

/** Client Supabase simulé : rpc + auth.admin.deleteUser. */
function fakeClient(responses: Record<string, { data?: unknown; error?: { message: string; code?: string } | null }>, deleteUserError: { status?: number; message: string } | null = null) {
  const rpc = vi.fn(async (fn: string) => ({ data: responses[fn]?.data ?? null, error: responses[fn]?.error ?? null }));
  const deleteUser = vi.fn(async () => ({ data: null, error: deleteUserError }));
  return { client: { rpc, auth: { admin: { deleteUser } } } as never, rpc, deleteUser };
}

describe("adaptateur Supabase (client simulé)", () => {
  it("transmet les bons paramètres et lit le plan", async () => {
    const admin = fakeClient({
      account_deletion_plan: { data: [{ organization_id: "o1", organization_name: "Atelier", role: "owner", is_demo: false, other_members: 0, other_owners: 0, has_orders: true, active_channel_connection_ids: ["c1"], active_supplier_connections: 2 }] },
      delete_account_organization: { data: { deleted: true, channel_connections_disconnected: 1 } },
      delete_account_data: { data: { memberships_removed: 2, profile_deleted: true } },
    });
    const user = fakeClient({ delete_organization: { error: { message: "ORGANIZATION_HAS_ORDERS", code: "55000" } } });
    const ports = supabaseAccountDeletionPorts({ user: user.client, admin: admin.client, disconnectChannel: async () => ({ revoked: true }) });
    expect(await ports.plan(USER)).toEqual([{ organizationId: "o1", organizationName: "Atelier", role: "owner", isDemo: false, otherMembers: 0, otherOwners: 0, hasOrders: true, activeChannelConnectionIds: ["c1"], activeSupplierConnections: 2 }]);
    expect(admin.rpc).toHaveBeenCalledWith("account_deletion_plan", { p_user_id: USER });
    expect(await ports.deleteOrganizationAsUser("o1", "Atelier")).toEqual({ ok: false, code: "ORGANIZATION_HAS_ORDERS", message: "ORGANIZATION_HAS_ORDERS" });
    expect(user.rpc).toHaveBeenCalledWith("delete_organization", { p_organization_id: "o1", p_confirmation: "Atelier" });
    expect(await ports.deleteOrganizationForAccount(USER, "o1")).toEqual({ deleted: true, channelConnectionsDisconnected: 1 });
    expect(admin.rpc).toHaveBeenCalledWith("delete_account_organization", { p_user_id: USER, p_organization_id: "o1" });
    expect(await ports.deleteAccountData(USER)).toEqual({ membershipsRemoved: 2, profileDeleted: true });
    await ports.deleteAuthUser(USER);
    expect(admin.deleteUser).toHaveBeenCalledWith(USER);
    // Le client de l'utilisateur ne sert QU'À la RPC soumise à ses droits.
    expect(user.rpc).toHaveBeenCalledTimes(1);
    expect(user.deleteUser).not.toHaveBeenCalled();
  });

  it("compte Auth déjà supprimé : reprise idempotente ; autre échec : message clair", async () => {
    const gone = fakeClient({}, { status: 404, message: "User not found" });
    await expect(supabaseAccountDeletionPorts({ user: gone.client, admin: gone.client, disconnectChannel: async () => ({ revoked: true }) }).deleteAuthUser(USER)).resolves.toBeUndefined();
    const down = fakeClient({}, { status: 500, message: "boom" });
    await expect(supabaseAccountDeletionPorts({ user: down.client, admin: down.client, disconnectChannel: async () => ({ revoked: true }) }).deleteAuthUser(USER)).rejects.toMatchObject({ code: "INTERNAL" });
  });

  it("erreur SQL traduite (jamais brute) ; code métier extrait du message", async () => {
    const admin = fakeClient({ delete_account_data: { error: { message: "ACCOUNT_SOLE_OWNER", code: "55000" } } });
    const ports = supabaseAccountDeletionPorts({ user: admin.client, admin: admin.client, disconnectChannel: async () => ({ revoked: true }) });
    await expect(ports.deleteAccountData(USER)).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("seul propriétaire") });
    expect(dbErrorCode({ message: "ORGANIZATION_HAS_CONNECTION" })).toBe("ORGANIZATION_HAS_CONNECTION");
    expect(dbErrorCode({ message: "permission denied for function x" })).toBeNull();
  });
});

describe("route Edge POST /account/delete", () => {
  it("sans jeton : 401, rien n'est appelé", async () => {
    const res = await route(new Request("https://x.supabase.co/functions/v1/api/account/delete", { method: "POST", body: JSON.stringify({ confirmation: "SUPPRIMER" }), headers: { "content-type": "application/json" } }));
    expect(res.status).toBe(401);
    const json = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(json).toMatchObject({ ok: false, error: { code: "AUTH_REQUIRED" } });
  });
  it("GET refusé (route inconnue)", async () => {
    const res = await route(new Request("https://x.supabase.co/functions/v1/api/account/delete", { method: "GET" }));
    expect(res.status).toBe(404);
  });
});
