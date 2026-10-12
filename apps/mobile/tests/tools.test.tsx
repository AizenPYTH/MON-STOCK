import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { fakeSupabase } from "./fake-supabase";
import ToolsTab from "../src/app/(app)/(tabs)/tools";
import VatTool from "../src/app/(app)/tools/vat";
import MarginTool from "../src/app/(app)/tools/margin";
import EbayFeesTool from "../src/app/(app)/tools/ebay-fees";
import ShippingTool from "../src/app/(app)/tools/shipping";
import TrackingList from "../src/app/(app)/tools/tracking/index";
import NewParcel from "../src/app/(app)/tools/tracking/new";
import { trackingSourceText } from "../src/components/tracking";

/**
 * « Mes outils » (mobile) : catalogue, calculateur de TVA (exact, instantané, sans serveur),
 * marge, frais eBay, comparateur de frais de port (aucun tarif inventé) et suivi de colis
 * (aucun statut inventé), rendus avec des données simulées.
 */
const mockCallApi = jest.fn();
const mockFrom = jest.fn();
const mockPush = jest.fn();
const mockSetString = jest.fn(() => Promise.resolve(true));
jest.mock("~/lib/api", () => ({ callApi: (...a: unknown[]) => mockCallApi(...a) }));
jest.mock("expo-clipboard", () => ({ setStringAsync: (...a: unknown[]) => mockSetString(...(a as [])) }));
jest.mock("~/org/org-provider", () => ({ useActiveOrg: () => ({ active: { organization: { id: "org-1", name: "Boutique", currency: "EUR", settings: {} } }, permissions: { canWrite: true, isAdmin: true } }) }));
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), canGoBack: () => true }, useLocalSearchParams: () => ({}) }));
jest.mock("~/lib/supabase", () => ({ requireSupabase: () => ({ from: (t: string) => mockFrom(t) }) }));

jest.setTimeout(30_000);
beforeEach(() => {
  mockCallApi.mockReset();
  mockFrom.mockReset();
  mockPush.mockReset();
  mockSetString.mockClear();
  // Lectures Supabase par défaut : vides (aucune grille, aucun colis, aucun réglage).
  mockFrom.mockImplementation((t: string) => (fakeSupabase({ [t]: { data: t === "organizations" ? { settings: {} } : [], error: null } }).client as unknown as { from: (x: string) => unknown }).from(t));
});

function wrap(node: React.ReactElement) {
  const { QueryClient, QueryClientProvider } = jest.requireActual("@tanstack/react-query");
  const { SafeAreaProvider } = jest.requireActual("react-native-safe-area-context");
  const { ToastProvider } = jest.requireActual("~/components/ui");
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  return (
    <QueryClientProvider client={qc}>
      {/* petit écran (iPhone SE) */}
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 568 }, insets: { top: 20, left: 0, right: 0, bottom: 0 } }}>
        <ToastProvider>{node}</ToastProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

describe("catalogue Mes outils", () => {
  it("outils disponibles ouvrables, outils à venir non ouvrables", async () => {
    const Screen = ToolsTab;
    render(wrap(<Screen />));
    expect(screen.getByText("Mes outils")).toBeTruthy();
    fireEvent.press(screen.getByTestId("tool-vat"));
    expect(mockPush).toHaveBeenCalledWith("/tools/vat");
    expect(screen.getByText("À venir")).toBeTruthy();
    fireEvent.press(screen.getByTestId("tool-purchase-profitability"));
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});

describe("calculateur de TVA (clavier intégré)", () => {
  const type = (keys: string) => {
    for (const k of keys) fireEvent.press(screen.getByTestId(`key-${k}`));
  };
  it("100 € HT à 20 % → 20 € de TVA, 120 € TTC, calcul local instantané ; inversion ; copie", async () => {
    const Screen = VatTool;
    render(wrap(<Screen />));
    expect(screen.getByText(/Tapez un montant HT/)).toBeTruthy();
    expect(screen.getByTestId("key-action")).toBeDisabled();
    type("100");
    expect(screen.getByLabelText("HT : 100 €, champ en cours de saisie")).toBeTruthy();
    expect(screen.getByLabelText("TVA 20 % : 20,00 €")).toBeTruthy();
    expect(screen.getByLabelText("TTC : 120,00 €")).toBeTruthy();
    expect(mockCallApi).not.toHaveBeenCalled();
    // le champ TTC touché devient la saisie (résultat repris)
    fireEvent.press(screen.getByTestId("vat-field-ttc"));
    expect(screen.getByLabelText("TTC : 120,00 €, champ en cours de saisie")).toBeTruthy();
    expect(screen.getByLabelText("HT : 100,00 €")).toBeTruthy();
    fireEvent.press(screen.getByTestId("key-action"));
    await waitFor(() => expect(mockSetString).toHaveBeenCalled());
    expect(String((mockSetString.mock.calls[0] as unknown[])[0])).toMatch(/TVA 20\s%\s:\s20,00\s€/u);
  });
  it("19,99 € HT, taux 5,5 % ; effacer ; au plus 2 décimales", async () => {
    const Screen = VatTool;
    render(wrap(<Screen />));
    fireEvent.press(screen.getByRole("tab", { name: "5,5" }));
    type("19,999");
    expect(screen.getByLabelText("HT : 19,99 €, champ en cours de saisie")).toBeTruthy();
    expect(screen.getByLabelText("TVA 5,5 % : 1,10 €")).toBeTruthy(); // 1,09945 → 1,10
    expect(screen.getByLabelText("TTC : 21,09 €")).toBeTruthy();
    fireEvent.press(screen.getByTestId("key-back"));
    expect(screen.getByLabelText("HT : 19,9 €, champ en cours de saisie")).toBeTruthy();
    fireEvent.press(screen.getByTestId("key-clear"));
    expect(screen.getByText(/Tapez un montant HT/)).toBeTruthy();
  });
});

describe("calculateur de marge", () => {
  it("frais non saisis listés comme non déduits (estimation partielle)", async () => {
    const Screen = MarginTool;
    render(wrap(<Screen />));
    fireEvent.changeText(screen.getByTestId("margin-sale"), "150");
    fireEvent.changeText(screen.getByTestId("profit-purchase"), "100");
    expect(screen.getByText("Bénéfice estimé (coûts connus)")).toBeTruthy();
    expect(screen.getByText(/Non renseigné \(non déduit\)/)).toBeTruthy();
    expect(screen.getByText("– commission marketplace")).toBeTruthy();
  });
});

describe("frais eBay", () => {
  it("aucun taux par défaut : sans commission saisie, elle est signalée et non déduite", async () => {
    const Screen = EbayFeesTool;
    render(wrap(<Screen />));
    fireEvent.changeText(screen.getByTestId("ebay-item"), "100");
    expect(screen.getByText("– commission sur la valeur finale")).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("ebay-fvf"), "10");
    expect(screen.getByText("90,00 €")).toBeTruthy();
  });
});

describe("comparateur de frais de port", () => {
  it("sans plateforme ni grille : aucun prix, message explicite", async () => {
    mockCallApi.mockImplementation((path: string) => (path === "/tools/status" ? Promise.resolve({ shipping: [{ id: "packlink", label: "Packlink PRO", configured: false }, { id: "boxtal", label: "Boxtal", configured: false }], tracking: { laposte: false, ship24: false, dhl: false } }) : Promise.reject(new Error(path))));
    const Screen = ShippingTool;
    render(wrap(<Screen />));
    await waitFor(() => expect(screen.getByText(/Aucun tarif réel disponible/)).toBeTruthy());
    fireEvent.changeText(screen.getByTestId("ship-weight"), "1");
    fireEvent.press(screen.getByTestId("ship-compare"));
    expect(screen.getAllByText("Champ requis.").length).toBeGreaterThan(0);
    expect(mockCallApi).not.toHaveBeenCalledWith("/shipping/quotes", expect.anything());
  });
});

describe("comparateur de frais de port : devis réels et estimations", () => {
  it("devis Sendcloud (HT/TTC inconnu) distinct de la grille (estimation), offre écartée signalée", async () => {
    mockCallApi.mockImplementation(async (p: string) => {
      if (p === "/tools/status") return { shipping: [{ id: "packlink", label: "Packlink PRO", configured: false }, { id: "boxtal", label: "Boxtal", configured: false }, { id: "sendcloud", label: "Sendcloud", configured: true }], tracking: { laposte: false, ship24: false, dhl: false } };
      if (p === "/shipping/quotes")
        return {
          quotedAt: "2026-10-11T08:00:00.000Z",
          providers: [{ id: "sendcloud", label: "Sendcloud", state: "ok", count: 1, message: "1 offre écartée (prix nul ou absent, envoi non suivi ou réponse incomplète)." }],
          quotes: [
            { key: "sendcloud:mr", provider: "sendcloud", providerLabel: "Sendcloud", carrier: "Mondial Relay", service: "Mondial Relay Point Relais", priceInclVat: null, priceExclVat: null, priceVatUnknown: "4.39", currency: "EUR", transitDaysMin: null, transitDaysMax: null, estimatedDelivery: null, dropOff: true, deliveryToPickupPoint: true, tracking: true, restrictions: ["Point relais à choisir pour l'étiquette."], quotedAt: "2026-10-11T08:00:00.000Z" },
            { key: "sendcloud:zero", provider: "sendcloud", providerLabel: "Sendcloud", carrier: "Zéro", service: "Gratuit ?", priceInclVat: null, priceExclVat: null, priceVatUnknown: "0", currency: "EUR", transitDaysMin: null, transitDaysMax: null, estimatedDelivery: null, dropOff: null, deliveryToPickupPoint: null, tracking: true, restrictions: [], quotedAt: "2026-10-11T08:00:00.000Z" },
          ],
        };
      throw new Error(`appel inattendu ${p}`);
    });
    const card = { id: "c1", carrier: "La Poste", service: "Ma grille", from_countries: ["FR"], to_countries: ["FR"], bands: [{ maxWeightKg: 2, price: "8,99" }], currency: "EUR", max_length_cm: null, max_dimensions_sum_cm: null, volumetric_divisor: null, transit_days_min: 2, transit_days_max: 3, tracking: true, delivery_mode: null, notes: null, verified_at: "2026-09-01" };
    mockFrom.mockImplementation((t: string) => (fakeSupabase({ [t]: { data: t === "shipping_rate_cards" ? [card] : [], error: null } }).client as unknown as { from: (x: string) => unknown }).from(t));
    render(wrap(<ShippingTool />));
    await waitFor(() => expect(screen.getByText("Sendcloud : connecté")).toBeTruthy());
    fireEvent.changeText(screen.getByTestId("ship-weight"), "1");
    for (const [label, v] of [["Longueur", "30"], ["Largeur", "20"], ["Hauteur", "10"]] as const) fireEvent.changeText(screen.getAllByLabelText(label)[0]!, v);
    fireEvent.changeText(screen.getAllByPlaceholderText("75001")[0]!, "75011");
    fireEvent.changeText(screen.getAllByPlaceholderText("10115")[0]!, "69003");
    fireEvent.press(screen.getByTestId("ship-compare"));
    await waitFor(() => expect(screen.getByText("Devis réel Sendcloud")).toBeTruthy());
    expect(mockCallApi).toHaveBeenCalledWith("/shipping/quotes", expect.objectContaining({ method: "POST", body: expect.objectContaining({ fromPostcode: "75011", toPostcode: "69003" }) }));
    expect(screen.getByText("HT/TTC inconnu")).toBeTruthy();
    expect(screen.getByText("Estimation : votre grille")).toBeTruthy();
    expect(screen.getByText("estimation (votre grille)")).toBeTruthy();
    expect(screen.queryByText("Gratuit ?")).toBeNull();
    expect(screen.getByText(/1 offre écartée/)).toBeTruthy();
    expect(screen.getByText("2 options")).toBeTruthy();
    // identité du transporteur : présentation neutre (aucun logo sans autorisation) + mention
    expect(screen.getByLabelText("Mondial Relay, Mondial Relay Point Relais")).toBeTruthy();
    expect(screen.getByTestId("ship-carrier-sendcloud:mr-generic")).toBeTruthy();
    expect(screen.getByText(/ni partenaire ni approuvé/)).toBeTruthy();
  });
});

describe("suivi de colis", () => {
  it("sans clé d'API : avertissement clair, aucun statut inventé", async () => {
    mockCallApi.mockResolvedValue({ shipping: [], tracking: { laposte: false, ship24: false, dhl: false } });
    const Screen = TrackingList;
    render(wrap(<Screen />));
    await waitFor(() => expect(screen.getByText(/Aucune API de suivi n'est encore configurée/)).toBeTruthy());
    expect(screen.getByText("Aucun colis suivi")).toBeTruthy();
  });
  it("ajout : numéro invalide refusé, transporteur détecté", async () => {
    const Screen = NewParcel;
    render(wrap(<Screen />));
    fireEvent.changeText(screen.getByTestId("tracking-number"), "ab#12");
    expect(screen.getByText("Lettres et chiffres uniquement.")).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("tracking-number"), "1Z5R89390357567127");
    expect(screen.getByText(/Détecté : UPS/)).toBeTruthy();
    expect(screen.getByText("Transporteur : UPS")).toBeTruthy();
  });
  it("source du suivi : API officielles La Poste / DHL ou Ship24", () => {
    expect(trackingSourceText("laposte")).toBe("API La Poste Suivi");
    expect(trackingSourceText("dhl")).toBe("API DHL Suivi");
    expect(trackingSourceText("ship24")).toBe("Ship24");
    expect(trackingSourceText(null)).toBeNull();
  });
});
