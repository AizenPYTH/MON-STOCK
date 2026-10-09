import { permissionsFor, pickActiveOrganization, type Membership } from "~/org/org-service";

const m = (id: string, role: Membership["role"] = "member"): Membership => ({ role, organization: { id, name: id, slug: id, isDemo: false, currency: "EUR", settings: {} } });

describe("organisation active et permissions", () => {
  it("garde le choix mémorisé s'il est encore valide", () => {
    expect(pickActiveOrganization([m("a"), m("b")], "b", "a")?.organization.id).toBe("b");
  });

  it("ignore un choix mémorisé dont l'utilisateur n'est plus membre", () => {
    expect(pickActiveOrganization([m("a"), m("b")], "retirée", "a")?.organization.id).toBe("a");
    expect(pickActiveOrganization([m("a"), m("b")], "retirée", null)?.organization.id).toBe("a");
  });

  it("aucune organisation → null (écran de création)", () => {
    expect(pickActiveOrganization([], "x", "y")).toBeNull();
  });

  it("mêmes règles que le web : lecture seule pour viewer, administration pour owner/admin", () => {
    expect(permissionsFor("viewer")).toEqual({ canWrite: false, isAdmin: false });
    expect(permissionsFor("member")).toEqual({ canWrite: true, isAdmin: false });
    expect(permissionsFor("admin")).toEqual({ canWrite: true, isAdmin: true });
    expect(permissionsFor("owner")).toEqual({ canWrite: true, isAdmin: true });
  });
});
