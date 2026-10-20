import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SourceOverviewDTO } from "@/features/mobile-api/contract";
import { ageText, FEED_FREQUENCIES, groupLibrary, groupSources, remoteFeedIssues, sampleOf, sourcesStats } from "@/features/sources/labels";
import { remoteFeedCreateSchema } from "@/services/sourcing/remote-feeds";

function source(over: Partial<SourceOverviewDTO> & { id: string }): SourceOverviewDTO {
  return {
    name: `Source ${over.id}`,
    supplierId: "00000000-0000-4000-8000-000000000001",
    supplierName: null,
    country: null,
    kind: "file_import",
    methodLabel: "Import de fichier",
    status: "manual_import",
    statusLabel: "Import manuel",
    activeOffers: 0,
    lastSyncAt: null,
    lastSuccessfulSyncAt: null,
    nextRunAt: null,
    lastError: null,
    consecutiveFailures: 0,
    frequency: "manual",
    frequencyLabel: "Manuelle",
    schedulable: false,
    canSyncNow: false,
    primaryAction: "import_file",
    ...over,
  };
}

describe("sources web : âge et regroupement", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  it("âge lisible, jamais inventé", () => {
    expect(ageText(null, now)).toBe("jamais");
    expect(ageText("2026-10-20T11:30:00Z", now)).toBe("il y a 30 min");
    expect(ageText("2026-10-20T07:00:00Z", now)).toBe("il y a 5 h");
    expect(ageText("2026-10-15T12:00:00Z", now)).toBe("il y a 5 j");
    expect(ageText("pas une date", now)).toBe("—");
  });

  it("groupes : automatique / recherche en direct / fichiers, sources en échec d'abord", () => {
    const list = [
      source({ id: "f1" }),
      source({ id: "w1", kind: "public_web", schedulable: true, status: "connected", activeOffers: 5, lastSuccessfulSyncAt: "2026-10-19T00:00:00Z" }),
      source({ id: "w2", kind: "remote_feed", schedulable: true, status: "error", consecutiveFailures: 3, activeOffers: 2, lastSuccessfulSyncAt: "2026-10-18T00:00:00Z" }),
      source({ id: "l1", kind: "live_search", status: "to_configure" }),
      source({ id: "f2", consecutiveFailures: 1 }),
    ];
    const g = groupSources(list);
    expect(g.automatic.map((s) => s.id)).toEqual(["w2", "w1"]);
    expect(g.live.map((s) => s.id)).toEqual(["l1"]);
    expect(g.manual.map((s) => s.id)).toEqual(["f2", "f1"]);
    expect(sourcesStats(list)).toEqual({ total: 5, active: 1, toFix: 2, offers: 7, lastSuccess: "2026-10-19T00:00:00Z" });
    expect(sourcesStats([])).toEqual({ total: 0, active: 0, toFix: 0, offers: 0, lastSuccess: null });
  });
});

describe("sources web : flux distant", () => {
  it("contrôles locaux : HTTPS, pas d'identifiant dans l'URL, authentification complète", () => {
    expect(remoteFeedIssues({ url: "https://f.example/stock.csv", auth: { kind: "none" } })).toEqual([]);
    expect(remoteFeedIssues({ url: "http://f.example/stock.csv", auth: { kind: "none" } })).toEqual(["Le lien doit commencer par https:// (connexion chiffrée)."]);
    expect(remoteFeedIssues({ url: "https://u:p@f.example/x", auth: { kind: "none" } })[0]).toMatch(/identifiant/);
    expect(remoteFeedIssues({ url: "pas un lien", auth: { kind: "none" } })[0]).toMatch(/lien complet/);
    expect(remoteFeedIssues({ url: "https://f.example", auth: { kind: "header", name: "X Key", value: "v" } })[0]).toMatch(/En-tête/);
    expect(remoteFeedIssues({ url: "https://f.example", auth: { kind: "basic", username: "u", password: "" } })[0]).toMatch(/mot de passe/);
  });

  it("l'attestation est obligatoire côté serveur, et les fréquences proposées sont acceptées", () => {
    const base = { url: "https://f.example/stock.csv", format: "csv", mapping: { supplier_sku: "ref", title: "t", price: "p" }, defaults: { currency: "EUR", taxType: "ht" }, supplierName: "Grossiste" };
    expect(remoteFeedCreateSchema.safeParse(base).success).toBe(false);
    expect(remoteFeedCreateSchema.safeParse({ ...base, attest: false }).success).toBe(false);
    for (const f of FEED_FREQUENCIES) expect(remoteFeedCreateSchema.safeParse({ ...base, attest: true, frequency: f.value }).success).toBe(true);
  });
});

describe("sources web : bibliothèque", () => {
  it("exemples de la vérification : au plus 3, prix inconnu conservé null", () => {
    const check = { status: "ok" as const, checkedAt: "2026-10-19T00:00:00Z", productCount: 4, message: null, sample: [{ title: "A", price: 10, currency: "EUR" }, { title: "B", price: null, currency: null }, { nope: 1 }, { title: "C", price: "12", currency: "EUR" }, { title: "D", price: 1, currency: "EUR" }] };
    expect(sampleOf({ check })).toEqual([
      { title: "A", price: 10, currency: "EUR" },
      { title: "B", price: null, currency: null },
      { title: "C", price: null, currency: "EUR" },
    ]);
    expect(sampleOf({ check: null })).toEqual([]);
  });

  it("activées / activables / non activables", () => {
    const g = groupLibrary([
      { key: "a", sourceId: "s1", activatable: true },
      { key: "b", sourceId: null, activatable: true },
      { key: "c", sourceId: null, activatable: false },
    ]);
    expect([g.active, g.ready, g.blocked].map((x) => x.map((e) => e.key))).toEqual([["a"], ["b"], ["c"]]);
  });
});

// ---------------------------------------------------------------------------
// Droits des actions : identiques à l'Edge (sync = rédacteur, planification = administrateur)
// ---------------------------------------------------------------------------
const calls: Array<{ write?: boolean; admin?: boolean }> = [];
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/auth/dal", () => ({
  requireOrgContextForAction: vi.fn(async (opts: { write?: boolean; admin?: boolean } = {}) => {
    calls.push(opts);
    return { organization: { id: "org-1" }, user: { id: "u1" } };
  }),
}));
vi.mock("@/services/sourcing/source-sync", async (orig) => {
  const real = await orig<typeof import("@/services/sourcing/source-sync")>();
  return {
    sourceScheduleSchema: real.sourceScheduleSchema,
    syncSourceNow: vi.fn(async () => ({ status: "success", message: "12 offres.", nextRunAt: null, consecutiveFailures: 0 })),
    setSourceSchedule: vi.fn(async () => ({ frequencyLabel: "1 fois / jour" })),
  };
});
vi.mock("@/services/sourcing/remote-feeds", async (orig) => {
  const real = await orig<typeof import("@/services/sourcing/remote-feeds")>();
  return { ...real, createRemoteFeed: vi.fn(async () => ({ supplierId: "s", sourceId: "src", feedId: "f" })), previewRemoteFeed: vi.fn() };
});

describe("sources web : droits des actions", () => {
  beforeEach(() => {
    calls.length = 0;
  });
  const id = "00000000-0000-4000-8000-000000000002";

  it("synchroniser = rédacteur ; fréquence et activation = administrateur", async () => {
    const { syncSourceAction, scheduleSourceAction } = await import("@/features/sources/actions");
    const fd = new FormData();
    fd.set("sourceId", id);
    expect(await syncSourceAction(null, fd)).toEqual({ ok: true, data: { message: "12 offres.", tone: "success" } });
    fd.set("frequency", "daily");
    expect(await scheduleSourceAction(null, fd)).toEqual({ ok: true, data: { message: "Fréquence enregistrée : 1 fois / jour.", tone: "success" } });
    expect(calls).toEqual([{ write: true }, { admin: true }]);
  });

  it("ajout d'un flux refusé sans attestation ; aucun identifiant renvoyé", async () => {
    const { createRemoteFeedAction } = await import("@/features/sources/actions");
    const base = { url: "https://f.example/stock.csv", format: "csv", auth: { kind: "basic", username: "u", password: "secret" }, mapping: { supplier_sku: "ref", title: "t", price: "p" }, defaults: { currency: "EUR", taxType: "ht" }, supplierName: "Grossiste" };
    const refused = await createRemoteFeedAction(base);
    expect(refused.ok).toBe(false);
    const created = await createRemoteFeedAction({ ...base, attest: true });
    expect(created).toEqual({ ok: true, data: { supplierId: "s", sourceId: "src" } });
    expect(JSON.stringify(created)).not.toContain("secret");
    expect(calls.every((c) => c.write === true)).toBe(true);
  });
});
