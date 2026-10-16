import { describe, expect, it } from "vitest";
import { categoryOf, frenchTitle, queryTargetsDevice, shortSupplierName } from "@/domain/sourcing/offer-display";

describe("frenchTitle", () => {
  it("traduit les termes courants sans toucher aux modèles, capacités ni grades", () => {
    expect(frenchTitle("Protector de cristal templado completo Iphone 15 Pro")).toBe("Verre trempé complet iPhone 15 Pro");
    expect(frenchTitle("Protector de cristal templado completo Iphone 15 PRO MAX")).toBe("Verre trempé complet iPhone 15 Pro Max");
    expect(frenchTitle("Pantalla completa para iPhone 13 Negro")).toBe("Écran complet pour iPhone 13 noir");
    expect(frenchTitle("iPhone 15 Pro Used - 128 GB / Mixed / A/B Grade")).toBe("iPhone 15 Pro occasion - 128 GB / mixte / A/B Grade");
    expect(frenchTitle("Apple iPhone 13 128GB Midnight Grade A")).toBe("Apple iPhone 13 128GB minuit Grade A");
    expect(frenchTitle("Lepení pod baterii iPhone 15 Pro")).toBe("Adhésif de batterie iPhone 15 Pro");
    expect(frenchTitle("Tapa trasera con lente de cámara iPhone 12 azul")).toBe("Vitre arrière avec lentille de caméra iPhone 12 bleu");
    expect(frenchTitle("Battery for iPhone 11 replacement")).toBe("Batterie pour iPhone 11 de remplacement");
  });

  it("ne modifie pas un titre déjà en français ni l'intérieur des mots", () => {
    expect(frenchTitle("Écran OLED iPhone 13 qualité origine")).toBe("Écran OLED iPhone 13 qualité origine");
    expect(frenchTitle("Connecteur de charge iPhone 12")).toBe("Connecteur de charge iPhone 12");
    expect(frenchTitle("Batterie iPhone 12 compatible 2815 mAh")).toBe("Batterie iPhone 12 compatible 2815 mAh");
  });
});

describe("categoryOf", () => {
  it("range chaque offre dans une catégorie simple", () => {
    expect(categoryOf("Apple iPhone 15 Pro 128GB Grade A")).toBe("devices");
    expect(categoryOf("Protector de cristal templado completo Iphone 15 Pro")).toBe("protection");
    expect(categoryOf("Pantalla OLED iPhone 15 Pro")).toBe("screens");
    expect(categoryOf("Batería iPhone 15 Pro")).toBe("batteries");
    expect(categoryOf("Tapa trasera iPhone 15 Pro")).toBe("parts");
    expect(categoryOf("Cargador USB-C 20W")).toBe("accessories");
    expect(categoryOf("Lote de 10 iPhone 11")).toBe("lots");
  });

  it("une recherche de modèle vise un appareil ; une recherche de pièce non", () => {
    expect(queryTargetsDevice("iPhone 15 Pro")).toBe(true);
    expect(queryTargetsDevice("écran iPhone 12")).toBe(false);
    expect(queryTargetsDevice("batterie iPhone 11")).toBe(false);
  });
});

describe("shortSupplierName", () => {
  it("retire la précision entre parenthèses et le sous-titre", () => {
    expect(shortSupplierName("Repuestosmovil (ES) — pièces détachées")).toBe("Repuestosmovil");
    expect(shortSupplierName("Foxway (Reseller Portal / Wholesale)")).toBe("Foxway");
    expect(shortSupplierName("Brico-phone")).toBe("Brico-phone");
  });
});
