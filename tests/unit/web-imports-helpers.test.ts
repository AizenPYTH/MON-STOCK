import { describe, expect, it } from "vitest";
import type { ImportJobDTO } from "@/features/mobile-api/contract";
import { countsText, fileIssue, fileSizeLabel, ignoredCount, importBreakdown, issuesCsv, isIssueKind, mappingIssues, MAX_FILE_BYTES, taxTypeOf, withColumn, withTaxType } from "@/features/catalog-imports/labels";
import { assertContentLength, buildCatalogBody, CatalogRequestError, fileToCatalogInput, MULTIPART_OVERHEAD_BYTES, parseOptions, validationMessage } from "@/features/catalog-imports/request";
import { catalogImportSchema, catalogPreviewSchema, MAX_CATALOG_BYTES } from "@/services/sourcing/catalog-import";

const counts = (over: Partial<ImportJobDTO["counts"]> = {}): ImportJobDTO["counts"] => ({ read: 0, valid: 0, created: 0, updated: 0, unchanged: 0, duplicates: 0, invalid: 0, rejected: 0, unrecognized: 0, expired: 0, ...over });

function fakeFile(name: string, content: string | Uint8Array, size?: number) {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  return { name, size: size ?? bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer };
}

describe("imports web : taille maximale identique à l'Edge", () => {
  it("15 Mo, comme MAX_CATALOG_BYTES du service", () => {
    expect(MAX_FILE_BYTES).toBe(MAX_CATALOG_BYTES);
  });

  it("refuse un fichier vide, trop gros ou .xls avant l'envoi", () => {
    expect(fileIssue({ name: "a.csv", size: 0 })).toBe("Le fichier est vide.");
    expect(fileIssue({ name: "a.csv", size: MAX_FILE_BYTES + 1 })).toMatch(/15 Mo/);
    expect(fileIssue({ name: "vieux.XLS", size: 10 })).toMatch(/\.xls/);
    expect(fileIssue({ name: "ok.xlsx", size: 10 })).toBeNull();
  });

  it("refuse un corps annoncé trop volumineux avant lecture (413)", () => {
    expect(() => assertContentLength(String(MAX_FILE_BYTES + MULTIPART_OVERHEAD_BYTES + 1))).toThrow(CatalogRequestError);
    expect(() => assertContentLength(String(MAX_FILE_BYTES))).not.toThrow();
    expect(() => assertContentLength(null)).not.toThrow();
  });
});

describe("imports web : corps reconstruit pour les schémas de l'Edge", () => {
  it("encode le fichier en base64 et le schéma d'aperçu l'accepte", async () => {
    const raw = fakeFile("prix.csv", "ref;titre;prix\nA1;iPhone 13;399\n");
    const file = await fileToCatalogInput(raw, undefined, raw.size);
    expect(Buffer.from(file.contentBase64, "base64").toString("utf8")).toContain("iPhone 13");
    const body = buildCatalogBody("preview", file, { mapping: { title: "titre" }, defaults: { currency: "EUR", taxType: "ht" }, supplierName: "ignoré à l'aperçu", force: true });
    expect(body).not.toHaveProperty("supplierName");
    expect(body).not.toHaveProperty("force");
    expect(catalogPreviewSchema.safeParse(body).success).toBe(true);
  });

  it("le schéma d'import exige fournisseur et colonnes minimales", async () => {
    const file = await fileToCatalogInput(fakeFile("prix.csv", "ref;titre;prix\n"), "Feuille 1", 15);
    expect(file.sheet).toBe("Feuille 1");
    const ok = buildCatalogBody("import", file, { mapping: { supplier_sku: "ref", title: "titre", price: "prix" }, defaults: { currency: "EUR", taxType: "unknown" }, supplierName: "Grossiste X", mode: "snapshot", unexpected: "x" });
    expect(ok).not.toHaveProperty("unexpected");
    const parsed = catalogImportSchema.safeParse(ok);
    expect(parsed.success).toBe(true);
    const missing = catalogImportSchema.safeParse(buildCatalogBody("import", file, { mapping: { title: "titre" }, defaults: { currency: "EUR" }, supplierName: "Grossiste X" }));
    expect(missing.success).toBe(false);
    if (!missing.success) expect(validationMessage(missing.error.issues)).toBe("Associez au minimum la référence (ou l'EAN), la désignation et le prix.");
  });

  it("refuse un fichier absent, vide ou trop gros, et des options illisibles", async () => {
    await expect(fileToCatalogInput(null)).rejects.toThrow(/Choisissez un fichier/);
    await expect(fileToCatalogInput(fakeFile("a.csv", ""))).rejects.toThrow(/vide/);
    await expect(fileToCatalogInput(fakeFile("a.csv", "x", MAX_FILE_BYTES + 1), undefined, 1)).rejects.toMatchObject({ status: 413 });
    // fichier tronqué en route (taille annoncée différente) ou taille non annoncée : refusé, rien n'est lu
    await expect(fileToCatalogInput(fakeFile("a.csv", "abc"), undefined, 10)).rejects.toThrow(/incomplet/);
    await expect(fileToCatalogInput(fakeFile("a.csv", "abc"))).rejects.toThrow(/incomplet/);
    expect(parseOptions(null)).toEqual({});
    expect(parseOptions('{"mode":"partial"}')).toEqual({ mode: "partial" });
    expect(() => parseOptions("[1]")).toThrow(/illisibles/);
    expect(() => parseOptions("{")).toThrow(/illisibles/);
  });

  it("messages de validation en français", () => {
    expect(validationMessage([{ message: "Too small: expected string to have >=2 characters", path: ["supplierName"] }])).toBe("Nom du fournisseur (2 à 160 caractères) : valeur invalide.");
    expect(validationMessage([{ message: "Devise sur 3 lettres (EUR, USD…).", path: ["defaults", "currency"] }])).toBe("Devise sur 3 lettres (EUR, USD…).");
    expect(validationMessage([{ message: "Invalid input", path: ["x"] }])).toBe("Vérifiez les informations de l'import.");
    expect(validationMessage([])).toBe("Demande invalide.");
  });
});

describe("imports web : correspondance des colonnes", () => {
  it("exige identifiant, désignation et prix", () => {
    expect(mappingIssues({})).toHaveLength(3);
    expect(mappingIssues({ ean: "EAN", title: "Nom", price: "Prix" })).toEqual([]);
  });

  it("type de prix porté par une constante, colonnes ajoutées / retirées", () => {
    const m = withTaxType({ title: "Nom" }, "ht");
    expect(taxTypeOf(m)).toBe("ht");
    expect(taxTypeOf(withTaxType(m, "unknown"))).toBe("unknown");
    expect(withColumn({ title: "Nom" }, "price", "Prix")).toEqual({ title: "Nom", price: "Prix" });
    expect(withColumn({ title: "Nom", price: "Prix" }, "price", null)).toEqual({ title: "Nom" });
  });
});

describe("imports web : historique et rapport", () => {
  it("résumé et lignes ignorées", () => {
    const c = counts({ created: 1, updated: 2, unchanged: 0, duplicates: 1, invalid: 2, rejected: 0, unrecognized: 3, expired: 4 });
    expect(countsText(c)).toBe("1 nouvelle · 2 mises à jour · 0 inchangée · 3 ignorées · 4 expirées");
    expect(ignoredCount(c)).toBe(6);
  });

  it("répartition en vrais comptes (0 % sans ligne)", () => {
    const parts = importBreakdown(counts({ created: 1, updated: 1, unchanged: 2 }));
    expect(parts.map((p) => [p.key, p.value, p.percent])).toEqual([
      ["created", 1, 25],
      ["updated", 1, 25],
      ["unchanged", 2, 50],
      ["ignored", 0, 0],
    ]);
    expect(importBreakdown(counts()).every((p) => p.percent === 0)).toBe(true);
  });

  it("CSV du rapport : BOM, « ; », guillemets échappés", () => {
    const csv = issuesCsv({ issues: [{ line: 3, kind: "invalid", reference: "A;1", message: 'Prix "abc" illisible', excerpt: null }, { line: null, kind: "warning", reference: null, message: "ok", excerpt: null }] });
    expect(csv.startsWith("﻿ligne;type;reference;message\n")).toBe(true);
    expect(csv).toContain('3;Ligne illisible;"A;1";"Prix ""abc"" illisible"');
    expect(csv).toContain(";Remarque;;ok");
  });

  it("divers", () => {
    expect(isIssueKind("duplicate")).toBe(true);
    expect(isIssueKind("drop")).toBe(false);
    expect(fileSizeLabel(null)).toBe("—");
    expect(fileSizeLabel(1536)).toBe("2 Ko");
    expect(fileSizeLabel(2.5 * 1024 * 1024)).toBe("2,5 Mo");
  });
});
