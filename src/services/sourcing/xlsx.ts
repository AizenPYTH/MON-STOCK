import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";

/**
 * Lecture minimale d'un classeur Excel (.xlsx, Office Open XML) : première feuille (ou feuille
 * nommée), valeurs des cellules (texte partagé, texte en ligne, nombres, booléens, formules →
 * valeur calculée en cache). Aucune macro ni formule n'est exécutée.
 *
 * Les grilles tarifaires des fournisseurs arrivent très souvent en XLSX : le contenu est converti
 * en CSV (« ; ») pour réutiliser exactement le même pipeline que les flux CSV (mapping,
 * validation, stockage, historique).
 */

export const MAX_XLSX_BYTES = 15 * 1024 * 1024;
const MAX_UNZIPPED_BYTES = 120 * 1024 * 1024;

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true, parseTagValue: false, trimValues: false, textNodeName: "#text" });

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function textOf(node: unknown): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    if ("#text" in o) return textOf(o["#text"]);
    // <si><r><t>…</t></r><r><t>…</t></r></si> (texte enrichi) ou <is><t>…</t></is>
    if ("t" in o) return textOf(o.t);
    if ("r" in o) return asArray(o.r as unknown[]).map(textOf).join("");
  }
  return "";
}

/** « AB12 » → index de colonne 27 (base 0). */
export function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0]?.toUpperCase() ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export interface XlsxSheet {
  name: string;
  rows: string[][];
}

export class XlsxError extends Error {}

function readZip(bytes: Uint8Array): Record<string, Uint8Array> {
  if (bytes.byteLength > MAX_XLSX_BYTES) throw new XlsxError("Fichier Excel trop volumineux (15 Mo maximum).");
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new XlsxError("Ce fichier n'est pas un classeur Excel .xlsx (les anciens fichiers .xls ne sont pas pris en charge : enregistrez-le en .xlsx ou .csv).");
  let total = 0;
  try {
    return unzipSync(bytes, {
      filter: (f) => {
        total += f.originalSize;
        if (total > MAX_UNZIPPED_BYTES) throw new XlsxError("Classeur trop volumineux une fois décompressé.");
        return f.name.startsWith("xl/") && (f.name.endsWith(".xml") || f.name.endsWith(".rels"));
      },
    });
  } catch (e) {
    if (e instanceof XlsxError) throw e;
    throw new XlsxError("Classeur Excel illisible (archive corrompue ou protégée par mot de passe).");
  }
}

/** Lit une feuille (par défaut la première du classeur). */
export function readXlsx(bytes: Uint8Array, sheetName?: string): XlsxSheet {
  const files = readZip(bytes);
  const workbook = files["xl/workbook.xml"];
  if (!workbook) throw new XlsxError("Classeur Excel invalide (xl/workbook.xml absent).");
  const wb = parser.parse(strFromU8(workbook)) as { workbook?: { sheets?: { sheet?: unknown } } };
  const sheets = asArray(wb.workbook?.sheets?.sheet as Record<string, string> | Record<string, string>[]);
  if (sheets.length === 0) throw new XlsxError("Le classeur ne contient aucune feuille.");
  const sheet = (sheetName ? sheets.find((s) => s["@_name"] === sheetName) : undefined) ?? sheets[0]!;
  const relId = sheet["@_id"];

  let target = "worksheets/sheet1.xml";
  const relsFile = files["xl/_rels/workbook.xml.rels"];
  if (relsFile && relId) {
    const rels = parser.parse(strFromU8(relsFile)) as { Relationships?: { Relationship?: unknown } };
    const rel = asArray(rels.Relationships?.Relationship as Record<string, string> | Record<string, string>[]).find((r) => r["@_Id"] === relId);
    if (rel?.["@_Target"]) target = rel["@_Target"].replace(/^\/?xl\//, "").replace(/^\//, "");
  }
  const sheetFile = files[`xl/${target}`];
  if (!sheetFile) throw new XlsxError(`Feuille « ${sheet["@_name"] ?? "1"} » introuvable dans le classeur.`);

  const shared: string[] = [];
  const sst = files["xl/sharedStrings.xml"];
  if (sst) {
    const doc = parser.parse(strFromU8(sst)) as { sst?: { si?: unknown } };
    for (const si of asArray(doc.sst?.si as unknown[])) shared.push(textOf(si));
  }

  const doc = parser.parse(strFromU8(sheetFile)) as { worksheet?: { sheetData?: { row?: unknown } } };
  const rows: string[][] = [];
  for (const row of asArray(doc.worksheet?.sheetData?.row as Record<string, unknown>[])) {
    const out: string[] = [];
    for (const c of asArray(row.c as Record<string, unknown>[])) {
      const ref = String(c["@_r"] ?? "");
      const idx = ref ? columnIndex(ref) : out.length;
      const type = String(c["@_t"] ?? "n");
      let value = "";
      if (type === "s") value = shared[Number(textOf(c.v))] ?? "";
      else if (type === "inlineStr") value = textOf(c.is);
      else if (type === "b") value = textOf(c.v) === "1" ? "true" : "false";
      else if (type === "e") value = "";
      else value = textOf(c.v);
      while (out.length < idx) out.push("");
      out[idx] = value.trim();
    }
    // lignes entièrement vides ignorées
    if (out.some((v) => v !== "")) rows.push(out);
  }
  return { name: sheet["@_name"] ?? "Feuille 1", rows };
}

function csvCell(v: string): string {
  return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Feuille → CSV « ; » (première ligne non vide = en-têtes). */
export function sheetToCsv(sheet: XlsxSheet): string {
  const width = Math.max(0, ...sheet.rows.map((r) => r.length));
  return sheet.rows.map((r) => Array.from({ length: width }, (_, i) => csvCell(r[i] ?? "")).join(";")).join("\n");
}
