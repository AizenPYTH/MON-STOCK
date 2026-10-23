import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ProductDraftDTO } from "@/features/mobile-api/contract";
import { draftToForm } from "~/data/ai";
import { speechErrorMessage } from "~/lib/speech";

/**
 * IA côté mobile : le téléphone ne fait que transcrire et afficher ; la compréhension est faite
 * par le serveur. Module de dictée absent ici (comme dans un ancien build) : rien ne plante, la
 * saisie au clavier reste disponible.
 */
jest.mock("expo-speech-recognition", () => {
  throw new Error("module natif absent");
});

const mockDraftProduct = jest.fn();
jest.mock("~/data/ai", () => ({ ...jest.requireActual("~/data/ai"), draftProduct: (...a: unknown[]) => mockDraftProduct(...a) }));
jest.mock("~/org/org-provider", () => ({ useActiveOrg: () => ({ active: { organization: { id: "org-1", name: "Boutique Test", currency: "EUR" } }, permissions: { canWrite: true } }) }));
jest.mock("~/lib/ai-consent", () => ({ useAiConsent: () => ({ status: "granted", grant: jest.fn(), revoke: jest.fn() }) }));
jest.mock("~/data/hooks", () => ({ useCreateProduct: () => ({ isPending: false, mutate: jest.fn() }) }));
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true } }));

const draft: ProductDraftDTO = {
  transcript: "3 iPhone 13 128 go noir grade A achetés 310 revendus 429,90 et 2 en 256 bleu",
  understood: true,
  brand: "Apple",
  model: "iPhone 13",
  name: null,
  category: "smartphone",
  variants: [
    { storage: "128 Go", color: "Noir", grade: "A", condition: "refurbished", costPrice: 310, salePrice: 429.9, initialQuantity: 3 },
    { storage: "256 Go", color: "Bleu", grade: null, condition: "unknown", costPrice: null, salePrice: null, initialQuantity: 2 },
  ],
  notes: ["Grade de la variante 256 Go non précisé."],
};

function wrap(node: React.ReactElement) {
  const { SafeAreaProvider } = jest.requireActual("react-native-safe-area-context");
  const { ToastProvider } = jest.requireActual("~/components/ui");
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <ToastProvider>{node}</ToastProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  mockDraftProduct.mockReset();
});

describe("brouillon dicté → formulaire", () => {
  it("pré-remplit les champs sans inventer : inconnus laissés vides", () => {
    const f = draftToForm(draft);
    expect(f).toMatchObject({ brand: "Apple", model: "iPhone 13", name: "", category: "Smartphone" });
    expect(f.variants).toHaveLength(2);
    expect(f.variants[0]).toMatchObject({ storage: "128 Go", color: "Noir", grade: "A", condition: "refurbished", cost_price: "310", sale_price: "429,9", initial_quantity: "3" });
    expect(f.variants[0]!.code).toMatch(/IPHONE/i);
    expect(f.variants[1]).toMatchObject({ grade: "", condition: "unknown", cost_price: "", sale_price: "", initial_quantity: "2" });
    expect(f.notes).toEqual(draft.notes);
  });

  it("écran Nouveau produit : le texte est envoyé au serveur et le formulaire se remplit", async () => {
    mockDraftProduct.mockResolvedValueOnce(draft);
    const Screen = jest.requireActual("~/app/(app)/product/new").default;
    render(wrap(<Screen />));
    expect(screen.queryByLabelText("Dicter")).toBeNull();
    fireEvent.changeText(screen.getByTestId("product-ai-input"), draft.transcript);
    fireEvent.press(screen.getByTestId("product-ai-input-send"));
    await waitFor(() => expect(screen.getByTestId("product-brand").props.value).toBe("Apple"));
    expect(mockDraftProduct).toHaveBeenCalledWith("org-1", draft.transcript);
    expect(screen.getByTestId("product-model").props.value).toBe("iPhone 13");
    expect(screen.getByText("Variantes (2)")).toBeTruthy();
    expect(screen.getByText(/Grade de la variante 256 Go non précisé/)).toBeTruthy();
  });

  it("phrase incomprise : message, formulaire inchangé", async () => {
    mockDraftProduct.mockResolvedValueOnce({ ...draft, understood: false, variants: [], brand: null, model: null, notes: ["Aucun produit décrit."] });
    const Screen = jest.requireActual("~/app/(app)/product/new").default;
    render(wrap(<Screen />));
    fireEvent.changeText(screen.getByTestId("product-ai-input"), "bonjour");
    fireEvent.press(screen.getByTestId("product-ai-input-send"));
    await waitFor(() => expect(screen.getByText("Aucun produit décrit.")).toBeTruthy());
    expect(screen.getByTestId("product-brand").props.value).toBe("");
  });
});

describe("ancien assistant", () => {
  it("l'ancien écran assistant mène au conseiller (texte + voix, voir advisor-screen.test.tsx)", () => {
    const Redirected = jest.requireActual("~/app/(app)/assistant").default;
    const el = Redirected();
    expect(el.props.href).toBe("/advisor");
  });
});

it("messages de dictée en français ; silence et annulation ignorés", () => {
  expect(speechErrorMessage("not-allowed")).toMatch(/Réglages/);
  expect(speechErrorMessage("no-speech")).toBeNull();
  expect(speechErrorMessage("aborted")).toBeNull();
});
