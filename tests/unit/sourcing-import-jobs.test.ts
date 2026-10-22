/**
 * Imports reprenables (S-04) : gros fichier traité par lots et en écritures groupées, budget de
 * durée et de calcul, interruption (fonction coupée), reprise sûre et idempotente, aucun job
 * « running » indéfini ; S-18 : préparation transactionnelle (RPC) et recherche du fournisseur
 * sans joker.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryDb, type MemoryDb } from "./helpers/memory-db";
import { prepareCatalogImportRpc } from "./helpers/catalog-import-rpc";

let db: MemoryDb;
let fromCalls = 0;
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: () => counting() }));
vi.mock("@/services/sourcing/fx-rates", () => ({ getFxRate: async () => ({ rate: 1, date: null }), refreshFxRates: async () => ({ date: null, count: 0 }) }));

/** client qui compte les requêtes (allers-retours base) */
function counting() {
  const c = db.client as unknown as { from: (t: string) => unknown; rpc: (...a: unknown[]) => unknown };
  return {
    from: (t: string) => {
      fromCalls++;
      return c.from(t);
    },
    rpc: (...a: unknown[]) => c.rpc(...a),
  } as never;
}

const { importCatalogFile, previewCatalogFileForOrg, listImportJobs, getImportJob, resumeImportJob } = await import("@/services/sourcing/catalog-import");
const { processImportJob, runPendingImportJobs, reapStaleImportJobs, IMPORT_CHUNK_ROWS, IMPORT_LEASE_MS } = await import("@/services/sourcing/import-jobs");

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const HEADER = "Ref;Designation;Prix;Stock;Etat";

function ctx() {
  return { supabase: counting(), user: { id: USER }, profile: null, organization: { id: ORG, default_currency: "EUR" }, role: "owner", memberships: [] } as never;
}

function bigFile(n: number, opts: { start?: number; price?: (i: number) => string } = {}) {
  const lines = [HEADER];
  for (let i = opts.start ?? 0; i < (opts.start ?? 0) + n; i++) lines.push(`REF-${i};Apple iPhone ${11 + (i % 4)} ${i % 2 ? 128 : 256}GB Noir grade A;${opts.price ? opts.price(i) : (200 + (i % 50)).toFixed(2).replace(".", ",")};${i % 7};Refurbished`);
  return { fileName: "catalogue.csv", contentBase64: Buffer.from(lines.join("\r\n"), "utf8").toString("base64") };
}

async function startImport(file: ReturnType<typeof bigFile>, budget: { budgetMs?: number; cpuBudgetMs?: number } = {}, extra: Record<string, unknown> = {}) {
  const preview = await previewCatalogFileForOrg(ctx(), { file }, counting());
  return importCatalogFile(ctx(), { file, mapping: preview.mapping, defaults: { currency: "EUR", taxType: "ht" }, supplierName: "Grossiste Test", mode: "partial", ...extra } as never, budget);
}

beforeEach(() => {
  fromCalls = 0;
  db = memoryDb(
    { organizations: [{ id: ORG, default_currency: "EUR" }], suppliers: [], supplier_sources: [], supplier_feeds: [], sourcing_offers: [], sourcing_products: [], sync_runs: [], sourcing_import_jobs: [], sourcing_import_chunks: [], sourcing_import_issues: [], product_matches: [], skus: [] },
    { sourcing_mapping_profiles: [["organization_id", "supplier_id", "header_signature"]], sourcing_import_chunks: [["job_id", "chunk_index"]] },
    { sourcing_prepare_catalog_import: prepareCatalogImportRpc },
  );
});

describe("S-04 : gros fichier, écritures groupées, budget", () => {
  it("3 000 lignes : import complet en écritures groupées (nombre de requêtes sans rapport avec le nombre de lignes)", async () => {
    const file = bigFile(3_000);
    const r = await startImport(file);
    expect(r.result).toMatchObject({ status: "success", created: 3_000, pending: false });
    expect(db.tables.sourcing_offers).toHaveLength(3_000);
    const job = (await listImportJobs(ctx()))[0]!;
    expect(job).toMatchObject({ status: "completed", counts: { read: 3_000, created: 3_000 }, progress: { rowsProcessed: 3_000, rowsTotal: 3_000, chunksDone: 12, chunksTotal: 12 }, resumable: false });
    // avant : 5 à 8 allers-retours PAR LIGNE (≥ 15 000) ; maintenant ≈ 20 par lot de 250 lignes
    expect(fromCalls).toBeLessThan(400);
    // lots purgés à la clôture (contenu brut du fichier non conservé)
    expect(db.tables.sourcing_import_chunks).toHaveLength(0);
    expect(db.tables.sync_runs![0]).toMatchObject({ status: "success" });
  });

  it("budget de calcul épuisé : l'import est rendu « en cours » avec sa progression, puis repris jusqu'au bout", async () => {
    // budget de durée épuisé dès la requête d'import : contrat « en cours »
    const r = await startImport(bigFile(1_000), { budgetMs: 1 });
    expect(r.result).toMatchObject({ status: "partial", pending: true, jobId: r.importJobId, progress: { rowsProcessed: 0, rowsTotal: 1_000, chunksDone: 0, chunksTotal: 4 } });
    expect(r.result.message).toMatch(/Import en cours : 0 \/ 1000 lignes/);
    // horloge de calcul simulée : chaque section de calcul « dure » 200 ms → budget de 500 ms atteint après 1 lot
    let cpu = 0;
    const step = await processImportJob(r.importJobId!, { admin: counting(), cpuBudgetMs: 500, cpuClock: () => (cpu += 200) });
    expect(step).toMatchObject({ claimed: true, done: false, chunksThisRun: 1, progress: { rowsProcessed: 250, chunksDone: 1 } });
    const pendingJob = (await listImportJobs(ctx()))[0]!;
    expect(pendingJob).toMatchObject({ status: "running", resumable: true });
    const resumed = await resumeImportJob(ctx(), r.importJobId!, {}, counting());
    expect(resumed).toMatchObject({ status: "completed", counts: { created: 1_000 }, progress: { rowsProcessed: 1_000, chunksDone: 4, chunksTotal: 4 } });
    expect(db.tables.sourcing_offers).toHaveLength(1_000);
  });
});

describe("S-04 : interruption et reprise sûre", () => {
  it("fonction coupée après 2 lots : bail conservé (pas de double traitement), repris après expiration, sans doublon ni compteur faux", async () => {
    const r = await startImport(bigFile(1_000), { budgetMs: 1 }); // budget nul : rien n'est traité dans la requête
    const jobId = r.importJobId!;
    expect(r.result.pending).toBe(true);
    let now = Date.now();
    await expect(processImportJob(jobId, { admin: counting(), crashAfterChunks: 2, clock: () => now })).rejects.toThrow(/Coupure simulée/);
    expect(db.tables.sourcing_offers).toHaveLength(500);
    // bail encore valide : une reprise simultanée ne fait rien
    const busy = await processImportJob(jobId, { admin: counting(), clock: () => now });
    expect(busy).toMatchObject({ claimed: false, done: false });
    // bail expiré : la tâche planifiée reprend et termine
    now += IMPORT_LEASE_MS + 1_000;
    const pending = await runPendingImportJobs({ admin: counting(), clock: () => now });
    expect(pending.resumed[0]).toMatchObject({ jobId, status: "completed" });
    expect(db.tables.sourcing_offers).toHaveLength(1_000);
    expect(new Set(db.tables.sourcing_offers!.map((o) => o.external_offer_id)).size).toBe(1_000);
    const detail = await getImportJob(ctx(), jobId);
    expect(detail).toMatchObject({ status: "completed", counts: { created: 1_000, updated: 0 } });
  });

  it("coupure APRÈS l'écriture d'un lot mais AVANT son marquage : lot rejoué sans doublon d'offres ni d'incidents, créations comptées une fois", async () => {
    const lines = bigFile(600);
    // une ligne illisible dans le 1er lot (incident)
    const csv = Buffer.from(lines.contentBase64, "base64").toString("utf8").split("\r\n");
    csv[3] = "REF-BAD;;;;";
    const file = { fileName: "catalogue.csv", contentBase64: Buffer.from(csv.join("\r\n"), "utf8").toString("base64") };
    const r = await startImport(file, { budgetMs: 1 });
    const jobId = r.importJobId!;
    // le marquage « fait » du 1er lot échoue une fois (fonction coupée juste après les écritures)
    const base = counting() as unknown as { from: (t: string) => { update: (v: unknown) => unknown } };
    let failed = false;
    const flaky = {
      ...base,
      from: (t: string) => {
        const q = base.from(t);
        if (t === "sourcing_import_chunks" && !failed) {
          const update = q.update.bind(q);
          q.update = (v: unknown) => {
            if ((v as { status?: string }).status === "done") {
              failed = true;
              throw new Error("coupure entre écriture et marquage");
            }
            return update(v);
          };
        }
        return q;
      },
    };
    await expect(processImportJob(jobId, { admin: flaky as never })).rejects.toThrow(/coupure/);
    const written = db.tables.sourcing_offers!.length;
    expect(written).toBe(IMPORT_CHUNK_ROWS - 1);
    // reprise (bail expiré)
    const later = Date.now() + IMPORT_LEASE_MS + 1_000;
    const out = await processImportJob(jobId, { admin: counting(), clock: () => later });
    expect(out).toMatchObject({ done: true, status: "partial" });
    expect(db.tables.sourcing_offers).toHaveLength(599);
    const detail = await getImportJob(ctx(), jobId);
    expect(detail.counts).toMatchObject({ created: 599, invalid: 1 });
    expect(detail.issues.filter((i) => i.kind === "invalid")).toHaveLength(1);
  });

  it("aucun job « running » indéfini : abandonné (24 h), jamais découpé (ancienne version), ou bloqué (5 reprises sans avancer)", async () => {
    const r = await startImport(bigFile(300), { budgetMs: 1 });
    const job = db.tables.sourcing_import_jobs!.find((j) => j.id === r.importJobId)!;
    // ancien job d'avant la migration : pas de lots, démarré il y a 1 h
    db.tables.sourcing_import_jobs!.push({ id: "legacy-1", organization_id: ORG, status: "running", params: {}, rows_total: null, rows_processed: 0, chunks_total: 0, chunks_done: 0, attempts: 0, lease_owner: null, lease_expires_at: null, heartbeat_at: null, started_at: new Date(Date.now() - 3_600_000).toISOString(), sync_run_id: null });
    job.heartbeat_at = new Date(Date.now() - 25 * 3_600_000).toISOString();
    const reaped = await reapStaleImportJobs(counting());
    expect(reaped).toBe(2);
    expect(db.tables.sourcing_import_jobs!.find((j) => j.id === "legacy-1")).toMatchObject({ status: "failed", message: expect.stringMatching(/avant son découpage/) });
    expect(job).toMatchObject({ status: "failed", message: expect.stringMatching(/abandonné/) });
    // journal clos, lots purgés
    expect(db.tables.sync_runs!.find((s) => s.id === (job.params as { runId: string }).runId)).toMatchObject({ status: "failed" });
    expect(db.tables.sourcing_import_chunks!.filter((c) => c.job_id === job.id)).toHaveLength(0);

    const r2 = await startImport(bigFile(300, { start: 1_000 }), { budgetMs: 1 }, { allowSameFile: true });
    const job2 = db.tables.sourcing_import_jobs!.find((j) => j.id === r2.importJobId)!;
    job2.attempts = 5;
    const out = await processImportJob(r2.importJobId!, { admin: counting() });
    expect(out.status).toBe("failed");
    expect(job2.message).toMatch(/5 reprises sans avancer/);
  });

  it("import remplacé (journal clos par un import plus récent) : le job s'arrête sans écrire", async () => {
    const r = await startImport(bigFile(300), { budgetMs: 1 });
    const job = db.tables.sourcing_import_jobs!.find((j) => j.id === r.importJobId)!;
    db.tables.sync_runs!.find((s) => s.id === (job.params as { runId: string }).runId)!.status = "failed";
    const out = await processImportJob(r.importJobId!, { admin: counting() });
    expect(out.status).toBe("failed");
    expect(db.tables.sourcing_offers).toHaveLength(0);
  });

  it("catalogue complet : les offres absentes n'expirent qu'à la CLÔTURE du job (jamais pendant un import partiel)", async () => {
    const first = await startImport(bigFile(500));
    for (const o of db.tables.sourcing_offers!) o.last_seen_at = "2026-01-01T00:00:00.000Z";
    const snap = await startImport(bigFile(300), { budgetMs: 1 }, { supplierId: first.supplierId, supplierName: undefined, mode: "snapshot", allowSameFile: true });
    await processImportJob(snap.importJobId!, { admin: counting(), budgetMs: 60_000, cpuBudgetMs: 1 });
    // en cours : rien n'a expiré
    expect(db.tables.sourcing_offers!.filter((o) => o.status === "expired")).toHaveLength(0);
    await runPendingImportJobs({ admin: counting() });
    expect(db.tables.sourcing_offers!.filter((o) => o.status === "expired")).toHaveLength(200);
    expect(db.tables.sourcing_offers).toHaveLength(500);
  });
});

describe("S-18 : préparation transactionnelle de l'import", () => {
  it("un seul appel RPC (fournisseur, source, flux) ; nom transmis tel quel, jamais en motif ilike", async () => {
    const rpc = vi.spyOn(db.client as unknown as { rpc: (...a: unknown[]) => unknown }, "rpc");
    db.tables.suppliers!.push({ id: "sup-x", organization_id: ORG, name: "AxB" });
    const file = bigFile(3);
    const preview = await previewCatalogFileForOrg(ctx(), { file }, counting());
    const r = await importCatalogFile(ctx(), { file, mapping: preview.mapping, defaults: { currency: "EUR", taxType: "ht" }, supplierName: "  A_B  ", mode: "partial" } as never);
    expect(rpc).toHaveBeenCalledWith("sourcing_prepare_catalog_import", expect.objectContaining({ p_supplier_name: "A_B", p_source_type: "CSV" }));
    // « A_B » ne retrouve pas « AxB » : nouveau fournisseur
    expect(r.supplierId).not.toBe("sup-x");
    expect(db.tables.suppliers).toHaveLength(2);
  });
});
