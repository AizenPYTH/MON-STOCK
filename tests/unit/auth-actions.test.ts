/**
 * Couche applicative : authentification et autorisation des Server Actions d'administration
 * (DAL, membres, changement d'organisation, connexion). Supabase est simulé : on vérifie
 * les décisions de l'application AVANT toute écriture (la base les double, voir tests d'intégration).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
interface Call {
  table: string;
  op: "select" | "update" | "delete" | "insert";
  filters: Array<[string, unknown]>;
  payload?: unknown;
}

const state = {
  user: null as { id: string; email: string } | null,
  memberships: [] as Array<{ organization_id: string; role: string }>,
  members: [] as Array<{ organization_id: string; user_id: string; role: string }>,
  currentOrg: null as string | null,
  calls: [] as Call[],
  signInError: null as { message: string } | null,
};

function query(table: string) {
  const call: Call = { table, op: "select", filters: [] };
  const resolveRows = (): Row[] => {
    const f = Object.fromEntries(call.filters);
    if (table === "organization_members") {
      return state.members.filter((m) => Object.entries(f).every(([k, v]) => (m as Row)[k] === v)) as Row[];
    }
    if (table === "user_profiles") return state.user ? [{ user_id: state.user.id, email: state.user.email, full_name: null, current_organization_id: state.currentOrg }] : [];
    if (table === "organizations") return [{ id: f["id"], name: "Org", slug: "org", is_demo: false, settings: {}, default_currency: "EUR" }];
    return [];
  };
  const builder: Record<string, unknown> = {
    select: (cols?: string, opts?: { head?: boolean }) => {
      if (call.op === "select" && table === "organization_members" && cols?.includes("organization:organizations")) {
        // Chargement des adhésions par le DAL.
        builder["then"] = (res: (v: unknown) => void) =>
          res({ data: state.memberships.map((m) => ({ role: m.role, organization: { id: m.organization_id, name: "Org", slug: "org", is_demo: false } })), error: null });
      }
      if (opts?.head) {
        builder["then"] = (res: (v: unknown) => void) => res({ count: resolveRows().length, data: null, error: null });
      }
      return builder;
    },
    update: (payload: unknown) => {
      call.op = "update";
      call.payload = payload;
      state.calls.push(call);
      return builder;
    },
    delete: () => {
      call.op = "delete";
      state.calls.push(call);
      return builder;
    },
    insert: (payload: unknown) => {
      call.op = "insert";
      call.payload = payload;
      state.calls.push(call);
      return builder;
    },
    eq: (k: string, v: unknown) => {
      call.filters.push([k, v]);
      return builder;
    },
    is: () => builder,
    order: () => builder,
    maybeSingle: async () => ({ data: resolveRows()[0] ?? null, error: null }),
    single: async () => ({ data: resolveRows()[0] ?? null, error: null }),
    then: (res: (v: unknown) => void) => res({ data: call.op === "select" ? resolveRows() : resolveRows().slice(0, 1), error: null }),
  };
  return builder;
}

const fakeClient = {
  auth: {
    getUser: async () => ({ data: { user: state.user } }),
    signInWithPassword: async () => ({ error: state.signInError }),
  },
  from: (table: string) => query(table),
  rpc: async () => ({ data: null, error: null }),
};

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => fakeClient }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { requireOrgContextForAction, SESSION_EXPIRED_MESSAGE } = await import("@/features/auth/dal");
const { changeMemberRoleAction, removeMemberAction, revokeInvitationAction, switchOrganizationAction, acceptInvitationAction } = await import("@/features/organizations/actions");
const { signInAction } = await import("@/features/auth/actions");

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MEMBER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function as(role: string | null) {
  state.user = role === null ? null : { id: ME, email: "me@example.test" };
  state.memberships = role === null || role === "none" ? [] : [{ organization_id: ORG, role }];
  state.currentOrg = role === null || role === "none" ? null : ORG;
  state.members = [
    ...(role && role !== "none" ? [{ organization_id: ORG, user_id: ME, role }] : []),
    { organization_id: ORG, user_id: OWNER, role: "owner" },
    { organization_id: ORG, user_id: MEMBER, role: "member" },
  ];
}

async function redirectOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const digest = (e as { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_REDIRECT")) return digest.split(";")[2]!;
    throw e;
  }
  throw new Error("aucune redirection");
}

function form(data: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(data)) f.set(k, v);
  return f;
}

const writes = () => state.calls.filter((c) => c.op !== "select");

beforeEach(() => {
  state.calls = [];
  state.signInError = null;
});

describe("requireOrgContextForAction", () => {
  it("session expirée : message clair et lien de reconnexion (pas de crash)", async () => {
    as(null);
    await expect(requireOrgContextForAction()).rejects.toMatchObject({ code: "AUTH_REQUIRED", message: SESSION_EXPIRED_MESSAGE, action: { href: "/login" } });
  });
  it("sans organisation : refus explicite", async () => {
    as("none");
    await expect(requireOrgContextForAction()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("viewer : écriture refusée ; member : administration refusée ; admin : accepté", async () => {
    as("viewer");
    await expect(requireOrgContextForAction({ write: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    as("member");
    await expect(requireOrgContextForAction({ admin: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    as("admin");
    await expect(requireOrgContextForAction({ admin: true, write: true })).resolves.toMatchObject({ role: "admin" });
  });
});

describe("Actions de gestion des membres", () => {
  it("session expirée : retour à la connexion avec la page d'origine, aucune écriture", async () => {
    as(null);
    const to = await redirectOf(changeMemberRoleAction(form({ user_id: MEMBER, role: "viewer" })));
    expect(to).toBe("/login?error=session_expired&next=%2Fsettings%2Fusers");
    expect(writes()).toEqual([]);
  });

  it("un membre ou un viewer ne gère personne", async () => {
    for (const role of ["member", "viewer"]) {
      as(role);
      expect(await redirectOf(changeMemberRoleAction(form({ user_id: MEMBER, role: "viewer" })))).toBe("/settings/users?status=forbidden");
      expect(await redirectOf(removeMemberAction(form({ user_id: MEMBER })))).toBe("/settings/users?status=forbidden");
      expect(await redirectOf(revokeInvitationAction(form({ id: OWNER })))).toBe("/settings/users?status=forbidden");
    }
    expect(writes()).toEqual([]);
  });

  it("personne ne modifie son propre rôle ni ne se retire depuis la page", async () => {
    as("admin");
    expect(await redirectOf(changeMemberRoleAction(form({ user_id: ME, role: "owner" })))).toBe("/settings/users?status=self_role");
    expect(await redirectOf(removeMemberAction(form({ user_id: ME })))).toBe("/settings/users?status=self_remove");
    expect(writes()).toEqual([]);
  });

  it("un admin ne touche pas au rôle propriétaire", async () => {
    as("admin");
    expect(await redirectOf(changeMemberRoleAction(form({ user_id: MEMBER, role: "owner" })))).toBe("/settings/users?status=owner_only");
    expect(await redirectOf(changeMemberRoleAction(form({ user_id: OWNER, role: "member" })))).toBe("/settings/users?status=owner_only");
    expect(await redirectOf(removeMemberAction(form({ user_id: OWNER })))).toBe("/settings/users?status=owner_only");
    expect(writes()).toEqual([]);
  });

  it("entre propriétaires : l'un peut rétrograder l'autre, écriture limitée à l'organisation courante", async () => {
    as("admin");
    state.members = state.members.map((m) => (m.user_id === ME ? { ...m, role: "owner" } : m));
    state.memberships = [{ organization_id: ORG, role: "owner" }];
    // Deux propriétaires (ME et OWNER) : rétrograder OWNER est permis.
    expect(await redirectOf(changeMemberRoleAction(form({ user_id: OWNER, role: "admin" })))).toBe("/settings/users?status=role_updated");
    expect(writes().map((c) => [c.table, c.op])).toEqual([["organization_members", "update"]]);
    expect(writes()[0]!.filters).toEqual([
      ["organization_id", ORG],
      ["user_id", OWNER],
    ]);
  });

  it("les identifiants invalides sont refusés sans requête d'écriture", async () => {
    as("owner");
    expect(await redirectOf(changeMemberRoleAction(form({ user_id: "pas-un-uuid", role: "viewer" })))).toBe("/settings/users?status=invalid");
    expect(await redirectOf(changeMemberRoleAction(form({ user_id: MEMBER, role: "superadmin" })))).toBe("/settings/users?status=invalid");
    expect(await redirectOf(revokeInvitationAction(form({ id: "1 or 1=1" })))).toBe("/settings/users?status=invalid");
    expect(writes()).toEqual([]);
  });
});

describe("Changement d'organisation", () => {
  it("vers une organisation dont on n'est pas membre : aucune écriture", async () => {
    as("member");
    expect(await redirectOf(switchOrganizationAction(form({ organization_id: OTHER_ORG })))).toBe("/dashboard");
    expect(writes()).toEqual([]);
  });
  it("vers une organisation dont on est membre : profil mis à jour", async () => {
    as("member");
    expect(await redirectOf(switchOrganizationAction(form({ organization_id: ORG })))).toBe("/dashboard");
    expect(writes()).toEqual([{ table: "user_profiles", op: "update", filters: [["user_id", ME]], payload: { current_organization_id: ORG } }]);
  });
  it("sans session : connexion", async () => {
    as(null);
    expect(await redirectOf(switchOrganizationAction(form({ organization_id: ORG })))).toBe("/login?error=session_expired");
  });
});

describe("Invitations et connexion", () => {
  it("accepter une invitation sans session renvoie vers la connexion puis l'invitation", async () => {
    as(null);
    const token = "a".repeat(48);
    expect(await redirectOf(acceptInvitationAction(form({ token })))).toBe(`/login?error=session_expired&next=${encodeURIComponent(`/invite/${token}`)}`);
  });

  it("la connexion ne redirige jamais hors de l'application", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "anon";
    for (const next of ["/\\evil.example", "//evil.example", "https://evil.example", "/\t/evil.example"]) {
      expect(await redirectOf(signInAction(null, form({ email: "me@example.test", password: "x", next })))).toBe("/dashboard");
    }
    expect(await redirectOf(signInAction(null, form({ email: "me@example.test", password: "x", next: "/invite/abc" })))).toBe("/invite/abc");
  });
});
