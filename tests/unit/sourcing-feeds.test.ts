import { describe, expect, it } from "vitest";
import { parseFeedContent, mapRow, previewFeed, suggestMapping, toNumber, toDeliveryRange, toTaxType, getPath, type FieldMapping } from "@/services/sourcing/feed-parsers";

const CSV = `sku;Désignation;Prix HT;Devise;Stock;MOQ;EAN;Délai
IP13-128-BLK;Apple iPhone 13 128GB Noir Grade A;229,90;EUR;45;10;0194252707013;3-5
IP13-256-BLU;Apple iPhone 13 256GB Bleu Grade B;249;EUR;0;5;;7
BAD;Sans prix;;EUR;3;1;;2`;

const mapping: FieldMapping = { supplier_sku: "sku", title: "Désignation", price: "Prix HT", currency: "Devise", available_quantity: "Stock", moq: "MOQ", ean: "EAN", delivery_days: "Délai", tax_type: { const: "ht" } };

describe("feed parsers", () => {
  it("parse un CSV (délimiteur détecté) et mappe les colonnes", () => {
    const parsed = parseFeedContent(CSV, "csv");
    expect(parsed.rows.length).toBe(3);
    expect(parsed.columns).toContain("Désignation");
    const first = mapRow(parsed.rows[0]!, mapping);
    expect(first.errors).toEqual([]);
    expect(first.offer).toMatchObject({ externalOfferId: "IP13-128-BLK", price: 229.9, currency: "EUR", availableQuantity: 45, moq: 10, ean: "0194252707013", deliveryMinDays: 3, deliveryMaxDays: 5, taxType: "ht", stockStatus: "in_stock" });
    const second = mapRow(parsed.rows[1]!, mapping);
    expect(second.offer?.stockStatus).toBe("out_of_stock");
    expect(second.offer?.ean).toBeNull();
    const bad = mapRow(parsed.rows[2]!, mapping);
    expect(bad.offer).toBeNull();
    expect(bad.errors.join(" ")).toContain("Prix manquant");
  });

  it("prévisualise avec comptage valides / invalides", () => {
    const p = previewFeed(CSV, "csv", mapping, {}, {}, 20);
    expect(p.total).toBe(3);
    expect(p.validCount).toBe(2);
    expect(p.invalidCount).toBe(1);
    expect(p.sample[0]?.offer?.title).toContain("iPhone 13");
  });

  it("parse un XML avec chemin racine", () => {
    const xml = `<?xml version="1.0"?><catalog><product><id>A1</id><name>Galaxy S23 128GB Noir</name><price>499.00</price><currency>USD</currency><qty>12</qty></product><product><id>A2</id><name>Galaxy S23 256GB</name><price>0</price><currency>USD</currency><qty>3</qty></product></catalog>`;
    const parsed = parseFeedContent(xml, "xml", { root_path: "catalog.product" });
    expect(parsed.rows.length).toBe(2);
    const m: FieldMapping = { external_offer_id: "id", title: "name", price: "price", currency: "currency", available_quantity: "qty" };
    const r = mapRow(parsed.rows[0]!, m);
    expect(r.offer).toMatchObject({ externalOfferId: "A1", price: 499, currency: "USD", availableQuantity: 12 });
    // un prix 0 est transmis tel quel : c'est la validation qui le rejettera (prix précédent conservé)
    expect(mapRow(parsed.rows[1]!, m).offer?.price).toBe(0);
  });

  it("parse un XML sans chemin racine (détection automatique)", () => {
    const xml = `<rss><channel><title>x</title><item><g:id>1</g:id><g:title>Pixel 8 128GB</g:title><g:price>599 EUR</g:price></item><item><g:id>2</g:id><g:title>Pixel 8 Pro</g:title><g:price>799 EUR</g:price></item></channel></rss>`;
    const parsed = parseFeedContent(xml, "xml");
    expect(parsed.rows.length).toBe(2);
    expect(parsed.warnings[0]).toContain("rss.channel.item");
    expect(parsed.columns).toContain("id");
  });

  it("parse un JSON imbriqué avec chemins pointés", () => {
    const json = JSON.stringify({ data: { items: [{ ref: "J1", info: { label: "iPad Air 64GB", pricing: { amount: "1 299,50", cur: "eur" } }, stock: { available: true } }] } });
    const parsed = parseFeedContent(json, "json", { root_path: "data.items" });
    expect(parsed.rows.length).toBe(1);
    const r = mapRow(parsed.rows[0]!, { external_offer_id: "ref", title: "info.label", price: "info.pricing.amount", currency: "info.pricing.cur", stock_status: "stock.available" });
    expect(r.offer).toMatchObject({ externalOfferId: "J1", price: 1299.5, currency: "EUR", stockStatus: "in_stock" });
    expect(getPath({ a: [{ b: 1 }] }, "a[0].b")).toBe(1);
  });

  it("utilise les valeurs par défaut de la source (devise, TVA, pays)", () => {
    const r = mapRow({ id: "X", t: "Titre", p: "10" }, { external_offer_id: "id", title: "t", price: "p" }, { currency: "GBP", taxType: "ttc", country: "GB" });
    expect(r.offer).toMatchObject({ currency: "GBP", taxType: "ttc", country: "GB" });
    const none = mapRow({ id: "X", t: "Titre", p: "10" }, { external_offer_id: "id", title: "t", price: "p" });
    expect(none.offer).toBeNull();
    expect(none.errors.join(" ")).toContain("Devise manquante");
  });

  it("convertit les nombres et délais dans les formats courants", () => {
    expect(toNumber("1.234,56")).toBe(1234.56);
    expect(toNumber("1,234.56")).toBe(1234.56);
    expect(toNumber("229,90 €")).toBe(229.9);
    expect(toNumber("abc")).toBeNull();
    expect(toDeliveryRange("5 à 7 jours")).toEqual({ min: 5, max: 7 });
    expect(toDeliveryRange("10")).toEqual({ min: 10, max: 10 });
    expect(toTaxType("HT")).toBe("ht");
    expect(toTaxType("incl")).toBe("ttc");
    expect(toTaxType("?")).toBe("unknown");
  });

  it("suggère un mapping à partir des entêtes", () => {
    const s = suggestMapping(["SKU", "Titre", "Prix", "Devise", "Stock", "EAN", "Marque"]);
    expect(s).toMatchObject({ supplier_sku: "SKU", title: "Titre", price: "Prix", currency: "Devise", available_quantity: "Stock", ean: "EAN", brand: "Marque" });
  });
});
