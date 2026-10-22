/**
 * W-07 / W-28 : organisation affichée par l'onglet transmise aux actions et vérifiée côté serveur ;
 * plus de bascule silencieuse vers la première adhésion.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DISPLAYED_ORGANIZATION_HEADER, parseDisplayedOrganization, withDisplayedOrganization, wrapFetchWithDisplayedOrganization } from "@/lib/displayed-organization";

const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_X = "11111111-1111-4111-8111-111111111111";
const ORG_Y = "22222222-2222-4222-8222-222222222222";
const ORG_Z = "33333333-3333-4333-8333-333333333333";
const NAMES: Record<string, string> = { [ORG_X]: "Boutique X", [ORG_Y]: "Boutique Y", [ORG_Z]: "Boutique Z" };

const state = {
  memberships: [] as Array<{ organization_id: string; role: string }>,
  currentOrg: null as string | null,
  header: null as string | null,
  inserts: [] as Array<{ table: string; payload: unknown }>,
};

function query(table: string) {
  const filters: Record<string, unknown> = {};
  const b: Record<string, unknown> = {
    select: (cols?: string) => {
      if (table === "organization_members" && cols?.includes("organization:organizations")) {
        b["then"] = (res: (v: unknown) => void) =>
          res({ data: state.memberships.map((m) => ({ role: m.role, organization: { id: m.organization_id, name: NAMES[m.organization_id], slug: "s", is_demo: false } })), error: null });
      }
      return b;
    },
    eq: (k: string, v: unknown) => ((filters[k] = v), b),
    insert: (payload: unknown) => (state.inserts.push({ table, payload }), b),
    maybeSingle: async () => (table === "user_profiles" ? { data: { user_id: ME, email: "me@x.test", full_name: null, current_organization_id: state.currentOrg }, error: null } : { data: null, error: null }),
    single: async () => {
      if (table === "organizations") return { data: { id: filters["id"], name: NAMES[String(filters["id"])], slug: "s", is_demo: false, settings: {}, default_currency: "EUR" }, error: null };
      return { data: { id: "new-id" }, error: null };
    },
    then: (res: (v: unknown) => void) => res({ data: [], error: null }),
  };
  return b;
}

const fakeClient = { auth: { getUser: async () => ({ data: { user: { id: ME, email: "me@x.test" } } }) }, from: (t: string) => query(t) };

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => fakeClient }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(state.header === null ? {} : { [DISPLAYED_ORGANIZATION_HEADER]: state.header }),
  cookies: async () => ({ getAll: () => [], set: () => undefined }),
}));

const { requireOrgContextForAction, assertDisplayedOrganization, resolveOrgContext } = await import("@/features/auth/dal");
const { createSupplierAction } = await import("@/features/suppliers/actions");

beforeEach(() => {
  state.memberships = [
    { organization_id: ORG_X, role: "member" },
    { organization_id: ORG_Y, role: "admin" },
  ];
  state.currentOrg = ORG_Y;
  state.header = null;
  state.inserts = [];
});

describe("en-tête d'organisation affichée (navigateur)", () => {
  const origin = "https://app.example";
  it("ajouté aux écritures vers le site uniquement", () => {
    const post = withDisplayedOrganization("/stock", { method: "POST", headers: { accept: "text/x-component" } }, ORG_X, origin);
    expect(new Headers(post?.headers).get(DISPLAYED_ORGANIZATION_HEADER)).toBe(ORG_X);
    expect(new Headers(post?.headers).get("accept")).toBe("text/x-component");
    expect(withDisplayedOrganization("/stock", undefined, ORG_X, origin)).toBeUndefined(); // GET
    expect(withDisplayedOrganization("https://evil.example/x", { method: "POST" }, ORG_X, origin)).toBeUndefined();
    expect(withDisplayedOrganization("/stock", { method: "POST" }, null, origin)).toBeUndefined();
    const req = new Request(`${origin}/api/advisor/chat`, { method: "POST", headers: { "content-type": "application/json" } });
    const fromRequest = withDisplayedOrganization(req, undefined, ORG_X, origin);
    expect(new Headers(fromRequest?.headers).get("content-type")).toBe("application/json");
    expect(new Headers(fromRequest?.headers).get(DISPLAYED_ORGANIZATION_HEADER)).toBe(ORG_X);
  });

  it("fetch enveloppé : l'organisation courante de l'onglet est lue à chaque appel", async () => {
    const seen: Array<string | null> = [];
    const base = vi.fn(async (_i: RequestInfo | URL, init?: RequestInit) => (seen.push(new Headers(init?.headers).get(DISPLAYED_ORGANIZATION_HEADER)), new Response("ok")));
    let current: string | null = ORG_X;
    const wrapped = wrapFetchWithDisplayedOrganization(base as unknown as typeof fetch, () => current, () => "https://app.example");
    await wrapped("/a", { method: "POST" });
    current = ORG_Y;
    await wrapped("/a", { method: "POST" });
    await wrapped("/a");
    expect(seen).toEqual([ORG_X, ORG_Y, null]);
  });

  it("valeur falsifiée ignorée", () => {
    expect(parseDisplayedOrganization("1 or 1=1")).toBeNull();
    expect(parseDisplayedOrganization(` ${ORG_X.toUpperCase()} `)).toBe(ORG_X);
  });
});

describe("requireOrgContextForAction et organisation affichée (W-07)", () => {
  it("sans en-tête (formulaire sans JavaScript) : comportement inchangé", async () => {
    await expect(requireOrgContextForAction({ write: true })).resolves.toMatchObject({ organization: { id: ORG_Y }, role: "admin" });
  });

  it("onglet sur l'organisation active : accepté", async () => {
    state.header = ORG_Y;
    await expect(requireOrgContextForAction({ admin: true })).resolves.toMatchObject({ organization: { id: ORG_Y } });
  });

  it("onglet resté sur X alors que Y a été choisie ailleurs : refus clair, quel que soit le rôle", async () => {
    state.header = ORG_X;
    for (const opts of [{}, { write: true }, { admin: true }]) {
      await expect(requireOrgContextForAction(opts)).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("« Boutique X »") });
    }
    await expect(requireOrgContextForAction()).rejects.toMatchObject({ message: expect.stringContaining("« Boutique Y »") });
  });

  it("onglet sur une organisation dont on n'est plus membre : refus", async () => {
    state.header = ORG_Z;
    await expect(requireOrgContextForAction()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("le rôle reste vérifié dans l'organisation active (lecteur)", async () => {
    state.memberships = [{ organization_id: ORG_Y, role: "viewer" }];
    state.header = ORG_Y;
    await expect(requireOrgContextForAction({ write: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("une vraie action d'écriture n'écrit rien dans l'autre organisation", async () => {
    state.header = ORG_X;
    const form = new FormData();
    form.set("name", "Grossiste");
    form.set("currency", "EUR");
    const r = await createSupplierAction(null, form);
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("changée dans un autre onglet") });
    expect(state.inserts).toEqual([]);
  });

  it("assertDisplayedOrganization : comparaison insensible à la casse", () => {
    const ctx = { organization: { id: ORG_Y, name: "Boutique Y" }, memberships: [] } as unknown as Parameters<typeof assertDisplayedOrganization>[0];
    expect(() => assertDisplayedOrganization(ctx, ORG_Y)).not.toThrow();
    expect(() => assertDisplayedOrganization(ctx, null)).not.toThrow();
  });
});

describe("organisation mémorisée perdue (W-28)", () => {
  it("adhésion retirée (profil remis à null) : première adhésion retenue ET signalée", async () => {
    state.currentOrg = null;
    const ctx = await resolveOrgContext(fakeClient as never, { id: ME } as never);
    expect(ctx).toMatchObject({ organization: { id: ORG_X }, fallback: true });
  });
  it("organisation mémorisée accessible : pas de signalement", async () => {
    const ctx = await resolveOrgContext(fakeClient as never, { id: ME } as never);
    expect(ctx).toMatchObject({ organization: { id: ORG_Y }, fallback: false });
  });
  it("organisation demandée explicitement (mobile) hors adhésions : refus, jamais de repli", async () => {
    expect(await resolveOrgContext(fakeClient as never, { id: ME } as never, ORG_Z)).toBeNull();
  });
});
