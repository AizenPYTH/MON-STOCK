import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { remoteFeedIssues } from "~/data/sourcing-b2b";
import { appraisalText } from "~/data/radar";

/**
 * Sourcing B2B (mobile) : contrôles locaux du flux distant, écran « Mes sources », formulaire de
 * flux autorisé (attestation obligatoire), assistant d'import (mode, fichier déjà importé,
 * mapping repris), historique des imports et détail du radar (trois notes, scénarios, offres
 * concurrentes). Toutes les réponses serveur sont SIMULÉES : aucun fournisseur n'est contacté.
 */
const mockCallApi = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("~/lib/api", () => ({ callApi: (...a: unknown[]) => mockCallApi(...a) }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("~/org/org-provider", () => ({ useActiveOrg: () => ({ active: { organization: { id: "org-1", name: "Boutique", currency: "EUR" } }, permissions: { canWrite: true, isAdmin: true } }) }));
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true }, useLocalSearchParams: () => mockParams }));
jest.mock("~/lib/supabase", () => ({ requireSupabase: () => ({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }) }) }) }) }));

jest.setTimeout(30_000);
beforeEach(() => {
  mockCallApi.mockReset();
  mockParams = {};
});

function wrap(node: React.ReactElement) {
  const { QueryClient, QueryClientProvider } = jest.requireActual("@tanstack/react-query");
  const { SafeAreaProvider } = jest.requireActual("react-native-safe-area-context");
  const { ToastProvider } = jest.requireActual("~/components/ui");
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  return (
    <QueryClientProvider client={qc}>
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
        <ToastProvider>{node}</ToastProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

describe("contrôles locaux", () => {
  it("flux distant : HTTPS exigé, pas d'identifiant dans l'URL, authentification complète", () => {
    expect(remoteFeedIssues({ url: "https://feed.example.com/stock.csv", format: "csv", auth: { kind: "none" } })).toEqual([]);
    expect(remoteFeedIssues({ url: "http://feed.example.com/stock.csv", format: "csv", auth: { kind: "none" } })[0]).toMatch(/https/);
    expect(remoteFeedIssues({ url: "https://user:pw@feed.example.com/x.csv", format: "csv", auth: { kind: "none" } })[0]).toMatch(/identifiant/);
    expect(remoteFeedIssues({ url: "pas une url", format: "csv", auth: { kind: "none" } })).toHaveLength(1);
    expect(remoteFeedIssues({ url: "https://f.example.com/x", format: "csv", auth: { kind: "header", name: "X Bad", value: "k" } })).toHaveLength(1);
    expect(remoteFeedIssues({ url: "https://f.example.com/x", format: "csv", auth: { kind: "basic", username: "u", password: "" } })).toHaveLength(1);
  });

  it("note absente = « Données insuffisantes », jamais 0", () => {
    expect(appraisalText({ score: null, label: "insufficient_data" })).toBe("Données insuffisantes");
    expect(appraisalText({ score: 72.4, label: "good" })).toBe("72 / 100 · Bonne");
  });

  it("âge des données et compteurs d'import", () => {
    const { ageText } = jest.requireActual("~/app/(app)/sourcing-connections");
    const now = new Date("2026-10-12T12:00:00Z");
    expect(ageText(null, now)).toBe("jamais");
    expect(ageText("2026-10-12T11:30:00Z", now)).toBe("il y a 30 min");
    expect(ageText("2026-10-12T07:00:00Z", now)).toBe("il y a 5 h");
    expect(ageText("2026-10-07T12:00:00Z", now)).toBe("il y a 5 j");
    const { countsText } = jest.requireActual("~/app/(app)/sourcing-imports/index");
    expect(countsText({ read: 10, valid: 8, created: 3, updated: 1, unchanged: 4, duplicates: 1, invalid: 1, rejected: 0, unrecognized: 2, expired: 0 })).toBe("3 nouvelles · 1 mise à jour · 4 inchangées · 2 ignorées");
  });
});

const source = (over: Record<string, unknown>) => ({
  id: "src-1",
  name: "Flux CSV — Grossiste A",
  supplierId: "sup-1",
  supplierName: "Grossiste A",
  country: "FR",
  kind: "remote_feed",
  methodLabel: "Flux distant autorisé",
  status: "connected",
  statusLabel: "Connecté",
  activeOffers: 42,
  lastSyncAt: "2026-10-12T08:00:00Z",
  lastSuccessfulSyncAt: "2026-10-12T08:00:00Z",
  nextRunAt: "2026-10-13T08:00:00Z",
  lastError: null,
  consecutiveFailures: 0,
  frequency: "daily",
  frequencyLabel: "1 fois / jour",
  schedulable: true,
  canSyncNow: true,
  primaryAction: "sync_now",
  ...over,
});

describe("Mes sources", () => {
  it("statut réel, échecs consécutifs, synchronisation à la demande", async () => {
    mockCallApi.mockImplementation((path: string) => {
      if (path === "/sourcing/sources")
        return Promise.resolve([
          source({}),
          source({ id: "src-2", supplierName: "Grossiste B", status: "error", statusLabel: "En erreur", consecutiveFailures: 3, lastError: "Le flux a répondu HTTP 503.", activeOffers: 7 }),
          source({ id: "src-3", supplierName: "Foxway", kind: "file_import", methodLabel: "Import de fichier", status: "manual_import", statusLabel: "Import manuel", schedulable: false, canSyncNow: false, primaryAction: "import_file", frequency: "manual", activeOffers: 120 }),
        ]);
      if (path === "/sourcing/sources/sync") return Promise.resolve({ status: "success", message: "42 offres à jour.", nextRunAt: null, consecutiveFailures: 0 });
      return Promise.resolve([]);
    });
    const Screen = jest.requireActual("~/app/(app)/sourcing-connections").default;
    render(wrap(<Screen />));
    await waitFor(() => expect(screen.getByText("Grossiste A")).toBeTruthy());
    expect(screen.getByText("Synchronisation automatique (2)")).toBeTruthy();
    expect(screen.getByText("Fichiers et saisie (1)")).toBeTruthy();
    expect(screen.getByText(/3 échec\(s\) consécutif\(s\)\. Le flux a répondu HTTP 503\./)).toBeTruthy();
    expect(screen.getByText(/120 offres exploitables/)).toBeTruthy();
    fireEvent.press(screen.getByTestId("source-action-src-1"));
    await waitFor(() => expect(mockCallApi.mock.calls.some((c) => c[0] === "/sourcing/sources/sync")).toBe(true));
    expect(mockCallApi.mock.calls.find((c) => c[0] === "/sourcing/sources/sync")![1].body).toEqual({ sourceId: "src-1" });
    const { router } = jest.requireMock("expo-router");
    fireEvent.press(screen.getByTestId("source-action-src-3"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/sourcing-import", params: { supplierId: "sup-1" } });
  });

  it("serveur sans la route (ancienne version) : l'import de fichier reste accessible", async () => {
    mockCallApi.mockImplementation(() => Promise.reject(new Error("Route inconnue")));
    const Screen = jest.requireActual("~/app/(app)/sourcing-connections").default;
    render(wrap(<Screen />));
    await waitFor(() => expect(screen.getByText("Impossible de charger les données")).toBeTruthy());
    expect(screen.getByTestId("sources-import")).toBeTruthy();
  });
});

const feedPreview = {
  fileSha256: "",
  fileSize: 300,
  headerSignature: "abc",
  mappingSource: "suggested",
  mappingConfidence: { title: "high", price: "medium", supplier_sku: "high" },
  duplicates: 0,
  alreadyImported: null,
  format: "csv",
  columns: ["SKU", "Name", "Price"],
  suggestedMapping: { supplier_sku: "SKU", title: "Name", price: "Price" },
  mapping: { supplier_sku: "SKU", title: "Name", price: "Price" },
  total: 2,
  validCount: 2,
  invalidCount: 0,
  warnings: [],
  sample: [{ line: 2, title: "iPhone 13 128GB Grade A", reference: "IP13-128-A", price: 289, currency: "EUR", taxType: null, quantity: 12, ean: null, brand: "Apple", condition: "refurbished", grade: "A", moq: null, errors: [], warnings: [] }],
  fields: [],
};

describe("flux autorisé", () => {
  it("aperçu sans enregistrement ; création impossible sans attestation ; identifiants transmis au serveur seulement", async () => {
    mockCallApi.mockImplementation((path: string) => {
      if (path === "/sourcing/feeds/preview") return Promise.resolve(feedPreview);
      if (path === "/sourcing/feeds") return Promise.resolve({ supplierId: "s", sourceId: "src", feedId: "f" });
      return Promise.resolve([]);
    });
    const Screen = jest.requireActual("~/app/(app)/sourcing-feed-new").default;
    render(wrap(<Screen />));
    fireEvent.changeText(screen.getByTestId("feed-url"), "http://feed.example.com/stock.csv");
    expect(screen.getByText(/doit commencer par https/)).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("feed-url"), "https://feed.example.com/stock.csv");
    fireEvent.press(screen.getByText("Clé / jeton"));
    fireEvent.changeText(screen.getByTestId("feed-header-value"), "Bearer secret-123");
    fireEvent.press(screen.getByTestId("feed-preview"));
    await waitFor(() => expect(screen.getByText(/2 lignes · 2 exploitables/)).toBeTruthy());
    expect(screen.getByText(/Prix unitaire \* · proposé, à vérifier/)).toBeTruthy();
    expect(mockCallApi.mock.calls.filter((c) => c[0] === "/sourcing/feeds")).toHaveLength(0);

    fireEvent.changeText(screen.getByTestId("feed-supplier-name"), "Grossiste Flux");
    expect(screen.getByTestId("feed-create").props.accessibilityState?.disabled).toBe(true);
    fireEvent(screen.getByTestId("feed-attest"), "valueChange", true);
    await act(async () => {
      fireEvent.press(screen.getByTestId("feed-create"));
    });
    await waitFor(() => expect(mockCallApi.mock.calls.some((c) => c[0] === "/sourcing/feeds")).toBe(true));
    const body = mockCallApi.mock.calls.find((c) => c[0] === "/sourcing/feeds")![1].body;
    expect(body).toMatchObject({ url: "https://feed.example.com/stock.csv", format: "csv", auth: { kind: "header", name: "Authorization", value: "Bearer secret-123" }, supplierName: "Grossiste Flux", mode: "snapshot", frequency: "daily", attest: true });
    const { router } = jest.requireMock("expo-router");
    expect(router.replace).toHaveBeenCalledWith("/sourcing-connections");
  });
});

describe("assistant d'import", () => {
  it("mapping repris, fichier déjà importé signalé, mode transmis, réimport sur demande", async () => {
    const DocumentPicker = jest.requireMock("expo-document-picker");
    DocumentPicker.getDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ name: "stock.xlsx", size: 100, base64: "UEsDBA==" }] });
    mockParams = { supplierId: "sup-1" };
    let imports = 0;
    mockCallApi.mockImplementation((path: string) => {
      if (path === "/sourcing/import/preview")
        return Promise.resolve({ ...feedPreview, format: "xlsx", fileSha256: "f".repeat(64), mappingSource: "saved", alreadyImported: { jobId: "job-0", at: "2026-10-11T09:00:00Z" }, duplicates: 1 });
      if (path === "/sourcing/import") {
        imports += 1;
        return Promise.resolve({ supplierId: "sup-1", sourceId: "src", feedId: "f", importJobId: imports === 1 ? "job-0" : "job-1", alreadyImported: imports === 1 ? { jobId: "job-0", at: "2026-10-11T09:00:00Z" } : null, result: { runId: "r", status: "success", processed: 2, stored: 2, rejected: 0, invalidRows: 0, expired: 0, fxUnavailable: 0, message: imports === 1 ? "Fichier déjà importé : rien n'a été modifié." : "2 offre(s) enregistrée(s)." } });
      }
      return Promise.resolve([]);
    });
    const Screen = jest.requireActual("~/app/(app)/sourcing-import").default;
    render(wrap(<Screen />));
    fireEvent.press(screen.getByTestId("import-pick"));
    await waitFor(() => expect(screen.getByText("Colonnes reprises du dernier import de ce fournisseur")).toBeTruthy());
    expect(screen.getByText(/a déjà été importé le/)).toBeTruthy();
    expect(screen.getByText(/1 doublon \(première ligne gardée\)/)).toBeTruthy();
    expect(mockCallApi.mock.calls.find((c) => c[0] === "/sourcing/import/preview")![1].body).toMatchObject({ supplierId: "sup-1" });
    fireEvent.press(screen.getByText("Catalogue complet"));
    expect(screen.getByTestId("import-mode-help")).toBeTruthy();
    fireEvent.press(screen.getByTestId("import-confirm"));
    fireEvent.press(await screen.findByText("Confirmer l'import"));
    await waitFor(() => expect(screen.getByTestId("import-same-file")).toBeTruthy());
    const first = mockCallApi.mock.calls.find((c) => c[0] === "/sourcing/import")![1].body;
    expect(first).toMatchObject({ supplierId: "sup-1", mode: "snapshot" });
    expect(first.allowSameFile).toBeFalsy();
    fireEvent.press(screen.getByTestId("import-same-file"));
    await waitFor(() => expect(screen.getByTestId("import-detail")).toBeTruthy());
    const second = mockCallApi.mock.calls.filter((c) => c[0] === "/sourcing/import")[1]![1].body;
    expect(second).toMatchObject({ allowSameFile: true, mode: "snapshot" });
  });
});

describe("historique des imports", () => {
  it("liste puis détail avec les lignes ignorées et leur motif", async () => {
    const job = { id: "job-1", supplierId: "sup-1", supplierName: "Grossiste A", sourceId: "src", origin: "file", fileName: "stock.xlsx", fileSize: 2048, format: "xlsx", mode: "partial", status: "partial", counts: { read: 5, valid: 4, created: 2, updated: 1, unchanged: 1, duplicates: 0, invalid: 1, rejected: 0, unrecognized: 1, expired: 0 }, truncated: false, message: "4 offres enregistrées.", createdBy: "u", startedAt: "2026-10-12T08:00:00Z", finishedAt: "2026-10-12T08:00:05Z" };
    mockCallApi.mockImplementation((path: string) => {
      if (path === "/sourcing/imports") return Promise.resolve([job]);
      if (path === "/sourcing/imports/detail") return Promise.resolve({ ...job, issues: [{ line: 4, kind: "invalid", reference: "X1", message: "Prix manquant", excerpt: { SKU: "X1" } }] });
      return Promise.resolve([]);
    });
    const List = jest.requireActual("~/app/(app)/sourcing-imports/index").default;
    const { unmount } = render(wrap(<List />));
    await waitFor(() => expect(screen.getByText(/stock\.xlsx/)).toBeTruthy());
    expect(screen.getAllByText(/2 nouvelles · 1 mise à jour · 1 inchangée · 1 ignorée/).length).toBeGreaterThan(0);
    unmount();
    mockParams = { id: "job-1" };
    const Detail = jest.requireActual("~/app/(app)/sourcing-imports/[id]").default;
    render(wrap(<Detail />));
    await waitFor(() => expect(screen.getByText(/Prix manquant/)).toBeTruthy());
    expect(mockCallApi.mock.calls.find((c) => c[0] === "/sourcing/imports/detail")![1].query).toEqual({ id: "job-1" });
  });
});

describe("détail du radar", () => {
  it("trois notes séparées, verdict expliqué, scénarios de quantité et offres concurrentes", async () => {
    const assessment = {
      competitiveness: { score: 78, label: "good", reasons: ["Coût rendu 12 % sous la médiane des 2 autres offres."] },
      sourceReliability: { score: null, label: "insufficient_data", reasons: ["Aucune commande reçue de ce fournisseur."] },
      dataConfidence: { score: 55, label: "fair", reasons: ["Stock non confirmé."], missing: ["quantité"], ageDays: 2 },
      verdict: "to_verify",
      verdictReasons: ["Stock non confirmé par le fournisseur."],
    };
    const evaluation = { status: "estimated", revenue: 600, revenueBasis: "avg_sale_30d", revenueExVat: 500, purchaseCost: 300, landedCost: 310, grossMargin: 190, estimatedProfit: 106, marginPercent: 17.67, breakdown: [], missing: [], cautions: [], reasons: [], freshness: "fresh", ageDays: 2, score: 70 };
    const item = { supplierId: "sup", sku: { id: "s1", code: "IP13", name: "iPhone 13 · 128 Go", currency: "EUR", units30d: 6, quantityAvailable: 1 }, offer: { offerId: "o1", supplierName: "Grossiste A", supplierCountry: "FR", title: "iPhone 13", sourceUrl: null, price: 300, currency: "EUR", taxType: "ht", shippingCost: 20, moq: 2, availableQuantity: null, stockStatus: "unknown", lastSeenAt: "2026-10-10T08:00:00Z", priceOrigin: "catalog_import", previousPrice: null, saved: false }, savedAt: null, priceAtSave: null, evaluation, offersForSku: 3, assessment, details: { shipFromCountry: "DE", warrantyMonths: 12, vatRegime: null, orderMultiple: null, condition: "refurbished", grade: "A", deliveryMaxDays: null } };
    mockCallApi.mockImplementation((path: string) => {
      if (path === "/radar") return Promise.resolve({ items: [item], restock: [], settings: {}, settingsFromChannel: [], missingSettings: [], counts: { profitable: 0, estimated: 1, unprofitable: 0, insufficient: 0, unlinkedOffers: 0, skus: 1 }, computedAt: "2026-10-12T12:00:00Z" });
      if (path === "/radar/offer")
        return Promise.resolve({
          item,
          scenarios: [{ quantity: 2, label: "minimum de commande", unitLandedCost: 310, unitProfit: 53, capital: 620, totalProfit: 106, exceedsStock: false, missing: [], assumption: "Port fournisseur réparti sur la commande." }],
          peers: [{ offerId: "o2", supplierName: "Grossiste B", price: 330, landedCost: 345, availableQuantity: 4, stockStatus: "in_stock", ageDays: 1, verdict: "risky" }],
          settings: {},
        });
      return Promise.resolve([]);
    });
    mockParams = { offerId: "o1" };
    const Screen = jest.requireActual("~/app/(app)/radar/[offerId]").default;
    render(wrap(<Screen />));
    await waitFor(() => expect(screen.getByText("À vérifier")).toBeTruthy());
    expect(screen.getByText("78 / 100 · Bonne")).toBeTruthy();
    expect(screen.getByText("Données insuffisantes")).toBeTruthy();
    expect(screen.getByText("55 / 100 · Moyenne")).toBeTruthy();
    expect(screen.getByText(/Stock non confirmé par le fournisseur/)).toBeTruthy();
    expect(screen.getByText(/garantie 12 mois · expédié depuis DE/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/2 unités · minimum de commande/)).toBeTruthy());
    expect(screen.getByText(/Capital 620,00/)).toBeTruthy();
    expect(screen.getByText("Grossiste B")).toBeTruthy();
    expect(screen.getByText("Risquée")).toBeTruthy();
  });
});
