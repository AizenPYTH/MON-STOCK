import { describe, expect, it } from "vitest";
import { moveIndex, paletteKeyAction, paletteOptionId, triggerOpenTarget, typeaheadIndex } from "@/components/layout/keyboard-nav";

describe("W-25 · moveIndex (menus : boucle par défaut)", () => {
  it("↓ / ↑ avancent et reculent, en boucle aux extrémités", () => {
    expect(moveIndex(0, 3, "ArrowDown")).toBe(1);
    expect(moveIndex(2, 3, "ArrowDown")).toBe(0);
    expect(moveIndex(1, 3, "ArrowUp")).toBe(0);
    expect(moveIndex(0, 3, "ArrowUp")).toBe(2);
  });

  it("sans élément actif (-1) : ↓ = premier, ↑ = dernier", () => {
    expect(moveIndex(-1, 4, "ArrowDown")).toBe(0);
    expect(moveIndex(-1, 4, "ArrowUp")).toBe(3);
  });

  it("Début / Fin ; autres touches ignorées ; liste vide → null", () => {
    expect(moveIndex(2, 5, "Home")).toBe(0);
    expect(moveIndex(2, 5, "End")).toBe(4);
    expect(moveIndex(2, 5, "Enter")).toBeNull();
    expect(moveIndex(2, 5, "a")).toBeNull();
    expect(moveIndex(0, 0, "ArrowDown")).toBeNull();
  });

  it("sans boucle (palette) : bornes atteintes ; Début/Fin désactivables (curseur du champ)", () => {
    expect(moveIndex(2, 3, "ArrowDown", { wrap: false })).toBe(2);
    expect(moveIndex(0, 3, "ArrowUp", { wrap: false })).toBe(0);
    expect(moveIndex(1, 3, "Home", { homeEnd: false })).toBeNull();
  });
});

describe("W-25 · ouverture depuis le bouton et saisie de la première lettre", () => {
  it("↓ ouvre sur le premier élément, ↑ sur le dernier ; autres touches : comportement natif", () => {
    expect(triggerOpenTarget("ArrowDown")).toBe("first");
    expect(triggerOpenTarget("ArrowUp")).toBe("last");
    expect(triggerOpenTarget("Enter")).toBeNull();
    expect(triggerOpenTarget(" ")).toBeNull();
  });

  it("première lettre : élément suivant (en boucle), accents et casse ignorés", () => {
    const labels = ["Produit", "Import de catalogue", "Fournisseur", "Suivi de colis", "Écran"];
    expect(typeaheadIndex(labels, 0, "f")).toBe(2);
    expect(typeaheadIndex(labels, 2, "P")).toBe(0);
    expect(typeaheadIndex(labels, -1, "e")).toBe(4);
    expect(typeaheadIndex(labels, 0, "z")).toBeNull();
    expect(typeaheadIndex(labels, 0, "ArrowDown")).toBeNull();
    expect(typeaheadIndex(labels, 0, " ")).toBeNull();
  });
});

describe("W-25 · palette ⌘K (combobox)", () => {
  it("↓ / ↑ déplacent l'option active sans boucler", () => {
    expect(paletteKeyAction("ArrowDown", 0, 3)).toEqual({ type: "move", index: 1 });
    expect(paletteKeyAction("ArrowDown", 2, 3)).toEqual({ type: "move", index: 2 });
    expect(paletteKeyAction("ArrowUp", 0, 3)).toEqual({ type: "move", index: 0 });
  });

  it("↵ ouvre l'option active (rien si la liste est vide) ; Échap ferme ; Début/Fin et lettres laissées au champ", () => {
    expect(paletteKeyAction("Enter", 1, 3)).toEqual({ type: "open", index: 1 });
    expect(paletteKeyAction("Enter", -1, 0)).toBeNull();
    expect(paletteKeyAction("Escape", 0, 3)).toEqual({ type: "close" });
    expect(paletteKeyAction("Home", 2, 3)).toBeNull();
    expect(paletteKeyAction("a", 0, 3)).toBeNull();
  });

  it("identifiants d'options stables et distincts", () => {
    expect(paletteOptionId("p1", 0)).toBe("p1-opt-0");
    expect(paletteOptionId("p1", 0)).not.toBe(paletteOptionId("p1", 1));
  });
});
