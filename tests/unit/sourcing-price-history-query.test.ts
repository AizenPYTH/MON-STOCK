/**
 * Historique de prix des offres visibles : les relevés les PLUS RÉCENTS de chaque offre doivent
 * être lus, même quand le volume total dépasse le plafond PostgREST (1 000 lignes par réponse).
 * Le client factice applique ce plafond comme PostgREST (max-rows), quelle que soit la limite demandée.
 */
import { describe, expect, it } from "vitest";
import type { OrgContext } from "@/features/auth/dal";
import { loadRecentPriceHistory, POSTGREST_MAX_ROWS, PRICE_HISTORY_POINTS_PER_OFFER } from "@/services/sourcing/price-history-query";
import { loadPriceInsights } from "@/services/sourcing/search";

const NOW = new Date("2026-10-08T10:00:00.000Z");
const ORG = "org-1";
type Row = { organization_id: string; offer_id: string; original_price: number; original_currency: string; normalized_price: number | null; normalized_currency: string | null; recorded_at: string };

function fakePostgrest(table: Row[]) {
  const requests: Array<{ filters: string[]; order: { column: string; ascending: boolean } | null; limit: number | null; returned: number }> = [];
  const client = {
    from(name: string) {
      expect(name).toBe("supplier_price_history");
      const preds: Array<(r: Row) => boolean> = [];
      const filters: string[] = [];
      let order: { column: string; ascending: boolean } | null = null;
      let limit: number | null = null;
      const builder = {
        select: () => builder,
        eq(col: keyof Row, v: unknown) {
          filters.push(`${String(col)}=eq`);
          preds.push((r) => r[col] === v);
          return builder;
        },
        in(col: keyof Row, vs: unknown[]) {
          filters.push(`${String(col)}=in`);
          preds.push((r) => vs.includes(r[col]));
          return builder;
        },
        gte(col: keyof Row, v: string) {
          preds.push((r) => String(r[col]) >= v);
          return builder;
        },
        order(column: string, opts: { ascending: boolean }) {
          order = { column, ascending: opts.ascending };
          return builder;
        },
        limit(n: number) {
          limit = n;
          return builder;
        },
        then<T>(resolve: (v: { data: Row[]; error: null }) => T) {
          let rows = table.filter((r) => preds.every((p) => p(r)));
          if (order) {
            const o = order;
            rows = [...rows].sort((a, b) => (o.ascending ? 1 : -1) * String(a[o.column as keyof Row]).localeCompare(String(b[o.column as keyof Row])));
          }
          rows = rows.slice(0, Math.min(limit ?? Infinity, POSTGREST_MAX_ROWS)); // plafond max-rows de PostgREST
          requests.push({ filters, order, limit, returned: rows.length });
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
      };
      return builder;
    },
  };
  return { client, requests };
}

const iso = (msAgo: number) => new Date(NOW.getTime() - msAgo).toISOString();
const DAY = 86_400_000;

/** « dense » : 1 500 relevés sur 80 jours, prix 100 puis chute récente à 50 (200 derniers relevés) ;
 *  « sparse » : 10 relevés récents sur 20 jours à 80. */
function history(): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < 1500; i++) {
    const at = iso(80 * DAY - i * Math.floor((80 * DAY - DAY) / 1500));
    rows.push({ organization_id: ORG, offer_id: "dense", original_price: i >= 1300 ? 50 : 100, original_currency: "EUR", normalized_price: null, normalized_currency: null, recorded_at: at });
  }
  for (let i = 0; i < 10; i++) rows.push({ organization_id: ORG, offer_id: "sparse", original_price: 80 + (i % 2), original_currency: "EUR", normalized_price: null, normalized_currency: null, recorded_at: iso(20 * DAY - i * 2 * DAY) });
  // Autre organisation : jamais lue.
  rows.push({ organization_id: "other-org", offer_id: "sparse", original_price: 1, original_currency: "EUR", normalized_price: null, normalized_currency: null, recorded_at: iso(DAY) });
  return rows;
}

describe("loadRecentPriceHistory", () => {
  it("chaque offre reçoit ses N derniers relevés (du plus récent), jamais tronqués par le plafond de 1 000 lignes", async () => {
    const table = history();
    const { client, requests } = fakePostgrest(table);
    const since = iso(90 * DAY);
    const r = await loadRecentPriceHistory(client as never, ORG, ["dense", "sparse", "dense"], since);
    expect(r.failedOfferIds).toEqual([]);
    const dense = r.rows.filter((x) => x.offer_id === "dense");
    const sparse = r.rows.filter((x) => x.offer_id === "sparse");
    expect(dense).toHaveLength(PRICE_HISTORY_POINTS_PER_OFFER);
    expect(sparse).toHaveLength(10);
    expect(sparse.every((x) => x.original_price >= 80)).toBe(true);
    // Le relevé le plus récent de « dense » est présent.
    const latestDense = table.filter((x) => x.offer_id === "dense").map((x) => x.recorded_at).sort().at(-1);
    expect(dense.map((x) => x.recorded_at)).toContain(latestDense);
    expect(r.cappedOfferIds).toEqual(["dense"]);
    // Une requête par offre distincte, triée du plus récent au plus ancien, bornée sous le plafond.
    expect(requests).toHaveLength(2);
    for (const q of requests) {
      expect(q.order).toEqual({ column: "recorded_at", ascending: false });
      expect(q.limit).toBeLessThan(POSTGREST_MAX_ROWS);
      expect(q.filters).toEqual(["organization_id=eq", "offer_id=eq"]);
    }
  });

  it("une offre en erreur est signalée, les autres sont lues", async () => {
    const { client } = fakePostgrest(history());
    const failing = {
      from: (t: string) => {
        const b = client.from(t);
        const eq = b.eq.bind(b);
        let broken = false;
        b.eq = (col: keyof Row, v: unknown) => {
          if (col === "offer_id" && v === "dense") broken = true;
          return eq(col, v);
        };
        const then = b.then.bind(b);
        b.then = ((resolve: (v: unknown) => unknown) => (broken ? Promise.resolve({ data: null, error: { message: "boom" } }).then(resolve) : then(resolve as never))) as typeof b.then;
        return b;
      },
    };
    const r = await loadRecentPriceHistory(failing as never, ORG, ["dense", "sparse"], iso(90 * DAY));
    expect(r.failedOfferIds).toEqual(["dense"]);
    expect(r.rows.filter((x) => x.offer_id === "sparse")).toHaveLength(10);
  });
});

describe("loadPriceInsights (recherche)", () => {
  it("> 1 000 relevés : les relevés récents sont pris en compte pour chaque offre visible", async () => {
    const { client } = fakePostgrest(history());
    const ctx = { supabase: client, organization: { id: ORG } } as unknown as OrgContext;
    const insights = await loadPriceInsights(
      ctx,
      [
        { id: "dense", currentPrice: 50 },
        { id: "sparse", currentPrice: 80 },
      ],
      "EUR",
      NOW,
    );
    const sparse = insights.get("sparse")!;
    // Avant correctif : les 1 000 relevés les plus anciens (tous de « dense ») remplissaient la réponse → 0 point.
    expect(sparse.pointCount).toBe(10);
    expect(sparse.bestObserved?.price).toBe(80);
    const dense = insights.get("dense")!;
    // La chute récente à 50 € est visible (avant correctif : seuls les relevés anciens à 100 €).
    expect(dense.bestObserved?.price).toBe(50);
    expect(dense.pointCount).toBe(PRICE_HISTORY_POINTS_PER_OFFER);
  });
});
