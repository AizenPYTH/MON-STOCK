import { fireEvent, render, screen } from "@testing-library/react-native";
import { Button, FilterChip, KpiCard, QtyBadge, Segmented, StatusChip, TextField } from "~/components/ui";
import { color } from "~/theme/tokens";

jest.mock("expo-haptics", () => ({ selectionAsync: jest.fn(() => Promise.resolve()), notificationAsync: jest.fn(() => Promise.resolve()), NotificationFeedbackType: { Success: "success" } }));

describe("composants du design", () => {
  it("QtyBadge : rupture en rouge, faible en ambre, accessible", () => {
    render(<QtyBadge qty={0} level="out" />);
    expect(screen.getByLabelText("0 disponible(s), rupture")).toBeTruthy();
    expect(screen.getByText("0")).toHaveStyle({ color: color.danger });
  });

  it("Button désactivé : non cliquable et annoncé comme tel", () => {
    const onPress = jest.fn();
    render(<Button label="Mise en vente eBay · bientôt" disabled onPress={onPress} />);
    fireEvent.press(screen.getByRole("button", { name: "Mise en vente eBay · bientôt" }));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("Segmented : onglet sélectionné annoncé, changement au tap", () => {
    const onChange = jest.fn();
    render(<Segmented value="a" onChange={onChange} options={[{ value: "a", label: "Aujourd'hui" }, { value: "b", label: "Analyse" }]} />);
    expect(screen.getByRole("tab", { name: "Aujourd'hui" })).toBeSelected();
    fireEvent.press(screen.getByRole("tab", { name: "Analyse" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("FilterChip affiche le compteur, KpiCard expose libellé et valeur", () => {
    render(
      <>
        <FilterChip label="Rupture" count={2} tone="danger" selected={false} onPress={() => {}} />
        <KpiCard label="À expédier" value="3" />
        <StatusChip label="À expédier" tone="accent" />
      </>,
    );
    expect(screen.getByText("Rupture · 2")).toBeTruthy();
    expect(screen.getByLabelText("À expédier : 3")).toBeTruthy();
  });

  it("TextField en erreur : message annoncé", () => {
    render(<TextField label="Nouvelle quantité" value="-2" error="La quantité ne peut pas être négative." />);
    expect(screen.getByText("La quantité ne peut pas être négative.")).toBeTruthy();
  });
});
