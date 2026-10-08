/**
 * google-merchant-feed — parser pur du format Google Merchant Center :
 *   RSS 2.0 : <rss xmlns:g="http://base.google.com/ns/1.0"><channel><item><g:id>…
 *   Atom    : <feed xmlns:g="…"><entry><g:id>…<link href="…"/>
 *   TSV/CSV : ligne d'en-tête avec les noms d'attributs (id, title, price, availability…),
 *             avec ou sans préfixe « g: ».
 * Attributs lus : id, title, description, link, price (« 229.00 EUR »), sale_price,
 * availability, gtin, mpn, brand, condition, shipping (country/price), item_group_id, color,
 * size, availability_date. Tout attribut absent reste null.
 */
import { parse as parseCsv } from "csv-parse/sync";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

export interface GmcPrice {
  amount: number;
  currency: string | null;
}

export interface GmcItem {
  id: string;
  title: string;
  description: string | null;
  link: string | null;
  price: GmcPrice | null;
  salePrice: GmcPrice | null;
  availability: string | null;
  gtin: string | null;
  mpn: string | null;
  brand: string | null;
  condition: string | null;
  itemGroupId: string | null;
  color: string | null;
  size: string | null;
  shipping: Array<{ country: string | null; price: GmcPrice | null }>;
  quantity: number | null;
  raw: Record<string, unknown>;
}

export const MAX_FEED_ITEMS = 50_000;

const scalar = z.union([z.string(), z.number(), z.boolean()]);
const textNode = z.union([scalar, z.looseObject({ "#text": scalar.optional() })]);
const anyField = z.union([textNode, z.array(textNode)]);

/** Un item RSS/Atom tel que produit par fast-xml-parser (préfixes conservés). */
const gmcItemSchema = z.record(z.string(), z.unknown());

function textOf(v: unknown): string | null {
  const parsed = anyField.safeParse(v);
  if (!parsed.success) return null;
  const first = Array.isArray(parsed.data) ? parsed.data[0] : parsed.data;
  if (first === undefined || first === null) return null;
  if (typeof first === "object") {
    const t = first["#text"];
    return t === undefined ? null : String(t).trim() || null;
  }
  const s = String(first).trim();
  return s.length > 0 ? s : null;
}

function field(item: Record<string, unknown>, name: string): unknown {
  if (item[`g:${name}`] !== undefined) return item[`g:${name}`];
  if (item[name] !== undefined) return item[name];
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(item)) {
    const key = k.toLowerCase().replace(/^g:/, "");
    if (key === lower) return v;
  }
  return undefined;
}

/** « 229.00 EUR », « 229,90 EUR », « 229 » → montant + devise (null si absente). */
export function parseGmcPrice(raw: string | null | undefined): GmcPrice | null {
  if (!raw) return null;
  const m = raw.trim().match(/^([\d\s.,]+)\s*([A-Za-z]{3})?$/);
  if (!m || !m[1]) return null;
  const numeric = m[1].replace(/\s/g, "");
  // « 1.234,56 » → 1234.56 ; « 1,234.56 » → 1234.56 ; « 229,90 » → 229.90
  const normalized = /,\d{1,2}$/.test(numeric) && numeric.includes(".") ? numeric.replace(/\./g, "").replace(",", ".") : /\.\d{1,2}$/.test(numeric) && numeric.includes(",") ? numeric.replace(/,/g, "") : numeric.replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;
  return { amount, currency: m[2] ? m[2].toUpperCase() : null };
}

function linkOf(item: Record<string, unknown>): string | null {
  const g = textOf(field(item, "link"));
  if (g && /^https?:\/\//i.test(g)) return g;
  // Atom : <link href="…"/> (attribut), éventuellement plusieurs
  const raw = item.link;
  const list = Array.isArray(raw) ? raw : raw !== undefined ? [raw] : [];
  for (const l of list) {
    if (l && typeof l === "object") {
      const href = (l as Record<string, unknown>)["@_href"];
      if (typeof href === "string" && /^https?:\/\//i.test(href)) return href;
    }
  }
  return g;
}

function shippingOf(item: Record<string, unknown>): GmcItem["shipping"] {
  const raw = field(item, "shipping");
  const list = Array.isArray(raw) ? raw : raw !== undefined ? [raw] : [];
  const out: GmcItem["shipping"] = [];
  for (const s of list) {
    if (!s || typeof s !== "object") continue;
    const rec = s as Record<string, unknown>;
    out.push({ country: textOf(field(rec, "country"))?.toUpperCase().slice(0, 2) ?? null, price: parseGmcPrice(textOf(field(rec, "price"))) });
  }
  return out;
}

function toItem(record: Record<string, unknown>): GmcItem | null {
  const id = textOf(field(record, "id"));
  const title = textOf(field(record, "title"));
  if (!id || !title) return null;
  const quantityRaw = textOf(field(record, "quantity"));
  const quantity = quantityRaw !== null && /^\d+$/.test(quantityRaw) ? Number(quantityRaw) : null;
  const raw: Record<string, unknown> = {};
  for (const key of ["id", "title", "price", "sale_price", "availability", "gtin", "mpn", "brand", "condition", "item_group_id", "link"]) {
    const v = textOf(field(record, key));
    if (v !== null) raw[key] = v;
  }
  return {
    id,
    title,
    description: textOf(field(record, "description")),
    link: linkOf(record),
    price: parseGmcPrice(textOf(field(record, "price"))),
    salePrice: parseGmcPrice(textOf(field(record, "sale_price"))),
    availability: textOf(field(record, "availability"))?.toLowerCase() ?? null,
    gtin: textOf(field(record, "gtin"))?.replace(/\D/g, "") || null,
    mpn: textOf(field(record, "mpn")),
    brand: textOf(field(record, "brand")),
    condition: textOf(field(record, "condition"))?.toLowerCase() ?? null,
    itemGroupId: textOf(field(record, "item_group_id")),
    color: textOf(field(record, "color")),
    size: textOf(field(record, "size")),
    shipping: shippingOf(record),
    quantity,
    raw,
  };
}

export function parseGmcXml(text: string): GmcItem[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: false, parseTagValue: false, trimValues: true, cdataPropName: false });
  const doc = parser.parse(text.replace(/^\uFEFF/, "")) as Record<string, unknown>;
  const rss = doc.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  const feed = doc.feed as Record<string, unknown> | undefined;
  const rawItems = channel?.item ?? feed?.entry ?? null;
  if (rawItems === null || rawItems === undefined) throw new Error("Flux non reconnu : ni <rss><channel><item>, ni <feed><entry>.");
  const list = Array.isArray(rawItems) ? rawItems : [rawItems];
  const items: GmcItem[] = [];
  for (const entry of list.slice(0, MAX_FEED_ITEMS)) {
    const parsed = gmcItemSchema.safeParse(entry);
    if (!parsed.success) continue;
    const item = toItem(parsed.data);
    if (item) items.push(item);
  }
  return items;
}

export function parseGmcTsv(text: string): GmcItem[] {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLine = clean.split(/\r?\n/)[0] ?? "";
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
  const rows = parseCsv(clean, { columns: (header: string[]) => header.map((h) => h.trim().toLowerCase().replace(/^g:/, "")), delimiter, bom: true, trim: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true, to: MAX_FEED_ITEMS + 1 }) as Array<Record<string, unknown>>;
  const items: GmcItem[] = [];
  for (const row of rows) {
    const parsed = gmcItemSchema.safeParse(row);
    if (!parsed.success) continue;
    // Colonnes TSV d'expédition : « shipping(country:price) » ou « shipping » = « FR:4.99 EUR »
    const record: Record<string, unknown> = { ...parsed.data };
    const shippingCol = Object.keys(record).find((k) => k.startsWith("shipping"));
    if (shippingCol && typeof record[shippingCol] === "string") {
      const [country, ...rest] = (record[shippingCol] as string).split(":");
      record.shipping = rest.length > 0 ? { country: country?.trim() ?? null, price: rest.join(":").trim() } : { price: record[shippingCol] };
    }
    const item = toItem(record);
    if (item) items.push(item);
  }
  return items;
}

export function parseGmcFeed(text: string, format: "xml" | "tsv"): GmcItem[] {
  return format === "xml" ? parseGmcXml(text) : parseGmcTsv(text);
}
