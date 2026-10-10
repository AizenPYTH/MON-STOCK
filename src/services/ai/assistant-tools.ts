import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { ServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Outils de l'assistant « Intelligence » : LECTURE SEULE des données réelles de l'organisation
 * (ventes eBay et autres canaux, commandes, stock, annonces, état de la connexion eBay).
 *
 * Chaque outil s'exécute avec le client Supabase DE L'UTILISATEUR (sa session, la RLS
 * s'applique) et filtre explicitement sur l'organisation active : l'assistant ne voit que ce
 * que l'utilisateur peut voir dans l'application. Aucun outil n'écrit quoi que ce soit.
 *
 * Les résultats sont des données brutes (montants, quantités, dates) que le modèle doit citer
 * telles quelles ; un résultat vide est renvoyé comme tel (« aucune vente »), jamais complété.
 */

export interface ToolContext {
  supabase: ServerSupabaseClient;
  organizationId: string;
  currency: string;
  now?: Date;
}

const DAY = 86_400_000;
const PAGE = 1000;
const MAX_ROWS = 5000;
const EXCLUDED_STATUSES = "(cancelled,refunded)";

const daysSchema = z.coerce.number().int().min(1).max(730).default(30);
const limitSchema = (max: number, def: number) => z.coerce.number().int().min(1).max(max).default(def);
const textQuery = z
  .string()
  .max(80)
  .optional()
  .transform((s) => (s ? s.replace(/[%,()*\\"']/g, " ").replace(/\s+/g, " ").trim() : undefined) || undefined);

function since(ctx: ToolContext, days: number): string {
  return new Date((ctx.now ?? new Date()).getTime() - days * DAY).toISOString();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function addMoney(map: Record<string, number>, currency: string | null | undefined, amount: number | null | undefined) {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return;
  const c = currency || "?";
  map[c] = round2((map[c] ?? 0) + amount);
}

/** Lecture paginée (PostgREST limite chaque réponse) jusqu'à MAX_ROWS lignes. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

// ---------------------------------------------------------------------------
// Ventes par produit
// ---------------------------------------------------------------------------

const salesRankingInput = z.object({
  days: daysSchema,
  by: z.enum(["units", "revenue"]).default("units"),
  limit: limitSchema(25, 10),
  channel: z.enum(["ebay", "amazon", "shopify", "woocommerce", "manual"]).optional(),
  query: textQuery,
});

type OrderItemRow = {
  sku_id: string | null;
  title: string;
  quantity: number;
  unit_price: number | null;
  total: number | null;
  currency: string | null;
  orders: { placed_at: string; status: string; provider: string; currency: string; order_number: string | null };
};

async function salesRanking(ctx: ToolContext, raw: unknown) {
  const input = salesRankingInput.parse(raw);
  const { rows, truncated } = await fetchAll<OrderItemRow>((from, to) => {
    let q = ctx.supabase
      .from("order_items")
      .select("sku_id, title, quantity, unit_price, total, currency, orders!inner(placed_at, status, provider, currency, order_number)")
      .eq("organization_id", ctx.organizationId)
      .gte("orders.placed_at", since(ctx, input.days))
      .not("orders.status", "in", EXCLUDED_STATUSES);
    if (input.channel) q = q.eq("orders.provider", input.channel);
    if (input.query) q = q.ilike("title", `%${input.query}%`);
    return q.order("id").range(from, to) as unknown as PromiseLike<{ data: OrderItemRow[] | null; error: { message: string } | null }>;
  });

  const groups = new Map<string, { skuId: string | null; title: string; units: number; revenue: Record<string, number>; orders: Set<string>; lastSaleAt: string; channels: Set<string> }>();
  for (const r of rows) {
    const key = r.sku_id ? `sku:${r.sku_id}` : `title:${r.title.trim().toLowerCase()}`;
    const g = groups.get(key) ?? { skuId: r.sku_id, title: r.title, units: 0, revenue: {}, orders: new Set<string>(), lastSaleAt: r.orders.placed_at, channels: new Set<string>() };
    g.units += r.quantity;
    addMoney(g.revenue, r.currency ?? r.orders.currency, r.total ?? (r.unit_price !== null ? r.unit_price * r.quantity : null));
    g.orders.add(`${r.orders.provider}:${r.orders.order_number ?? r.orders.placed_at}`);
    if (r.orders.placed_at > g.lastSaleAt) g.lastSaleAt = r.orders.placed_at;
    g.channels.add(r.orders.provider);
    groups.set(key, g);
  }

  const skuIds = [...groups.values()].map((g) => g.skuId).filter((x): x is string => Boolean(x));
  const labels = new Map<string, { code: string | null; product: string | null; variant: string | null; available: number | null }>();
  if (skuIds.length) {
    const { data } = await ctx.supabase
      .from("v_stock_overview")
      .select("sku_id, code, product_name, variant_name, quantity_available")
      .eq("organization_id", ctx.organizationId)
      .in("sku_id", skuIds.slice(0, 300));
    for (const s of data ?? []) if (s.sku_id) labels.set(s.sku_id, { code: s.code, product: s.product_name, variant: s.variant_name, available: s.quantity_available });
  }

  const primary = (rev: Record<string, number>) => rev[ctx.currency] ?? Object.values(rev)[0] ?? 0;
  const ranked = [...groups.values()]
    .sort((a, b) => (input.by === "units" ? b.units - a.units || primary(b.revenue) - primary(a.revenue) : primary(b.revenue) - primary(a.revenue) || b.units - a.units))
    .slice(0, input.limit)
    .map((g, i) => {
      const l = g.skuId ? labels.get(g.skuId) : undefined;
      return {
        rank: i + 1,
        product: l ? [l.product, l.variant].filter(Boolean).join(" — ") : g.title,
        sku: l?.code ?? null,
        mappedToStock: Boolean(g.skuId),
        listingTitle: g.title,
        unitsSold: g.units,
        revenue: g.revenue,
        orders: g.orders.size,
        lastSaleAt: g.lastSaleAt,
        channels: [...g.channels],
        stockAvailableNow: l?.available ?? null,
      };
    });

  const totalRevenue: Record<string, number> = {};
  for (const g of groups.values()) for (const [c, v] of Object.entries(g.revenue)) addMoney(totalRevenue, c, v);
  return {
    period: { days: input.days, from: since(ctx, input.days).slice(0, 10), channel: input.channel ?? "tous", filter: input.query ?? null },
    rankedBy: input.by,
    totals: { distinctProducts: groups.size, unitsSold: [...groups.values()].reduce((s, g) => s + g.units, 0), revenue: totalRevenue, lineItems: rows.length },
    products: ranked,
    truncated,
    note: "Commandes annulées ou remboursées exclues. revenue = montant des lignes de commande (hors frais de port), par devise.",
  };
}

// ---------------------------------------------------------------------------
// Synthèse des ventes (chiffre d'affaires, commandes, unités, tendance)
// ---------------------------------------------------------------------------

const salesSummaryInput = z.object({ days: daysSchema });

async function salesSummary(ctx: ToolContext, raw: unknown) {
  const input = salesSummaryInput.parse(raw);
  const from = since(ctx, input.days * 2).slice(0, 10);
  const { data, error } = await ctx.supabase
    .from("v_daily_sales")
    .select("day, orders_count, units, revenue, currency")
    .eq("organization_id", ctx.organizationId)
    .gte("day", from)
    .order("day", { ascending: true })
    .limit(2000);
  if (error) throw new Error(error.message);
  const split = since(ctx, input.days).slice(0, 10);
  const agg = () => ({ orders: 0, units: 0, revenue: {} as Record<string, number>, activeDays: 0 });
  const cur = agg();
  const prev = agg();
  let best: { day: string; revenue: number; currency: string | null } | null = null;
  for (const r of data ?? []) {
    if (!r.day) continue;
    const target = r.day >= split ? cur : prev;
    target.orders += r.orders_count ?? 0;
    target.units += r.units ?? 0;
    target.activeDays += 1;
    addMoney(target.revenue, r.currency ?? ctx.currency, r.revenue);
    if (target === cur && (!best || (r.revenue ?? 0) > best.revenue)) best = { day: r.day, revenue: r.revenue ?? 0, currency: r.currency };
  }
  const { count: connected } = await ctx.supabase.from("channel_connections").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organizationId).eq("status", "connected");
  return {
    period: { days: input.days, from: split, to: (ctx.now ?? new Date()).toISOString().slice(0, 10) },
    current: cur,
    previousPeriod: { ...prev, from },
    bestDay: best,
    connectedSalesChannels: connected ?? 0,
    note: "Commandes annulées ou remboursées exclues ; jours sans vente non comptés dans activeDays.",
  };
}

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------

const stockInput = z.object({
  query: textQuery,
  filter: z.enum(["all", "in_stock", "low", "out_of_stock", "dormant", "best_sellers"]).default("all"),
  limit: limitSchema(40, 15),
});

async function stockSearch(ctx: ToolContext, raw: unknown) {
  const input = stockInput.parse(raw);
  let q = ctx.supabase
    .from("v_stock_overview")
    .select("code, product_name, variant_name, brand, category, grade, condition, quantity_available, quantity_on_hand, quantity_reserved, reorder_point, cost_price, sale_price, avg_sale_price_30d, unit_margin, stock_value, currency, units_7d, units_30d, units_90d, revenue_30d, last_sale_at, active_listings_count, best_supplier_price")
    .eq("organization_id", ctx.organizationId)
    .eq("product_archived", false);
  if (input.query) q = q.or(`product_name.ilike.%${input.query}%,code.ilike.%${input.query}%,brand.ilike.%${input.query}%,variant_name.ilike.%${input.query}%`);
  const { data, error } = await q.limit(1000);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const now = (ctx.now ?? new Date()).getTime();
  const filtered = rows.filter((r) => {
    const qty = r.quantity_available ?? 0;
    switch (input.filter) {
      case "in_stock":
        return qty > 0;
      case "out_of_stock":
        return qty <= 0;
      case "low":
        return qty > 0 && qty <= Math.max(r.reorder_point ?? 0, 2);
      case "dormant":
        return (r.quantity_on_hand ?? 0) > 0 && (!r.last_sale_at || now - new Date(r.last_sale_at).getTime() > 60 * DAY);
      case "best_sellers":
        return (r.units_30d ?? 0) > 0;
      default:
        return true;
    }
  });
  filtered.sort((a, b) => (input.filter === "best_sellers" ? (b.units_30d ?? 0) - (a.units_30d ?? 0) : (b.stock_value ?? 0) - (a.stock_value ?? 0)));
  const totals = { skus: rows.length, unitsAvailable: rows.reduce((s, r) => s + Math.max(0, r.quantity_available ?? 0), 0), stockValue: {} as Record<string, number> };
  for (const r of rows) addMoney(totals.stockValue, r.currency ?? ctx.currency, r.stock_value);
  return {
    filter: input.filter,
    query: input.query ?? null,
    matching: filtered.length,
    totalsForQuery: totals,
    items: filtered.slice(0, input.limit),
    truncated: rows.length >= 1000,
    note: "stock_value = quantité en stock × prix d'achat (null si prix d'achat inconnu). unit_margin = prix de vente − prix d'achat.",
  };
}

// ---------------------------------------------------------------------------
// Commandes récentes
// ---------------------------------------------------------------------------

const ordersInput = z.object({ days: daysSchema, limit: limitSchema(30, 10), status: z.enum(["pending", "paid", "shipped", "delivered", "cancelled", "refunded", "unknown"]).optional() });

async function recentOrders(ctx: ToolContext, raw: unknown) {
  const input = ordersInput.parse(raw);
  let q = ctx.supabase
    .from("orders")
    .select("order_number, provider, status, placed_at, total, subtotal, shipping_total, fee_total, currency, buyer_username, inventory_applied, order_items(title, quantity, unit_price, sku_id)")
    .eq("organization_id", ctx.organizationId)
    .gte("placed_at", since(ctx, input.days));
  if (input.status) q = q.eq("status", input.status);
  const { data, error } = await q.order("placed_at", { ascending: false }).limit(input.limit);
  if (error) throw new Error(error.message);
  const { count } = await ctx.supabase.from("orders").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organizationId).gte("placed_at", since(ctx, input.days));
  return {
    period: { days: input.days },
    ordersInPeriod: count ?? 0,
    orders: (data ?? []).map((o) => ({ ...o, stockDeducted: o.inventory_applied, inventory_applied: undefined })),
  };
}

// ---------------------------------------------------------------------------
// Compte eBay : connexion, synchronisation, annonces
// ---------------------------------------------------------------------------

async function ebayAccount(ctx: ToolContext) {
  const org = ctx.organizationId;
  const [conn, runs, errors, active, unmapped, ended] = await Promise.all([
    ctx.supabase.from("channel_connections").select("provider, status, external_username, environment, connected_at, last_sync_at, last_successful_sync_at, last_error, auto_sync").eq("organization_id", org).eq("provider", "ebay"),
    ctx.supabase.from("sync_runs").select("status, trigger, started_at, finished_at, records_processed, error_count, error_summary").eq("organization_id", org).eq("provider", "ebay").order("started_at", { ascending: false }).limit(5),
    ctx.supabase.from("sync_errors").select("code, message, created_at").eq("organization_id", org).order("created_at", { ascending: false }).limit(5),
    ctx.supabase.from("channel_listings").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("provider", "ebay").eq("status", "active"),
    ctx.supabase.from("channel_listings").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("provider", "ebay").eq("status", "active").in("mapping_status", ["unmapped", "suggested"]),
    ctx.supabase.from("channel_listings").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("provider", "ebay").neq("status", "active"),
  ]);
  if (conn.error) throw new Error(conn.error.message);
  return {
    connections: conn.data ?? [],
    connected: (conn.data ?? []).some((c) => c.status === "connected"),
    listings: { active: active.count ?? 0, activeNotLinkedToStock: unmapped.count ?? 0, endedOrUnsold: ended.count ?? 0 },
    lastSyncRuns: runs.data ?? [],
    recentSyncErrors: errors.data ?? [],
  };
}

const listingsInput = z.object({
  query: textQuery,
  status: z.enum(["active", "ended", "unsold", "unknown"]).optional(),
  onlyNotLinkedToStock: z.boolean().default(false),
  sort: z.enum(["quantity_sold", "price", "recent"]).default("quantity_sold"),
  limit: limitSchema(30, 10),
});

async function listingsSearch(ctx: ToolContext, raw: unknown) {
  const input = listingsInput.parse(raw);
  let q = ctx.supabase
    .from("channel_listings")
    .select("provider, title, status, price, currency, quantity_available, quantity_sold, mapping_status, external_sku, listing_url, last_synced_at, sku_id")
    .eq("organization_id", ctx.organizationId);
  if (input.status) q = q.eq("status", input.status);
  if (input.onlyNotLinkedToStock) q = q.in("mapping_status", ["unmapped", "suggested"]);
  if (input.query) q = q.ilike("title", `%${input.query}%`);
  const order = input.sort === "price" ? "price" : input.sort === "recent" ? "last_synced_at" : "quantity_sold";
  const { data, error } = await q.order(order, { ascending: false, nullsFirst: false }).limit(input.limit);
  if (error) throw new Error(error.message);
  return { count: (data ?? []).length, listings: (data ?? []).map((l) => ({ ...l, linkedToStock: Boolean(l.sku_id), sku_id: undefined })), note: "quantity_sold = cumul indiqué par eBay pour l'annonce (depuis sa création)." };
}

// ---------------------------------------------------------------------------
// Déclaration des outils
// ---------------------------------------------------------------------------

interface ToolSpec {
  label: string;
  definition: Anthropic.Beta.BetaTool;
  run: (ctx: ToolContext, input: unknown) => Promise<unknown>;
}

const obj = (properties: Record<string, unknown>) => ({ type: "object" as const, additionalProperties: false, properties });

export const ASSISTANT_TOOLS: Record<string, ToolSpec> = {
  sales_ranking: {
    label: "Ventes par produit",
    definition: {
      name: "sales_ranking",
      description:
        "Classement des produits VENDUS (commandes eBay et autres canaux synchronisés) sur une période : unités vendues, chiffre d'affaires par devise, nombre de commandes, dernière vente, stock restant. Utilise-le pour « produit le plus vendu », « meilleures ventes », « combien de X ai-je vendu ». Les commandes annulées/remboursées sont exclues.",
      input_schema: obj({
        days: { type: "integer", description: "Période en jours jusqu'à aujourd'hui (1 à 730). 30 par défaut ; 365 pour « cette année / depuis le début »." },
        by: { type: "string", enum: ["units", "revenue"], description: "Critère de classement : unités vendues (défaut) ou chiffre d'affaires." },
        limit: { type: "integer", description: "Nombre de produits (1 à 25, défaut 10)." },
        channel: { type: "string", enum: ["ebay", "amazon", "shopify", "woocommerce", "manual"], description: "Limiter à un canal de vente." },
        query: { type: "string", description: "Filtrer sur un mot du titre (ex. « iPhone 13 »)." },
      }),
    },
    run: salesRanking,
  },
  sales_summary: {
    label: "Synthèse des ventes",
    definition: {
      name: "sales_summary",
      description: "Chiffre d'affaires, nombre de commandes et d'unités sur une période, comparés à la période précédente de même durée, et meilleur jour. Pour « combien j'ai vendu ce mois », « mes ventes augmentent-elles ».",
      input_schema: obj({ days: { type: "integer", description: "Période en jours (1 à 730, défaut 30)." } }),
    },
    run: salesSummary,
  },
  stock_search: {
    label: "Stock",
    definition: {
      name: "stock_search",
      description:
        "État du stock par SKU : quantités disponibles/réservées, prix d'achat et de vente, marge unitaire, valeur du stock, ventes 7/30/90 jours, dernière vente, annonces actives, meilleur prix fournisseur. Filtres : en stock, stock bas, rupture, dormant (en stock sans vente depuis 60 jours), best_sellers.",
      input_schema: obj({
        query: { type: "string", description: "Recherche dans le nom, la marque, la variante ou le code SKU." },
        filter: { type: "string", enum: ["all", "in_stock", "low", "out_of_stock", "dormant", "best_sellers"] },
        limit: { type: "integer", description: "1 à 40 (défaut 15)." },
      }),
    },
    run: stockSearch,
  },
  recent_orders: {
    label: "Commandes",
    definition: {
      name: "recent_orders",
      description: "Dernières commandes (eBay et autres canaux) avec leurs lignes, montants, frais, statut et indication de déduction du stock.",
      input_schema: obj({
        days: { type: "integer", description: "Période en jours (défaut 30)." },
        limit: { type: "integer", description: "1 à 30 (défaut 10)." },
        status: { type: "string", enum: ["pending", "paid", "shipped", "delivered", "cancelled", "refunded", "unknown"] },
      }),
    },
    run: recentOrders,
  },
  ebay_account: {
    label: "Compte eBay",
    definition: {
      name: "ebay_account",
      description: "État du compte eBay connecté : connexion, dernière synchronisation, erreurs récentes, nombre d'annonces actives, annonces non associées au stock.",
      input_schema: obj({}),
    },
    run: (ctx) => ebayAccount(ctx),
  },
  listings_search: {
    label: "Annonces",
    definition: {
      name: "listings_search",
      description: "Annonces des canaux de vente (eBay…) : titre, statut, prix, quantité disponible, quantité vendue (cumul eBay), association au stock.",
      input_schema: obj({
        query: { type: "string", description: "Mot du titre." },
        status: { type: "string", enum: ["active", "ended", "unsold", "unknown"] },
        onlyNotLinkedToStock: { type: "boolean" },
        sort: { type: "string", enum: ["quantity_sold", "price", "recent"] },
        limit: { type: "integer", description: "1 à 30 (défaut 10)." },
      }),
    },
    run: listingsSearch,
  },
};

export const ASSISTANT_TOOL_DEFINITIONS: Anthropic.Beta.BetaTool[] = Object.values(ASSISTANT_TOOLS).map((t) => t.definition);

const MAX_RESULT_CHARS = 24_000;

/** Exécute un outil ; une erreur devient un résultat `is_error` lisible par le modèle (jamais inventé). */
export async function runAssistantTool(ctx: ToolContext, name: string, input: unknown): Promise<{ content: string; isError: boolean }> {
  const tool = ASSISTANT_TOOLS[name];
  if (!tool) return { content: `Outil inconnu : ${name}`, isError: true };
  try {
    const result = await tool.run(ctx, input ?? {});
    const json = JSON.stringify(result);
    return { content: json.length > MAX_RESULT_CHARS ? `${json.slice(0, MAX_RESULT_CHARS)}…[résultat tronqué]` : json, isError: false };
  } catch (e) {
    if (e instanceof z.ZodError) return { content: `Paramètres invalides : ${e.issues[0]?.message ?? "inconnus"}`, isError: true };
    return { content: `Lecture des données impossible : ${e instanceof Error ? e.message.slice(0, 200) : "erreur"}`, isError: true };
  }
}
