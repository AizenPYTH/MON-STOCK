import "server-only";
import { createAdminSupabaseClient, type AdminSupabaseClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import type { Json } from "@/db/database.types";

type JsonValue = NonNullable<Json>;

/**
 * =============================================================================
 * DONNÉES DE DÉMONSTRATION — FICTIVES
 * Ce module ne s'exécute que pour une organisation marquée is_demo = true.
 * Aucune valeur ici ne provient d'une marketplace ou d'un fournisseur réel.
 * Le code de production (dashboard, stock, sourcing…) ne dépend pas de ce fichier.
 * =============================================================================
 */

const log = createLogger("DEMO");
const DAY = 86_400_000;

/** PRNG déterministe (mulberry32) : le même seed produit la même démo. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DemoVariant {
  storage?: string;
  color?: string;
  grade?: string;
  condition: "new" | "refurbished" | "used";
  code: string;
  cost: number | null;
  sale: number;
  initial: number;
  /** ventes moyennes par jour (fictif) */
  rate: number;
  ean?: string;
}
interface DemoProduct {
  name: string;
  brand: string;
  category: string;
  variants: DemoVariant[];
}

const PRODUCTS: DemoProduct[] = [
  { name: "Apple iPhone 13", brand: "Apple", category: "Smartphones", variants: [
    { storage: "128 Go", color: "Noir", grade: "A", condition: "refurbished", code: "IPH13-128-BLK-A", cost: 258, sale: 329, initial: 60, rate: 4.2, ean: "0194252707340" },
    { storage: "128 Go", color: "Noir", grade: "B", condition: "refurbished", code: "IPH13-128-BLK-B", cost: 229, sale: 289, initial: 25, rate: 1.1 },
    { storage: "128 Go", color: "Bleu", grade: "A", condition: "refurbished", code: "IPH13-128-BLU-A", cost: 262, sale: 335, initial: 18, rate: 0.9 },
    { storage: "256 Go", color: "Noir", grade: "A", condition: "refurbished", code: "IPH13-256-BLK-A", cost: 305, sale: 389, initial: 12, rate: 0.5 },
  ] },
  { name: "Apple iPhone 12", brand: "Apple", category: "Smartphones", variants: [
    { storage: "64 Go", color: "Noir", grade: "A", condition: "refurbished", code: "IPH12-64-BLK-A", cost: 195, sale: 249, initial: 40, rate: 2.3 },
    { storage: "128 Go", color: "Blanc", grade: "B", condition: "refurbished", code: "IPH12-128-WHT-B", cost: 189, sale: 239, initial: 9, rate: 0.6 },
  ] },
  { name: "Apple iPhone 14", brand: "Apple", category: "Smartphones", variants: [
    { storage: "128 Go", color: "Minuit", grade: "A", condition: "refurbished", code: "IPH14-128-MID-A", cost: 395, sale: 489, initial: 30, rate: 1.8 },
    { storage: "256 Go", color: "Violet", grade: "A", condition: "refurbished", code: "IPH14-256-PUR-A", cost: null, sale: 549, initial: 6, rate: 0.3 },
  ] },
  { name: "Apple iPhone 15", brand: "Apple", category: "Smartphones", variants: [
    { storage: "128 Go", color: "Noir", condition: "new", code: "IPH15-128-BLK-N", cost: 689, sale: 799, initial: 10, rate: 0.7 },
  ] },
  { name: "Apple iPhone SE (2022)", brand: "Apple", category: "Smartphones", variants: [
    { storage: "64 Go", color: "Noir", grade: "A", condition: "refurbished", code: "IPHSE22-64-BLK-A", cost: 155, sale: 199, initial: 14, rate: 0.4 },
  ] },
  { name: "Samsung Galaxy S22", brand: "Samsung", category: "Smartphones", variants: [
    { storage: "128 Go", color: "Noir", grade: "A", condition: "refurbished", code: "SGS22-128-BLK-A", cost: 240, sale: 309, initial: 7, rate: 1.4 },
    { storage: "256 Go", color: "Blanc", grade: "A", condition: "refurbished", code: "SGS22-256-WHT-A", cost: 265, sale: 339, initial: 11, rate: 0.5 },
  ] },
  { name: "Samsung Galaxy S23", brand: "Samsung", category: "Smartphones", variants: [
    { storage: "128 Go", color: "Noir", grade: "A", condition: "refurbished", code: "SGS23-128-BLK-A", cost: 329, sale: 419, initial: 22, rate: 1.2 },
    { storage: "256 Go", color: "Crème", condition: "new", code: "SGS23-256-CRM-N", cost: 489, sale: 599, initial: 5, rate: 0.2 },
  ] },
  { name: "Samsung Galaxy A54", brand: "Samsung", category: "Smartphones", variants: [
    { storage: "128 Go", color: "Graphite", condition: "new", code: "SGA54-128-GRA-N", cost: 245, sale: 299, initial: 35, rate: 1.0 },
  ] },
  { name: "Google Pixel 7", brand: "Google", category: "Smartphones", variants: [
    { storage: "128 Go", color: "Obsidienne", grade: "A", condition: "refurbished", code: "PIX7-128-OBS-A", cost: 240, sale: 319, initial: 16, rate: 0.8 },
  ] },
  { name: "Xiaomi Redmi Note 12", brand: "Xiaomi", category: "Smartphones", variants: [
    { storage: "128 Go", color: "Gris", condition: "new", code: "XRN12-128-GRY-N", cost: 139, sale: 179, initial: 48, rate: 1.6 },
  ] },
  { name: "Apple AirPods Pro (2e gén.)", brand: "Apple", category: "Audio", variants: [
    { condition: "new", code: "APP2-N", cost: 189, sale: 239, initial: 80, rate: 2.9 },
    { grade: "A", condition: "refurbished", code: "APP2-A", cost: 129, sale: 169, initial: 20, rate: 0.9 },
  ] },
  { name: "Apple AirPods (3e gén.)", brand: "Apple", category: "Audio", variants: [{ condition: "new", code: "AP3-N", cost: 139, sale: 179, initial: 30, rate: 0.9 }] },
  { name: "Apple Watch Series 8 41 mm", brand: "Apple", category: "Montres", variants: [
    { color: "Minuit", grade: "A", condition: "refurbished", code: "AWS8-41-MID-A", cost: 219, sale: 289, initial: 9, rate: 0.5 },
  ] },
  { name: "Apple Watch SE 40 mm", brand: "Apple", category: "Montres", variants: [{ color: "Lumière stellaire", condition: "new", code: "AWSE-40-STR-N", cost: 199, sale: 249, initial: 12, rate: 0.4 }] },
  { name: "Apple iPad (9e gén.) 10.2\"", brand: "Apple", category: "Tablettes", variants: [
    { storage: "64 Go", color: "Gris sidéral", grade: "A", condition: "refurbished", code: "IPAD9-64-SGR-A", cost: 199, sale: 259, initial: 14, rate: 0.7 },
  ] },
  { name: "Apple iPad Air (5e gén.)", brand: "Apple", category: "Tablettes", variants: [{ storage: "64 Go", color: "Bleu", condition: "new", code: "IPADA5-64-BLU-N", cost: 529, sale: 629, initial: 4, rate: 0.15 }] },
  { name: "Apple MacBook Air M2 13\"", brand: "Apple", category: "Ordinateurs", variants: [
    { storage: "256 Go", color: "Minuit", grade: "A", condition: "refurbished", code: "MBA-M2-256-MID-A", cost: 849, sale: 999, initial: 6, rate: 0.25 },
  ] },
  { name: "Apple MacBook Pro 14\" M1 Pro", brand: "Apple", category: "Ordinateurs", variants: [{ storage: "512 Go", color: "Gris sidéral", grade: "B", condition: "refurbished", code: "MBP14-M1P-512-B", cost: 1190, sale: 1399, initial: 3, rate: 0.1 }] },
  { name: "Dell Latitude 5420", brand: "Dell", category: "Ordinateurs", variants: [{ storage: "256 Go SSD", grade: "B", condition: "refurbished", code: "DELL-L5420-256-B", cost: 310, sale: 419, initial: 15, rate: 0.5 }] },
  { name: "Lenovo ThinkPad T14 Gen 2", brand: "Lenovo", category: "Ordinateurs", variants: [{ storage: "512 Go SSD", grade: "A", condition: "refurbished", code: "LEN-T14G2-512-A", cost: 420, sale: 549, initial: 8, rate: 0.35 }] },
  { name: "Samsung Galaxy Tab A8", brand: "Samsung", category: "Tablettes", variants: [{ storage: "32 Go", color: "Gris", condition: "new", code: "SGTA8-32-GRY-N", cost: 129, sale: 169, initial: 20, rate: 0.6 }] },
  { name: "Samsung Galaxy Buds2 Pro", brand: "Samsung", category: "Audio", variants: [{ color: "Graphite", condition: "new", code: "SGB2P-GRA-N", cost: 115, sale: 149, initial: 25, rate: 0.7 }] },
  { name: "Sony WH-1000XM4", brand: "Sony", category: "Audio", variants: [{ color: "Noir", grade: "A", condition: "refurbished", code: "SONY-XM4-BLK-A", cost: 149, sale: 199, initial: 10, rate: 0.6 }] },
  { name: "JBL Flip 6", brand: "JBL", category: "Audio", variants: [{ color: "Noir", condition: "new", code: "JBL-FLIP6-BLK-N", cost: 79, sale: 109, initial: 40, rate: 1.1 }] },
  { name: "Chargeur USB-C 20 W", brand: "Apple", category: "Accessoires", variants: [{ condition: "new", code: "ACC-USBC-20W", cost: 11, sale: 19.9, initial: 200, rate: 5.5 }] },
  { name: "Câble USB-C vers Lightning 1 m", brand: "Apple", category: "Accessoires", variants: [{ condition: "new", code: "ACC-CABLE-CL-1M", cost: 7.5, sale: 14.9, initial: 150, rate: 3.8 }] },
  { name: "Coque silicone iPhone 13", brand: "Générique", category: "Accessoires", variants: [
    { color: "Noir", condition: "new", code: "ACC-CASE-IPH13-BLK", cost: 2.1, sale: 9.9, initial: 120, rate: 2.5 },
    { color: "Bleu", condition: "new", code: "ACC-CASE-IPH13-BLU", cost: 2.1, sale: 9.9, initial: 0, rate: 1.2 },
  ] },
  { name: "Verre trempé iPhone 13 / 14", brand: "Générique", category: "Accessoires", variants: [{ condition: "new", code: "ACC-GLASS-IPH13", cost: 0.9, sale: 7.9, initial: 300, rate: 4.0 }] },
  { name: "Batterie externe 10 000 mAh", brand: "Anker", category: "Accessoires", variants: [{ color: "Noir", condition: "new", code: "ACC-PB-10K-BLK", cost: 14, sale: 24.9, initial: 45, rate: 1.3 }] },
  { name: "Nintendo Switch OLED", brand: "Nintendo", category: "Consoles", variants: [{ color: "Blanc", grade: "A", condition: "refurbished", code: "NSW-OLED-WHT-A", cost: 229, sale: 299, initial: 7, rate: 0.5 }] },
  { name: "Sony PlayStation 5 (édition standard)", brand: "Sony", category: "Consoles", variants: [{ grade: "A", condition: "refurbished", code: "PS5-STD-A", cost: 379, sale: 459, initial: 2, rate: 0.4 }] },
];

interface DemoSupplier {
  name: string;
  company: string;
  country: string;
  lead: number;
  moq: number;
  offers: Array<{ code: string; price: number; moq: number; qty: number | null; lead: number; shipping: number | null; history: number[] }>;
}

const SUPPLIERS: DemoSupplier[] = [
  { name: "DEMO — Alpha Distribution (fictif)", company: "Alpha Distribution SAS", country: "FR", lead: 2, moq: 10, offers: [
    { code: "IPH13-128-BLK-A", price: 251, moq: 20, qty: 80, lead: 2, shipping: 15, history: [262, 258, 255, 251] },
    { code: "IPH13-128-BLK-B", price: 221, moq: 10, qty: 40, lead: 2, shipping: 15, history: [229, 225, 221] },
    { code: "SGS23-128-BLK-A", price: 318, moq: 5, qty: 25, lead: 2, shipping: 15, history: [335, 329, 318] },
    { code: "APP2-N", price: 182, moq: 10, qty: 200, lead: 2, shipping: 9, history: [189, 185, 182] },
    { code: "ACC-USBC-20W", price: 9.8, moq: 100, qty: null, lead: 3, shipping: 12, history: [11, 10.5, 9.8] },
  ] },
  { name: "DEMO — Beta Wholesale (fictif)", company: "Beta Wholesale GmbH", country: "DE", lead: 4, moq: 50, offers: [
    { code: "IPH13-128-BLK-A", price: 244, moq: 50, qty: 320, lead: 4, shipping: 40, history: [249, 249, 246, 244] },
    { code: "IPH12-64-BLK-A", price: 186, moq: 20, qty: 90, lead: 4, shipping: 25, history: [199, 192, 186] },
    { code: "SGS22-128-BLK-A", price: 228, moq: 10, qty: 30, lead: 4, shipping: 25, history: [240, 236, 228] },
    { code: "PIX7-128-OBS-A", price: 226, moq: 10, qty: 18, lead: 5, shipping: 25, history: [240, 231, 226] },
    { code: "SONY-XM4-BLK-A", price: 139, moq: 5, qty: 12, lead: 4, shipping: 12, history: [149, 139] },
  ] },
  { name: "DEMO — Gamma Refurb (fictif)", company: "Gamma Refurb Ltd", country: "GB", lead: 1, moq: 5, offers: [
    { code: "IPH13-128-BLK-A", price: 265, moq: 10, qty: 24, lead: 1, shipping: null, history: [265] },
    { code: "IPH14-128-MID-A", price: 386, moq: 5, qty: 15, lead: 1, shipping: null, history: [399, 386] },
    { code: "AWS8-41-MID-A", price: 205, moq: 5, qty: 9, lead: 1, shipping: null, history: [219, 205] },
    { code: "MBA-M2-256-MID-A", price: 829, moq: 2, qty: 4, lead: 2, shipping: null, history: [849, 829] },
  ] },
];

type SkuMap = Map<string, { skuId: string; productId: string; variant: DemoVariant; product: DemoProduct }>;

export async function seedDemoData(organizationId: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  const { data: org, error: orgErr } = await admin.from("organizations").select("id, is_demo").eq("id", organizationId).single();
  if (orgErr || !org) throw new AppError("NOT_FOUND", "Organisation introuvable.");
  if (!org.is_demo) throw new AppError("FORBIDDEN", "Le seed de démonstration ne s'exécute que sur une organisation marquée DEMO.");

  const { count } = await admin.from("products").select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
  if ((count ?? 0) > 0) throw new AppError("CONFLICT", "Cette organisation de démonstration contient déjà des données.");

  const random = rng(20261007);
  const now = Date.now();
  log.info("seeding demo organization", { organizationId });

  // Canaux : eBay (démo, NON connecté) avec frais renseignés, pour que les marges soient calculables.
  const { data: ebayChannel, error: chErr } = await admin
    .from("sales_channels")
    .insert({ organization_id: organizationId, provider: "ebay", name: "eBay (démo, non connecté)", currency: "EUR", fee_percent: 12.8, payment_fee_percent: 0, payment_fee_fixed: 0.35, default_shipping_cost: 5.9 })
    .select("id")
    .single();
  if (chErr || !ebayChannel) throw new AppError("INTERNAL", `Canal démo : ${chErr?.message}`);
  const { data: manualChannel } = await admin.from("sales_channels").select("id").eq("organization_id", organizationId).eq("provider", "manual").single();
  if (!manualChannel) throw new AppError("INTERNAL", "Canal manuel introuvable.");
  await admin.from("organizations").update({ settings: { default_shipping_cost: 5.9, vat_rate: 20 } as JsonValue }).eq("id", organizationId);

  // Produits / variantes / SKU (stock initial = réception datée il y a 95 jours)
  const skus: SkuMap = new Map();
  for (const product of PRODUCTS) {
    let productId: string | null = null;
    for (const v of product.variants) {
      const variantName = [v.storage, v.color, v.grade ? `Grade ${v.grade}` : null].filter(Boolean).join(" / ") || "Standard";
      const attributes: Record<string, string> = {};
      if (v.storage) attributes.storage = v.storage;
      if (v.color) attributes.color = v.color;
      if (v.grade) attributes.grade = v.grade;
      const { data, error } = await admin.rpc("create_sku", {
        p_organization_id: organizationId,
        ...(productId ? { p_product_id: productId } : { p_product: { name: product.name, brand: product.brand, category: product.category } }),
        p_variant: { name: variantName, condition: v.condition, grade: v.grade ?? null, ean: v.ean ?? null, attributes },
        p_sku: { code: v.code, cost_price: v.cost, sale_price: v.sale, currency: "EUR", reorder_point: Math.max(2, Math.round(v.rate * 5)), safety_stock: Math.max(1, Math.round(v.rate * 3)), location: `A-${Math.floor(random() * 40) + 1}` },
        p_initial_quantity: 0,
      });
      if (error || !data) throw new AppError("INTERNAL", `SKU ${v.code} : ${error?.message}`);
      const res = data as { product_id: string; variant_id: string; sku_id: string };
      productId = res.product_id;
      skus.set(v.code, { skuId: res.sku_id, productId, variant: v, product });
      const initial = v.initial + Math.round(v.rate * 90 * 0.9); // stock reçu pour couvrir ~90 jours de ventes fictives
      if (initial > 0) {
        const { error: mvErr } = await admin.rpc("apply_inventory_movement", {
          p_organization_id: organizationId,
          p_sku_id: res.sku_id,
          p_type: "receipt",
          p_quantity: initial,
          p_reference_type: "manual",
          p_channel: "manual",
          p_note: "DEMO — réception initiale fictive",
          p_occurred_at: new Date(now - 95 * DAY).toISOString(),
        });
        if (mvErr) throw new AppError("INTERNAL", `Mouvement ${v.code} : ${mvErr.message}`);
      }
    }
  }

  // Annonces eBay (démo) : mappées pour la plupart, quelques-unes non associées pour l'écran de mapping.
  let itemCounter = 100000001;
  const listingBySku = new Map<string, string>();
  const unmappedCodes = new Set(["SGTA8-32-GRY-N", "JBL-FLIP6-BLK-N"]);
  for (const [code, info] of skus) {
    const itemId = String(itemCounter++);
    listingBySku.set(code, itemId);
    const unmapped = unmappedCodes.has(code);
    const { error } = await admin.from("channel_listings").insert({
      organization_id: organizationId,
      sales_channel_id: ebayChannel.id,
      provider: "ebay",
      external_listing_id: itemId,
      external_sku: unmapped ? null : code,
      title: `${info.product.name} ${info.variant.storage ?? ""} ${info.variant.color ?? ""} ${info.variant.grade ? "Grade " + info.variant.grade : ""} (DEMO)`.replace(/\s+/g, " ").trim(),
      price: info.variant.sale,
      currency: "EUR",
      quantity_listed: info.variant.initial,
      quantity_available: info.variant.initial,
      status: "active",
      listing_url: null,
      sku_id: unmapped ? null : info.skuId,
      mapping_status: unmapped ? "unmapped" : "mapped",
      mapping_source: unmapped ? null : "auto_sku_match",
      mapped_at: unmapped ? null : new Date(now - 90 * DAY).toISOString(),
    });
    if (error) throw new AppError("INTERNAL", `Annonce ${code} : ${error.message}`);
  }
  // Suggestions de mapping pour les annonces non associées
  const { data: unmappedListings } = await admin.from("channel_listings").select("id, title").eq("organization_id", organizationId).eq("mapping_status", "unmapped");
  for (const l of unmappedListings ?? []) {
    const code = l.title.includes("Tab A8") ? "SGTA8-32-GRY-N" : "JBL-FLIP6-BLK-N";
    const target = skus.get(code);
    if (!target) continue;
    await admin.from("mapping_suggestions").insert({ organization_id: organizationId, listing_id: l.id, sku_id: target.skuId, confidence: 0.82, method: "title_similarity", reasons: ["Titre proche du nom du produit", "Prix identique"] as JsonValue });
  }

  // Commandes sur 90 jours (eBay démo + quelques ventes manuelles), ingérées via la fonction idempotente.
  const orderJobs: Array<() => Promise<void>> = [];
  let orderSeq = 1;
  for (let day = 90; day >= 0; day--) {
    for (const [code, info] of skus) {
      const v = info.variant;
      // Poisson approximatif : nombre de ventes du jour
      const expected = v.rate * (day < 7 && code === "IPH13-128-BLK-A" ? 1.3 : 1) * (0.6 + random() * 0.8);
      let n = Math.floor(expected);
      if (random() < expected - n) n += 1;
      for (let k = 0; k < n; k++) {
        const qty = random() < 0.9 ? 1 : 2;
        const placedAt = new Date(now - day * DAY - Math.floor(random() * DAY * 0.9));
        const provider = random() < 0.85 ? "ebay" : "manual";
        const unit = Math.round(v.sale * (0.97 + random() * 0.06) * 100) / 100;
        const cancelled = random() < 0.03;
        const extId = provider === "ebay" ? `DEMO-${String(orderSeq).padStart(6, "0")}` : `MAN-${String(orderSeq).padStart(6, "0")}`;
        orderSeq++;
        const order = {
          external_order_id: extId,
          order_number: provider === "ebay" ? `${10 + (orderSeq % 10)}-${String(10000 + orderSeq).slice(-5)}-${String(20000 + orderSeq).slice(-5)}` : extId,
          status: cancelled ? "cancelled" : day > 3 ? "delivered" : day > 1 ? "shipped" : "paid",
          payment_status: "PAID",
          buyer_username: `acheteur_demo_${Math.floor(random() * 500)}`,
          currency: "EUR",
          subtotal: unit * qty,
          shipping_total: 0,
          total: unit * qty,
          placed_at: placedAt.toISOString(),
        };
        const items = [{ external_line_item_id: `${extId}-1`, external_listing_id: provider === "ebay" ? listingBySku.get(code) ?? null : null, external_variation_id: "", external_sku: code, title: info.product.name, quantity: qty, unit_price: unit, currency: "EUR", total: unit * qty }];
        orderJobs.push(async () => {
          const { error } = await admin.rpc("ingest_external_order", {
            p_organization_id: organizationId,
            p_sales_channel_id: provider === "ebay" ? ebayChannel.id : manualChannel.id,
            // Pas de connexion OAuth en démo : null est accepté par la fonction SQL.
            p_connection_id: null as unknown as string,
            p_provider: provider,
            p_order: order as unknown as JsonValue,
            p_items: items as unknown as JsonValue,
          });
          if (error) throw new AppError("INTERNAL", `Commande ${extId} : ${error.message}`);
        });
      }
    }
  }
  // Exécution par lots pour limiter la durée (ordre chronologique conservé par lot).
  for (let i = 0; i < orderJobs.length; i += 12) {
    await Promise.all(orderJobs.slice(i, i + 12).map((job) => job()));
  }
  log.info("demo orders ingested", { organizationId, orders: orderJobs.length });

  // Fournisseurs fictifs, sources MANUAL, offres (certaines sous le coût actuel → opportunités) et historique de prix.
  for (const s of SUPPLIERS) {
    const { data: supplier, error: sErr } = await admin
      .from("suppliers")
      .insert({ organization_id: organizationId, name: s.name, company: s.company, country: s.country, website: null, email: `contact@${s.company.split(" ")[0]?.toLowerCase()}.example`, average_lead_time_days: s.lead, default_moq: s.moq, currency: "EUR", payment_terms: "30 jours fin de mois", notes: "Fournisseur fictif généré pour la démonstration." })
      .select("id")
      .single();
    if (sErr || !supplier) throw new AppError("INTERNAL", `Fournisseur ${s.name} : ${sErr?.message}`);
    const { data: source, error: srcErr } = await admin
      .from("supplier_sources")
      .insert({ organization_id: organizationId, supplier_id: supplier.id, name: "Saisie manuelle (démo)", source_type: "MANUAL", country: s.country, default_currency: "EUR", default_tax_type: "ht", status: "active", last_sync_at: new Date(now - 12 * 60_000).toISOString() })
      .select("id")
      .single();
    if (srcErr || !source) throw new AppError("INTERNAL", `Source ${s.name} : ${srcErr?.message}`);
    for (const o of s.offers) {
      const target = skus.get(o.code);
      if (!target) continue;
      const lastSeen = new Date(now - Math.floor(random() * 6 * 3_600_000)).toISOString();
      const { data: offer, error: oErr } = await admin
        .from("sourcing_offers")
        .insert({
          organization_id: organizationId,
          supplier_id: supplier.id,
          source_id: source.id,
          source_type: "MANUAL",
          external_offer_id: `${s.country}-${o.code}`,
          title_original: `${target.product.name} ${target.variant.storage ?? ""} ${target.variant.color ?? ""} ${target.variant.grade ? "Grade " + target.variant.grade : ""}`.replace(/\s+/g, " ").trim(),
          sku_id: target.skuId,
          brand: target.product.brand,
          model: target.product.name.replace(target.product.brand, "").trim(),
          storage: target.variant.storage ?? null,
          color: target.variant.color ?? null,
          condition: target.variant.condition,
          grade: target.variant.grade ?? null,
          original_price: o.price,
          original_currency: "EUR",
          normalized_price: o.price,
          normalized_currency: "EUR",
          fx_rate: 1,
          tax_type: "ht",
          moq: o.moq,
          available_quantity: o.qty,
          stock_status: o.qty === null ? "unknown" : o.qty > 20 ? "in_stock" : o.qty > 0 ? "low" : "out_of_stock",
          shipping_cost: o.shipping,
          shipping_currency: o.shipping === null ? null : "EUR",
          delivery_min_days: o.lead,
          delivery_max_days: o.lead + 1,
          country: s.country,
          source_url: null,
          confidence: { product: 1, price: 1, stock: o.qty === null ? 0 : 0.9, grade: 0.9 } as JsonValue,
          status: "active",
          first_seen_at: new Date(now - 40 * DAY).toISOString(),
          last_seen_at: lastSeen,
          last_price_at: lastSeen,
          last_stock_at: lastSeen,
        })
        .select("id")
        .single();
      if (oErr || !offer) throw new AppError("INTERNAL", `Offre ${o.code} : ${oErr?.message}`);
      // Historique de prix antérieur (le trigger a déjà enregistré le prix courant).
      const past = o.history.slice(0, -1);
      if (past.length > 0) {
        await admin.from("supplier_price_history").insert(
          past.map((price, i) => ({
            organization_id: organizationId,
            offer_id: offer.id,
            original_price: price,
            original_currency: "EUR",
            normalized_price: price,
            normalized_currency: "EUR",
            tax_type: "ht" as const,
            recorded_at: new Date(now - (past.length - i) * 7 * DAY).toISOString(),
          })),
        );
      }
    }
    // Commande fournisseur reçue (historique d'achats) chez Alpha, et une commande en cours chez Beta.
    if (s.country === "FR" || s.country === "DE") {
      const target = skus.get("IPH13-128-BLK-A");
      const offer = s.offers[0];
      if (target && offer) {
        const received = s.country === "FR";
        const { data: po } = await admin
          .from("purchase_orders")
          .insert({ organization_id: organizationId, supplier_id: supplier.id, reference: received ? "DEMO-PO-001" : "DEMO-PO-002", status: received ? "received" : "sent", currency: "EUR", expected_at: new Date(now + 3 * DAY).toISOString().slice(0, 10), notes: "Commande fictive (démo)", total: offer.price * 20, sent_at: new Date(now - (received ? 30 : 1) * DAY).toISOString(), received_at: received ? new Date(now - 27 * DAY).toISOString() : null })
          .select("id")
          .single();
        if (po) {
          await admin.from("purchase_order_items").insert({ organization_id: organizationId, purchase_order_id: po.id, sku_id: target.skuId, quantity_ordered: 20, quantity_received: received ? 20 : 0, unit_cost: offer.price, currency: "EUR" });
        }
      }
    }
  }

  // Alerte sourcing et alerte événementielle (annonces non associées)
  const iph = skus.get("IPH13-128-BLK-A");
  await admin.from("sourcing_alerts").insert({ organization_id: organizationId, name: "iPhone 13 128 Go Grade A sous 250 €", query_text: "iPhone 13 128 Go Grade A", parsed: { brand: "Apple", model: "iPhone 13", storage: "128GB", grade: "A" } as JsonValue, criteria: { max_price: 250, min_quantity: 10 } as JsonValue, sku_id: iph?.skuId ?? null, is_active: true });
  await admin.from("alerts").insert({ organization_id: organizationId, type: "unmapped_listings", severity: "warning", title: "2 annonces eBay non associées", message: "Deux annonces importées n'ont pas de SKU interne : leurs ventes ne sont pas déduites du stock.", dedupe_key: "unmapped_listings", action_href: "/settings/integrations/mapping" });

  log.info("demo seed completed", { organizationId, products: PRODUCTS.length, skus: skus.size, suppliers: SUPPLIERS.length });
}

/** Pour le script CLI : crée l'organisation DEMO pour un utilisateur donné (sans auth.uid()). */
export async function createDemoOrganizationForUser(admin: AdminSupabaseClient, userId: string): Promise<string> {
  const slug = `demo-${Math.random().toString(36).slice(2, 8)}`;
  const { data: org, error } = await admin.from("organizations").insert({ name: "Démonstration (données fictives)", slug, is_demo: true, created_by: userId }).select("id").single();
  if (error || !org) throw new AppError("INTERNAL", `Organisation démo : ${error?.message}`);
  const { error: mErr } = await admin.from("organization_members").insert({ organization_id: org.id, user_id: userId, role: "owner" });
  if (mErr) throw new AppError("INTERNAL", `Membre : ${mErr.message}`);
  await admin.from("sales_channels").insert({ organization_id: org.id, provider: "manual", name: "Ventes manuelles", currency: "EUR" });
  await admin.from("user_profiles").update({ current_organization_id: org.id }).eq("user_id", userId);
  return org.id;
}
