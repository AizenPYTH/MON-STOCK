import { applyMovement } from "~/data/stock";
import { fakeSupabase } from "./fake-supabase";

const ORG = "11111111-1111-4111-8111-111111111111";
const SKU = "22222222-2222-4222-8222-222222222222";
describe("mouvement de stock (apply_inventory_movement)", () => {
  it("envoie une quantité signée, l'organisation active et le type manuel", async () => {
    const { client, queries } = fakeSupabase({ "rpc:apply_inventory_movement": { data: { quantity_after: 3 } } });
    const r = await applyMovement(client, ORG, { sku_id: SKU, type: "transfer_out", direction: "in", quantity: 2, note: "" });
    expect(r.quantityAfter).toBe(3);
    const args = queries.find((q) => q.target === "rpc:apply_inventory_movement")!.calls[0]!.args[0] as Record<string, unknown>;
    // transfer_out est TOUJOURS une sortie, quel que soit le sens choisi.
    expect(args).toMatchObject({ p_organization_id: ORG, p_sku_id: SKU, p_type: "transfer_out", p_quantity: -2, p_reference_type: "manual", p_channel: "manual" });
    expect(args.p_note).toBeUndefined();
  });

  it("refuse une quantité invalide sans appeler la base", async () => {
    const { client, queries } = fakeSupabase();
    await expect(applyMovement(client, ORG, { sku_id: SKU, type: "adjustment", direction: "out", quantity: 0 })).rejects.toThrow(/au moins 1/);
    expect(queries).toHaveLength(0);
  });

  it("traduit le refus de la base (stock insuffisant) sans message SQL brut", async () => {
    const { client } = fakeSupabase({ "rpc:apply_inventory_movement": { error: { code: "P0001", message: "INSUFFICIENT_STOCK" } } });
    await expect(applyMovement(client, ORG, { sku_id: SKU, type: "adjustment", direction: "out", quantity: 5 })).rejects.toThrow(/Stock insuffisant/);
  });
});
