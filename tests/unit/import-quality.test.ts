import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { assessImportQuality, rowIdentity } from "@/domain/sourcing/import-quality";
import { directoryTier, nextAction, SUPPLIER_DIRECTORY } from "@/services/sourcing/supplier-directory";

const ok = { totalRows: 100, validRows: 98, invalidRows: 2, duplicateRows: 0, previousRecordCount: 100, priceRatios: Array(40).fill(1.02) };

describe("contrôle de qualité d'un import (aucune écriture si suspect)", () => {
  it("accepte un import normal, signale les doublons", () => {
    expect(assessImportQuality(ok)).toEqual({ decision: "accept", issues: [], warnings: [] });
    expect(assessImportQuality({ ...ok, duplicateRows: 3 }).warnings[0]).toMatch(/3 ligne\(s\) en double/);
  });
  it("suspend : trop de lignes illisibles (mauvaise correspondance de colonnes)", () => {
    const r = assessImportQuality({ ...ok, validRows: 30, invalidRows: 70 });
    expect(r.decision).toBe("quarantine");
    expect(r.issues[0]!.code).toBe("too_many_invalid");
  });
  it("suspend : catalogue réduit de plus de moitié (fichier tronqué)", () => {
    expect(assessImportQuality({ ...ok, totalRows: 40, validRows: 40, invalidRows: 0, priceRatios: [] }).issues.map((i) => i.code)).toEqual(["catalog_shrank"]);
    // premier import : aucune référence de comparaison
    expect(assessImportQuality({ ...ok, totalRows: 40, validRows: 40, invalidRows: 0, previousRecordCount: null, priceRatios: [] }).decision).toBe("accept");
  });
  it("suspend : prix connus décalés en masse (colonne, HT/TTC ou devise erronée)", () => {
    const r = assessImportQuality({ ...ok, priceRatios: [100, 100, 98, 1.01, 102, 99, 1] });
    expect(r.issues.map((i) => i.code)).toEqual(["price_shift"]);
    // baisse ou hausse ponctuelle : accepté
    expect(assessImportQuality({ ...ok, priceRatios: [0.5, 1, 1.1, 0.95, 1.7, 1] }).decision).toBe("accept");
  });
  it("suspend : la colonne de référence n'identifie pas les produits", () => {
    expect(assessImportQuality({ ...ok, totalRows: 10, validRows: 5, invalidRows: 0, duplicateRows: 5, priceRatios: [] }).issues.map((i) => i.code)).toContain("all_duplicates");
  });
  it("identité de ligne : référence, sinon EAN, sinon MPN (insensible à la casse)", () => {
    expect(rowIdentity({ externalOfferId: " ab-1 " })).toBe("AB-1");
    expect(rowIdentity({ externalOfferId: null, ean: "0194252707323" })).toBe("EAN:0194252707323");
    expect(rowIdentity({ mpn: "mlpf3" })).toBe("MPN:MLPF3");
    expect(rowIdentity({})).toBeNull();
  });
});

describe("annuaire : niveau d'accès réel et prochaine action", () => {
  const entry = (key: string) => SUPPLIER_DIRECTORY.find((e) => e.key === key)!;
  it("un fournisseur découvert n'est jamais « connecté » sans source active ni import réussi", () => {
    for (const e of SUPPLIER_DIRECTORY) expect(directoryTier(e, ["identified", "verified"], false)).not.toBe("connected");
    expect(directoryTier(entry("foxway"), ["identified", "import_tested"], false)).toBe("connected");
    expect(directoryTier(entry("foxway"), ["identified"], true)).toBe("connected");
  });
  it("importable : flux, API, fichier ou liste de prix ; accessible : catalogue public vérifié", () => {
    expect(directoryTier({ key: "x", accessModes: ["feed_csv"] }, ["identified"], false)).toBe("importable");
    expect(directoryTier({ key: "x", accessModes: ["email_pricelist"] }, ["identified"], false)).toBe("importable");
    expect(directoryTier({ key: "x", accessModes: ["public_catalog"] }, ["identified", "verified"], false)).toBe("accessible");
    expect(directoryTier({ key: "x", accessModes: ["public_catalog"] }, ["identified"], false)).toBe("identified");
    expect(directoryTier({ key: "x", accessModes: ["pro_portal"] }, ["identified", "verified"], false)).toBe("verified");
  });
  it("prochaine action concrète selon le mode d'accès", () => {
    expect(nextAction({ key: "refreshed-apples", accessModes: ["public_catalog"], proAccountRequired: false }, "accessible", ["identified", "verified"])).toMatch(/Activez la source/);
    expect(nextAction({ key: "x", accessModes: ["email_pricelist"], proAccountRequired: null }, "importable", ["identified"])).toMatch(/e-mail de demande de liste de prix/);
    expect(nextAction({ key: "x", accessModes: ["feed_xml"], proAccountRequired: true }, "importable", ["identified"])).toMatch(/^Créez un compte professionnel, puis demandez l'URL du flux/);
    expect(nextAction({ key: "x", accessModes: ["pro_portal"], proAccountRequired: true }, "verified", ["identified", "unavailable"])).toMatch(/injoignable/);
    expect(nextAction({ key: "x", accessModes: [], proAccountRequired: null }, "connected", ["import_tested"])).toMatch(/réimportez/);
  });
  it("les 3 sources publiques vérifiées le 10/10/2026 sont reliées à la bibliothèque", () => {
    for (const k of ["refreshed-apples", "fixje-zakelijk", "servisnidily-cz"]) expect(entry(k)).toBeDefined();
  });
});
