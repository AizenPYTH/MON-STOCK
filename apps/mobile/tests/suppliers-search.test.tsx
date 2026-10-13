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

it("affiche « Chez <fournisseur> » puis ses produits et prix, fournisseur par fournisseur", async () => {
  mockCallApi.mockResolvedValue({
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
  expect(screen.getByText("Fournisseurs")).toBeTruthy();
  fireEvent.changeText(screen.getByTestId("supplier-query"), "iPhone 15 Pro");
  fireEvent.press(screen.getByTestId("supplier-search"));
  await waitFor(() => expect(screen.getByTestId("supplier-summary")).toBeTruthy());
  expect(screen.getByText(/4 résultats chez 2 fournisseurs pour « iPhone 15 Pro »/)).toBeTruthy();
  expect(screen.getByText("Chez Brico-phone")).toBeTruthy();
  expect(screen.getByText("Chez Refreshed Apples")).toBeTruthy();
  expect(screen.getByText("Verre trempé iPhone 15 Pro")).toBeTruthy();
  expect(screen.getByText(/7,90/)).toBeTruthy();
  expect(screen.getByText(/550,00/)).toBeTruthy();
  expect(screen.getAllByText(/En rupture/).length).toBe(1);
  expect(screen.getByText(/≈ 1,15/)).toBeTruthy();
  expect(screen.getByText(/Servisní díly \(n'a pas répondu\)/)).toBeTruthy();
  expect(mockCallApi).toHaveBeenCalledWith("/suppliers/search", expect.objectContaining({ query: { q: "iPhone 15 Pro" } }));
});

it("rien trouvé : message clair, sans écran compliqué", async () => {
  mockCallApi.mockResolvedValue({ query: "batterie trottinette", currency: "EUR", total: 0, partial: false, durationMs: 9000, checked: [{ supplierName: "Brico-phone", ok: true, found: 0, message: null }], suppliers: [] });
  const Screen = jest.requireActual("~/app/(app)/(tabs)/sourcing").default;
  render(wrap(<Screen />));
  fireEvent.press(screen.getByText("iPhone 13"));
  await waitFor(() => expect(screen.getByText(/Rien trouvé pour « batterie trottinette »/)).toBeTruthy());
  expect(screen.getByText(/Fournisseurs consultés : Brico-phone/)).toBeTruthy();
});
