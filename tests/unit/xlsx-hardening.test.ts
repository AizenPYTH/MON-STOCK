import { describe, expect, it } from "vitest";
import { Deflate, deflateSync, strToU8, zipSync } from "fflate";
import { columnIndex, DEFAULT_XLSX_LIMITS, readXlsx, sheetToCsv, XlsxError } from "@/services/sourcing/xlsx";
import { loadCatalogFile } from "@/services/sourcing/catalog-import";
import { MAX_FEED_ROWS } from "@/services/sourcing/feed-parsers";

/**
 * Durcissement du lecteur XLSX (audit I-04, Q-13) : fichiers envoyés par les utilisateurs et lus
 * dans l'Edge Function partagée. Toutes les archives piégées sont générées ici, petites sur disque.
 */

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const WORKBOOK = `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Tarifs" sheetId="1" r:id="rId1"/></sheets></workbook>`;
const RELS = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
const sheetXml = (rows: string) => `${XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;

function workbookWith(sheet: string, extra: Record<string, Uint8Array> = {}): Uint8Array {
  return zipSync({ "xl/workbook.xml": strToU8(WORKBOOK), "xl/_rels/workbook.xml.rels": strToU8(RELS), "xl/worksheets/sheet1.xml": strToU8(sheet), ...extra });
}

const inline = (ref: string, v: string) => `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`;

/** Archive ZIP écrite à la main : tailles déclarées, méthode et champs ZIP64 entièrement contrôlés. */
interface RawEntry {
  name: string;
  data: Uint8Array;
  method: 0 | 8;
  declaredSize?: number;
  /** champ supplémentaire du répertoire central (ZIP64…) */
  extra?: Uint8Array;
  compressedSizeField?: number;
}
function rawZip(entries: RawEntry[], tweakEocd?: (eocd: DataView) => void): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = strToU8(e.name);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, e.method, true);
    lv.setUint32(18, e.data.length, true);
    lv.setUint32(22, e.declaredSize ?? e.data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const extra = e.extra ?? new Uint8Array(0);
    const cd = new Uint8Array(46 + name.length + extra.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, e.method, true);
    cv.setUint32(20, e.compressedSizeField ?? e.data.length, true);
    cv.setUint32(24, e.declaredSize ?? e.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, extra.length, true);
    cv.setUint32(42, offset, true);
    cd.set(name, 46);
    cd.set(extra, 46 + name.length);
    parts.push(local, e.data);
    central.push(cd);
    offset += local.length + e.data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  tweakEocd?.(ev);
  const all = [...parts, ...central, eocd];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of all) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Flux DEFLATE de `total` octets d'espaces, produit par morceaux (jamais en mémoire en entier). */
function deflatedSpaces(prefix: string, total: number, suffix: string): Uint8Array {
  const chunks: Uint8Array[] = [];
  const d = new Deflate({ level: 9 }, (chunk) => chunks.push(chunk));
  d.push(strToU8(prefix));
  const block = new Uint8Array(1024 * 1024).fill(0x20);
  for (let sent = 0; sent < total; sent += block.length) d.push(block);
  d.push(strToU8(suffix), true);
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function timed<T>(fn: () => T): { ms: number; error: unknown; value: T | undefined } {
  const t0 = Date.now();
  try {
    const value = fn();
    return { ms: Date.now() - t0, error: null, value };
  } catch (error) {
    return { ms: Date.now() - t0, error, value: undefined };
  }
}

describe("XLSX — références de cellule bornées (I-04)", () => {
  it("columnIndex refuse les références au-delà de XFD1048576 ou trop longues, sans calcul", () => {
    expect(columnIndex("A1")).toBe(0);
    expect(columnIndex("XFD1048576")).toBe(16_383);
    for (const ref of ["ZZZZZZZZ1", "XFE1", "A1048577", "A0", "1A", "", "A".repeat(10_000) + "1"]) {
      expect(() => columnIndex(ref), ref.slice(0, 20)).toThrow(XlsxError);
    }
  });

  it("une cellule « ZZZZZZZZ1 » est refusée immédiatement (aucune ligne de 2×10¹¹ cases allouée)", () => {
    const bytes = workbookWith(sheetXml(`<row r="1">${inline("A1", "Ref")}${inline("ZZZZZZZZ1", "x")}</row>`));
    const r = timed(() => readXlsx(bytes));
    expect(r.error).toBeInstanceOf(XlsxError);
    expect((r.error as Error).message).toMatch(/référence de cellule incorrecte/);
    expect(r.ms).toBeLessThan(1000);
  });

  it("cellule de mise en forme vide lointaine (XFD) ignorée ; valeur au-delà de la largeur maximale refusée", () => {
    const ok = readXlsx(workbookWith(sheetXml(`<row r="1">${inline("A1", "Ref")}<c r="XFD1" s="3"/></row>`)));
    expect(ok.rows).toEqual([["Ref"]]);
    expect(() => readXlsx(workbookWith(sheetXml(`<row r="1">${inline("A1", "Ref")}${inline("XFD1", "loin")}</row>`)))).toThrow(/Feuille trop large/);
  });
});

describe("XLSX — fichiers volumineux (I-04)", () => {
  it(`fichier normal très long : au-delà de ${MAX_FEED_ROWS} lignes de données, feuille tronquée et signalée`, () => {
    const rows: string[] = [`<row r="1">${inline("A1", "Ref")}${inline("B1", "Prix")}</row>`];
    for (let i = 2; i <= MAX_FEED_ROWS + 11; i++) rows.push(`<row r="${i}"><c r="A${i}" t="inlineStr"><is><t>R${i}</t></is></c><c r="B${i}"><v>${i}</v></c></row>`);
    const bytes = workbookWith(sheetXml(rows.join("")));
    expect(bytes.byteLength).toBeLessThan(15 * 1024 * 1024);
    const sheet = readXlsx(bytes);
    expect(sheet.rows).toHaveLength(MAX_FEED_ROWS + 1);
    expect(sheet.truncated).toBe(true);
    expect(sheetToCsv(sheet).split("\n")).toHaveLength(MAX_FEED_ROWS + 1);
    const loaded = loadCatalogFile({ fileName: "grille.xlsx", contentBase64: Buffer.from(bytes).toString("base64") });
    expect(loaded.notes.join(" ")).toMatch(/tronqu/i);
  });

  it("plafonds de cellules, de lignes et de textes partagés : erreur claire", () => {
    const row = (i: number) => `<row r="${i}">${inline(`A${i}`, "a")}${inline(`B${i}`, "b")}${inline(`C${i}`, "c")}</row>`;
    const bytes = workbookWith(sheetXml(Array.from({ length: 50 }, (_, i) => row(i + 1)).join("")));
    expect(() => readXlsx(bytes, undefined, { maxCells: 100 })).toThrow(/trop de cellules/);
    expect(() => readXlsx(bytes, undefined, { maxRowElements: 10 })).toThrow(/trop de lignes/);
    const sst = strToU8(`${XML}<sst>${"<si><t>x</t></si>".repeat(20)}</sst>`);
    expect(() => readXlsx(workbookWith(sheetXml(row(1)), { "xl/sharedStrings.xml": sst }), undefined, { maxSharedStrings: 10 })).toThrow(/textes partagés/);
  });

  it("taille décompressée MESURÉE : une bombe qui ment sur sa taille déclarée est arrêtée", () => {
    // 200 Mo d'espaces dans la feuille → ≈ 200 Ko compressés ; l'archive annonce 1 000 octets.
    const sheet = deflatedSpaces(`${XML}<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>x</t></is></c></row>`, 200 * 1024 * 1024, "</sheetData></worksheet>");
    expect(sheet.byteLength).toBeLessThan(1024 * 1024);
    const bytes = rawZip([
      { name: "xl/workbook.xml", data: deflateSync(strToU8(WORKBOOK)), method: 8, declaredSize: WORKBOOK.length },
      { name: "xl/_rels/workbook.xml.rels", data: deflateSync(strToU8(RELS)), method: 8, declaredSize: RELS.length },
      { name: "xl/worksheets/sheet1.xml", data: sheet, method: 8, declaredSize: 1000 },
    ]);
    const before = process.memoryUsage().arrayBuffers;
    const r = timed(() => readXlsx(bytes));
    expect(r.error).toBeInstanceOf(XlsxError);
    expect((r.error as Error).message).toMatch(/trop volumineux une fois décompressé/);
    expect(r.ms).toBeLessThan(5000);
    // jamais plus que la limite (+ un morceau) en mémoire, loin des 200 Mo de la bombe
    expect(process.memoryUsage().arrayBuffers - before).toBeLessThan(DEFAULT_XLSX_LIMITS.maxUnzippedBytes * 2);
  });

  it("bombe honnête (taille déclarée exacte) : refusée sans décompresser", () => {
    const sheet = deflatedSpaces(`${XML}<worksheet><sheetData>`, 64 * 1024 * 1024, "</sheetData></worksheet>");
    const bytes = rawZip([
      { name: "xl/workbook.xml", data: deflateSync(strToU8(WORKBOOK)), method: 8, declaredSize: WORKBOOK.length },
      { name: "xl/worksheets/sheet1.xml", data: sheet, method: 8, declaredSize: 64 * 1024 * 1024 + 60 },
    ]);
    const r = timed(() => readXlsx(bytes));
    expect((r.error as Error).message).toMatch(/trop volumineux une fois décompressé/);
    expect(r.ms).toBeLessThan(1000);
  });
});

describe("XLSX — archives malformées (I-04, Q-13)", () => {
  const valid = workbookWith(sheetXml(`<row r="1">${inline("A1", "Ref")}</row>`));

  it("archives tronquées, octets aléatoires, données DEFLATE corrompues : message clair, sans plantage", () => {
    const samples: Uint8Array[] = [
      valid.subarray(0, valid.length - 10),
      valid.subarray(0, 40),
      new Uint8Array([0x50, 0x4b, ...Array.from({ length: 4000 }, (_, i) => (i * 7919) % 256)]),
      rawZip([{ name: "xl/workbook.xml", data: new Uint8Array([0xff, 0xff, 0xff, 0x00, 0x01]), method: 8, declaredSize: 100 }]),
      rawZip([{ name: "xl/workbook.xml", data: strToU8(WORKBOOK), method: 0 }], (ev) => ev.setUint32(16, 0x7fffff00, true)),
    ];
    for (const s of samples) {
      const r = timed(() => readXlsx(s));
      expect(r.error, String(s.length)).toBeInstanceOf(XlsxError);
      expect((r.error as Error).message).toMatch(/illisible|invalide/);
      expect((r.error as Error).message).not.toMatch(/at |\.ts|undefined|offset/i);
      expect(r.ms).toBeLessThan(1000);
    }
  });

  it("ZIP64 corrompu (localisateur absent ou hors fichier, compte d'entrées géant, champ supplémentaire vide) : aucune boucle", () => {
    const entry = { name: "xl/workbook.xml", data: strToU8(WORKBOOK), method: 0 as const };
    const z64NoLocator = rawZip([entry], (ev) => ev.setUint16(10, 0xffff, true));
    // localisateur ZIP64 présent, enregistrement pointant hors du fichier
    const withLocator = (() => {
      const base = rawZip([entry], (ev) => {
        ev.setUint16(8, 0xffff, true);
        ev.setUint16(10, 0xffff, true);
        ev.setUint32(12, 0xffffffff, true);
        ev.setUint32(16, 0xffffffff, true);
      });
      const eocd = base.subarray(base.length - 22);
      const locator = new Uint8Array(20);
      const lv = new DataView(locator.buffer);
      lv.setUint32(0, 0x07064b50, true);
      lv.setUint32(8, 0xfffffff0, true); // décalage de l'enregistrement ZIP64 bien au-delà du fichier
      lv.setUint32(12, 0x0, true);
      lv.setUint32(16, 1, true);
      const out = new Uint8Array(base.length + 20);
      out.set(base.subarray(0, base.length - 22));
      out.set(locator, base.length - 22);
      out.set(eocd, base.length - 2);
      return out;
    })();
    // enregistrement ZIP64 valide annonçant 2^40 entrées
    const hugeCount = (() => {
      const base = rawZip([entry], (ev) => ev.setUint16(10, 0xffff, true));
      const body = base.subarray(0, base.length - 22);
      const z64 = new Uint8Array(56);
      const zv = new DataView(z64.buffer);
      zv.setUint32(0, 0x06064b50, true);
      zv.setUint32(32, 0, true);
      zv.setUint32(36, 0x100, true); // 2^40 entrées
      const locator = new Uint8Array(20);
      const lv = new DataView(locator.buffer);
      lv.setUint32(0, 0x07064b50, true);
      lv.setUint32(8, body.length, true);
      const eocd = base.subarray(base.length - 22);
      const out = new Uint8Array(body.length + 56 + 20 + 22);
      out.set(body);
      out.set(z64, body.length);
      out.set(locator, body.length + 56);
      out.set(eocd, body.length + 76);
      return out;
    })();
    // taille compressée saturée (0xFFFFFFFF) sans champ ZIP64 exploitable (cas de l'avis GHSA-px8p-9vwx-vf98)
    const emptyExtra = rawZip([{ ...entry, compressedSizeField: 0xffffffff, extra: new Uint8Array([0x01, 0x00, 0x00, 0x00]) }]);
    const truncatedExtra = rawZip([{ ...entry, compressedSizeField: 0xffffffff, extra: new Uint8Array([0x01, 0x00, 0x10, 0x00, 1, 2, 3]) }]);
    for (const [label, s] of Object.entries({ z64NoLocator, withLocator, hugeCount, emptyExtra, truncatedExtra })) {
      const r = timed(() => readXlsx(s));
      expect(r.error, label).toBeInstanceOf(XlsxError);
      expect((r.error as Error).message, label).toMatch(/illisible|invalide/);
      expect(r.ms, label).toBeLessThan(1000);
    }
  });

  it("archive chiffrée et DOCTYPE (entités) refusés avec un message utilisateur", () => {
    const encrypted = rawZip([{ name: "xl/workbook.xml", data: strToU8(WORKBOOK), method: 0 }]);
    // drapeau « chiffré » dans le répertoire central
    const cdStart = encrypted.length - 22 - (46 + "xl/workbook.xml".length);
    encrypted[cdStart + 8] = 0x01;
    expect(() => readXlsx(encrypted)).toThrow(/mot de passe/);
    const doctype = `${XML}<!DOCTYPE workbook [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><workbook><sheets><sheet name="&b;" sheetId="1" r:id="rId1"/></sheets></workbook>`;
    expect(() => readXlsx(zipSync({ "xl/workbook.xml": strToU8(doctype) }))).toThrow(/DOCTYPE/);
  });

  it("préfixes d'espace de noms, texte enrichi, entités et indications phonétiques lus correctement", () => {
    const sst = strToU8(`${XML}<x:sst xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:si><x:r><x:t>Écran </x:t></x:r><x:r><x:rPr><x:b/></x:rPr><x:t xml:space="preserve">&lt;OLED&gt; &amp; co</x:t></x:r><x:rPh sb="0" eb="1"><x:t>フリガナ</x:t></x:rPh></x:si><x:si><x:t/></x:si></x:sst>`);
    const sheet = `${XML}<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData><x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c><x:c r="C1" t="b"><x:v>1</x:v></x:c><x:c r="D1"><x:f>1+1</x:f><x:v>2</x:v></x:c><x:c r="E1" t="e"><x:v>#N/A</x:v></x:c><x:c r="F1" t="inlineStr"><x:is><x:t>&#233;t&#xE9;</x:t></x:is></x:c></x:row></x:sheetData></x:worksheet>`;
    const r = readXlsx(workbookWith(sheet, { "xl/sharedStrings.xml": sst }));
    expect(r.rows).toEqual([["Écran <OLED> & co", "", "true", "2", "", "été"]]);
  });
});
