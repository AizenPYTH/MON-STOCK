/**
 * W-01 : création d'organisation (réelle ou démo) depuis l'onboarding.
 * - la revalidation du layout racine précède TOUJOURS la redirection (sans elle, la réponse de
 *   l'action n'a pas d'en-tête `x-action-revalidated` et le routeur client peut réafficher
 *   l'onboarding à partir de son cache) ;
 * - une création répétée rapidement (même nom, même utilisateur) ouvre l'organisation existante
 *   au lieu d'en créer une seconde ;
 * - parcours v2 : une organisation RÉELLE mène au choix de plateforme (`/onboarding/plateforme`),
 *   une démonstration (données fictives) au tableau de bord.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NEW_ORG = "11111111-1111-4111-8111-111111111111";
const OLD_ORG = "22222222-2222-4222-8222-222222222222";

const state = {
  user: { id: ME, email: "me@example.test" } as { id: string; email: string } | null,
  recent: [] as Array<{ id: string; name: string; created_at: string; is_demo: boolean; created_by: string }>,
  recentError: null as { message: string } | null,
  events: [] as string[],
  rpcCalls: [] as Array<Record<string, unknown>>,
  filters: [] as Array<[string, string, unknown]>,
};

function orgQuery() {
  const filters: Array<[string, string, unknown]> = [];
  const b = {
    select: () => b,
    eq: (k: string, v: unknown) => (filters.push(["eq", k, v]), state.filters.push(["eq", k, v]), b),
    gte: (k: string, v: unknown) => (filters.push(["gte", k, v]), state.filters.push(["gte", k, v]), b),
    order: () => b,
    limit: () => b,
    update: (payload: unknown) => (state.events.push(`update:organizations:${JSON.stringify(payload)}`), b),
    then: (res: (v: unknown) => void) => {
      if (state.recentError) return res({ data: null, error: state.recentError });
      const rows = state.recent.filter((o) =>
        filters.every(([op, k, v]) => (op === "eq" ? (o as Record<string, unknown>)[k] === v : String((o as Record<string, unknown>)[k]) >= String(v))),
      );
      return res({ data: rows, error: null });
    },
  };
  return b;
}

function profileQuery() {
  const b = {
    update: (payload: { current_organization_id: string }) => (state.events.push(`profile:${payload.current_organization_id}`), b),
    eq: () => b,
    then: (res: (v: unknown) => void) => res({ data: null, error: null }),
  };
  return b;
}

const fakeClient = {
  auth: { getUser: async () => ({ data: { user: state.user } }) },
  from: (table: string) => (table === "organizations" ? orgQuery() : profileQuery()),
  rpc: async (_fn: string, args: Record<string, unknown>) => {
    state.rpcCalls.push(args);
    state.events.push("rpc:create");
    return { data: NEW_ORG, error: null };
  },
};

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => fakeClient }));
vi.mock("next/cache", () => ({ revalidatePath: (path: string, type?: string) => state.events.push(`revalidate:${path}:${type ?? ""}`) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    state.events.push(`redirect:${url}`);
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;push;${url};307;` });
  },
}));
vi.mock("@/features/demo/seed", () => ({ seedDemoOrganization: async () => void state.events.push("seed") }));

const { createOrganizationAction } = await import("@/features/organizations/actions");
const { createDemoOrganizationAction } = await import("@/features/demo/actions");
const { sameOrganizationName, DUPLICATE_CREATION_WINDOW_MS } = await import("@/features/organizations/creation-guard");

function form(data: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(data)) f.set(k, v);
  return f;
}

async function run(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    const digest = (e as { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_REDIRECT")) return digest.split(";")[2]!;
    throw e;
  }
}

beforeEach(() => {
  state.user = { id: ME, email: "me@example.test" };
  state.recent = [];
  state.recentError = null;
  state.events = [];
  state.rpcCalls = [];
  state.filters = [];
});

describe("createOrganizationAction (W-01)", () => {
  it("revalide le layout racine AVANT de rediriger vers l'étape « plateforme » du parcours", async () => {
    const to = await run(createOrganizationAction(null, form({ name: "Ma Boutique", country: "FR", default_currency: "EUR" })));
    expect(to).toBe("/onboarding/plateforme");
    const revalidate = state.events.indexOf("revalidate:/:layout");
    const redirect = state.events.indexOf("redirect:/onboarding/plateforme");
    expect(revalidate).toBeGreaterThan(-1);
    expect(revalidate).toBeLessThan(redirect);
    expect(state.events.indexOf("rpc:create")).toBeLessThan(revalidate);
    expect(state.rpcCalls).toHaveLength(1);
  });

  it("la recherche de doublon ne porte que sur les organisations récentes de CET utilisateur", async () => {
    await run(createOrganizationAction(null, form({ name: "Ma Boutique" })));
    expect(state.filters).toContainEqual(["eq", "created_by", ME]);
    expect(state.filters).toContainEqual(["eq", "is_demo", false]);
    const since = state.filters.find(([op, k]) => op === "gte" && k === "created_at")?.[2] as string;
    expect(Date.now() - Date.parse(since)).toBeGreaterThanOrEqual(DUPLICATE_CREATION_WINDOW_MS - 1000);
    expect(Date.now() - Date.parse(since)).toBeLessThanOrEqual(DUPLICATE_CREATION_WINDOW_MS + 1000);
  });

  it("répétition rapprochée du même nom : aucune seconde création, l'organisation existante est ouverte", async () => {
    state.recent = [{ id: OLD_ORG, name: "  ma   BOUTIQUE ", created_at: new Date().toISOString(), is_demo: false, created_by: ME }];
    const to = await run(createOrganizationAction(null, form({ name: "Ma Boutique" })));
    expect(to).toBe("/onboarding/plateforme");
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.events).toEqual([`profile:${OLD_ORG}`, "revalidate:/:layout", "redirect:/onboarding/plateforme"]);
  });

  it("autre nom (ou création ancienne) : nouvelle organisation créée", async () => {
    state.recent = [{ id: OLD_ORG, name: "Autre", created_at: new Date().toISOString(), is_demo: false, created_by: ME }];
    await run(createOrganizationAction(null, form({ name: "Ma Boutique" })));
    expect(state.rpcCalls).toHaveLength(1);
  });

  it("lecture du garde-fou en échec : la création n'est pas bloquée", async () => {
    state.recentError = { message: "boom" };
    expect(await run(createOrganizationAction(null, form({ name: "Ma Boutique" })))).toBe("/onboarding/plateforme");
    expect(state.rpcCalls).toHaveLength(1);
  });

  it("sans session : aucun appel, message clair", async () => {
    state.user = null;
    await expect(createOrganizationAction(null, form({ name: "X" }))).resolves.toMatchObject({ ok: false });
    expect(state.events).toEqual([]);
  });
});

describe("createDemoOrganizationAction (W-01)", () => {
  it("seed puis revalidation puis redirection vers le tableau de bord (pas d'étape plateforme pour une démo)", async () => {
    expect(await run(createDemoOrganizationAction(null, new FormData()))).toBe("/dashboard");
    expect(state.events.slice(-3)).toEqual(["seed", "revalidate:/:layout", "redirect:/dashboard"]);
  });

  it("démo déjà créée à l'instant : rouverte, pas de seconde démo", async () => {
    state.recent = [{ id: OLD_ORG, name: "Démonstration (données fictives)", created_at: new Date().toISOString(), is_demo: true, created_by: ME }];
    expect(await run(createDemoOrganizationAction(null, new FormData()))).toBe("/dashboard");
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.events).toEqual([`profile:${OLD_ORG}`, "revalidate:/:layout", "redirect:/dashboard"]);
  });
});

describe("sameOrganizationName", () => {
  it("ignore casse et espaces, distingue les noms différents", () => {
    expect(sameOrganizationName("Ma  Boutique", " ma boutique ")).toBe(true);
    expect(sameOrganizationName("Ma Boutique", "Ma Boutique 2")).toBe(false);
  });
});
