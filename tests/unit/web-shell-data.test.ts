/** W-14 : coquille — compteur en échec = inconnu (« — »), alertes triées par gravité EN BASE. */
import { describe, expect, it } from "vitest";
import { fakeSupabase } from "./helpers/fake-supabase";
import { getShellData, SHELL_ALERTS_SHOWN } from "@/features/shell/queries";

const ctx = (client: unknown) => ({ supabase: client, organization: { id: "org" } }) as never;

describe("getShellData", () => {
  it("une lecture en échec donne null (jamais 0), les autres restent exactes", async () => {
    const { client } = fakeSupabase({
      inventory: { error: { message: "timeout" }, count: null },
      alerts: { data: [], count: 3 },
      channel_listings: { count: 0 },
      product_matches: { count: 2 },
    });
    const d = await getShellData(ctx(client));
    expect(d.counts).toEqual({ outOfStock: null, openAlerts: 3, unmappedListings: 0, pendingMatches: 2 });
  });

  it("menu Alertes : tri par gravité puis récence en SQL, 4 lignes lues", async () => {
    const { client, queries } = fakeSupabase({ alerts: { data: [{ id: "a", title: "t", message: "m", severity: "critical", action_href: null }], count: 1 } });
    const d = await getShellData(ctx(client));
    const list = queries.filter((q) => q.target === "alerts").find((q) => q.calls.some((c) => c.method === "limit"))!;
    const orders = list.calls.filter((c) => c.method === "order").map((c) => c.args);
    expect(orders).toEqual([
      ["severity", { ascending: false }],
      ["created_at", { ascending: false }],
    ]);
    expect(list.calls.find((c) => c.method === "limit")?.args).toEqual([SHELL_ALERTS_SHOWN]);
    expect(d.alerts).toEqual([{ id: "a", title: "t", message: "m", severity: "critical", href: null }]);
  });
});
