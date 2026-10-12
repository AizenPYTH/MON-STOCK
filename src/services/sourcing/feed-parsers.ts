/**
 * Parsers de flux fournisseurs (CSV / XML / JSON) et mapping colonnes → offre.
 * Code pur, testable sans réseau ni base : la récupération et le stockage sont
 * dans feed-ingestion.ts.
 */
import { parse as parseCsv } from "csv-parse/sync";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { RAW_OFFER_FIELDS, type RawOffer, type RawOfferField, type StockStatus, type TaxType, type VatRegimeCode } from "@/domain/sourcing/types";
import { isValidGtin, normalizeCondition } from "@/domain/sourcing/normalizer";

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

/** Régime de TVA annoncé (« marge », « margin scheme », « autoliquidation », « 0 % »…) ; jamais déduit du pays. */
export function toVatRegime(v: unknown): VatRegimeCode | null {
  const s = String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  if (!s) return null;
  if (/marg|differenz|§ ?25a|art\.? ?297|regime particulier/.test(s)) return "margin";
  if (/reverse|autoliquid|intracom|ic supply|0 ?%|zero[\s-]?rated|steuerfrei innergem/.test(s)) return "reverse_charge";
  if (/exon|exempt|franchise|293 ?b/.test(s)) return "exempt";
  if (/normal|standard|incl|ttc|20 ?%|21 ?%|19 ?%|regular|regelbesteuer/.test(s)) return "normal";
  return "unknown";
}

/** Date seule AAAA-MM-JJ : ISO, JJ/MM/AAAA, JJ.MM.AAAA ou numéro de série Excel ; sinon null. */
export function toDateOnly(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const iso = (y: number, m: number, d: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
  };
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s);
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]));
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    if (serial >= 36526 && serial <= 73050) return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 10);
  }
  return null;
}

/** Horodatage ISO (mise à jour annoncée par le fournisseur) ; date seule acceptée ; sinon null. */
export function toTimestamp(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) {
    const t = Date.parse(s.replace(" ", "T"));
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  const d = toDateOnly(s);
  return d ? `${d}T00:00:00.000Z` : null;
}

/** Garantie en mois : « 12 », « 12 mois », « 1 an », « 2 years », « 90 jours » (≈ 3 mois). */
export function toWarrantyMonths(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).toLowerCase();
  const n = toNumber(s.replace(/[^\d.,]/g, " ").trim().split(/\s+/)[0] ?? "");
  if (n === null || n < 0) return null;
  const months = /(an|year|jahr)/.test(s) ? n * 12 : /(jour|day|tag)/.test(s) ? n / 30 : /(semaine|week|woche)/.test(s) ? (n * 7) / 30 : n;
  const r = Math.round(months);
  return r >= 0 && r <= 120 ? r : null;
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
  /** remarques non bloquantes (EAN invalide écarté…) */
  warnings?: string[];
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

  const warnings: string[] = [];
  const eanDigits = str(read("ean"))?.replace(/\D/g, "") || null;
  let ean: string | null = null;
  if (eanDigits) {
    if ([8, 12, 13, 14].includes(eanDigits.length) && isValidGtin(eanDigits)) ean = eanDigits;
    else warnings.push(`EAN « ${eanDigits.slice(0, 20)} » invalide (clé de contrôle ou longueur) : ignoré pour le rapprochement.`);
  }
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
    ean,
    mpn: str(read("mpn")),
    brand: str(read("brand")),
    model: str(read("model")),
    storage: str(read("storage")),
    color: str(read("color")),
    grade: str(read("grade")),
    condition: read("condition") !== undefined ? normalizeCondition(str(read("condition"))) : null,
    supplierSku: str(read("supplier_sku")),
    orderMultiple: (() => {
      const n = toInt(read("order_multiple"));
      return n !== null && n > 0 ? n : null;
    })(),
    vatRegime: toVatRegime(read("vat_regime")),
    shipFromCountry: (() => {
      const c = str(read("ship_from_country"))?.toUpperCase() ?? null;
      return c && /^[A-Z]{2}$/.test(c) ? c : null;
    })(),
    warrantyMonths: toWarrantyMonths(read("warranty_months")),
    availableFrom: toDateOnly(read("available_from")),
    supplierUpdatedAt: toTimestamp(read("supplier_updated_at")),
    raw: row,
  };
  return { offer, errors, warnings };
}

export interface FeedPreview {
  columns: string[];
  total: number;
  warnings: string[];
  sample: Array<{ index: number; row: Record<string, unknown>; offer: RawOffer | null; errors: string[]; warnings?: string[] }>;
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
  return suggestMappingDetailed(columns).mapping;
}

const STRICT_HEADER_PATTERNS: Record<RawOfferField, RegExp> = {
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
    condition: /^(condition|etat|état|g:condition|zustand)$/i,
    order_multiple: /^(order[_\s-]?multiple|multiple|pack[_\s-]?size|colisage|conditionnement|vpe)$/i,
    vat_regime: /^(vat[_\s-]?regime|vat[_\s-]?scheme|regime[_\s-]?tva|régime[_\s-]?tva|tax[_\s-]?scheme|besteuerung)$/i,
    ship_from_country: /^(ship[_\s-]?from|ships[_\s-]?from|warehouse|entrepot|entrepôt|lager|location|stock[_\s-]?location)$/i,
    warranty_months: /^(warranty|garantie|gewährleistung|gewahrleistung)$/i,
    available_from: /^(available[_\s-]?from|eta|arrival|arrivage|date[_\s-]?dispo|lieferdatum)$/i,
    supplier_updated_at: /^(updated|updated[_\s-]?at|last[_\s-]?update|date[_\s-]?maj|mise[_\s-]?a[_\s-]?jour|stand)$/i,
  };
export type MappingConfidence = "high" | "medium";

/**
 * Mapping proposé + confiance par champ : « high » = en-tête exact connu, « medium » = en-tête
 * approchant (accents, unités, langue). Toujours soumis à la validation de l'utilisateur.
 */
export function suggestMappingDetailed(columns: string[], strict: Record<RawOfferField, RegExp> = STRICT_HEADER_PATTERNS): { mapping: FieldMapping; confidence: Partial<Record<RawOfferField, MappingConfidence>> } {
  const out: FieldMapping = {};
  const confidence: Partial<Record<RawOfferField, MappingConfidence>> = {};
  const used = new Set<string>();
  for (const field of RAW_OFFER_FIELDS) {
    const col = columns.find((c) => !used.has(c) && strict[field].test(c.trim()));
    if (col) {
      out[field] = col;
      confidence[field] = "high";
      used.add(col);
    }
  }
  // Second passage : en-têtes réels des grilles fournisseurs (« Prix HT (€) », « Désignation
  // article », « Qté dispo », « Réf. fournisseur »…), comparés sans accents ni ponctuation.
  // Une colonne n'est jamais attribuée à deux champs ; rien n'est appliqué sans validation.
  for (const [field, patterns] of LOOSE_HEADER_PATTERNS) {
    if (out[field]) continue;
    const col = columns.find((c) => !used.has(c) && patterns.some((re) => re.test(looseHeader(c))));
    if (col) {
      out[field] = col;
      confidence[field] = "medium";
      used.add(col);
    }
  }
  return { mapping: out, confidence };
}

/** En-tête normalisé : minuscules, sans accents, ponctuation et unités remplacées par des espaces. */
export function looseHeader(h: string): string {
  return ` ${h
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[€$£%()[\]{}.,:;/\\_\-#°*'"’]/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

const LOOSE_HEADER_PATTERNS: Array<[RawOfferField, RegExp[]]> = [
  ["ean", [/ (ean|gtin|ean13|upc|code barre|barcode|strichcode) /]],
  ["mpn", [/ (mpn|part number|ref fabricant|reference fabricant) /]],
  ["supplier_sku", [/ (ref|reference|sku|code article|code produit|article no|art nr|item no|item code|part no|ref fournisseur|ref fourn|artikelnummer|artikel nr|art nr) /]],
  ["title", [/ (designation|libelle|description|product name|product|nom produit|nom article|article|produit|titre|title|name|bezeichnung|artikelbezeichnung|beschreibung) /]],
  ["price", [/ (prix|price|tarif|cost|cout|pu|unit price|net price|wholesale price|wholesale|dealer price|prix net|prix achat|prix revendeur|prix pro|preis|einzelpreis|nettopreis|ek preis|haendlerpreis) /]],
  ["currency", [/ (devise|currency|monnaie|wahrung|cur) /]],
  ["tax_type", [/ (ht|ttc|tva|vat) incl /, / (type de prix|tax) /]],
  ["moq", [/ (moq|minimum order|min order|minimum|min qty|qte min|quantite minimum|mindestmenge|mindestbestellmenge) /]],
  ["available_quantity", [/ (qte|qty|quantite|quantity|stock|dispo|disponible|available|en stock|menge|bestand|verfugbar|lagerbestand) /]],
  ["brand", [/ (marque|brand|fabricant|manufacturer|constructeur|marke|hersteller) /]],
  ["model", [/ (modele|model|modell) /]],
  ["storage", [/ (capacite|stockage|storage|memoire|memory|rom|gb|go|speicher|kapazitat) /]],
  ["color", [/ (couleur|color|colour|coloris|farbe) /]],
  ["grade", [/ (grade|classe|qualite esthetique|quality|qualitat|klasse) /]],
  ["condition", [/ (etat|condition|state|zustand) /]],
  ["order_multiple", [/ (multiple|pack size|colisage|conditionnement|vpe|verpackungseinheit) /]],
  ["vat_regime", [/ (regime tva|vat scheme|vat regime|tax scheme|margin scheme|besteuerung|differenzbesteuerung) /]],
  ["ship_from_country", [/ (ship from|ships from|warehouse|entrepot|expedie depuis|lagerort|lager|stock location) /]],
  ["warranty_months", [/ (garantie|warranty|gewahrleistung) /]],
  ["available_from", [/ (eta|available from|arrival|arrivage|date dispo|disponible le|lieferdatum|verfugbar ab) /]],
  ["supplier_updated_at", [/ (last update|updated|date maj|mise a jour|stand|aktualisiert) /]],
  ["url", [/ (url|lien|link) /]],
  ["shipping_cost", [/ (port|frais de livraison|shipping|shipping cost|delivery cost|transport|versandkosten|versand) /]],
  ["delivery_days", [/ (delai|lead time|delivery time|delivery days|lieferzeit) /]],
];
