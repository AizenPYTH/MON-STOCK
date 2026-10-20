import { beforeEach, describe, expect, it, vi } from "vitest";
import { credentialFieldName, credentialsFromFormData } from "@/features/pro-accounts/credentials";

const calls: Array<{ write?: boolean; admin?: boolean }> = [];
const connectProAccount = vi.fn(async (_ctx: unknown, input: { key: string; credentials: Record<string, string> }) => ({ connectionId: "c1", ok: input.credentials.apiKey === "good", message: input.credentials.apiKey === "good" ? "Connexion vérifiée." : "Identifiants refusés par le fournisseur." }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/auth/dal", () => ({
  requireOrgContextForAction: vi.fn(async (opts: { write?: boolean; admin?: boolean } = {}) => {
    calls.push(opts);
    return { organization: { id: "org-1" }, user: { id: "u1" } };
  }),
}));
vi.mock("@/services/sourcing/pro-accounts", () => ({
  connectProAccount: (ctx: unknown, input: { key: string; credentials: Record<string, string> }) => connectProAccount(ctx, input),
  syncProAccount: vi.fn(async () => ({ status: "failed", message: "Le fournisseur ne répond pas." })),
  disconnectProAccount: vi.fn(async () => ({ message: "Compte déconnecté : identifiants supprimés." })),
}));

describe("comptes pro web : identifiants du formulaire", () => {
  it("ne garde que les champs « cred.* », bornés comme l'Edge", () => {
    const fd = new FormData();
    fd.set("key", "bigbuy");
    fd.set(credentialFieldName("apiKey"), "x".repeat(2500));
    fd.set(credentialFieldName(""), "vide");
    fd.set("cred.secret", "s");
    expect(credentialsFromFormData(fd)).toEqual({ apiKey: "x".repeat(2000), secret: "s" });
  });
});

describe("comptes pro web : droits identiques à l'Edge et identifiants jamais renvoyés", () => {
  beforeEach(() => {
    calls.length = 0;
    connectProAccount.mockClear();
  });
  const connectionId = "00000000-0000-4000-8000-00000000000a";

  it("connexion = rédacteur ; seul le verdict du test serveur revient", async () => {
    const { connectProAccountAction } = await import("@/features/pro-accounts/actions");
    const fd = new FormData();
    fd.set("key", "bigbuy");
    fd.set(credentialFieldName("apiKey"), "good");
    const r = await connectProAccountAction(null, fd);
    expect(r).toEqual({ ok: true, data: { ok: true, message: "Connexion vérifiée." } });
    expect(JSON.stringify(r)).not.toContain("good");
    expect(connectProAccount).toHaveBeenCalledWith(expect.anything(), { key: "bigbuy", credentials: { apiKey: "good" } });
    const refused = await connectProAccountAction(null, (fd.set(credentialFieldName("apiKey"), "bad"), fd));
    expect(refused).toEqual({ ok: true, data: { ok: false, message: "Identifiants refusés par le fournisseur." } });
    expect(calls).toEqual([{ write: true }, { write: true }]);
  });

  it("synchronisation = rédacteur ; déconnexion = administrateur", async () => {
    const { syncProAccountAction, disconnectProAccountAction } = await import("@/features/pro-accounts/actions");
    const fd = new FormData();
    fd.set("connectionId", connectionId);
    expect(await syncProAccountAction(null, fd)).toEqual({ ok: true, data: { ok: false, message: "Le fournisseur ne répond pas." } });
    expect(await disconnectProAccountAction(null, fd)).toEqual({ ok: true, data: { ok: true, message: "Compte déconnecté : identifiants supprimés." } });
    expect(calls).toEqual([{ write: true }, { admin: true }]);
  });

  it("refuse un identifiant de connexion invalide sans appeler le service", async () => {
    const { syncProAccountAction } = await import("@/features/pro-accounts/actions");
    const fd = new FormData();
    fd.set("connectionId", "pas-un-uuid");
    expect(await syncProAccountAction(null, fd)).toEqual({ ok: false, error: "Connexion invalide." });
  });
});
