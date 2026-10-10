/**
 * Migration 20261011000100 : grilles tarifaires et colis suivis (« Mes outils »).
 * - isolation entre organisations, rédacteurs seulement pour écrire ;
 * - le statut et l'historique d'un colis ne sont écrits que par le serveur (privilèges par colonne) ;
 * - une commande associée doit appartenir à la même organisation.
 */
import { describe, expect, it } from "vitest";
import type { Client } from "pg";
import { asService, asUser, canConnect, createOrgAs, createUser, expectQueryError, manualChannelId, withRollback } from "./helpers";
import { addMember } from "./security-fixtures";

const available = await canConnect();
const d = available ? describe : describe.skip;

async function orderIn(c: Client, org: string, ext: string): Promise<string> {
  await asService(c);
  const channel = await manualChannelId(c, org);
  const { rows } = await c.query("insert into public.orders (organization_id, sales_channel_id, provider, external_order_id, status, placed_at) values ($1, $2, 'manual', $3, 'paid', now()) returning id", [org, channel, ext]);
  return rows[0].id;
}

const BANDS = '[{"maxWeightKg":1,"price":"7.35"},{"maxWeightKg":5,"price":"12.9"}]';

d("Mes outils : grilles tarifaires et suivi de colis", () => {
  it("grilles : visibles par l'organisation seulement, écriture réservée aux rédacteurs, contraintes de saisie", async () => {
    await withRollback(async (c) => {
      const a = await createUser(c, "rates-a@example.test");
      const b = await createUser(c, "rates-b@example.test");
      const orgA = await createOrgAs(c, a, "A", "rates-a");
      await createOrgAs(c, b, "B", "rates-b");
      const viewer = await addMember(c, orgA, "rates-viewer@example.test", "viewer");

      await asUser(c, a);
      const { rows } = await c.query("insert into public.shipping_rate_cards (organization_id, carrier, service, to_countries, bands) values ($1, 'Colissimo', 'Domicile', '{FR,BE}', $2::jsonb) returning id, created_by", [orgA, BANDS]);
      expect(rows[0].created_by).toBe(a);
      await expectQueryError(c, "insert into public.shipping_rate_cards (organization_id, carrier, bands) values ($1, 'X', '[]'::jsonb)", [orgA], /check constraint/);
      await expectQueryError(c, "insert into public.shipping_rate_cards (organization_id, carrier, to_countries, bands) values ($1, 'X', '{france}', $2::jsonb)", [orgA, BANDS], /check constraint/);
      await expectQueryError(c, "insert into public.shipping_rate_cards (organization_id, carrier, transit_days_min, transit_days_max, bands) values ($1, 'X', 5, 2, $2::jsonb)", [orgA, BANDS], /check constraint/);

      await asUser(c, viewer);
      const { rows: seenByViewer } = await c.query("select id from public.shipping_rate_cards");
      expect(seenByViewer).toHaveLength(1);
      await expectQueryError(c, "insert into public.shipping_rate_cards (organization_id, carrier, bands) values ($1, 'Y', $2::jsonb)", [orgA, BANDS], /row-level security/);

      await asUser(c, b);
      const { rows: seenByB } = await c.query("select id from public.shipping_rate_cards");
      expect(seenByB).toEqual([]);
      const upd = await c.query("update public.shipping_rate_cards set carrier = 'pirate' where id = $1", [rows[0].id]);
      expect(upd.rowCount).toBe(0);
    });
  });

  it("colis : statut, historique et date estimée non modifiables par l'application ; serveur autorisé", async () => {
    await withRollback(async (c) => {
      const a = await createUser(c, "parcel-a@example.test");
      const orgA = await createOrgAs(c, a, "A", "parcel-a");
      await asUser(c, a);
      const { rows } = await c.query("insert into public.tracked_parcels (organization_id, tracking_number, carrier_code, label) values ($1, '6A18987970674', 'colissimo', 'iPhone') returning id, status, created_by", [orgA]);
      const id = rows[0].id;
      expect(rows[0].status).toBe("unknown");
      expect(rows[0].created_by).toBe(a);
      // L'application ne peut pas inventer de statut, ni à la création ni ensuite.
      await expectQueryError(c, "insert into public.tracked_parcels (organization_id, tracking_number, status) values ($1, 'XX123456789FR', 'delivered')", [orgA], /permission denied/);
      await expectQueryError(c, "update public.tracked_parcels set status = 'delivered' where id = $1", [id], /permission denied/);
      await expectQueryError(c, "update public.tracked_parcels set estimated_delivery = '2026-10-12' where id = $1", [id], /permission denied/);
      await expectQueryError(c, "update public.tracked_parcels set events = '[]'::jsonb where id = $1", [id], /permission denied/);
      // Colonnes autorisées : libellé, transporteur, archivage, relance immédiate.
      await c.query("update public.tracked_parcels set label = 'iPhone 13', carrier_code = 'laposte', carrier_source = 'manual', next_check_at = now() where id = $1", [id]);
      // Mais pas de report arbitraire de l'actualisation.
      await expectQueryError(c, "update public.tracked_parcels set next_check_at = now() + interval '30 days' where id = $1", [id], /PARCEL_NEXT_CHECK_FORBIDDEN/);
      // Numéro mal formé refusé ; doublon refusé dans la même organisation.
      await expectQueryError(c, "insert into public.tracked_parcels (organization_id, tracking_number) values ($1, '6a 1898')", [orgA], /check constraint/);
      await expectQueryError(c, "insert into public.tracked_parcels (organization_id, tracking_number) values ($1, '6A18987970674')", [orgA], /duplicate key/);

      await asService(c);
      await c.query("update public.tracked_parcels set status = 'in_transit', events = $2::jsonb, estimated_delivery = '2026-10-14' where id = $1", [id, JSON.stringify([{ at: "2026-10-11T10:00:00+02:00", label: "Pris en charge", location: null, status: "in_transit", code: "PC1" }])]);
      await asUser(c, a);
      const { rows: after } = await c.query("select status, label, carrier_code, jsonb_array_length(events) as n from public.tracked_parcels where id = $1", [id]);
      expect(after[0]).toEqual({ status: "in_transit", label: "iPhone 13", carrier_code: "laposte", n: 1 });
    });
  });

  it("colis : commande associée de la même organisation uniquement, invisibles pour une autre organisation, lecteurs en lecture seule", async () => {
    await withRollback(async (c) => {
      const a = await createUser(c, "plink-a@example.test");
      const b = await createUser(c, "plink-b@example.test");
      const orgA = await createOrgAs(c, a, "A", "plink-a");
      const orgB = await createOrgAs(c, b, "B", "plink-b");
      const orderA = await orderIn(c, orgA, "EXT-A-1");
      const orderB = await orderIn(c, orgB, "EXT-B-1");
      const viewer = await addMember(c, orgA, "plink-viewer@example.test", "viewer");

      await asUser(c, a);
      const { rows } = await c.query("insert into public.tracked_parcels (organization_id, tracking_number, order_id) values ($1, 'XX123456785FR', $2) returning id", [orgA, orderA]);
      await expectQueryError(c, "insert into public.tracked_parcels (organization_id, tracking_number, order_id) values ($1, 'YY123456785FR', $2)", [orgA, orderB], /CROSS_ORGANIZATION_REFERENCE|row-level security|violates foreign key/);
      await expectQueryError(c, "update public.tracked_parcels set order_id = $2 where id = $1", [rows[0].id, orderB], /CROSS_ORGANIZATION_REFERENCE|row-level security|violates foreign key/);

      await asUser(c, viewer);
      const { rows: v } = await c.query("select id from public.tracked_parcels");
      expect(v).toHaveLength(1);
      await expectQueryError(c, "insert into public.tracked_parcels (organization_id, tracking_number) values ($1, 'ZZ123456785FR')", [orgA], /row-level security/);
      const vdel = await c.query("delete from public.tracked_parcels where id = $1", [rows[0].id]);
      expect(vdel.rowCount).toBe(0);

      await asUser(c, b);
      const { rows: seen } = await c.query("select id from public.tracked_parcels");
      expect(seen).toEqual([]);
      await expectQueryError(c, "insert into public.tracked_parcels (organization_id, tracking_number) values ($1, 'AB123456785FR')", [orgA], /row-level security/);
      const del = await c.query("delete from public.tracked_parcels where id = $1", [rows[0].id]);
      expect(del.rowCount).toBe(0);
    });
  });
});
