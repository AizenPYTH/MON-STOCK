/**
 * « État des sources » : « Avec prix » / « Avec stock » comptés exactement côté base, même au-delà
 * du plafond PostgREST de 1 000 lignes (le client factice l'applique comme PostgREST max-rows).
 */
import { describe, expect, it } from "vitest";
import type { OrgContext } from "@/features/auth/dal";
import { countOfferStatsBySource, loadSourcingStatus } from "@/features/sourcing/status-queries";

const ORG = "org-1";
type Row = Record<string, unknown>;

function fakeClient(tables: Record<string, Row[]>, options: { failSource?: string } = {}) {
  const calls: Array<{ table: string; head: boolean; filters: string[] }> = [];
  return {
    calls,
    from(table: string) {
      const preds: Array<(r: Row) => boolean> = [];
      const filters: string[] = [];
      let head = false;
      let counting = false;
      let limit = Infinity;
      const b = {
        select(_cols: string, opts?: { count?: string; head?: boolean }) {
          head = opts?.head === true;
          counting = opts?.count === "exact";
          return b;
        },
        eq(col: string, v: unknown) {
          filters.push(`${col}=${String(v)}`);
          preds.push((r) => r[col] === v);
          return b;
        },
        gt(col: string, v: number) {
          filters.push(`${col}>${v}`);
          preds.push((r) => Number(r[col]) > v);
          return b;
        },
        or(expr: string) {
          expect(expr).toBe("available_quantity.not.is.null,stock_status.neq.unknown");
          filters.push(`or(${expr})`);
          preds.push((r) => r.available_quantity !== null || r.stock_status !== "unknown");
          return b;
        },
        limit(n: number) {
          limit = n;
          return b;
        },
        then<T>(resolve: (v: unknown) => T) {
          calls.push({ table, head, filters });
          if (options.failSource && filters.includes(`source_id=${options.failSource}`)) return Promise.resolve({ data: null, count: null, error: { message: "timeout" } }).then(resolve);
          const rows = (tables[table] ?? []).filter((r) => preds.every((p) => p(r)));
          if (head) return Promise.resolve({ data: null, count: counting ? rows.length : null, error: null }).then(resolve);
          return Promise.resolve({ data: rows.slice(0, Math.min(limit, 1000)), count: null, error: null }).then(resolve); // plafond max-rows
        },
      };
      return b;
    },
  };
}

function dataset() {
  const source = (id: string) => ({ id, organization_id: ORG, source_type: "CSV", status: "active", automated_access_confirmed: true, robots_allowed: null, config: {} });
  const offers: Row[] = [];
  // Source A : 1 200 offres actives avec prix, stock inconnu (remplissent à elles seules le plafond de 1 000 lignes).
  for (let i = 0; i < 1200; i++) offers.push({ organization_id: ORG, source_id: "A", status: "active", original_price: 10 + i, available_quantity: null, stock_status: "unknown" });
  // Source B : 5 offres avec prix ET stock connu, lues après les 1 000 premières lignes.
  for (let i = 0; i < 5; i++) offers.push({ organization_id: ORG, source_id: "B", status: "active", original_price: 20, available_quantity: 3, stock_status: "in_stock" });
  // Source C : uniquement des offres inactives / sans prix.
  offers.push({ organization_id: ORG, source_id: "C", status: "inactive", original_price: 20, available_quantity: 3, stock_status: "in_stock" });
  offers.push({ organization_id: ORG, source_id: "C", status: "active", original_price: 0, available_quantity: null, stock_status: "unknown" });
  return { supplier_sources: [source("A"), source("B"), source("C")], supplier_connections: [], sourcing_offers: offers };
}

const value = (items: Array<{ key: string; value: number }>, key: string) => items.find((i) => i.key === key)?.value;

describe("loadSourcingStatus", () => {
  it("> 1 000 offres : chaque source connectée est comptée (aucune troncature silencieuse)", async () => {
    const client = fakeClient(dataset());
    const r = await loadSourcingStatus({ supabase: client, organization: { id: ORG } } as unknown as OrgContext);
    expect(value(r.items, "connected")).toBe(3);
    // Avant correctif : 1 et 0 (les offres de B étaient au-delà des 1 000 lignes renvoyées).
    expect(value(r.items, "with_prices")).toBe(2);
    expect(value(r.items, "with_stock")).toBe(1);
    expect(r.offerCountsIncomplete).toBe(false);
    // Comptages HEAD uniquement sur les offres (aucune ligne d'offre transférée).
    expect(client.calls.filter((c) => c.table === "sourcing_offers").every((c) => c.head)).toBe(true);
  });

  it("comptage en échec pour une source : signalé (incomplet), jamais présenté comme zéro certain", async () => {
    const client = fakeClient(dataset(), { failSource: "B" });
    const r = await loadSourcingStatus({ supabase: client, organization: { id: ORG } } as unknown as OrgContext);
    expect(r.offerCountsIncomplete).toBe(true);
    expect(value(r.items, "with_prices")).toBe(1);
  });
});

describe("countOfferStatsBySource", () => {
  it("compte exactement les offres actives avec prix (> 0) et avec stock (quantité ou statut connu)", async () => {
    const client = fakeClient(dataset());
    const r = await countOfferStatsBySource(client as never, ORG, ["A", "B", "C", "A"]);
    expect(r.failedSourceIds).toEqual([]);
    expect(r.stats.get("A")).toEqual({ withPrice: 1200, withStock: 0 });
    expect(r.stats.get("B")).toEqual({ withPrice: 5, withStock: 5 });
    expect(r.stats.get("C")).toEqual({ withPrice: 0, withStock: 0 });
    expect(client.calls).toHaveLength(6);
    for (const c of client.calls) expect(c.filters.slice(0, 3)).toEqual([`organization_id=${ORG}`, expect.stringMatching(/^source_id=/), "status=active"]);
  });
});
