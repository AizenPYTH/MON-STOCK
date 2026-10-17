import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

/**
 * « Connectez vos comptes » : comptes pro d'abord (statut réel, actions), sources publiques ensuite,
 * logos d'identification. Réponses serveur SIMULÉES.
 */
const mockCallApi = jest.fn();
jest.mock("~/lib/api", () => ({ callApi: (...a: unknown[]) => mockCallApi(...a) }));
jest.mock("~/org/org-provider", () => ({ useActiveOrg: () => ({ active: { organization: { id: "org-1", name: "Snowolff", currency: "EUR" } }, permissions: { canWrite: true, isAdmin: true } }) }));
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true }, useLocalSearchParams: () => ({}) }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(() => Promise.resolve()) }));
jest.setTimeout(30_000);
beforeEach(() => mockCallApi.mockReset());

function wrap(node: React.ReactElement) {
  const { QueryClient, QueryClientProvider } = jest.requireActual("@tanstack/react-query");
  const { SafeAreaProvider } = jest.requireActual("react-native-safe-area-context");
  const { ToastProvider } = jest.requireActual("~/components/ui");
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return (
    <QueryClientProvider client={qc}>
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
        <ToastProvider>{node}</ToastProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

const email = { fr: { subject: "Demande — Snowolff", body: "Bonjour" }, en: { subject: "Request", body: "Hello" } };
const account = (over: Record<string, unknown>) => ({ segment: "A_refurb", country: "EE", website: "https://www.foxway.com", categories: [], benefit: "Avantage", requirements: "Conditions", caution: null, methods: ["file", "feed"], signupUrl: "https://resellers.foxway.com/", status: "not_connected", offers: 0, lastSyncAt: null, lastError: null, connectionId: null, supplierId: null, connector: null, email, ...over });

it("comptes pro (statut réel, logo), connexion API chiffrée côté serveur, sources publiques ensuite", async () => {
  mockCallApi.mockImplementation((path: string) => {
    if (path === "/sourcing/accounts")
      return Promise.resolve({
        accounts: [
          account({ key: "foxway", name: "Foxway", domain: "foxway.com", status: "connected", offers: 42, supplierId: "s-fox", lastSyncAt: "2026-10-15T08:00:00Z" }),
          account({ key: "bigbuy", name: "BigBuy", domain: "bigbuy.eu", methods: ["api", "file"], connector: { key: "bigbuy", label: "BigBuy (API)", fields: [{ name: "api_key", label: "Clé API BigBuy", secret: true, placeholder: null }] } }),
        ],
        publicSources: [{ sourceId: "p1", supplierName: "Brico-phone", domain: "brico-phone.com", country: null, offers: 120, lastSuccessAt: null }],
        totals: { account: 42, public: 120, marketplace: 30 },
      });
    if (path === "/sourcing/accounts/connect") return Promise.resolve({ connectionId: "c1", ok: true, message: "Connexion vérifiée." });
    return Promise.resolve({});
  });
  const Screen = jest.requireActual("~/app/(app)/pro-accounts").default;
  render(wrap(<Screen />));
  await waitFor(() => expect(screen.getByText("Vos prix pro passent en premier")).toBeTruthy());
  expect(screen.getByTestId("pro-accounts-totals").props.children.join("")).toMatch(/1 compte connecté · 42 offres de vos comptes · 120 offres publiques · 30 annonces/);
  expect(screen.getByText("Connecté")).toBeTruthy();
  expect(screen.getByText("Non connecté")).toBeTruthy();
  expect(screen.getAllByTestId("supplier-logo-image", { includeHiddenElements: true }).length).toBeGreaterThanOrEqual(3);
  expect(screen.getByText(/Brico-phone/)).toBeTruthy();
  expect(screen.getByText(/aucun partenariat/)).toBeTruthy();

  // liste de stock : import du fichier, fournisseur pré-rempli
  fireEvent.press(screen.getByTestId("pro-file-foxway"));
  const { router } = jest.requireMock("expo-router");
  expect(router.push).toHaveBeenCalledWith({ pathname: "/sourcing-import", params: { supplierName: "Foxway", supplierId: "s-fox" } });

  // connexion API : les identifiants partent au serveur (aucun stockage local)
  fireEvent.press(screen.getByTestId("pro-connect-bigbuy"));
  fireEvent.changeText(screen.getByTestId("pro-field-api_key"), "ma-cle");
  fireEvent.press(screen.getByTestId("pro-connect-submit"));
  await waitFor(() => expect(mockCallApi).toHaveBeenCalledWith("/sourcing/accounts/connect", expect.objectContaining({ method: "POST", body: { key: "bigbuy", credentials: { api_key: "ma-cle" } } })));
});

it("recherche : vos comptes d'abord, puis sources publiques (logos, lien) ; invitation à connecter ses comptes", async () => {
  const o = (id: string, title: string, price: number, over: Record<string, unknown>) => ({ id, title, price, currency: "EUR", priceConverted: price, taxType: "ht", stock: "in_stock", quantity: null, url: `https://example.test/${id}`, seenAt: "2026-10-15T08:00:00Z", ...over });
  const offers = [
    { ...o("p", "Ecran iPhone 13 OLED", 89, { access: "public" }), supplierId: "b", supplierName: "Brico-phone", country: "FR", domain: "brico-phone.com" },
    { ...o("a", "iPhone 13 128GB Grade A", 250, { access: "account", url: null }), supplierId: "f", supplierName: "Foxway", country: "EE", domain: "foxway.com" },
  ];
  const payload = { query: "iPhone 13", currency: "EUR", total: 2, partial: false, durationMs: 900, checked: [], offers, suppliers: [] };
  mockCallApi.mockImplementation((path: string) => Promise.resolve(path === "/suppliers/search" ? payload : path === "/sourcing/imports" ? [] : { entries: [] }));
  const Screen = jest.requireActual("~/app/(app)/(tabs)/sourcing").default;
  render(wrap(<Screen />));
  expect(screen.getByTestId("connect-accounts-cta")).toBeTruthy();
  fireEvent.press(screen.getByTestId("connect-accounts-cta"));
  expect(jest.requireMock("expo-router").router.push).toHaveBeenCalledWith("/pro-accounts");
  fireEvent.press(screen.getByText("iPhone 13"));
  await waitFor(() => expect(screen.getByTestId("supplier-summary")).toBeTruthy());
  fireEvent.press(screen.getByRole("button", { name: /^Tout · / }));
  expect(screen.getByText("Vos comptes")).toBeTruthy();
  expect(screen.getByText("Publiques et marché")).toBeTruthy();
  const titles = screen.getAllByText(/iPhone 13/).map((n) => n.props.children).filter((t) => typeof t === "string" && t !== "iPhone 13");
  expect(titles).toEqual(["iPhone 13 128GB Grade A", "Ecran iPhone 13 OLED"]);
  expect(screen.getByText(/Votre compte/)).toBeTruthy();
  expect(screen.getAllByTestId("supplier-logo-image", { includeHiddenElements: true })).toHaveLength(2);
  // vue compacte : mêmes offres, une ligne chacune
  fireEvent.press(screen.getByLabelText("Vue compacte"));
  expect(screen.getAllByTestId("supplier-logo-image", { includeHiddenElements: true })).toHaveLength(2);
});
