import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { decodeText, detectCatalogFormat, loadCatalogFile, previewCatalogFile, suggestCatalogMapping } from "@/services/sourcing/catalog-import";
import { columnIndex, readXlsx, sheetToCsv } from "@/services/sourcing/xlsx";
import { looseHeader } from "@/services/sourcing/feed-parsers";

/**
 * Import de catalogue fournisseur : fichiers RÉALISTES (export Excel « CSV » français en
 * Windows-1252, classeur .xlsx généré ici au format Office Open XML), mapping proposé, aperçu,
 * erreurs. Aucune donnée n'est enregistrée par l'aperçu.
 */
const fixture = readFileSync(path.resolve(__dirname, "../fixtures/sourcing/catalog-import/grille-fournisseur-win1252.csv"));
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");

function buildXlsx(rows: (string | number | null)[][]): Uint8Array {
  const shared: string[] = [];
  const sIdx = (s: string) => {
    const i = shared.indexOf(s);
    if (i >= 0) return i;
    shared.push(s);
    return shared.length - 1;
  };
  const col = (i: number) => String.fromCharCode(65 + i);
  const sheetRows = rows
    .map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => (v === null ? "" : typeof v === "number" ? `<c r="${col(ci)}${ri + 1}"><v>${v}</v></c>` : `<c r="${col(ci)}${ri + 1}" t="s"><v>${sIdx(v)}</v></c>`)).join("")}</row>`)
    .join("");
  const xml = (s: string) => strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${s}`);
  return zipSync({
    "[Content_Types].xml": xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    "xl/workbook.xml": xml('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Tarifs octobre" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    "xl/worksheets/sheet1.xml": xml(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`),
    "xl/sharedStrings.xml": xml(`<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${shared.map((s) => `<si><t>${s.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</t></si>`).join("")}</sst>`),
  });
}

describe("lecture des fichiers fournisseurs", () => {
  it("CSV exporté par Excel (Windows-1252, « ; », CRLF) : accents conservés", () => {
    const { text, encoding } = decodeText(new Uint8Array(fixture));
    expect(encoding).toBe("windows-1252");
    expect(text).toContain("Désignation article");
    expect(text).toContain("Écran OLED iPhone 13");
    expect(text).toContain("Prix HT (€)");
    expect(text).toContain("Batterie iPhone 13 – capacité");
    expect(detectCatalogFormat("grille.csv", new Uint8Array(fixture))).toBe("csv");
  });

  it("formats détectés par extension ou contenu ; .xls refusé avec une consigne", () => {
    expect(detectCatalogFormat("tarifs.xlsx", new Uint8Array([0x50, 0x4b]))).toBe("xlsx");
    expect(detectCatalogFormat("export", strToU8("<?xml version='1.0'?><items/>"))).toBe("xml");
    expect(detectCatalogFormat("export", strToU8('[{"sku":"A"}]'))).toBe("json");
    expect(() => detectCatalogFormat("vieux.xls", new Uint8Array([1]))).toThrow(/xlsx ou \.csv/);
  });

  it("classeur .xlsx : texte partagé, nombres, cellules vides, colonnes au-delà de Z", () => {
    expect(columnIndex("A1")).toBe(0);
    expect(columnIndex("AB12")).toBe(27);
    const bytes = buildXlsx([
      ["Référence", "Désignation", "Prix HT", "Stock"],
      ["S23-256-N", "Samsung Galaxy S23 256 Go Noir", 489.5, 7],
      ["P8-128-W", "Google Pixel 8 128 Go", null, 0],
    ]);
    const sheet = readXlsx(bytes);
    expect(sheet.name).toBe("Tarifs octobre");
    expect(sheet.rows).toEqual([
      ["Référence", "Désignation", "Prix HT", "Stock"],
      ["S23-256-N", "Samsung Galaxy S23 256 Go Noir", "489.5", "7"],
      ["P8-128-W", "Google Pixel 8 128 Go", "", "0"],
    ]);
    expect(sheetToCsv(sheet).split("\n")[1]).toBe("S23-256-N;Samsung Galaxy S23 256 Go Noir;489.5;7");
  });

  it("archive corrompue ou non-Excel : message clair", () => {
    expect(() => loadCatalogFile({ fileName: "x.xlsx", contentBase64: b64(strToU8("pas un zip")) })).toThrow(/n'est pas un classeur Excel/);
    expect(() => loadCatalogFile({ fileName: "x.xlsx", contentBase64: b64(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0])) })).toThrow(/illisible|invalide/);
    expect(() => loadCatalogFile({ fileName: "x.csv", contentBase64: "%%%" })).toThrow(/encodage invalide/);
  });
});

describe("mapping proposé sur des en-têtes réels", () => {
  it("« Réf. », « Désignation article », « Prix HT (€) », « Qté dispo »… reconnus ; prix HT déduit", () => {
    expect(looseHeader("Prix HT (€)")).toBe(" prix ht ");
    const m = suggestCatalogMapping(["Réf.", "Désignation article", "EAN", "Prix HT (€)", "Qté dispo", "Marque", "Etat", "Grade"]);
    expect(m).toMatchObject({ supplier_sku: "Réf.", title: "Désignation article", ean: "EAN", price: "Prix HT (€)", available_quantity: "Qté dispo", brand: "Marque", condition: "Etat", grade: "Grade", tax_type: { const: "ht" } });
    // une colonne n'est jamais attribuée à deux champs
    const cols = Object.values(m).filter((v) => typeof v === "string");
    expect(new Set(cols).size).toBe(cols.length);
  });
});

describe("aperçu d'import (aucune écriture)", () => {
  it("grille CSV : lignes valides, ligne sans prix signalée, montants « 1 249,00 » lus", () => {
    const p = previewCatalogFile({ file: { fileName: "grille.csv", contentBase64: b64(new Uint8Array(fixture)) } }, "EUR");
    expect(p.format).toBe("csv");
    expect(p.total).toBe(5);
    expect(p.validCount).toBe(4);
    expect(p.invalidCount).toBe(1);
    expect(p.warnings.join(" ")).toMatch(/Windows-1252/);
    expect(p.sample[0]).toMatchObject({ line: 2, reference: "IP13-128-NR-B", price: 329.9, currency: "EUR", taxType: "ht", quantity: 12, ean: "0194252707323" });
    expect(p.sample[3]).toMatchObject({ line: 5, price: null });
    expect(p.sample[3]!.errors.join(" ")).toMatch(/Prix manquant/);
    expect(p.sample[4]).toMatchObject({ price: 1249, quantity: 2 });
  });

  it("classeur Excel : même pipeline, devise par défaut de l'organisation", () => {
    const bytes = buildXlsx([
      ["Code article", "Libellé", "Prix net", "Disponible"],
      ["A-1", "iPad 9 64 Go Gris sidéral Grade A", 199, 3],
    ]);
    const p = previewCatalogFile({ file: { fileName: "tarifs.xlsx", contentBase64: b64(bytes) }, defaults: { taxType: "ht" } }, "EUR");
    expect(p.format).toBe("xlsx");
    expect(p.validCount).toBe(1);
    expect(p.sample[0]).toMatchObject({ reference: "A-1", title: "iPad 9 64 Go Gris sidéral Grade A", price: 199, currency: "EUR", quantity: 3 });
  });

  it("mapping fourni par l'utilisateur respecté (aucune substitution)", () => {
    const p = previewCatalogFile({ file: { fileName: "grille.csv", contentBase64: b64(new Uint8Array(fixture)) }, mapping: { external_offer_id: "EAN", title: "Désignation article", price: "Prix HT (€)" } }, "EUR");
    expect(p.mapping).toEqual({ external_offer_id: "EAN", title: "Désignation article", price: "Prix HT (€)" });
    // l'EAN choisi comme identifiant : lignes sans EAN refusées, jamais complétées
    expect(p.invalidCount).toBe(2); // écran et batterie : sans EAN (la batterie n'a pas non plus de prix)
  });
});
