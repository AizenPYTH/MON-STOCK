import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<{ write?: boolean; admin?: boolean }> = [];
const activate = vi.fn(async () => ({ sourceId: "s", supplierId: "p", alreadyActive: false }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/auth/dal", () => ({
  requireOrgContextForAction: vi.fn(async (opts: { write?: boolean; admin?: boolean } = {}) => {
    calls.push(opts);
    return { supabase: {}, organization: { id: "org-1" }, user: { id: "u1", email: "a@b.c" } };
  }),
}));
vi.mock("@/services/sourcing/source-library", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/services/sourcing/source-library")>();
  return {
    libraryActivateSchema: real.libraryActivateSchema,
    activateLibrarySource: (...args: unknown[]) => activate(...(args as [])),
    getLibrarySource: (key: string) => (key === "foneday" ? { name: "Foneday", termsUrl: "https://www.foneday.shop/policies/terms-of-service" } : null),
  };
});

describe("annuaire web : activation d'une source de la bibliothèque", () => {
  beforeEach(() => {
    calls.length = 0;
    activate.mockClear();
  });

  it("refuse sans attestation (comme l'Edge) et n'écrit rien", async () => {
    const { activateLibrarySourceAction } = await import("@/features/directory/actions");
    const fd = new FormData();
    fd.set("key", "foneday");
    expect(await activateLibrarySourceAction(null, fd)).toEqual({ ok: false, error: "Confirmez avoir lu les conditions d'utilisation de la source." });
    expect(activate).not.toHaveBeenCalled();
  });

  it("rédacteur requis ; validation de l'utilisateur connecté transmise (canal « web », page des conditions lue)", async () => {
    const { activateLibrarySourceAction } = await import("@/features/directory/actions");
    const fd = new FormData();
    fd.set("key", "foneday");
    fd.set("attest", "on");
    fd.set("termsUrl", "https://www.foneday.shop/pages/terms");
    expect(await activateLibrarySourceAction(null, fd)).toEqual({ ok: true, data: { message: "Foneday activée : elle sera interrogée à chaque recherche." } });
    expect(calls).toEqual([{ write: true }]);
    const [ctx, key, review, channel] = activate.mock.calls[0] as unknown as [{ user: { id: string } }, string, { termsUrl: string | null }, string];
    expect(ctx.user.id).toBe("u1");
    expect([key, review.termsUrl, channel]).toEqual(["foneday", "https://www.foneday.shop/pages/terms", "web"]);
  });

  it("adresse de la page des conditions invalide : refusée avant toute écriture", async () => {
    const { activateLibrarySourceAction } = await import("@/features/directory/actions");
    const fd = new FormData();
    fd.set("key", "foneday");
    fd.set("attest", "on");
    fd.set("termsUrl", "pas une adresse");
    expect(await activateLibrarySourceAction(null, fd)).toEqual({ ok: false, error: "Adresse de la page des conditions invalide." });
    expect(activate).not.toHaveBeenCalled();
  });
});
