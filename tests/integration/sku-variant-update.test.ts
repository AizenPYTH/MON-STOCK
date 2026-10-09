/**
 * update_sku_with_variant : SKU et variante modifiés dans une seule transaction, chacun sous verrou
 * optimiste (updated_at) ; attributs fusionnés côté serveur à partir des seules clés soumises.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { asSuperuser, asUser, canConnect, createOrgAs, createSkuAs, createUser, expectQueryError, withRollback } from "./helpers";
import { createCommittedOrg, createCommittedSku, superQuery, userSession, type CommittedOrg } from "./stock-fixtures";

const available = await canConnect();
const d = available ? describe : describe.skip;

const CALL = "select public.update_sku_with_variant($1, $2, $3::jsonb, $4::jsonb, $5, $6) as r";

async function versions(c: Client, sku: string): Promise<{ sku_at: string; variant_at: string; variant_id: string }> {
  const { rows } = await c.query(
    "select s.updated_at::text as sku_at, v.updated_at::text as variant_at, v.id as variant_id from public.skus s join public.product_variants v on v.id = s.variant_id where s.id = $1",
    [sku],
  );
  return rows[0];
}

/**
 * Dans une même transaction de test, now() est figé : une écriture concurrente ne change pas
 * updated_at. On simule donc un formulaire ouvert sur une version ANTÉRIEURE à la version courante.
 */
function older(ts: string): string {
  return new Date(new Date(ts).getTime() - 1000).toISOString();
}

d("update_sku_with_variant (SQL)", () => {
  it("fusionne les attributs soumis sans toucher aux autres clés, et met à jour SKU + variante", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "skuv-merge@example.test");
      const org = await createOrgAs(c, u, "Org", "skuv-merge");
      const sku = await createSkuAs(c, u, org, "SKUV-1", { initial: 0 });
      // Attribut posé par un import (hors formulaire) : doit survivre à l'édition.
      await asSuperuser(c);
      await c.query("update public.product_variants set attributes = attributes || '{\"battery\":\"92%\"}'::jsonb where id = (select variant_id from public.skus where id = $1)", [sku]);
      const v0 = await versions(c, sku);
      await asUser(c, u);
      const r = await c.query(CALL, [org, sku, JSON.stringify({ sale_price: 299 }), JSON.stringify({ ean: "0194252707326", attributes: { storage: "256GB", color: null } }), v0.sku_at, v0.variant_at]);
      expect(r.rows[0].r).toMatchObject({ sku_id: sku, code: "SKUV-1" });
      const { rows } = await c.query("select s.sale_price::float as sale_price, v.ean, v.attributes from public.skus s join public.product_variants v on v.id = s.variant_id where s.id = $1", [sku]);
      expect(rows[0]).toEqual({ sale_price: 299, ean: "0194252707326", attributes: { storage: "256GB", grade: "A", battery: "92%" } });
    });
  });

  it("variante modifiée entre-temps → SKU_STALE et RIEN n'est écrit (ni le SKU ni la variante)", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "skuv-stale@example.test");
      const org = await createOrgAs(c, u, "Org", "skuv-stale");
      const sku = await createSkuAs(c, u, org, "SKUV-2", { initial: 0, sale: 100 });
      await asSuperuser(c);
      const v0 = await versions(c, sku);
      // Une autre édition modifie la variante (EAN) après l'ouverture du formulaire.
      await c.query("update public.product_variants set ean = '1111111111116' where id = $1", [v0.variant_id]);
      await asUser(c, u);
      // SKU à jour, variante lue dans une version antérieure.
      await expectQueryError(c, CALL, [org, sku, JSON.stringify({ sale_price: 1 }), JSON.stringify({ ean: "2222222222222" }), v0.sku_at, older(v0.variant_at)], "SKU_STALE");
      const { rows } = await c.query("select s.sale_price::float as sale_price, v.ean from public.skus s join public.product_variants v on v.id = s.variant_id where s.id = $1", [sku]);
      expect(rows[0]).toEqual({ sale_price: 100, ean: "1111111111116" });
    });
  });

  it("SKU modifié entre-temps → SKU_STALE ; SKU d'une autre organisation → introuvable ; lecteur → refusé", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "skuv-guard@example.test");
      const org = await createOrgAs(c, u, "Org", "skuv-guard");
      const sku = await createSkuAs(c, u, org, "SKUV-3", { initial: 0 });
      const other = await createUser(c, "skuv-other@example.test");
      const otherOrg = await createOrgAs(c, other, "Autre", "skuv-other");
      await asSuperuser(c);
      const v0 = await versions(c, sku);
      await asUser(c, u);
      await expectQueryError(c, CALL, [org, sku, "{}", "{}", older(v0.sku_at), null], "SKU_STALE");
      // Sans version attendue (ancien formulaire) : la mise à jour passe.
      await c.query(CALL, [org, sku, JSON.stringify({ location: "C-2" }), "{}", null, null]);
      // Organisation d'un autre : refus explicite ; SKU d'un autre via sa propre organisation : introuvable.
      await asUser(c, other);
      await expectQueryError(c, CALL, [org, sku, "{}", "{}", null, null], "FORBIDDEN");
      await expectQueryError(c, CALL, [otherOrg, sku, "{}", "{}", null, null], "SKU_NOT_FOUND");
      await asSuperuser(c);
      await c.query("insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'viewer')", [org, other]);
      await asUser(c, other);
      await expectQueryError(c, CALL, [org, sku, "{}", "{}", null, null], "FORBIDDEN");
      await expectQueryError(c, CALL, [org, sku, "[]", "{}", null, null], "FORBIDDEN");
      await asUser(c, u);
      await expectQueryError(c, CALL, [org, sku, "[]", "{}", null, null], "SKU_UPDATE_INVALID");
    });
  });
});

d("update_sku_with_variant : deux éditions simultanées de la variante (deux connexions)", () => {
  let org: CommittedOrg;
  beforeAll(async () => {
    org = await createCommittedOrg("skuv-conc");
  });
  afterAll(async () => {
    await org?.cleanup();
  });

  it("la seconde édition, partie de la même version, est refusée au lieu d'écraser la première", async () => {
    const sku = await createCommittedSku(org, "SKUV-CONC", { initial: 0 });
    const [v0] = await superQuery<{ sku_at: string; variant_at: string }>(
      "select s.updated_at::text as sku_at, v.updated_at::text as variant_at from public.skus s join public.product_variants v on v.id = s.variant_id where s.id = $1",
      [sku],
    );
    const a = await userSession(org.userId);
    const b = await userSession(org.userId);
    try {
      await a.query(CALL, [org.orgId, sku, "{}", JSON.stringify({ attributes: { color: "Bleu" } }), v0!.sku_at, v0!.variant_at]);
      const pending = b.query(CALL, [org.orgId, sku, "{}", JSON.stringify({ ean: "0194252707326" }), v0!.sku_at, v0!.variant_at]).then(
        () => null,
        (e: Error) => e.message,
      );
      await a.query("commit");
      expect(await pending).toMatch(/SKU_STALE/);
      await b.query("rollback");
    } finally {
      await a.end().catch(() => undefined);
      await b.end().catch(() => undefined);
    }
    const [row] = await superQuery<{ ean: string | null; color: string | null }>(
      "select v.ean, v.attributes ->> 'color' as color from public.skus s join public.product_variants v on v.id = s.variant_id where s.id = $1",
      [sku],
    );
    expect(row).toEqual({ ean: null, color: "Bleu" });
  });
});
