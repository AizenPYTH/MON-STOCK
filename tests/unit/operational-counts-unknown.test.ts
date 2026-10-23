import { describe, expect, it } from "vitest";
import { buildInsights, buildTodoItems, isEmptyWorkspace } from "@/features/analytics/priorities.pure";
import { addCounts } from "@/features/analytics/util.pure";
import { buildTasks, resolveHasSupplier, setupSteps, type TaskInput } from "@/features/dashboard/today.pure";
import { countRow } from "@/services/ai/advisor-cards";
import { fakeSupabase } from "./helpers/fake-supabase";

/**
 * W-14 : un compteur opérationnel dont la requête échoue vaut null (« inconnu »). Il ne doit jamais
 * produire une ligne « 0 », ni rendre l'organisation « vide », ni être additionné comme 0.
 */

const ORG = "11111111-1111-4111-8111-111111111111";

describe("getOperationalCounts : une requête en échec donne null, pas 0", () => {
  it("chaque compteur est indépendant ; seul celui en échec devient inconnu", async () => {
    const { getOperationalCounts } = await import("@/features/analytics/dashboard");
    const { client } = fakeSupabase({
      sync_runs: { error: { message: "timeout" }, count: null },
      order_items: { error: { message: "boom" }, count: null },
      alerts: { count: 3 },
      channel_listings: { count: 0 },
      orders: { count: 12 },
      suppliers: { count: 2 },
    });
    const counts = await getOperationalCounts({ supabase: client, organization: { id: ORG } } as never);
    expect(counts).toEqual({ syncFailed24h: null, openAlerts: 3, unmappedListings: 0, pendingSales: null, ordersTotal: 12, suppliersCount: 2 });
  });
});

describe("addCounts", () => {
  it("additionne des compteurs connus", () => {
    expect(addCounts(2, 3)).toBe(5);
    expect(addCounts(0, 0)).toBe(0);
  });
  it("devient inconnu dès qu'un terme l'est (jamais complété par 0)", () => {
    expect(addCounts(4, null)).toBeNull();
    expect(addCounts(null, 0)).toBeNull();
  });
});

describe("isEmptyWorkspace", () => {
  it("vide seulement si produits ET commandes sont connus et nuls", () => {
    expect(isEmptyWorkspace(0, 0)).toBe(true);
    expect(isEmptyWorkspace(0, 5)).toBe(false);
    expect(isEmptyWorkspace(3, 0)).toBe(false);
  });
  it("ne conclut pas « vide » quand le nombre de commandes est inconnu", () => {
    expect(isEmptyWorkspace(0, null)).toBe(false);
  });
});

describe("buildTodoItems avec des compteurs inconnus", () => {
  const known = { toReplenish: 0, syncErrors: 0, lowStock: 0, unmappedListings: 0, pendingSales: 0, negativeStock: 0 };

  it("un compteur inconnu produit une ligne « indisponible », sans chiffre ni « 0 »", () => {
    const items = buildTodoItems({ ...known, pendingSales: null });
    expect(items).toEqual([{ key: "pendingSales", count: null, label: "Ventes non déduites : compteur indisponible pour le moment", href: "/sales?inventory=pending", tone: "info" }]);
    expect(items[0]?.label).not.toMatch(/\b0\b/);
  });

  it("les lignes d'information viennent après les actions ; tous les compteurs inconnus sont signalés", () => {
    const items = buildTodoItems({ toReplenish: 2, syncErrors: null, lowStock: 1, unmappedListings: null, pendingSales: null, negativeStock: 0 });
    expect(items.map((i) => [i.key, i.count])).toEqual([
      ["toReplenish", 2],
      ["lowStock", 1],
      ["syncErrors", null],
      ["unmappedListings", null],
      ["pendingSales", null],
    ]);
    expect(items.filter((i) => i.count === null).every((i) => i.tone === "info" && i.label.endsWith("compteur indisponible pour le moment"))).toBe(true);
    expect(items.some((i) => i.count === 0)).toBe(false);
  });

  it("une somme dont un terme est inconnu ne cache pas l'inconnu derrière le terme connu", () => {
    const items = buildTodoItems({ ...known, syncErrors: addCounts(3, null) });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ key: "syncErrors", count: null, label: "Erreurs de synchronisation et alertes : compteur indisponible pour le moment" });
  });
});

describe("buildInsights avec des compteurs inconnus", () => {
  const base = { outOfStock: [], atRisk: [], lowCount: 0, syncFailed24h: 0, openAlerts: 0, unmappedListings: 0, pendingSales: 0, negativeStock: 0, unknownCostWithSales: 0, deadStock: 0, channelsMissingFees: [] };

  it("la liste n'est pas « rien d'urgent » quand un compteur est inconnu", () => {
    const items = buildInsights({ ...base, syncFailed24h: null });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ key: "sync:unknown", severity: "info", title: "Synchronisations échouées (24 h) : compteur indisponible pour le moment", href: "/settings/sync" });
  });

  it("chaque compteur inconnu a sa ligne d'information, aucune ne porte un chiffre", () => {
    const items = buildInsights({ ...base, syncFailed24h: null, openAlerts: null, unmappedListings: null, pendingSales: null, lowCount: 2 });
    expect(items.map((i) => i.key)).toEqual(["low", "sync:unknown", "alerts:unknown", "pending:unknown", "unmapped:unknown"]);
    for (const it of items.filter((i) => i.key.endsWith(":unknown"))) {
      expect(it.severity).toBe("info");
      expect(it.title).toMatch(/ : compteur indisponible pour le moment$/);
      expect(it.title).not.toMatch(/^\d|\b0\b/);
    }
  });

  it("un compteur connu à 0 ne produit toujours aucune ligne", () => {
    expect(buildInsights({ ...base, openAlerts: null }).map((i) => i.key)).toEqual(["alerts:unknown"]);
  });
});

describe("buildTasks (« À traiter », web) avec des compteurs inconnus", () => {
  const base: TaskInput = { now: new Date("2026-10-21T08:00:00Z"), outOfStock: 0, atRisk: 0, low: 0, negativeStock: 0, toShip: 0, pendingSales: 0, unmappedListings: 0, syncFailed24h: 0, openAlerts: 0, toReplenish: null, unknownCostWithSales: 0, jobs: [], accounts: [], channels: [] };

  it("« Tout est à jour » n'est jamais déduit d'un compteur inconnu", () => {
    const tasks = buildTasks({ ...base, pendingSales: null });
    expect(tasks).toEqual([{ key: "pending-unknown", icon: "boxes", tone: "info", title: "Ventes non déduites : compteur indisponible", detail: "vérification impossible pour le moment", cta: "Voir", href: "/sales?inventory=pending", rank: 6 }]);
  });

  it("une ligne par compteur inconnu, après les tâches actionnables, sans « 0 »", () => {
    const tasks = buildTasks({ ...base, outOfStock: 1, toShip: null, pendingSales: null, unmappedListings: null, syncFailed24h: null, openAlerts: null });
    expect(tasks.map((t) => t.key)).toEqual(["out", "sync-unknown", "ship-unknown", "alerts-unknown", "pending-unknown", "unmapped-unknown"]);
    for (const t of tasks.slice(1)) {
      expect(t.tone).toBe("info");
      expect(t.title).toMatch(/compteur indisponible$/);
      expect(t.title).not.toMatch(/\d/);
    }
  });
});

describe("resolveHasSupplier (« Bien démarrer »)", () => {
  const hub = (account: number, pub: number, statuses: string[] = []) => ({ totals: { account, public: pub }, accounts: statuses.map((status) => ({ status })) });

  it("vrai dès qu'une source le prouve, même si l'autre est inconnue", () => {
    expect(resolveHasSupplier(null, 2)).toBe(true);
    expect(resolveHasSupplier(hub(1, 0), null)).toBe(true);
    expect(resolveHasSupplier(hub(0, 0, ["connected"]), null)).toBe(true);
  });

  it("faux seulement si tout est connu et vide", () => {
    expect(resolveHasSupplier(hub(0, 0, ["error"]), 0)).toBe(false);
  });

  it("inconnu (null, étape masquée) si le compteur est inconnu et qu'aucune autre source ne tranche", () => {
    expect(resolveHasSupplier(hub(0, 0), null)).toBeNull();
    expect(resolveHasSupplier(null, null)).toBeNull();
    expect(resolveHasSupplier(null, 0)).toBeNull();
    expect(setupSteps({ hasProducts: false, hasChannel: false, hasSupplier: resolveHasSupplier(hub(0, 0), null), hasCosts: null }).map((s) => s.key)).toEqual(["product", "channel"]);
  });
});

describe("countRow (cartes du conseiller)", () => {
  it("inconnu → « — » et mention explicite, jamais « 0 » ni « null »", () => {
    expect(countRow("Ventes non déduites du stock", null, "warning")).toEqual({ label: "Ventes non déduites du stock", value: "—", detail: "compteur indisponible pour le moment", tone: "neutral" });
  });
  it("connu → valeur et ton selon le signe", () => {
    expect(countRow("Synchronisations en échec (24 h)", 2, "danger")).toMatchObject({ value: "2", tone: "danger" });
    expect(countRow("Commandes à expédier", 0, "warning", "success")).toMatchObject({ value: "0", tone: "success" });
  });
});
