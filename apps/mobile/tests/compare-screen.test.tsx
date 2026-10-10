import { render, screen } from "@testing-library/react-native";
import { fetchComparison, groupOffers } from "~/data/compare";
import { fakeSupabase } from "./fake-supabase";

const rows = [
  { id: "f8d6", title_original: "Batterie iPhone 13  - Pulled Origine Apple", supplier_id: "s1", sku_id: null, normalized_product_id: "np1", grade: null, normalized_price: 37.9, normalized_currency: "EUR", moq: null, delivery_max_days: null, available_quantity: null, shipping_cost: null, source_url: "https://www.brico-phone.com/45277.html", last_seen_at: "2026-10-10T05:36:55.482+00:00", supplier: { name: "Brico-phone (FR) — pièces détachées" }, sku: null },
  { id: "e344", title_original: "Ecran iPhone 13 - Origine Apple", supplier_id: "s1", sku_id: null, normalized_product_id: "np1", grade: null, normalized_price: 199.9, normalized_currency: "EUR", moq: null, delivery_max_days: null, available_quantity: null, shipping_cost: null, source_url: "https://www.brico-phone.com/43535.html", last_seen_at: "2026-10-10T05:36:55.482+00:00", supplier: { name: "Brico-phone (FR) — pièces détachées" }, sku: null },
];
const ctx = { feePercent: null, paymentFeePercent: null, paymentFeeFixed: null, shippingCost: null, vatRate: null } as never;

const mockState: { data: unknown } = { data: null };
jest.mock("~/data/hooks", () => ({
  useComparison: () => ({ isPending: false, isError: false, data: mockState.data, isRefetching: false, refetch: jest.fn() }),
  useDraftPurchaseOrder: () => ({ create: { isPending: false, mutate: jest.fn() }, remove: { mutate: jest.fn() } }),
}));
jest.mock("~/org/org-provider", () => ({ useActiveOrg: () => ({ active: { organization: { id: "o1", currency: "EUR" } }, permissions: { canWrite: true } }) }));
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn(), canGoBack: () => true }, useLocalSearchParams: () => ({ key: "np:np1" }) }));

/**
 * Régression TestFlight : toucher « Voir » sur une offre fermait l'application. L'écran affiche
 * « vérifiée il y a … » via formatRelative, qui reposait sur Intl.RelativeTimeFormat — absent de
 * Hermes. On rend l'écran avec de vraies lignes d'offres (Brico-phone) ET sans cette API.
 */
describe("écran de comparaison", () => {
  const original = Intl.RelativeTimeFormat;
  beforeEach(() => {
    (Intl as { RelativeTimeFormat?: unknown }).RelativeTimeFormat = undefined;
  });
  afterEach(() => {
    (Intl as { RelativeTimeFormat?: unknown }).RelativeTimeFormat = original;
  });

  it("sépare l'écran et la batterie d'un même appareil", () => {
    const groups = groupOffers(rows as never);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.offers.length === 1)).toBe(true);
    expect(new Set(groups.map((g) => g.key)).size).toBe(2);
  });

  it("rend l'écran avec les vraies offres sans Intl.RelativeTimeFormat (Hermes)", async () => {
    const { client } = fakeSupabase({ sourcing_offers: { data: rows } });
    const key = groupOffers(rows as never).find((g) => g.title.startsWith("Ecran"))!.key;
    mockState.data = await fetchComparison(client, "o1", key, ctx);
    const comparison = mockState.data as { offers: { id: string }[] };
    expect(comparison.offers.map((o) => o.id)).toEqual(["e344"]);
    const { ToastProvider } = jest.requireActual("~/components/ui");
    const Screen = jest.requireActual("~/app/(app)/compare/[key]").default;
    const { SafeAreaProvider } = jest.requireActual("react-native-safe-area-context");
    render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
        <ToastProvider>
          <Screen />
        </ToastProvider>
      </SafeAreaProvider>,
    );
    expect(screen.getAllByText(/Brico-phone/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/vérifiée il y a|vérifiée à l'instant/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Batterie/)).toBeNull();
  });
});
