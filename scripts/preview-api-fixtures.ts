/**
 * APERÇU VISUEL : produit les réponses de l'API utilisées par l'aperçu web de l'application
 * (apps/mobile/preview). Les VRAIES fonctions serveur sont exécutées sur la base de démonstration en
 * mémoire (apps/mobile/preview/demo-db.ts) : aucune connexion à Supabase, aucun appel réseau.
 *
 * Lancement : npx tsx --conditions=react-server scripts/preview-api-fixtures.ts
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createDemoClient, DEMO_ORG_ID, DEMO_USER, demoTables } from "../apps/mobile/preview/demo-db";
import type { OrgContext } from "@/features/auth/dal";
import { directoryForOrg } from "@/services/sourcing/supplier-directory";
import { proAccountsHub, supplierOffers } from "@/services/sourcing/pro-accounts";
import { getImportJob, listImportJobs } from "@/services/sourcing/catalog-import";
import { listSourcesForOrg } from "@/services/sourcing/source-sync";
import { simpleSupplierSearch } from "@/services/sourcing/simple-search";
import { sourceLibrary } from "@/services/sourcing/source-library";

const NOW = new Date();
const db = demoTables(NOW);
const client = createDemoClient(db, DEMO_USER);
const org = db.organizations![0]!;
// Le client de démonstration n'implémente que le sous-ensemble de lecture utilisé par ces services.
const ctx = {
  supabase: client,
  user: { id: DEMO_USER.id, email: DEMO_USER.email },
  profile: { user_id: DEMO_USER.id, current_organization_id: DEMO_ORG_ID },
  organization: org,
  role: "owner",
  memberships: [{ organization: { id: DEMO_ORG_ID, name: org.name, slug: org.slug, is_demo: true }, role: "owner" }],
} as unknown as OrgContext;

const out: Record<string, unknown> = {};
async function record(key: string, fn: () => Promise<unknown>) {
  try {
    out[key] = await fn();
    console.log(`ok   ${key}`);
  } catch (e) {
    console.log(`FAIL ${key}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const noLive = { live: async () => ({ queried: 0, found: 0, stored: 0, durationMs: 0, sources: [] }) } as unknown as Parameters<typeof simpleSupplierSearch>[2];

async function main() {
  await record("GET /sourcing/directory", () => directoryForOrg(ctx));
  await record("GET /sourcing/accounts", () => proAccountsHub(ctx));
  await record("GET /sourcing/sources", () => listSourcesForOrg(ctx, client as unknown as Parameters<typeof listSourcesForOrg>[1]));
  await record("GET /sourcing/imports", () => listImportJobs(ctx, { limit: 50 }));
  await record("GET /sourcing/library", () => sourceLibrary(ctx));
  for (const job of db.sourcing_import_jobs ?? []) await record(`GET /sourcing/imports/detail?id=${String(job.id)}`, () => getImportJob(ctx, String(job.id)));
  for (const s of db.suppliers ?? []) {
    await record(`GET /sourcing/supplier-offers?supplierId=${String(s.id)}`, () => supplierOffers(ctx, String(s.id)));
    await record(`GET /sourcing/imports?supplierId=${String(s.id)}`, () => listImportJobs(ctx, { supplierId: String(s.id), limit: 50 }));
  }
  for (const q of ["iphone 13", "iphone 12", "batterie", "écran"]) await record(`GET /suppliers/search?q=${q}`, () => simpleSupplierSearch(ctx, q, noLive));

  const file = path.resolve(__dirname, "../apps/mobile/preview/api-fixtures.generated.json");
  writeFileSync(file, `${JSON.stringify({ generatedAt: NOW.toISOString(), responses: out }, null, 1)}\n`);
  console.log(`→ ${path.relative(process.cwd(), file)} (${Object.keys(out).length} réponses)`);
}

void main();
