/** W-20 : identifiants validés (UUID) avant toute requête ; pas de succès si aucune ligne n'est touchée. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type Response } from "./helpers/fake-supabase";

const fake = { current: fakeSupabase() };
vi.mock("@/features/auth/dal", () => ({ requireOrgContextForAction: async () => ({ organization: { id: "org" }, user: { id: "u" }, supabase: fake.current.client }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { toggleAlertAction, deleteAlertAction, unlinkOfferAction, markAlertEventsSeenAction, suggestMatchesAction } = await import("@/features/sourcing/actions");

const ID = "11111111-1111-4111-8111-111111111111";
const form = (data: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(data)) f.set(k, v);
  return f;
};
const use = (responses: Record<string, Response>) => (fake.current = fakeSupabase(responses));

beforeEach(() => use({}));

describe("alertes de sourcing", () => {
  it("identifiant invalide : refus clair, aucune requête", async () => {
    for (const bad of ["", "1 or 1=1", "abc"]) {
      expect(await toggleAlertAction(null, form({ alert_id: bad, active: "false" }))).toMatchObject({ ok: false });
      expect(await deleteAlertAction(null, form({ alert_id: bad }))).toMatchObject({ ok: false });
    }
    expect(await markAlertEventsSeenAction(null, form({ alert_id: "pas-un-uuid" }))).toMatchObject({ ok: false });
    expect(fake.current.queries).toEqual([]);
  });

  it("aucune ligne modifiée (autre organisation, déjà supprimée) : pas de faux succès", async () => {
    use({ sourcing_alerts: { data: [], error: null } });
    expect(await toggleAlertAction(null, form({ alert_id: ID, active: "false" }))).toMatchObject({ ok: false, error: expect.stringContaining("introuvable") });
    expect(await deleteAlertAction(null, form({ alert_id: ID }))).toMatchObject({ ok: false });
  });

  it("ligne modifiée : succès, filtré par organisation, nombre de lignes contrôlé", async () => {
    use({ sourcing_alerts: { data: [{ id: ID }], error: null } });
    expect(await toggleAlertAction(null, form({ alert_id: ID, active: "true" }))).toEqual({ ok: true, data: { message: "Alerte réactivée." } });
    const calls = fake.current.queries[0]!.calls;
    expect(calls).toContainEqual({ method: "eq", args: ["organization_id", "org"] });
    expect(calls).toContainEqual({ method: "eq", args: ["id", ID] });
    expect(calls.some((c) => c.method === "select")).toBe(true);
  });

  it("marquer comme vus sans alerte précise reste possible", async () => {
    expect(await markAlertEventsSeenAction(null, form({}))).toMatchObject({ ok: true });
  });
});

describe("offres", () => {
  it("dissociation / suggestions : identifiant invalide refusé sans requête", async () => {
    expect(await unlinkOfferAction(null, form({ offer_id: "x" }))).toMatchObject({ ok: false, error: "Offre introuvable." });
    expect(await suggestMatchesAction("../../etc")).toMatchObject({ ok: false });
    expect(fake.current.queries).toEqual([]);
  });
});
