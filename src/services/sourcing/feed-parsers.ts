/**
 * Parsers de flux fournisseurs (CSV / XML / JSON) et mapping colonnes → offre.
 * Code pur, testable sans réseau ni base : la récupération et le stockage sont
 * dans feed-ingestion.ts.
 */
import { parse as parseCsv } from "csv-parse/sync";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { RAW_OFFER_FIELDS, type RawOffer, type RawOfferField, type StockStatus, type TaxType } from "@/domain/sourcing/types";
import { normalizeCondition } from "@/domain/sourcing/normalizer";

export type FeedFormat = "csv" | "xml" | "json";

export const feedOptionsSchema = z.object({
  delimiter: z.string().min(1).max(3).optional(),
  encoding: z.string().min(1).max(30).optional(),
  root_path: z.string().max(200).optional(),
  header_row: z.boolean().optional(),
  columns: z.array(z.string()).optional(),
});
export type FeedOptions = z.infer<typeof feedOptionsSchema>;

/** Valeur d'un champ : nom de colonne / chemin, ou constante `{ const: "EUR" }`. */
export const fieldMappingSchema = z.partialRecord(
  z.enum(RAW_OFFER_FIELDS),
  z.union([z.string().min(1).max(200), z.object({ const: z.string().max(200) })]),
);
export type FieldMapping = z.infer<typeof fieldMappingSchema>;

export interface ParsedFeed {
  rows: Array<Record<string, unknown>>;
  columns: string[];
  warnings: string[];
}

export const MAX_FEED_ROWS = 50_000;

/** Lecture d'un chemin pointé : `a.b[0].c` ou `a.b.0.c`. */
export function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter((p) => p.length > 0);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(p);
      cur = Number.isInteger(idx) ? cur[idx] : cur.map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>)[p] : undefined)).find((v) => v !== undefined);
    } else if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[p];
    } else return undefined;
  }
  return cur;
}

/** Trouve le premier tableau d'objets dans une structure (profondeur bornée). */
export function findFirstArray(obj: unknown, depth = 0, path = ""): { path: string; items: unknown[] } | null {
  if (depth > 6 || obj === null || typeof obj !== "object") return null;
  if (Array.isArray(obj)) return obj.length > 0 && typeof obj[0] === "object" ? { path, items: obj } : null;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const found = findFirstArray(v, depth + 1, path ? `${path}.${k}` : k);
    if (found) return found;
  }
  return null;
}

function detectDelimiter(sample: string): string {
  const candidates = [";", ",", "\t", "|"];
  const firstLine = sample.split(/\r?\n/)[0] ?? "";
  let best = ",";
  let bestCount = 0;
  for (const c of candidates) {
    const count = firstLine.split(c).length - 1;
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best;
}

function flatten(obj: unknown, prefix = "", out: Record<string, unknown> = {}, depth = 0): Record<string, unknown> {
  if (depth > 4 || obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    if (prefix) out[prefix] = obj;
    return out;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out, depth + 1);
    else out[key] = v;
  }
  return out;
}

export function parseFeedContent(content: string, format: FeedFormat, options: FeedOptions = {}): ParsedFeed {
  const warnings: string[] = [];
  let rows: Array<Record<string, unknown>> = [];
  const text = content.replace(/^﻿/, "");

  if (format === "csv") {
    const delimiter = options.delimiter ?? detectDelimiter(text.slice(0, 4000));
    const headerRow = options.header_row ?? true;
    const parsed = parseCsv(text, {
      columns: headerRow ? true : options.columns ?? false,
      delimiter,
      bom: true,
      trim: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      to: MAX_FEED_ROWS + 1,
    }) as Array<Record<string, unknown>> | unknown[][];
    if (!headerRow && !options.columns) {
      rows = (parsed as unknown[][]).map((r) => Object.fromEntries(r.map((v, i) => [`col${i + 1}`, v])));
    } else {
      rows = parsed as Array<Record<string, unknown>>;
    }
    if (options.delimiter === undefined || options.delimiter === null) warnings.push(`Délimiteur détecté automatiquement : « ${delimiter} »`);
  } else {
    let doc: unknown;
    if (format === "xml") {
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true, parseTagValue: false, trimValues: true, cdataPropName: false });
      doc = parser.parse(text);
    } else {
      doc = JSON.parse(text);
    }
    let items: unknown[] | null = null;
    if (options.root_path) {
      const found = getPath(doc, options.root_path);
      if (Array.isArray(found)) items = found;
      else if (found && typeof found === "object") items = [found];
      else warnings.push(`Chemin racine « ${options.root_path} » introuvable dans le flux.`);
    }
    if (!items) {
      if (Array.isArray(doc)) items = doc;
      else {
        const found = findFirstArray(doc);
        if (found) {
          items = found.items;
          warnings.push(`Chemin racine détecté automatiquement : « ${found.path} »`);
        }
      }
    }
    rows = (items ?? []).filter((x): x is Record<string, unknown> => x !== null && typeof x === "object").map((x) => flatten(x));
  }

  if (rows.length > MAX_FEED_ROWS) {
    warnings.push(`Flux tronqué à ${MAX_FEED_ROWS} lignes.`);
    rows = rows.slice(0, MAX_FEED_ROWS);
  }
  const columns = Array.from(new Set(rows.slice(0, 200).flatMap((r) => Object.keys(r))));
  return { rows, columns, warnings };
}

// ---------------------------------------------------------------------------
// Mapping ligne → RawOffer
// ---------------------------------------------------------------------------
export function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v)
    .trim()
    .replace(/\s| /g, "")
    .replace(/[€$£]/g, "");
  if (!s) return null;
  // « 1.234,56 » → 1234.56 ; « 1,234.56 » → 1234.56 ; « 229,90 » → 229.90
  const normalized = /,\d{1,2}$/.test(s) && s.includes(".") ? s.replace(/\./g, "").replace(",", ".") : /\.\d{1,2}$/.test(s) && s.includes(",") ? s.replace(/,/g, "") : s.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function toInt(v: unknown): number | null {
  const n = toNumber(v);
  return n === null ? null : Math.round(n);
}

export function toTaxType(v: unknown): TaxType {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return "unknown";
  if (/^(ht|hors[\s-]?taxes?|excl|exclusive|net|ex[\s-]?vat|without[\s-]?vat|false|0)$/.test(s)) return "ht";
  if (/^(ttc|toutes[\s-]?taxes|incl|inclusive|inc[\s-]?vat|with[\s-]?vat|gross|true|1)$/.test(s)) return "ttc";
  return "unknown";
}

export function toStockStatus(v: unknown): StockStatus {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return "unknown";
  if (/^(in[\s_-]?stock|en[\s_-]?stock|disponible|available|yes|true|oui|1|instock|https?:\/\/schema\.org\/instock)$/.test(s)) return "in_stock";
  if (/^(out[\s_-]?of[\s_-]?stock|rupture|indisponible|unavailable|no|false|non|0|outofstock|sold[\s_-]?out|https?:\/\/schema\.org\/outofstock)$/.test(s)) return "out_of_stock";
  if (/^(low|faible|limited|limite|limitedavailability|https?:\/\/schema\.org\/limitedavailability)$/.test(s)) return "low";
  return "unknown";
}

export function toDeliveryRange(v: unknown): { min: number | null; max: number | null } {
  if (v === null || v === undefined || v === "") return { min: null, max: null };
  const s = String(v).trim();
  const m = s.match(/(\d+)\s*(?:-|–|à|to|a)\s*(\d+)/i);
  if (m) return { min: Number(m[1]), max: Number(m[2]) };
  const n = toInt(s.replace(/[^\d.,]/g, ""));
  return { min: n, max: n };
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

export interface MappingDefaults {
  currency?: string | null;
  taxType?: TaxType;
  country?: string | null;
}

export interface MappedRow {
  offer: RawOffer | null;
  errors: string[];
}

export function mapRow(row: Record<string, unknown>, mapping: FieldMapping, defaults: MappingDefaults = {}): MappedRow {
  const errors: string[] = [];
  const read = (field: RawOfferField): unknown => {
    const m = mapping[field];
    if (m === undefined) return undefined;
    if (typeof m === "string") {
      const direct = row[m];
      return direct !== undefined ? direct : getPath(row, m);
    }
    return m.const;
  };

  const externalOfferId = str(read("external_offer_id")) ?? str(read("supplier_sku")) ?? str(read("ean"));
  const title = str(read("title"));
  const price = toNumber(read("price"));
  const currency = str(read("currency"))?.toUpperCase() ?? defaults.currency?.toUpperCase() ?? null;

  if (!externalOfferId) errors.push("Identifiant d'offre manquant (external_offer_id, supplier_sku ou ean).");
  if (!title) errors.push("Titre manquant.");
  if (read("price") !== undefined && price === null && str(read("price")) !== null) errors.push(`Prix illisible : « ${String(read("price")).slice(0, 30)} ».`);
  if (price === null) errors.push("Prix manquant.");
  if (!currency) errors.push("Devise manquante (colonne ou devise par défaut de la source).");

  if (errors.length > 0 || !externalOfferId || !title) return { offer: null, errors };

  const deliveryBoth = toDeliveryRange(read("delivery_days"));
  const dMin = toInt(read("delivery_min_days")) ?? deliveryBoth.min;
  const dMax = toInt(read("delivery_max_days")) ?? deliveryBoth.max;
  const taxRaw = read("tax_type");
  const taxType = taxRaw !== undefined ? toTaxType(taxRaw) : defaults.taxType ?? "unknown";
  const stockRaw = read("stock_status");
  const availableQuantity = toInt(read("available_quantity"));

  const offer: RawOffer = {
    externalOfferId,
    externalProductId: str(read("supplier_sku")),
    title,
    price,
    currency,
    taxType,
    moq: toInt(read("moq")),
    minimumOrderValue: toNumber(read("minimum_order_value")),
    availableQuantity,
    stockStatus: stockRaw !== undefined ? toStockStatus(stockRaw) : availableQuantity === null ? "unknown" : availableQuantity > 0 ? "in_stock" : "out_of_stock",
    shippingCost: toNumber(read("shipping_cost")),
    shippingCurrency: currency,
    deliveryMinDays: dMin,
    deliveryMaxDays: dMax,
    country: str(read("country"))?.toUpperCase().slice(0, 2) ?? defaults.country ?? null,
    url: str(read("url")),
    ean: str(read("ean"))?.replace(/\D/g, "") || null,
    mpn: str(read("mpn")),
    brand: str(read("brand")),
    model: str(read("model")),
    storage: str(read("storage")),
    color: str(read("color")),
    grade: str(read("grade")),
    condition: read("condition") !== undefined ? normalizeCondition(str(read("condition"))) : null,
    supplierSku: str(read("supplier_sku")),
    raw: row,
  };
  return { offer, errors };
}

export interface FeedPreview {
  columns: string[];
  total: number;
  warnings: string[];
  sample: Array<{ index: number; row: Record<string, unknown>; offer: RawOffer | null; errors: string[] }>;
  validCount: number;
  invalidCount: number;
}

export function previewFeed(content: string, format: FeedFormat, mapping: FieldMapping, options: FeedOptions = {}, defaults: MappingDefaults = {}, limit = 20): FeedPreview {
  const parsed = parseFeedContent(content, format, options);
  const sample = parsed.rows.slice(0, limit).map((row, index) => ({ index, row, ...mapRow(row, mapping, defaults) }));
  let validCount = 0;
  let invalidCount = 0;
  for (const row of parsed.rows) {
    if (mapRow(row, mapping, defaults).offer) validCount++;
    else invalidCount++;
  }
  return { columns: parsed.columns, total: parsed.rows.length, warnings: parsed.warnings, sample, validCount, invalidCount };
}

/** Mapping automatique proposé à partir des noms de colonnes (jamais appliqué sans validation). */
export function suggestMapping(columns: string[]): FieldMapping {
  const candidates: Record<RawOfferField, RegExp> = {
    external_offer_id: /^(id|offer[_\s-]?id|ref(erence)?|article|item[_\s-]?id|product[_\s-]?id)$/i,
    supplier_sku: /^(sku|supplier[_\s-]?sku|ref(erence)?[_\s-]?fournisseur|code|g:id)$/i,
    title: /^(title|titre|name|nom|designation|désignation|libelle|libellé|description|g:title)$/i,
    price: /^(price|prix|prix[_\s-]?ht|price[_\s-]?ht|unit[_\s-]?price|prix[_\s-]?unitaire|g:price|tarif)$/i,
    currency: /^(currency|devise|monnaie)$/i,
    tax_type: /^(tax[_\s-]?type|tva|vat|taxe?s?)$/i,
    moq: /^(moq|min[_\s-]?qty|minimum|qte[_\s-]?min|quantite[_\s-]?minimale)$/i,
    minimum_order_value: /^(min[_\s-]?order[_\s-]?value|minimum[_\s-]?commande|mov)$/i,
    available_quantity: /^(stock|qty|quantity|quantite|quantité|available|dispo|disponible|g:quantity)$/i,
    stock_status: /^(availability|disponibilite|disponibilité|stock[_\s-]?status|g:availability)$/i,
    shipping_cost: /^(shipping|port|frais[_\s-]?de[_\s-]?port|livraison[_\s-]?cout|g:shipping)$/i,
    delivery_days: /^(delivery|delai|délai|lead[_\s-]?time|delivery[_\s-]?days)$/i,
    delivery_min_days: /^(delivery[_\s-]?min|delai[_\s-]?min)$/i,
    delivery_max_days: /^(delivery[_\s-]?max|delai[_\s-]?max)$/i,
    country: /^(country|pays|origin|origine)$/i,
    url: /^(url|link|lien|product[_\s-]?url|g:link)$/i,
    ean: /^(ean|ean13|gtin|gtin13|barcode|code[_\s-]?barre|upc|g:gtin)$/i,
    mpn: /^(mpn|part[_\s-]?number|ref[_\s-]?fabricant|g:mpn)$/i,
    brand: /^(brand|marque|manufacturer|fabricant|g:brand)$/i,
    model: /^(model|modele|modèle)$/i,
    storage: /^(storage|stockage|capacite|capacité|memory|memoire|mémoire)$/i,
    color: /^(color|colour|couleur|g:color)$/i,
    grade: /^(grade|classe)$/i,
    condition: /^(condition|etat|état|g:condition)$/i,
  };
  const out: FieldMapping = {};
  for (const field of RAW_OFFER_FIELDS) {
    const col = columns.find((c) => candidates[field].test(c.trim()));
    if (col) out[field] = col;
  }
  return out;
}
