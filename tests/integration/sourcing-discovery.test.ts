/**
 * Découverte de sources contre le vrai schéma (migrations du dépôt, garde « même organisation »,
 * RLS) : les insertions de createSupabaseDiscoveryStore (client ADMIN = service_role) passent, la
 * source reste non attestée, puis la validation / l'ignorance par un membre (rôle authenticated)
 * respectent la RLS. Le client Supabase est simulé : chaque insert est exécuté en SQL réel.
 */
import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { createSupabaseDiscoveryStore } from "@/services/sourcing/discovery/discovery-service";
import type { ProbedCandidate } from "@/services/sourcing/discovery/candidate-analyzer";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import { activatedConfig, activationCheck, dismissedConfig, isPendingDiscovered, readDiscoveredConfig } from "@/features/suppliers/discovered";
import { asService, asUser, canConnect, createOrgAs, createUser, expectQueryError, withRollback } from "./helpers";

const available = await canConnect();
const d = available ? describe : describe.skip;

/** Client minimal : from(t).insert(row).select(cols).single() et from(t).delete().eq().eq() exécutés en SQL. */
function sqlBackedAdmin(c: Client): AdminSupabaseClient {
  return {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          return {
            select() {
              return {
                async single() {
                  const cols = Object.keys(row);
                  const values = cols.map((k) => (row[k] !== null && typeof row[k] === "object" ? JSON.stringify(row[k]) : row[k]));
                  try {
                    const { rows } = await c.query(`insert into public.${table} (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`, values);
                    return { data: rows[0], error: null };
                  } catch (e) {
                    return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
                  }
                },
              };
            },
          };
        },
        delete() {
          const filters: Array<[string, unknown]> = [];
          const builder = {
            eq(col: string, v: unknown) {
              filters.push([col, v]);
              return builder;
            },
            then(resolve: (v: unknown) => void) {
              c.query(`delete from public.${table} where ${filters.map(([k], i) => `${k} = $${i + 1}`).join(" and ")}`, filters.map(([, v]) => v)).then(() => resolve({ error: null }));
            },
          };
          return builder;
        },
      };
    },
  } as unknown as AdminSupabaseClient;
}

function candidate(overrides: Partial<ProbedCandidate> = {}): ProbedCandidate {
  return {
    domain: "grossiste-exemple.fr",
    host: "www.grossiste-exemple.fr",
    origin: "https://www.grossiste-exemple.fr",
    name: "Grossiste Exemple",
    sampleUrl: "https://www.grossiste-exemple.fr/iphone-13",
    title: "Grossiste Exemple — iPhone 13 reconditionné",
    description: null,
    query: "iPhone 13 grossiste reconditionné",
    supplierType: "wholesaler",
    typeConfidence: 0.8,
    signals: ["grossiste"],
    robots: "allowed",
    robotsDetail: "Autorisé",
    crawlDelaySeconds: null,
    probed: true,
    httpStatus: 200,
    platform: "shopify",
    access: "public",
    priceVisibility: "public",
    suggestedAdapter: "shopify-storefront",
    probeSignals: ["cdn.shopify.com"],
    probeError: null,
    ...overrides,
  };
}

d("Découverte de sources (schéma réel, garde même organisation, RLS)", () => {
  it("le store ADMIN crée fournisseur + source non attestée ; un membre valide ou ignore, un lecteur ne peut pas", async () => {
    await withRollback(async (c) => {
      const owner = await createUser(c, "discovery-owner@example.test");
      const org = await createOrgAs(c, owner, "Org découverte", "org-discovery");
      const viewer = await createUser(c, "discovery-viewer@example.test");
      await asService(c);
      await c.query("insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'viewer')", [org, viewer]);

      const store = createSupabaseDiscoveryStore(sqlBackedAdmin(c));
      const pub = await store.createDiscoveredSource(org, { candidate: candidate(), provider: "brave", discoveredAt: new Date().toISOString() });
      const acct = await store.createDiscoveredSource(org, { candidate: candidate({ domain: "pro-only.fr", host: "pro-only.fr", origin: "https://pro-only.fr", access: "account", priceVisibility: "after_login", suggestedAdapter: null, platform: "unknown" }), provider: "brave", discoveredAt: new Date().toISOString() });

      const { rows } = await c.query("select id, status, automated_access_confirmed, config, robots_allowed from public.supplier_sources where organization_id = $1 order by created_at", [org]);
      expect(rows).toHaveLength(2);
      for (const r of rows) {
        expect(r.status).toBe("not_connected");
        expect(r.automated_access_confirmed).toBe(false);
        expect(r.config.adapter).toBeUndefined();
        expect(isPendingDiscovered(r)).toBe(true);
      }
      const pubRow = rows.find((r) => r.id === pub.sourceId)!;
      const acctRow = rows.find((r) => r.id === acct.sourceId)!;
      const adapters = [{ key: "shopify-storefront", access: "public" as const }];
      const check = activationCheck(readDiscoveredConfig(pubRow.config), adapters, pubRow.robots_allowed);
      expect(check).toEqual({ ok: true, adapterKey: "shopify-storefront" });
      const acctCheck = activationCheck(readDiscoveredConfig(acctRow.config), adapters, acctRow.robots_allowed);
      expect(acctCheck.ok).toBe(false);

      // un lecteur ne peut pas valider (RLS : aucune ligne modifiée)
      await asUser(c, viewer);
      const denied = await c.query("update public.supplier_sources set automated_access_confirmed = true where id = $1", [pub.sourceId]);
      expect(denied.rowCount).toBe(0);

      // le propriétaire valide (même mise à jour que validateDiscoveredSourceAction)
      await asUser(c, owner);
      const cfg = activatedConfig(pubRow.config, "shopify-storefront", { userId: owner, at: new Date() });
      const ok = await c.query("update public.supplier_sources set config = $2, automated_access_confirmed = true, status = 'active' where id = $1", [pub.sourceId, JSON.stringify(cfg)]);
      expect(ok.rowCount).toBe(1);
      // et ignore la source à compte
      const dis = await c.query("update public.supplier_sources set status = 'paused', config = $2 where id = $1", [acct.sourceId, JSON.stringify(dismissedConfig(acctRow.config, { userId: owner, at: new Date() }))]);
      expect(dis.rowCount).toBe(1);

      await asService(c);
      const after = await c.query("select id, status, automated_access_confirmed, config from public.supplier_sources where organization_id = $1", [org]);
      const validated = after.rows.find((r) => r.id === pub.sourceId)!;
      expect(validated).toMatchObject({ status: "active", automated_access_confirmed: true });
      expect(validated.config.adapter).toBe("shopify-storefront");
      expect(validated.config.validation).toBe("validated");
      expect(isPendingDiscovered(after.rows.find((r) => r.id === acct.sourceId)!)).toBe(false);
    });
  });

  it("une source découverte ne peut pas référencer le fournisseur d'une autre organisation", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "discovery-guard@example.test");
      const orgA = await createOrgAs(c, u, "Org A", "org-discovery-a");
      const orgB = await createOrgAs(c, u, "Org B", "org-discovery-b");
      await asService(c);
      const { rows } = await c.query("insert into public.suppliers (organization_id, name) values ($1, 'Fournisseur B') returning id", [orgB]);
      await expectQueryError(c, "insert into public.supplier_sources (organization_id, supplier_id, name, source_type, status, config) values ($1, $2, 'x', 'PUBLIC_WEB', 'not_connected', '{\"discovered\": true}')", [orgA, rows[0].id], /organisation|organization/i);
    });
  });
});
