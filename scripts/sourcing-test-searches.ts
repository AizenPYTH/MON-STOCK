/**
 * Recherches de référence du sourcing — `npm run sourcing:test-searches`
 *
 *   DATABASE_URL=postgresql://… npm run sourcing:test-searches   (défaut : base locale de test mon_stock_test)
 *
 * 1. Crée (si absente) l'organisation « TEST — recherches sourcing » et lit les sources que
 *    l'opérateur y a configurées (supplier_sources / supplier_connections). Aucune source, aucun
 *    fournisseur ni aucune offre n'est inséré par ce script.
 * 2. Pour 5 requêtes, exécute le VRAI pipeline (executeLiveSearch + adaptateurs du registre +
 *    fetch réel + robots.txt réel) puis le filtre de pertinence et le classement, en mémoire.
 * 3. Rejoue les 5 requêtes sur les fixtures des adaptateurs (section « FIXTURES — pas des offres réelles »).
 * 4. Affiche et écrit docs/sourcing-test-searches.md.
 *
 * Les modules serveur importent « server-only » : le script se relance avec la condition
 * d'export `react-server` (comme scripts/run-sync.ts).
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/mon_stock_test";

function hasReactServerCondition(): boolean {
  const argv = process.execArgv;
  return argv.some((a, i) => a === "--conditions=react-server" || a === "-C=react-server" || ((a === "--conditions" || a === "-C") && argv[i + 1] === "react-server"));
}

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "(DATABASE_URL illisible)";
  }
}

async function main(): Promise<void> {
  if (!hasReactServerCondition()) {
    const script = fileURLToPath(import.meta.url);
    const result = spawnSync(process.execPath, ["--conditions", "react-server", ...process.execArgv, script, ...process.argv.slice(2)], { stdio: "inherit", env: process.env });
    process.exit(result.status ?? 1);
  }

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const { Client } = await import("pg");
  const { getSourceAdapter } = await import("../src/integrations/sourcing/registry");
  const { adapterConfigFromSource, adapterKeyOf } = await import("../src/services/sourcing/adapter-runtime");
  const { LIVE_SEARCH_SOURCE_TYPES, LIVE_SEARCH_DEFAULT_TIMEOUT_MS, LIVE_SEARCH_MAX_SOURCES, LIVE_SEARCH_PARALLELISM, LIVE_SEARCH_PUBLIC_MIN_DELAY_MS, LIVE_SEARCH_ACCOUNT_MIN_DELAY_MS, isUnvalidatedDiscovered } = await import("../src/services/sourcing/live-search");
  const { checkRobotsForUrls } = await import("../src/services/sourcing/crawler/robots");
  const { decryptSecret } = await import("../src/lib/crypto");
  const harness = await import("../src/services/sourcing/test-searches");
  type Candidate = import("../src/services/sourcing/live-search").LiveSourceCandidate;

  const databaseUrl = process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    // --- organisation de test (créée si absente, jamais d'offre insérée)
    let created = false;
    let org = (await client.query<{ id: string; name: string; default_currency: string }>("select id, name, default_currency from organizations where slug = $1", [harness.TEST_ORG_SLUG])).rows[0];
    if (!org) {
      org = (await client.query<{ id: string; name: string; default_currency: string }>("insert into organizations (name, slug, default_currency, settings) values ($1, $2, 'EUR', $3) returning id, name, default_currency", [harness.TEST_ORG_NAME, harness.TEST_ORG_SLUG, JSON.stringify({ purpose: "Organisation de test des recherches de sourcing (scripts/sourcing-test-searches.ts) — aucune offre insérée par le script." })])).rows[0]!;
      created = true;
    }

    // --- sources configurées par l'opérateur (mêmes règles que loadCandidates, sans écriture)
    const sources = (
      await client.query(
        `select s.*, sup.name as supplier_name, sup.is_archived from supplier_sources s join suppliers sup on sup.id = s.supplier_id
          where s.organization_id = $1 and s.status <> 'paused' and s.source_type = any($2::source_type[]) order by s.created_at limit 100`,
        [org.id, [...LIVE_SEARCH_SOURCE_TYPES]],
      )
    ).rows as Array<Record<string, unknown> & { id: string; name: string; supplier_id: string; supplier_name: string; is_archived: boolean; source_type: string; config: unknown; automated_access_confirmed: boolean; base_url: string | null; default_currency: string | null; default_tax_type: "ht" | "ttc" | "unknown"; country: string | null }>;
    const connections = (await client.query<{ id: string; supplier_id: string; source_id: string | null; connector_key: string; supplier_name: string }>("select c.id, c.supplier_id, c.source_id, c.connector_key, sup.name as supplier_name from supplier_connections c join suppliers sup on sup.id = c.supplier_id where c.organization_id = $1 and c.status <> 'disconnected' limit 50", [org.id])).rows;
    const connectionBySource = new Map(connections.filter((c) => c.source_id).map((c) => [c.source_id!, c] as const));
    const candidates: Candidate[] = [];
    for (const s of sources) {
      if (s.is_archived || isUnvalidatedDiscovered(s.config as never, s.automated_access_confirmed)) continue;
      const conn = connectionBySource.get(s.id) ?? null;
      const key = conn?.connector_key ?? adapterKeyOf(s.config as never);
      const adapter = getSourceAdapter(key);
      candidates.push({ sourceId: s.id, sourceName: s.name, supplierId: s.supplier_id, supplierName: s.supplier_name, sourceType: s.source_type as Candidate["sourceType"], adapter, adapterKey: adapter?.key ?? key, config: adapterConfigFromSource({ base_url: s.base_url, config: s.config as never, default_currency: s.default_currency, default_tax_type: s.default_tax_type, country: s.country }), attested: s.automated_access_confirmed, connectionId: conn?.id ?? null });
    }
    for (const c of connections) {
      if (c.source_id && sources.some((s) => s.id === c.source_id)) continue;
      const adapter = getSourceAdapter(c.connector_key);
      if (!adapter || adapter.access !== "account") continue;
      candidates.push({ sourceId: `connection-${c.id}`, sourceName: adapter.label, supplierId: c.supplier_id, supplierName: c.supplier_name, sourceType: "SUPPLIER_ACCOUNT", adapter, adapterKey: adapter.key, config: { baseUrl: null, settings: {}, defaultCurrency: null, defaultTaxType: "unknown", defaultCountry: null }, attested: true, connectionId: c.id });
    }

    const userAgent = process.env.SOURCING_USER_AGENT || "MonStockBot/0.1";
    const realFetch: typeof fetch = (...args) => fetch(...args);
    const now = () => new Date();
    const liveBase = {
      userAgent,
      now,
      fetchImpl: realFetch,
      checkRobots: (c: Candidate, urls: string[]) => checkRobotsForUrls(c.config.baseUrl ?? urls[0]!, urls, userAgent, realFetch),
      loadCredentials: async (connectionId: string) => {
        const row = (await client.query<{ credentials_enc: string }>("select credentials_enc from supplier_connection_secrets where connection_id = $1", [connectionId])).rows[0];
        if (!row?.credentials_enc) return null;
        try {
          return JSON.parse(decryptSecret(row.credentials_enc)) as Record<string, string>;
        } catch {
          return null; // clé de chiffrement absente ou différente : « compte requis »
        }
      },
      perSourceTimeoutMs: LIVE_SEARCH_DEFAULT_TIMEOUT_MS,
      maxSources: LIVE_SEARCH_MAX_SOURCES,
      parallelism: LIVE_SEARCH_PARALLELISM,
      publicMinDelayMs: LIVE_SEARCH_PUBLIC_MIN_DELAY_MS,
      accountMinDelayMs: LIVE_SEARCH_ACCOUNT_MIN_DELAY_MS,
    };

    const live = [];
    for (const q of harness.TEST_SEARCH_QUERIES) live.push(await harness.runTestSearch(q, candidates, liveBase, { now: new Date() }));
    const requestsMade = live.reduce((a, o) => a + o.summary.sources.reduce((b, s) => b + s.requests.length, 0), 0);
    const networkNote =
      candidates.length === 0
        ? "Aucune source n'est configurée pour cette organisation : **aucune requête réseau n'a été émise** et aucune offre réelle n'a été trouvée (réseau sortant de toute façon bloqué dans l'environnement de développement — hôtes externes en 403)."
        : `${requestsMade} requête(s) réseau émise(s) au total ; voir le statut de chaque source ci-dessous (dans l'environnement de développement, le réseau sortant est bloqué).`;

    const readFixture = (adapterKey: string, file: string) => readFileSync(path.join(root, "tests/fixtures/sourcing", adapterKey, file), "utf8");
    const fixtureNow = new Date();
    const fixtures = [];
    for (const q of harness.TEST_SEARCH_QUERIES) fixtures.push(await harness.runTestSearch(q, harness.fixtureCandidates(), harness.fixtureRuntime(readFixture, () => fixtureNow), { now: fixtureNow }));

    const report = harness.renderTestSearchReport({ generatedAt: new Date(), database: maskUrl(databaseUrl), organization: { id: org.id, name: org.name, created }, liveSourceCount: candidates.length, live, fixtures, networkNote });
    const outFile = path.join(root, "docs/sourcing-test-searches.md");
    writeFileSync(outFile, report, "utf8");
    console.log(report);
    console.log(`→ écrit : ${path.relative(root, outFile)}`);
  } finally {
    await client.end();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
