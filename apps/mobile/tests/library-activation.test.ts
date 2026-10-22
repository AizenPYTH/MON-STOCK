import { activateLibrarySource } from "~/data/sourcing-live";

const mockCallApi = jest.fn();
jest.mock("~/lib/api", () => ({ callApi: (...args: unknown[]) => mockCallApi(...args) }));

/** I-05 : validation de l'utilisateur ; page des conditions lue transmise quand MON STOCK ne l'a pas confirmée. */
describe("activation d'une source de la bibliothèque", () => {
  beforeEach(() => mockCallApi.mockReset().mockResolvedValue({ sourceId: "s", supplierId: "p", alreadyActive: false }));

  it("page des conditions confirmée : attestation seule (contrat inchangé)", async () => {
    await activateLibrarySource("org-1", "ebay-fr");
    expect(mockCallApi).toHaveBeenCalledWith("/sourcing/library/activate", { method: "POST", organizationId: "org-1", body: { key: "ebay-fr", attest: true } });
  });

  it("page non vérifiée : adresse de la page lue envoyée (espaces retirés)", async () => {
    await activateLibrarySource("org-1", "foneday", "  https://www.foneday.shop/pages/terms ");
    expect(mockCallApi).toHaveBeenCalledWith("/sourcing/library/activate", { method: "POST", organizationId: "org-1", body: { key: "foneday", attest: true, termsUrl: "https://www.foneday.shop/pages/terms" } });
  });
});
