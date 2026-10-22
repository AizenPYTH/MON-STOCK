import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryDb, type MemoryDb } from "./helpers/memory-db";
import { prepareCatalogImportRpc } from "./helpers/catalog-import-rpc";

vi.mock("server-only", () => ({}));
let db: MemoryDb;
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: () => db.client }));

const { importCatalogFile, previewCatalogFileForOrg, listImportJobs, getImportJob, headerSignature } = await import("@/services/sourcing/catalog-import");

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

function ctx() {
  return { supabase: db.client, user: { id: USER }, profile: null, organization: { id: ORG, default_currency: "EUR" }, role: "owner", memberships: [] } as never;
}

function fileOf(lines: string[], name = "stock.csv") {
  const bytes = new TextEncoder().encode(lines.join("\r\n"));
  return { fileName: name, contentBase64: Buffer.from(bytes).toString("base64") };
}

const HEADER = "Item code;Product;EAN;Wholesale price;Qty;MOQ;Grade;Condition;Warranty;Ships from;VAT scheme";
const base = [
  HEADER,
  "TPH-1;Apple iPhone 13 128GB Midnight;0194252707326;329,90;12;5;A;Refurbished;12 months;BE;Margin scheme",
  "TPH-2;Apple iPhone 13 256GB Blue;0194252707012;389,00;4;5;B;Refurbished;12 months;BE;Margin scheme",
  "TPH-3;Samsung Galaxy S22 128GB Black;;259,00;0;1;A;Refurbished;6 months;NL;",
];

beforeEach(() => {
  db = memoryDb({ organizations: [{ id: ORG, default_currency: "EUR" }] }, { sourcing_mapping_profiles: [["organization_id", "supplier_id", "header_signature"]] }, { sourcing_prepare_catalog_import: prepareCatalogImportRpc });
});

async function run(lines: string[], extra: Record<string, unknown> = {}) {
  const file = fileOf(lines, (extra.fileName as string) ?? "stock.csv");
  const preview = await previewCatalogFileForOrg(ctx(), { file, supplierId: extra.supplierId as string | undefined }, db.client as never);
  const r = await importCatalogFile(ctx(), {
    file,
    mapping: preview.mapping,
    defaults: { currency: "EUR", taxType: "ht" },
    ...(extra.supplierId ? { supplierId: extra.supplierId as string } : { supplierName: "ThePhoneHub" }),
    mode: (extra.mode as "partial" | "snapshot") ?? "partial",
    allowSameFile: extra.allowSameFile as boolean | undefined,
  } as never);
  return { preview, r };
}

describe("import fournisseur : aperçu, historique, réimport", () => {
  it("aperçu : en-têtes anglais reconnus avec confiance, champs étendus, EAN invalide signalé", async () => {
    const lines = [...base, "TPH-4;Apple iPhone 12 64GB White;1234567890123;199,00;3;1;C;Used;3 months;DE;Standard VAT"];
    const p = await previewCatalogFileForOrg(ctx(), { file: fileOf(lines) }, db.client as never);
    expect(p.mapping).toMatchObject({ supplier_sku: "Item code", title: "Product", ean: "EAN", price: "Wholesale price", available_quantity: "Qty", moq: "MOQ", grade: "Grade", condition: "Condition", warranty_months: "Warranty", ship_from_country: "Ships from", vat_regime: "VAT scheme" });
    expect(p.mappingConfidence.title).toBe("medium");
    expect(p.mappingConfidence.ean).toBe("high");
    expect(p.mappingSource).toBe("suggested");
    expect(p.validCount).toBe(4);
    expect(p.sample[3]!.ean).toBeNull();
    expect(p.sample[3]!.warnings.join(" ")).toMatch(/EAN « 1234567890123 » invalide/);
    expect(p.fileSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(p.alreadyImported).toBeNull();
  });

  it("premier import : 3 nouvelles offres, champs étendus enregistrés, historique et mapping mémorisé", async () => {
    const { r } = await run(base);
    expect(r.result).toMatchObject({ status: "success", created: 3, updated: 0, unchanged: 0, mode: "partial" });
    const offers = db.tables.sourcing_offers!;
    expect(offers).toHaveLength(3);
    const o1 = offers.find((o) => o.external_offer_id === "TPH-1")!;
    expect(o1).toMatchObject({ warranty_months: 12, ship_from_country: "BE", vat_regime: "margin", moq: 5, available_quantity: 12, last_import_job_id: r.importJobId });
    const jobs = await listImportJobs(ctx());
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ fileName: "stock.csv", mode: "partial", status: "completed", createdBy: USER, counts: { read: 3, created: 3, updated: 0, unchanged: 0, duplicates: 0, invalid: 0 } });
    expect(db.tables.sourcing_mapping_profiles).toHaveLength(1);
    expect(db.tables.sourcing_mapping_profiles![0]).toMatchObject({ supplier_id: r.supplierId, header_signature: headerSignature(HEADER.split(";")) });
  });

  it("réimport du même fichier : rien n'est modifié sans confirmation ; avec confirmation, tout est « inchangé »", async () => {
    const { r: first } = await run(base);
    const { preview, r: again } = await run(base, { supplierId: first.supplierId });
    expect(preview.alreadyImported?.jobId).toBe(first.importJobId);
    expect(preview.mappingSource).toBe("saved");
    expect(again.alreadyImported?.jobId).toBe(first.importJobId);
    expect(again.result.stored).toBe(0);
    expect(db.tables.sourcing_import_jobs!.map((j) => j.status)).toEqual(["completed", "skipped_duplicate"]);
    const { r: forced } = await run(base, { supplierId: first.supplierId, allowSameFile: true });
    expect(forced.result).toMatchObject({ created: 0, updated: 0, unchanged: 3 });
    expect(db.tables.sourcing_offers).toHaveLength(3);
  });

  it("mise à jour partielle : seules les lignes reçues changent, rien n'expire", async () => {
    const { r: first } = await run(base);
    const partial = [HEADER, "TPH-2;Apple iPhone 13 256GB Blue;0194252707012;369,00;9;5;B;Refurbished;12 months;BE;Margin scheme"];
    const { r } = await run(partial, { supplierId: first.supplierId, fileName: "maj.csv" });
    expect(r.result).toMatchObject({ created: 0, updated: 1, unchanged: 0, expired: 0, mode: "partial" });
    const statuses = Object.fromEntries(db.tables.sourcing_offers!.map((o) => [o.external_offer_id, o.status]));
    expect(statuses).toEqual({ "TPH-1": "active", "TPH-2": "active", "TPH-3": "active" });
    expect(db.tables.sourcing_offers!.find((o) => o.external_offer_id === "TPH-2")).toMatchObject({ original_price: 369, available_quantity: 9 });
  });

  it("catalogue complet : les offres absentes du fichier sont « expirées », jamais supprimées", async () => {
    const { r: first } = await run(base);
    // horodatage postérieur au premier import
    for (const o of db.tables.sourcing_offers!) o.last_seen_at = "2026-01-01T00:00:00.000Z";
    const snapshot = [HEADER, base[1]!, base[2]!];
    const { r } = await run(snapshot, { supplierId: first.supplierId, mode: "snapshot", fileName: "complet.csv" });
    expect(r.result).toMatchObject({ mode: "snapshot", expired: 1, unchanged: 2 });
    expect(db.tables.sourcing_offers).toHaveLength(3);
    expect(db.tables.sourcing_offers!.find((o) => o.external_offer_id === "TPH-3")!.status).toBe("expired");
  });

  it("doublons, lignes invalides et produits non reconnus : comptés et détaillés ligne par ligne", async () => {
    const lines = [...base, base[1]!, "TPH-9;;100;1;1;A;New;;FR;", "TPH-10;Lot accessoires divers;;12,00;40;10;;New;;FR;"];
    const { r } = await run(lines);
    expect(r.result).toMatchObject({ duplicates: 1, invalidRows: 1 });
    expect(r.result.unrecognized).toBeGreaterThanOrEqual(1);
    const detail = await getImportJob(ctx(), r.importJobId!);
    const kinds = detail.issues.map((i) => i.kind);
    expect(kinds).toContain("duplicate");
    expect(kinds).toContain("invalid");
    expect(kinds).toContain("unrecognized");
    const dup = detail.issues.find((i) => i.kind === "duplicate")!;
    expect(dup).toMatchObject({ line: 5, reference: "TPH-1" });
    expect(detail.issues.find((i) => i.kind === "invalid")!.message).toMatch(/Titre manquant|Prix/);
    expect(detail.counts).toMatchObject({ duplicates: 1, invalid: 1 });
  });

  it("isolation : l'historique d'une autre organisation n'est pas visible", async () => {
    await run(base);
    const other = { ...(ctx() as object), organization: { id: "33333333-3333-4333-8333-333333333333", default_currency: "EUR" } } as never;
    expect(await listImportJobs(other)).toEqual([]);
    const job = db.tables.sourcing_import_jobs![0]!.id as string;
    await expect(getImportJob(other, job)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
