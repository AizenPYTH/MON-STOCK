import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSkuUpdatePayload } from "@/features/stock/sku-update";

const rpc = vi.hoisted(() => ({ calls: [] as Array<{ fn: string; args: Record<string, unknown> }>, result: { data: null as unknown, error: null as null | { message: string; code?: string } } }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/features/auth/dal", () => ({
  requireOrgContextForAction: vi.fn(async () => ({
    organization: { id: "org-1", default_currency: "EUR" },
    user: { id: "user-1" },
    supabase: {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        rpc.calls.push({ fn, args });
        return rpc.result;
      },
      from: () => {
        throw new Error("aucune lecture-modification-écriture directe attendue");
      },
    },
  })),
}));

const { updateSkuAction } = await import("@/features/stock/actions");

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

const SKU_ID = "6f1c1c4e-2b7a-4c55-9e0a-8f6b1d2c3e4f";

describe("buildSkuUpdatePayload : seuls les champs soumis", () => {
  it("attributs : valeur → définie, vide → retirée (null), absent → non transmis", () => {
    const p = buildSkuUpdatePayload({ storage: "256 Go", color: "", ean: "", variant_name: "", condition: "refurbished" });
    expect(p.variant).toEqual({ condition: "refurbished", ean: null, attributes: { storage: "256 Go", color: null } });
    expect(p.variant).not.toHaveProperty("name");
    expect(p.variant).not.toHaveProperty("mpn");
    expect(p.variant.attributes).not.toHaveProperty("grade");
  });

  it("grade : colonne et attribut suivent le champ", () => {
    expect(buildSkuUpdatePayload({ grade: "A" }).variant).toMatchObject({ grade: "A", attributes: { grade: "A" } });
    expect(buildSkuUpdatePayload({ grade: "" }).variant).toMatchObject({ grade: null, attributes: { grade: null } });
  });

  it("SKU : champs vides → null, seuils vides → 0, statut seulement s'il est soumis", () => {
    const p = buildSkuUpdatePayload({ cost_price: "", sale_price: 199.9, reorder_point: "", lead_time_days: 5 });
    expect(p.sku).toEqual({ barcode: null, cost_price: null, sale_price: 199.9, location: null, reorder_point: 0, safety_stock: 0, lead_time_days: 5, default_supplier_id: null });
    expect(buildSkuUpdatePayload({ is_active: "false" }).sku.is_active).toBe(false);
  });
});

describe("updateSkuAction : SKU + variante en une transaction, sous verrou optimiste", () => {
  beforeEach(() => {
    rpc.calls.length = 0;
    rpc.result = { data: { code: "IPH13", sku_id: SKU_ID }, error: null };
  });

  it("transmet les deux versions lues à l'ouverture du formulaire", async () => {
    const r = await updateSkuAction(null, fd({ sku_id: SKU_ID, expected_updated_at: "2026-10-08T10:00:00.123456+00:00", expected_variant_updated_at: "2026-10-08T09:00:00.654321+00:00", storage: "128 Go", color: "" }));
    expect(r).toEqual({ ok: true, data: undefined });
    expect(rpc.calls).toHaveLength(1);
    expect(rpc.calls[0]!.fn).toBe("update_sku_with_variant");
    expect(rpc.calls[0]!.args).toMatchObject({
      p_organization_id: "org-1",
      p_sku_id: SKU_ID,
      p_expected_sku_updated_at: "2026-10-08T10:00:00.123456+00:00",
      p_expected_variant_updated_at: "2026-10-08T09:00:00.654321+00:00",
      p_variant: { attributes: { storage: "128 Go", color: null } },
    });
  });

  it("modification concurrente → conflit explicite, rien n'est enregistré", async () => {
    rpc.result = { data: null, error: { message: "SKU_STALE", code: "40001" } };
    const r = await updateSkuAction(null, fd({ sku_id: SKU_ID, expected_updated_at: "x", expected_variant_updated_at: "y" }));
    expect(r).toMatchObject({ ok: false, code: "CONFLICT", error: expect.stringContaining("modifié entre-temps") });
  });
});
