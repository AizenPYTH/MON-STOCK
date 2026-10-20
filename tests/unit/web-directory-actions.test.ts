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
vi.mock("@/services/sourcing/source-library", () => ({
  activateLibrarySourceFor: (...args: unknown[]) => activate(...(args as [])),
  getLibrarySource: (key: string) => (key === "foneday" ? { name: "Foneday", termsUrl: "https://www.foneday.shop/policies/terms-of-service" } : null),
}));

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

  it("rédacteur requis ; attestation datée et tracée « site web »", async () => {
    const { activateLibrarySourceAction } = await import("@/features/directory/actions");
    const fd = new FormData();
    fd.set("key", "foneday");
    fd.set("attest", "on");
    expect(await activateLibrarySourceAction(null, fd)).toEqual({ ok: true, data: { message: "Foneday activée : elle sera interrogée à chaque recherche." } });
    expect(calls).toEqual([{ write: true }]);
    const [, org, key, attestation] = activate.mock.calls[0] as unknown as [unknown, string, string, string];
    expect([org, key]).toEqual(["org-1", "foneday"]);
    expect(attestation).toMatch(/terms-of-service.*a@b\.c le \d{4}-\d{2}-\d{2}T.*\(site web\)/);
  });
});
