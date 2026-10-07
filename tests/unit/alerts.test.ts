import { describe, expect, it } from "vitest";
import { classifyStock } from "@/domain/inventory/alerts";

describe("classifyStock", () => {
  it("rupture quand plus rien n'est disponible", () => {
    expect(classifyStock({ available: 0, reorderPoint: 5, safetyStock: 2, daysOfCover: 0, leadTimeDays: 2 }).level).toBe("out_of_stock");
    expect(classifyStock({ available: -3, reorderPoint: 5, safetyStock: 2, daysOfCover: 0, leadTimeDays: 2 }).reason).toContain("négatif");
  });

  it("risque de rupture quand la couverture est inférieure au délai fournisseur", () => {
    const r = classifyStock({ available: 8, reorderPoint: 0, safetyStock: 0, daysOfCover: 1.8, leadTimeDays: 2 });
    expect(r.level).toBe("at_risk");
    expect(r.usedDefaultLeadTime).toBe(false);
  });

  it("utilise un délai par défaut explicitement signalé", () => {
    const r = classifyStock({ available: 20, reorderPoint: 0, safetyStock: 0, daysOfCover: 5, leadTimeDays: null });
    expect(r.level).toBe("at_risk");
    expect(r.usedDefaultLeadTime).toBe(true);
  });

  it("stock faible sous le seuil de réapprovisionnement", () => {
    expect(classifyStock({ available: 4, reorderPoint: 5, safetyStock: 0, daysOfCover: 40, leadTimeDays: 3 }).level).toBe("low");
  });

  it("stock normal sans données de vitesse", () => {
    const r = classifyStock({ available: 50, reorderPoint: 5, safetyStock: 0, daysOfCover: null, leadTimeDays: null });
    expect(r.level).toBe("normal");
    expect(r.reason).toContain("inconnue");
  });
});
