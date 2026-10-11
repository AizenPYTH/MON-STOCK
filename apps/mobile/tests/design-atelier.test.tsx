import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Package, Sun } from "lucide-react-native";
import { Estimate, FloatingTabBar, QualityBars, Tile, TrustBadge } from "~/components/ui";
import { color } from "~/theme/tokens";

/**
 * Handoff « Atelier » : langage de confiance (chiffre nu = certain, « ≈ » = estimé, « — » =
 * inconnu, jamais 0), tuiles et barre d'onglets flottante.
 */
jest.mock("expo-haptics", () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));

describe("langage de confiance", () => {
  it("Tile sans valeur : « — » et annoncée « inconnu », jamais 0", () => {
    render(<Tile label="Marge du jour" value={null} reason="coûts d'achat inconnus" tone="success" />);
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.getByLabelText("Marge du jour : inconnu, coûts d'achat inconnus")).toBeTruthy();
  });

  it("Tile appuyable : rôle bouton et action", () => {
    const onPress = jest.fn();
    render(<Tile label="Rupture" value="3" tone="danger" onPress={onPress} />);
    fireEvent.press(screen.getByRole("button", { name: "Rupture : 3" }));
    expect(onPress).toHaveBeenCalled();
    expect(screen.getByText("3")).toHaveStyle({ color: color.dangerInk });
  });

  it("Estimate : préfixe ≈, raison affichée au tap ; inconnu → « — »", () => {
    const { rerender } = render(<Estimate value="100 €" reason="Frais eBay non renseignés" />);
    expect(screen.getByText("≈ 100 €")).toBeTruthy();
    expect(screen.queryByText("Frais eBay non renseignés")).toBeNull();
    fireEvent.press(screen.getByRole("button"));
    expect(screen.getByText("Frais eBay non renseignés")).toBeTruthy();
    rerender(<Estimate value={null} reason="coût inconnu" />);
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("TrustBadge : libellés et fraîcheur ambre au-delà de 7 jours", () => {
    render(
      <>
        <TrustBadge kind="api" />
        <TrustBadge kind="missing" />
        <TrustBadge kind="unverified" />
        <TrustBadge kind="freshness" ageDays={12} />
      </>,
    );
    expect(screen.getByText("API connectée")).toBeTruthy();
    expect(screen.getByText("Donnée manquante")).toBeTruthy();
    expect(screen.getByText("Non vérifié")).toBeTruthy();
    expect(screen.getByText("observé il y a 12 j")).toHaveStyle({ color: color.accentInkOnSoft });
  });

  it("QualityBars : n segments sur 4, annoncés", () => {
    render(<QualityBars filled={3} />);
    expect(screen.getByLabelText("Qualité des données : 3 sur 4")).toBeTruthy();
  });
});

describe("barre d'onglets flottante", () => {
  function setup(index = 0) {
    const emit = jest.fn(() => ({ defaultPrevented: false }));
    const navigate = jest.fn();
    const routes = [
      { key: "today-1", name: "today", params: undefined },
      { key: "stock-1", name: "stock", params: undefined },
    ];
    const descriptors = {
      "today-1": { options: { title: "Aujourd'hui", tabBarIcon: ({ color: c, size }: { color: string; size: number }) => <Sun color={c} size={size} /> } },
      "stock-1": { options: { title: "Stock", tabBarIcon: ({ color: c, size }: { color: string; size: number }) => <Package color={c} size={size} /> } },
    };
    const props = { state: { index, routes, key: "tabs", routeNames: ["today", "stock"], type: "tab", stale: false, history: [] }, descriptors, navigation: { emit, navigate }, insets: { top: 0, bottom: 34, left: 0, right: 0 } };
    render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, bottom: 34, left: 0, right: 0 } }}>
        <FloatingTabBar {...(props as unknown as Parameters<typeof FloatingTabBar>[0])} />
      </SafeAreaProvider>,
    );
    return { emit, navigate };
  }

  it("onglet actif annoncé, appui sur un autre onglet → navigation", () => {
    const { emit, navigate } = setup(0);
    expect(screen.getByRole("tab", { name: "Aujourd'hui" })).toBeSelected();
    fireEvent.press(screen.getByRole("tab", { name: "Stock" }));
    expect(emit).toHaveBeenCalledWith({ type: "tabPress", target: "stock-1", canPreventDefault: true });
    expect(navigate).toHaveBeenCalledWith("stock", undefined);
  });

  it("appui sur l'onglet déjà actif : pas de navigation", () => {
    const { navigate } = setup(1);
    fireEvent.press(screen.getByRole("tab", { name: "Stock" }));
    expect(navigate).not.toHaveBeenCalled();
  });
});
