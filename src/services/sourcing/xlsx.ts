import { Inflate } from "fflate";
import { XMLParser } from "fast-xml-parser";
import { MAX_FEED_ROWS } from "@/services/sourcing/feed-parsers";

/**
 * Lecture minimale d'un classeur Excel (.xlsx, Office Open XML) : première feuille (ou feuille
 * nommée), valeurs des cellules (texte partagé, texte en ligne, nombres, booléens, formules →
 * valeur calculée en cache). Aucune macro ni formule n'est exécutée.
 *
 * Les grilles tarifaires des fournisseurs arrivent très souvent en XLSX : le contenu est converti
 * en CSV (« ; ») pour réutiliser exactement le même pipeline que les flux CSV (mapping,
 * validation, stockage, historique).
 *
 * Fichier envoyé par un utilisateur = donnée hostile (déni de service de l'Edge Function partagée) :
 * - archive ZIP lue par un analyseur borné (répertoire central, ZIP64 vérifié, aucune boucle
 *   au-delà du nombre d'entrées annoncé et plafonné, chaque décalage contrôlé) ;
 * - seules les parties utiles sont décompressées, par petits morceaux, en MESURANT les octets
 *   produits (la taille déclarée dans l'archive n'est jamais crue) ;
 * - la feuille et les textes partagés sont parcourus sans construire d'arbre XML ; colonnes,
 *   lignes, cellules et références (au-delà de XFD1048576) sont bornées AVANT toute allocation ;
 * - DOCTYPE / entités refusés ; délai d'analyse plafonné ; messages d'erreur sans détail interne.
 */

export const MAX_XLSX_BYTES = 15 * 1024 * 1024;
/** Limites d'Excel : colonne XFD, ligne 1 048 576. */
export const EXCEL_MAX_COLUMNS = 16_384;
export const EXCEL_MAX_ROWS = 1_048_576;

export interface XlsxLimits {
  /** entrées du répertoire central */
  maxEntries: number;
  /** octets décompressés (mesurés) toutes parties confondues */
  maxUnzippedBytes: number;
  /** octets décompressés pour workbook.xml / workbook.xml.rels */
  maxSmallPartBytes: number;
  /** lignes non vides conservées (en-têtes compris) ; au-delà, la feuille est tronquée */
  maxRows: number;
  /** éléments <row> parcourus (vides compris) */
  maxRowElements: number;
  /** colonnes utilisables (une valeur non vide au-delà est refusée) */
  maxColumns: number;
  /** éléments <c> parcourus */
  maxCells: number;
  /** entrées de la table des textes partagés */
  maxSharedStrings: number;
  /** durée maximale d'analyse */
  maxMillis: number;
}

export const DEFAULT_XLSX_LIMITS: Readonly<XlsxLimits> = {
  maxEntries: 10_000,
  maxUnzippedBytes: 40 * 1024 * 1024,
  maxSmallPartBytes: 4 * 1024 * 1024,
  maxRows: MAX_FEED_ROWS + 1,
  maxRowElements: EXCEL_MAX_ROWS,
  maxColumns: 512,
  maxCells: 2_000_000,
  maxSharedStrings: 1_000_000,
  maxMillis: 20_000,
};

export interface XlsxSheet {
  name: string;
  rows: string[][];
  /** lignes au-delà de `maxRows` ignorées */
  truncated?: boolean;
}

export class XlsxError extends Error {}

const CORRUPT = "Classeur Excel illisible (archive corrompue ou protégée par mot de passe).";
const INVALID_REF = "Classeur Excel invalide : référence de cellule incorrecte (au-delà de XFD1048576 ou mal formée).";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true, parseTagValue: false, trimValues: false, textNodeName: "#text", processEntities: true });

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/** « AB12 » → index de colonne 27 (base 0). Référence au-delà de XFD1048576 ou mal formée : erreur. */
export function columnIndex(ref: string): number {
  // longueur contrôlée AVANT l'expression régulière et le calcul (« ZZZZZZZZ1 » refusé d'emblée)
  if (ref.length > 10) throw new XlsxError(INVALID_REF);
  const m = /^([A-Za-z]{1,3})([1-9][0-9]{0,6})$/.exec(ref);
  if (!m) throw new XlsxError(INVALID_REF);
  let n = 0;
  for (const ch of m[1]!.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  if (n > EXCEL_MAX_COLUMNS || Number(m[2]) > EXCEL_MAX_ROWS) throw new XlsxError(INVALID_REF);
  return n - 1;
}

// ---------------------------------------------------------------------------
// Archive ZIP (répertoire central) — analyse bornée
// ---------------------------------------------------------------------------

interface ZipEntry {
  method: number;
  compressedSize: number;
  declaredSize: number;
  localOffset: number;
}

class Budget {
  private readonly deadline: number;
  private remaining: number;
  constructor(private readonly limits: XlsxLimits) {
    this.deadline = Date.now() + limits.maxMillis;
    this.remaining = limits.maxUnzippedBytes;
  }
  tick(): void {
    if (Date.now() > this.deadline) throw new XlsxError("Classeur trop long à analyser : enregistrez la feuille en CSV et réessayez.");
  }
  room(partLimit: number): number {
    return Math.min(partLimit, this.remaining);
  }
  consume(n: number): void {
    this.remaining -= n;
  }
  get max(): XlsxLimits {
    return this.limits;
  }
}

const tooLarge = () => new XlsxError(`Classeur trop volumineux une fois décompressé (${Math.round(DEFAULT_XLSX_LIMITS.maxUnzippedBytes / 1024 / 1024)} Mo de données au maximum) : enregistrez la feuille en CSV.`);

function need(bytes: Uint8Array, offset: number, length: number): void {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + length > bytes.byteLength) throw new XlsxError(CORRUPT);
}
function u16(b: Uint8Array, o: number): number {
  need(b, o, 2);
  return b[o]! | (b[o + 1]! << 8);
}
function u32(b: Uint8Array, o: number): number {
  need(b, o, 4);
  return (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16)) + b[o + 3]! * 0x1000000;
}
function u64(b: Uint8Array, o: number): number {
  const lo = u32(b, o);
  const hi = u32(b, o + 4);
  if (hi > 0x1fffff) throw new XlsxError(CORRUPT); // au-delà de Number.MAX_SAFE_INTEGER : forcément faux
  return hi * 0x100000000 + lo;
}

const SIG_EOCD = 0x06054b50;
const SIG_EOCD64_LOCATOR = 0x07064b50;
const SIG_EOCD64 = 0x06064b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;
const MAX32 = 0xffffffff;

function readCentralDirectory(bytes: Uint8Array, limits: XlsxLimits): Map<string, ZipEntry> {
  const len = bytes.byteLength;
  if (len < 22) throw new XlsxError(CORRUPT);
  let eocd = -1;
  for (let p = len - 22; p >= Math.max(0, len - 22 - 0xffff); p--) {
    if (bytes[p] === 0x50 && bytes[p + 1] === 0x4b && u32(bytes, p) === SIG_EOCD) {
      eocd = p;
      break;
    }
  }
  if (eocd < 0) throw new XlsxError(CORRUPT);
  if (u16(bytes, eocd + 4) !== 0 || u16(bytes, eocd + 6) !== 0) throw new XlsxError(CORRUPT); // archive multi-volumes
  let count = u16(bytes, eocd + 10);
  let cdSize = u32(bytes, eocd + 12);
  let cdOffset = u32(bytes, eocd + 16);
  if (count === 0xffff || cdSize === MAX32 || cdOffset === MAX32) {
    // ZIP64 : localisateur juste avant la fin du répertoire central, enregistrement vérifié et borné
    const locator = eocd - 20;
    if (locator < 0 || u32(bytes, locator) !== SIG_EOCD64_LOCATOR) throw new XlsxError(CORRUPT);
    const z64 = u64(bytes, locator + 8);
    if (z64 + 56 > locator || u32(bytes, z64) !== SIG_EOCD64) throw new XlsxError(CORRUPT);
    count = u64(bytes, z64 + 32);
    cdSize = u64(bytes, z64 + 40);
    cdOffset = u64(bytes, z64 + 48);
  }
  if (count > limits.maxEntries) throw new XlsxError("Classeur Excel invalide (trop de fichiers dans l'archive).");
  const cdEnd = cdOffset + cdSize;
  if (cdEnd > len) throw new XlsxError(CORRUPT);
  const names = new TextDecoder("utf-8", { fatal: false });
  const entries = new Map<string, ZipEntry>();
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > cdEnd || u32(bytes, p) !== SIG_CENTRAL) throw new XlsxError(CORRUPT);
    const flags = u16(bytes, p + 8);
    const method = u16(bytes, p + 10);
    let compressedSize = u32(bytes, p + 20);
    let declaredSize = u32(bytes, p + 24);
    const nameLen = u16(bytes, p + 28);
    const extraLen = u16(bytes, p + 30);
    const commentLen = u16(bytes, p + 32);
    let localOffset = u32(bytes, p + 42);
    const nameStart = p + 46;
    const extraStart = nameStart + nameLen;
    const extraEnd = extraStart + extraLen;
    const next = extraEnd + commentLen;
    if (next > cdEnd) throw new XlsxError(CORRUPT);
    if (flags & 0x1) throw new XlsxError("Classeur Excel protégé par mot de passe : enregistrez-le sans protection.");
    if (declaredSize === MAX32 || compressedSize === MAX32 || localOffset === MAX32) {
      // champ supplémentaire ZIP64 (id 0x0001) : valeurs 64 bits dans l'ordre, seulement pour les champs saturés
      let q = extraStart;
      let found = false;
      while (q + 4 <= extraEnd) {
        const id = u16(bytes, q);
        const size = u16(bytes, q + 2);
        const dataEnd = q + 4 + size;
        if (dataEnd > extraEnd) throw new XlsxError(CORRUPT);
        if (id === 0x0001) {
          let r = q + 4;
          const take = (): number => {
            if (r + 8 > dataEnd) throw new XlsxError(CORRUPT);
            const v = u64(bytes, r);
            r += 8;
            return v;
          };
          if (declaredSize === MAX32) declaredSize = take();
          if (compressedSize === MAX32) compressedSize = take();
          if (localOffset === MAX32) localOffset = take();
          found = true;
          break;
        }
        q = dataEnd;
      }
      if (!found) throw new XlsxError(CORRUPT);
    }
    const name = names.decode(bytes.subarray(nameStart, extraStart));
    if (entries.has(name)) throw new XlsxError(CORRUPT); // noms dupliqués : archive ambiguë
    entries.set(name, { method, compressedSize, declaredSize, localOffset });
    p = next;
  }
  return entries;
}

/** Morceau de données compressées poussé à chaque étape (≈ 4 Mo produits au plus par étape). */
const INFLATE_CHUNK = 4096;

function extractEntry(bytes: Uint8Array, entry: ZipEntry, budget: Budget, partLimit: number): Uint8Array {
  const lo = entry.localOffset;
  if (u32(bytes, lo) !== SIG_LOCAL) throw new XlsxError(CORRUPT);
  const start = lo + 30 + u16(bytes, lo + 26) + u16(bytes, lo + 28);
  const end = start + entry.compressedSize;
  need(bytes, start, entry.compressedSize);
  const limit = budget.room(partLimit);
  // refus rapide si l'archive annonce elle-même trop ; la limite effective reste la taille MESURÉE
  if (entry.declaredSize > limit) throw tooLarge();
  if (entry.method === 0) {
    if (entry.compressedSize > limit) throw tooLarge();
    budget.consume(entry.compressedSize);
    return bytes.subarray(start, end);
  }
  if (entry.method !== 8) throw new XlsxError("Classeur Excel illisible (compression non prise en charge).");
  if (entry.compressedSize === 0) throw new XlsxError(CORRUPT);
  const chunks: Uint8Array[] = [];
  let produced = 0;
  const inflater = new Inflate((chunk) => {
    produced += chunk.byteLength;
    if (produced > limit) throw tooLarge();
    chunks.push(chunk);
  });
  try {
    for (let off = start; off < end; off += INFLATE_CHUNK) {
      budget.tick();
      const stop = Math.min(off + INFLATE_CHUNK, end);
      inflater.push(bytes.subarray(off, stop), stop === end);
    }
  } catch (e) {
    if (e instanceof XlsxError) throw e;
    throw new XlsxError(CORRUPT);
  }
  budget.consume(produced);
  const out = new Uint8Array(produced);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function readPart(bytes: Uint8Array, entries: Map<string, ZipEntry>, name: string, budget: Budget, partLimit: number): string | null {
  const entry = entries.get(name);
  if (!entry) return null;
  const xml = new TextDecoder("utf-8", { fatal: false }).decode(extractEntry(bytes, entry, budget, partLimit));
  // aucune partie d'un classeur ne déclare de DTD : refus (expansion d'entités, entités externes)
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new XlsxError("Classeur Excel invalide (déclaration DOCTYPE refusée).");
  return xml;
}

// ---------------------------------------------------------------------------
// XML de feuille : parcours linéaire, sans arbre
// ---------------------------------------------------------------------------

const P = "(?:([A-Za-z_][\\w.-]*):)?";

function decodeXmlText(s: string): string {
  if (!s.includes("&") && !s.includes("<![CDATA[")) return s;
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>|&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|lt|gt|amp|quot|apos);/g, (m, cdata: string | undefined, ent: string | undefined) => {
    if (cdata !== undefined) return cdata;
    switch (ent) {
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "amp":
        return "&";
      case "quot":
        return '"';
      case "apos":
        return "'";
      default: {
        const code = ent!.startsWith("#x") || ent!.startsWith("#X") ? parseInt(ent!.slice(2), 16) : parseInt(ent!.slice(1), 10);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
      }
    }
  });
}

const ATTR_RE = { r: /(?:^|\s)r\s*=\s*(?:"([^"]*)"|'([^']*)')/, t: /(?:^|\s)t\s*=\s*(?:"([^"]*)"|'([^']*)')/ } as const;

function attr(attrs: string, name: keyof typeof ATTR_RE): string | null {
  const m = ATTR_RE[name].exec(attrs);
  return m ? decodeXmlText(m[1] ?? m[2] ?? "") : null;
}

const closeTagCache = new Map<string, RegExp>();
function closeTag(prefix: string | undefined, local: string): RegExp {
  const key = `${prefix ?? ""}:${local}`;
  let re = closeTagCache.get(key);
  if (!re) {
    re = new RegExp(`</${prefix ? `${prefix.replace(/[.]/g, "\\.")}:` : ""}${local}\\s*>`, "g");
    closeTagCache.set(key, re);
  }
  return re;
}

/** Contenu de l'élément ouvert juste avant `from` ; renvoie [contenu, position après la balise fermante]. */
function elementBody(xml: string, from: number, limit: number, prefix: string | undefined, local: string): [string, number] {
  const re = closeTag(prefix, local);
  re.lastIndex = from;
  const m = re.exec(xml);
  if (!m || m.index > limit) throw new XlsxError("Classeur Excel invalide (XML mal formé).");
  return [xml.slice(from, m.index), m.index + m[0].length];
}

/** Texte d'un <si> ou <is> : concaténation des <t>, sans les indications phonétiques (<rPh>). */
function richText(inner: string): string {
  const clean = inner.includes("rPh") ? inner.replace(new RegExp(`<${P}rPh\\b[\\s\\S]*?</(?:[A-Za-z_][\\w.-]*:)?rPh\\s*>`, "g"), "") : inner;
  let out = "";
  const re = new RegExp(`<${P}t\\b[^>]*?(?:/>|>([\\s\\S]*?)</(?:[A-Za-z_][\\w.-]*:)?t\\s*>)`, "g");
  for (let m = re.exec(clean); m; m = re.exec(clean)) out += decodeXmlText(m[2] ?? "");
  return out;
}

const V_RE = new RegExp(`<${P}v\\b[^>]*?(?:/>|>([\\s\\S]*?)</(?:[A-Za-z_][\\w.-]*:)?v\\s*>)`);

function cellValue(type: string, inner: string, shared: string[]): string {
  if (type === "inlineStr") return richText(inner);
  const v = V_RE.exec(inner);
  const text = v ? decodeXmlText(v[2] ?? "") : "";
  if (type === "s") {
    const i = Number(text);
    return Number.isInteger(i) && i >= 0 ? shared[i] ?? "" : "";
  }
  if (type === "b") return text === "1" ? "true" : "false";
  if (type === "e") return "";
  return text;
}

function readSharedStrings(xml: string, budget: Budget): string[] {
  const shared: string[] = [];
  const re = new RegExp(`<${P}si\\b[^>]*?(/?)>`, "g");
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    if (shared.length >= budget.max.maxSharedStrings) throw new XlsxError("Classeur trop volumineux (trop de textes partagés) : enregistrez la feuille en CSV.");
    if ((shared.length & 1023) === 0) budget.tick();
    if (m[2] === "/") {
      shared.push("");
      continue;
    }
    const [inner, after] = elementBody(xml, re.lastIndex, xml.length, m[1], "si");
    shared.push(richText(inner));
    re.lastIndex = after;
  }
  return shared;
}

function readSheetRows(xml: string, shared: string[], budget: Budget): { rows: string[][]; truncated: boolean } {
  const limits = budget.max;
  const rows: string[][] = [];
  const open = new RegExp(`<${P}sheetData\\b[^>]*?(/?)>`, "g").exec(xml);
  if (!open || open[2] === "/") return { rows, truncated: false };
  const start = open.index + open[0].length;
  const closeRe = closeTag(open[1], "sheetData");
  closeRe.lastIndex = start;
  const close = closeRe.exec(xml);
  const end = close ? close.index : xml.length;

  const rowRe = new RegExp(`<${P}row\\b([^>]*?)(/?)>`, "g");
  const cellRe = new RegExp(`<${P}c\\b([^>]*?)(/?)>`, "g");
  let rowElements = 0;
  let cells = 0;
  rowRe.lastIndex = start;
  for (let m = rowRe.exec(xml); m && m.index < end; m = rowRe.exec(xml)) {
    if (++rowElements > limits.maxRowElements) throw new XlsxError("Classeur trop volumineux (trop de lignes) : enregistrez la feuille en CSV.");
    if ((rowElements & 255) === 0) budget.tick();
    const r = attr(m[2] ?? "", "r");
    if (r !== null && (!/^[1-9][0-9]{0,6}$/.test(r) || Number(r) > EXCEL_MAX_ROWS)) throw new XlsxError(INVALID_REF);
    if (m[3] === "/") continue;
    const [content, after] = elementBody(xml, rowRe.lastIndex, end, m[1], "row");
    rowRe.lastIndex = after;
    const out: string[] = [];
    cellRe.lastIndex = 0;
    for (let c = cellRe.exec(content); c; c = cellRe.exec(content)) {
      if (++cells > limits.maxCells) throw new XlsxError("Classeur trop volumineux (trop de cellules) : enregistrez la feuille en CSV.");
      if ((cells & 4095) === 0) budget.tick();
      const attrs = c[2] ?? "";
      let inner = "";
      if (c[3] !== "/") {
        const [body, next] = elementBody(content, cellRe.lastIndex, content.length, c[1], "c");
        inner = body;
        cellRe.lastIndex = next;
      }
      const ref = attr(attrs, "r");
      // index validé et borné AVANT de compléter la ligne
      const idx = ref !== null ? columnIndex(ref) : out.length;
      const value = cellValue(attr(attrs, "t") ?? "n", inner, shared).trim();
      if (idx >= limits.maxColumns) {
        if (value === "") continue; // cellule de mise en forme lointaine : ignorée sans allocation
        throw new XlsxError(`Feuille trop large : données au-delà de la colonne ${limits.maxColumns} (non prises en charge).`);
      }
      while (out.length < idx) out.push("");
      out[idx] = value;
    }
    // lignes entièrement vides ignorées
    if (out.some((v) => v !== "")) {
      if (rows.length >= limits.maxRows) return { rows, truncated: true };
      rows.push(out);
    }
  }
  return { rows, truncated: false };
}

/** Lit une feuille (par défaut la première du classeur). */
export function readXlsx(bytes: Uint8Array, sheetName?: string, limitsOverride: Partial<XlsxLimits> = {}): XlsxSheet {
  if (bytes.byteLength > MAX_XLSX_BYTES) throw new XlsxError("Fichier Excel trop volumineux (15 Mo maximum).");
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new XlsxError("Ce fichier n'est pas un classeur Excel .xlsx (les anciens fichiers .xls ne sont pas pris en charge : enregistrez-le en .xlsx ou .csv).");
  const limits: XlsxLimits = { ...DEFAULT_XLSX_LIMITS, ...limitsOverride };
  const budget = new Budget(limits);
  const entries = readCentralDirectory(bytes, limits);

  const workbook = readPart(bytes, entries, "xl/workbook.xml", budget, limits.maxSmallPartBytes);
  if (!workbook) throw new XlsxError("Classeur Excel invalide (xl/workbook.xml absent).");
  const wb = parser.parse(workbook) as { workbook?: { sheets?: { sheet?: unknown } } };
  const sheets = asArray(wb.workbook?.sheets?.sheet as Record<string, string> | Record<string, string>[]);
  if (sheets.length === 0) throw new XlsxError("Le classeur ne contient aucune feuille.");
  const sheet = (sheetName ? sheets.find((s) => s["@_name"] === sheetName) : undefined) ?? sheets[0]!;
  const relId = sheet["@_id"];

  let target = "worksheets/sheet1.xml";
  const relsFile = readPart(bytes, entries, "xl/_rels/workbook.xml.rels", budget, limits.maxSmallPartBytes);
  if (relsFile && relId) {
    const rels = parser.parse(relsFile) as { Relationships?: { Relationship?: unknown } };
    const rel = asArray(rels.Relationships?.Relationship as Record<string, string> | Record<string, string>[]).find((r) => r["@_Id"] === relId);
    if (rel?.["@_Target"]) target = String(rel["@_Target"]).replace(/^\/?xl\//, "").replace(/^\//, "");
  }
  const sheetPath = `xl/${target}`;
  if (!entries.has(sheetPath)) throw new XlsxError(`Feuille « ${String(sheet["@_name"] ?? "1").slice(0, 80)} » introuvable dans le classeur.`);

  const sst = readPart(bytes, entries, "xl/sharedStrings.xml", budget, limits.maxUnzippedBytes);
  const shared = sst ? readSharedStrings(sst, budget) : [];
  const sheetXml = readPart(bytes, entries, sheetPath, budget, limits.maxUnzippedBytes) ?? "";
  const { rows, truncated } = readSheetRows(sheetXml, shared, budget);
  return { name: sheet["@_name"] ?? "Feuille 1", rows, ...(truncated ? { truncated } : {}) };
}

function csvCell(v: string): string {
  return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Feuille → CSV « ; » (première ligne non vide = en-têtes). */
export function sheetToCsv(sheet: XlsxSheet): string {
  // pas de Math.max(...rows) : l'étalement d'un très grand tableau dépasse la pile
  let width = 0;
  for (const r of sheet.rows) if (r.length > width) width = r.length;
  return sheet.rows.map((r) => Array.from({ length: width }, (_, i) => csvCell(r[i] ?? "")).join(";")).join("\n");
}
