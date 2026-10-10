import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { mailtoLink, mappingIssues, pickCatalogFile, taxTypeOf, withTaxType } from "~/data/suppliers-pro";
import { parseSetting, saveOffer } from "~/data/radar";
import { fakeSupabase } from "./fake-supabase";

/**
 * Sourcing professionnel (mobile) : sélection de fichier (limites), association des colonnes,
 * offres enregistrées (prix figé), paramètres de coûts « inconnu ≠ 0 », écrans radar et import
 * rendus avec des réponses serveur simulées.
 */
const mockCallApi = jest.fn();
jest.mock("~/lib/api", () => ({ callApi: (...a: unknown[]) => mockCallApi(...a) }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("~/org/org-provider", () => ({ useActiveOrg: () => ({ active: { organization: { id: "org-1", name: "Boutique", currency: "EUR" } }, permissions: { canWrite: true, isAdmin: true } }) }));
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true }, useLocalSearchParams: () => ({ supplierName: "Foneday" }) }));
jest.mock("~/lib/supabase", () => ({ requireSupabase: () => ({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }) }) }) }) }));

// Premier rendu d'écran : chargement des modules (React Query, UI) — délai élargi.
jest.setTimeout(30_000);
beforeEach(() => mockCallApi.mockReset());

describe("fichier fournisseur", () => {
  it("sélection : annulation, taille, .xls refusé, contenu base64 transmis", async () => {
    const picker = jest.fn();
    picker.mockResolvedValueOnce({ canceled: true, assets: null });
    expect(await pickCatalogFile(picker)).toBeNull();
    picker.mockResolvedValueOnce({ canceled: false, assets: [{ name: "gros.csv", size: 16 * 1024 * 1024, base64: "AA==" }] });
    await expect(pickCatalogFile(picker)).rejects.toThrow(/15 Mo/);
    picker.mockResolvedValueOnce({ canceled: false, assets: [{ name: "vieux.xls", size: 10, base64: "AA==" }] });
    await expect(pickCatalogFile(picker)).rejects.toThrow(/\.xlsx ou \.csv/);
    picker.mockResolvedValueOnce({ canceled: false, assets: [{ name: "tarifs.xlsx", size: 2048, base64: "UEsDBA==" }] });
    expect(await pickCatalogFile(picker)).toEqual({ name: "tarifs.xlsx", size: 2048, base64: "UEsDBA==" });
    expect(picker.mock.calls.at(-1)![0]).toMatchObject({ base64: true, multiple: false });
  });

  it("mapping minimal exigé ; type de prix porté par le mapping", () => {
    expect(mappingIssues({})).toHaveLength(3);
    expect(mappingIssues({ ean: "EAN", title: "Désignation", price: "Prix HT" })).toEqual([]);
    expect(taxTypeOf({ tax_type: { const: "ht" } })).toBe("ht");
    expect(withTaxType({ price: "P", tax_type: { const: "ht" } }, "unknown")).toEqual({ price: "P" });
    expect(withTaxType({ price: "P" }, "ttc")).toEqual({ price: "P", tax_type: { const: "ttc" } });
  });

  it("e-mail de demande d'accès : lien mailto encodé, sans destinataire imposé", () => {
    const l = mailtoLink({ subject: "Compte pro & tarifs", body: "Bonjour,\nMerci" });
    expect(l.startsWith("mailto:?subject=Compte%20pro%20%26%20tarifs&body=Bonjour%2C%0AMerci")).toBe(true);
  });
});

describe("radar", () => {
  it("paramètre vide = inconnu (null), jamais 0 ; valeur invalide signalée", () => {
    expect(parseSetting("")).toBeNull();
    expect(parseSetting("12,9")).toBe(12.9);
    expect(parseSetting("0")).toBe(0);
    expect(parseSetting("-3")).toBe("invalid");
    expect(parseSetting("abc")).toBe("invalid");
  });

  it("offre enregistrée : prix et devise du moment, déjà enregistrée = sans erreur", async () => {
    const { client, queries } = fakeSupabase({ sourcing_saved_offers: { data: null, error: null } });
    await saveOffer(client, "org-1", { offerId: "o1", price: 300, currency: "eur" }, "  à comparer ");
    expect(queries[0]!.calls[0]).toEqual({ method: "insert", args: [{ organization_id: "org-1", offer_id: "o1", price_at_save: 300, currency_at_save: "EUR", note: "à comparer" }] });
    const dup = fakeSupabase({ sourcing_saved_offers: { error: { code: "23505", message: "duplicate" } } });
    await expect(saveOffer(dup.client, "org-1", { offerId: "o1", price: 300, currency: "EUR" })).resolves.toBeUndefined();
  });
});

function wrap(node: React.ReactElement) {
  const { QueryClient, QueryClientProvider } = jest.requireActual("@tanstack/react-query");
  const { SafeAreaProvider } = jest.requireActual("react-native-safe-area-context");
  const { ToastProvider } = jest.requireActual("~/components/ui");
  // gcTime infini : aucun minuteur de nettoyage ne survit au test.
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  return (
    <QueryClientProvider client={qc}>
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
        <ToastProvider>{node}</ToastProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

const evaluation = {
  status: "estimated",
  revenue: 600,
  revenueBasis: "avg_sale_30d",
  revenueExVat: 500,
  purchaseCost: 300,
  landedCost: 310,
  grossMargin: 190,
  estimatedProfit: 106,
  marginPercent: 17.67,
  breakdown: [],
  missing: ["emballage"],
  cautions: [],
  reasons: ["Meilleur prix parmi 2 offres (écart 40.00)."],
  freshness: "fresh",
  ageDays: 0,
  score: 70,
};
const radarResponse = {
  items: [{ supplierId: "sup", sku: { id: "s1", code: "IP13", name: "iPhone 13 · 128 Go", currency: "EUR", units30d: 6, quantityAvailable: 1 }, offer: { offerId: "o1", supplierName: "Grossiste A", supplierCountry: "FR", title: "iPhone 13", sourceUrl: null, price: 300, currency: "EUR", taxType: "ht", shippingCost: 20, moq: 2, availableQuantity: 5, stockStatus: "in_stock", lastSeenAt: "2026-10-10T08:00:00Z", priceOrigin: "catalog_import", previousPrice: null, saved: false }, savedAt: null, priceAtSave: null, evaluation, offersForSku: 2 }],
  restock: [{ skuId: "s1", code: "IP13", name: "iPhone 13 · 128 Go", quantityAvailable: 1, units30d: 6, daysOfCover: 5, bestOfferId: "o1", bestPrice: 300, bestSupplier: "Grossiste A" }],
  settings: {},
  settingsFromChannel: [],
  missingSettings: ["emballage"],
  counts: { profitable: 0, estimated: 1, unprofitable: 0, insufficient: 0, unlinkedOffers: 0, skus: 2 },
  computedAt: "2026-10-10T12:00:00Z",
};

it("écran radar : estimation partielle affichée comme telle (≈), réapprovisionnement, coûts manquants", async () => {
  mockCallApi.mockImplementation((path: string) => Promise.resolve(path === "/radar" ? radarResponse : []));
  const Screen = jest.requireActual("~/app/(app)/radar/index").default;
  render(wrap(<Screen />));
  await waitFor(() => expect(screen.getByText("Radar d'opportunités")).toBeTruthy());
  expect(screen.getByText("Estimation partielle")).toBeTruthy();
  expect(screen.getAllByText(/≈ 106,00/).length).toBeGreaterThan(0);
  expect(screen.getByText(/Prix importé d'un catalogue fournisseur/)).toBeTruthy();
  expect(screen.getByText(/À réapprovisionner \(1\)/)).toBeTruthy();
  expect(screen.getByText(/Paramètres de coûts manquants \(emballage\)/)).toBeTruthy();
});

it("écran d'import : aperçu sans enregistrement puis import confirmé", async () => {
  const DocumentPicker = jest.requireMock("expo-document-picker");
  DocumentPicker.getDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ name: "grille.csv", size: 100, base64: "QQ==" }] });
  mockCallApi.mockImplementation((path: string) => {
    if (path === "/sourcing/import/preview")
      return Promise.resolve({ format: "csv", columns: ["Réf.", "Désignation", "Prix HT"], suggestedMapping: {}, mapping: { supplier_sku: "Réf.", title: "Désignation", price: "Prix HT", tax_type: { const: "ht" } }, total: 3, validCount: 2, invalidCount: 1, warnings: [], sample: [{ line: 2, title: "Écran iPhone 13", reference: "E13", price: 79.9, currency: "EUR", taxType: "ht", quantity: 4, ean: null, errors: [] }], fields: [] });
    if (path === "/sourcing/import") return Promise.resolve({ supplierId: "s", sourceId: "src", feedId: "f", result: { runId: "r", status: "partial", processed: 3, stored: 2, rejected: 0, invalidRows: 1, expired: 0, fxUnavailable: 0, message: "2 offre(s) enregistrée(s), 1 ligne(s) illisible(s), 0 offre(s) rejetée(s), 0 offre(s) expirée(s)." } });
    return Promise.resolve([]);
  });
  const Screen = jest.requireActual("~/app/(app)/sourcing-import").default;
  render(wrap(<Screen />));
  expect(screen.getByTestId("import-supplier-name").props.value).toBe("Foneday");
  fireEvent.press(screen.getByTestId("import-pick"));
  await waitFor(() => expect(screen.getByText(/3 lignes · 2 exploitables · 1 incomplètes/)).toBeTruthy());
  expect(mockCallApi.mock.calls.filter((c) => c[0] === "/sourcing/import")).toHaveLength(0);
  fireEvent.press(screen.getByTestId("import-confirm"));
  fireEvent.press(await screen.findByText("Confirmer l'import"));
  await waitFor(() => expect(screen.getByText("Import partiel")).toBeTruthy());
  const call = mockCallApi.mock.calls.find((c) => c[0] === "/sourcing/import")![1];
  expect(call.body).toMatchObject({ supplierName: "Foneday", defaults: { currency: "EUR", taxType: "ht" }, mapping: { tax_type: { const: "ht" } } });
});
