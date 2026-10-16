import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

/**
 * Onglet « Fournisseurs » : on tape un produit, les résultats s'affichent fournisseur par
 * fournisseur avec les prix. Réponses serveur SIMULÉES (titres réels relevés le 13/10/2026).
 */
const mockCallApi = jest.fn();
jest.mock("~/lib/api", () => ({ callApi: (...a: unknown[]) => mockCallApi(...a) }));
jest.mock("~/org/org-provider", () => ({ useActiveOrg: () => ({ active: { organization: { id: "org-1", name: "Boutique", currency: "EUR" } }, permissions: { canWrite: true, isAdmin: true } }) }));
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true }, useLocalSearchParams: () => ({}) }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(() => Promise.resolve()) }));
jest.setTimeout(30_000);
beforeEach(() => mockCallApi.mockReset());
/** Réponse simulée de la recherche ; les autres routes (annuaire, imports) répondent vide. */
function searchReturns(payload: unknown) {
  mockCallApi.mockImplementation((path: string) => Promise.resolve(path === "/suppliers/search" ? payload : path === "/sourcing/imports" ? [] : { entries: [] }));
}

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

const o = (id: string, title: string, price: number, over: Record<string, unknown> = {}) => ({ id, title, price, currency: "EUR", priceConverted: price, taxType: "unknown", stock: "in_stock", quantity: null, url: `https://example.test/${id}`, seenAt: "2026-10-13T16:10:00Z", ...over });

it("affiche tous les résultats du moins cher au plus cher, avec le fournisseur ; un appui ouvre la page du produit", async () => {
  searchReturns({
    query: "iPhone 15 Pro",
    currency: "EUR",
    total: 4,
    partial: false,
    durationMs: 26000,
    checked: [
      { supplierName: "Brico-phone", ok: true, found: 6, message: null },
      { supplierName: "Refreshed Apples", ok: true, found: 6, message: null },
      { supplierName: "Servisní díly", ok: false, found: 0, message: "Délai dépassé" },
    ],
    suppliers: [
      { supplierId: "b", supplierName: "Brico-phone", country: "FR", total: 2, offers: [o("1", "Verre trempé iPhone 15 Pro", 7.9), o("2", "Ecran iPhone 15 Pro - Origine Apple", 369.9, { stock: "out_of_stock" })] },
      { supplierId: "r", supplierName: "Refreshed Apples", country: "NL", total: 2, offers: [o("3", "iPhone 15 Pro Used - 128 GB / Mixed / A/B Grade", 550, { stock: "unknown" }), o("4", "Lepení pod baterii iPhone 15 Pro", 29, { currency: "CZK", priceConverted: 1.15 })] },
    ],
  });
  const Screen = jest.requireActual("~/app/(app)/(tabs)/sourcing").default;
  render(wrap(<Screen />));
  expect(screen.getByText("Sourcing")).toBeTruthy();
  fireEvent.changeText(screen.getByTestId("supplier-query"), "iPhone 15 Pro");
  fireEvent.press(screen.getByTestId("supplier-search"));
  await waitFor(() => expect(screen.getByTestId("supplier-summary")).toBeTruthy());
  expect(screen.getByText(/4 résultats chez 2 fournisseurs pour « iPhone 15 Pro »/)).toBeTruthy();
  const shownTitles = () => screen.getAllByText(/iPhone 15 Pro/).map((n) => n.props.children).filter((t) => typeof t === "string" && t !== "iPhone 15 Pro");
  // recherche d'un modèle : les appareils d'abord (catégorie choisie automatiquement), titres en français
  expect(shownTitles()).toEqual(["iPhone 15 Pro occasion - 128 GB / mixte / A/B Grade"]);
  expect(screen.getByRole("button", { name: "Appareils · 1" }).props.accessibilityState).toEqual({ selected: true });
  expect(screen.getByRole("button", { name: "Protections · 1" })).toBeTruthy();
  // « Tout » : ordre 1,15 € (converti) < 7,90 < 369,90 < 550
  fireEvent.press(screen.getByRole("button", { name: "Tout · 4" }));
  expect(shownTitles()).toEqual(["Adhésif de batterie iPhone 15 Pro", "Verre trempé iPhone 15 Pro", "Ecran iPhone 15 Pro - Origine Apple", "iPhone 15 Pro occasion - 128 GB / mixte / A/B Grade"]);
  expect(screen.getAllByText("Brico-phone")).toHaveLength(2);
  expect(screen.getAllByText("Refreshed Apples")).toHaveLength(2);
  expect(screen.getByText(/≈ 1,15/)).toBeTruthy();
  expect(screen.getAllByText(/En rupture/).length).toBe(1);
  fireEvent.press(screen.getByLabelText(/Verre trempé iPhone 15 Pro, .*chez Brico-phone/));
  const { openBrowserAsync } = jest.requireMock("expo-web-browser");
  expect(openBrowserAsync).toHaveBeenCalledWith("https://example.test/1");
  // vue par fournisseur
  fireEvent.press(screen.getByText("Fournisseurs"));
  expect(screen.getByText(/^Brico-phone$/)).toBeTruthy();
  expect(screen.getByText(/550,00/)).toBeTruthy();
  expect(screen.getByText(/Servisní díly \(n'a pas répondu\)/)).toBeTruthy();
  expect(mockCallApi).toHaveBeenCalledWith("/suppliers/search", expect.objectContaining({ query: { q: "iPhone 15 Pro" } }));
});

it("rien trouvé : message clair, sans écran compliqué", async () => {
  searchReturns({ query: "batterie trottinette", currency: "EUR", total: 0, partial: false, durationMs: 9000, checked: [{ supplierName: "Brico-phone", ok: true, found: 0, message: null }], suppliers: [] });
  const Screen = jest.requireActual("~/app/(app)/(tabs)/sourcing").default;
  render(wrap(<Screen />));
  fireEvent.press(screen.getByText("iPhone 13"));
  await waitFor(() => expect(screen.getByText(/Rien trouvé pour « batterie trottinette »/)).toBeTruthy());
  expect(screen.getByText(/Fournisseurs consultés en direct : Brico-phone/)).toBeTruthy();
});

it("chaque offre affiche son analyse ; « Meilleures affaires » classe les offres rentables d'abord", async () => {
  const deal = (level: string, label: string, over: Record<string, unknown> = {}) => ({ level, label, comparable: true, supplierPrice: 250, marketPrice: 420, marketBasis: "marketplace", marketCount: 3, discountPercent: 40.48, totalCost: 250, resalePrice: 410, resaleBasis: "marketplace_low", margin: 86.33, marginPercent: 21.06, provisional: false, missingCosts: [], uncertainties: ["Prix HT ou TTC non précisé par le fournisseur."], score: 82, summary: "40.48 % sous le marché, marge 86.33 (21.06 %).", ...over });
  const insufficient = { level: "insufficient_data", label: "Données insuffisantes", comparable: false, supplierPrice: 90, marketPrice: null, marketBasis: null, marketCount: 0, discountPercent: null, totalCost: 90, resalePrice: null, resaleBasis: null, margin: null, marginPercent: null, provisional: false, missingCosts: [], uncertainties: [], score: null, summary: "Comparaison impossible : pas assez d'offres équivalentes (0 trouvée)." };
  const offers = [
    { ...o("a", "Batterie iPhone 13", 90, { deal: insufficient }), supplierId: "b", supplierName: "Brico-phone", country: "FR" },
    { ...o("b", "iPhone 13 128GB Grade A reconditionné", 250, { deal: deal("very_good", "Très intéressant") }), supplierId: "r", supplierName: "Refreshed Apples", country: "NL" },
    { ...o("c", "iPhone 13 128GB Grade A", 450, { deal: deal("not_competitive", "Non compétitif", { margin: -40, marginPercent: -9.76, summary: "Marge nulle ou négative après les coûts.", score: 10 }) }), supplierId: "r", supplierName: "Refreshed Apples", country: "NL" },
  ];
  searchReturns({ query: "iPhone 13", currency: "EUR", total: 3, partial: false, durationMs: 1000, checked: [], offers, suppliers: [{ supplierId: "r", supplierName: "Refreshed Apples", country: "NL", total: 3, offers }], missingCostSettings: ["régime de TVA", "commission marketplace"] });
  const Screen = jest.requireActual("~/app/(app)/(tabs)/sourcing").default;
  render(wrap(<Screen />));
  fireEvent.press(screen.getByText("iPhone 13"));
  await waitFor(() => expect(screen.getByTestId("supplier-summary")).toBeTruthy());
  expect(screen.getByText("Très intéressant")).toBeTruthy();
  expect(screen.getByText("Non compétitif")).toBeTruthy();
  // « Données insuffisantes » n'encombre plus les cartes
  fireEvent.press(screen.getByRole("button", { name: /^Tout · / }));
  expect(screen.queryByText("Données insuffisantes")).toBeNull();
  // marge visible d'emblée ; le détail du calcul s'ouvre à la demande
  expect(screen.getByText(/Marge ≈ \+86,33/)).toBeTruthy();
  for (const b of screen.getAllByLabelText("Voir le détail du calcul")) fireEvent.press(b);
  expect(screen.getAllByText(/Marché ≈ 420,00/).length).toBe(2);
  expect(screen.getAllByText(/Coût total ≈ 250,00/).length).toBe(2);
  expect(screen.getAllByText(/À vérifier : Prix HT ou TTC/).length).toBe(2);
  expect(screen.getByLabelText("Marges provisoires : coûts à compléter (régime de TVA, commission marketplace)")).toBeTruthy();
  fireEvent.press(screen.getByText("Opportunités"));
  const order = screen.getAllByText(/^(Très intéressant|Non compétitif)$/).map((n) => n.props.children);
  expect(order).toEqual(["Très intéressant", "Non compétitif"]);
  fireEvent.press(screen.getByLabelText(/^Marges provisoires/));
  const { router } = jest.requireMock("expo-router");
  expect(router.push).toHaveBeenCalledWith("/radar/settings");
});
