/**
 * D-03 / Q-02 : les scripts dangereux refusent la base de production (scripts/lib/production-guard.ts)
 * et db-local-reset.sh refuse tout hôte non local. Aucun accès réseau ni base réelle : `psql` est
 * remplacé par un faux binaire qui journalise ses appels.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { assertNotProductionTarget, findProductionTargets, ProductionTargetError, productionRefs } from "../../scripts/lib/production-guard";

const PROD = "ccywsegdowikeirbsfae";
const root = path.resolve(__dirname, "../..");

describe("production-guard (scripts TypeScript)", () => {
  it("détecte la production dans l'URL HTTP, la chaîne Postgres directe et le pooler", () => {
    expect(findProductionTargets({ NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co` })).toEqual([{ variable: "NEXT_PUBLIC_SUPABASE_URL", ref: PROD }]);
    expect(findProductionTargets({ DATABASE_URL: `postgresql://postgres:x@db.${PROD}.supabase.co:5432/postgres` })).toEqual([{ variable: "DATABASE_URL", ref: PROD }]);
    expect(findProductionTargets({ DATABASE_URL: `postgresql://postgres.${PROD.toUpperCase()}:x@aws-0-eu-west-3.pooler.supabase.com:6543/postgres` })).toEqual([{ variable: "DATABASE_URL", ref: PROD }]);
  });

  it("laisse passer une base locale ou un autre projet (préproduction)", () => {
    expect(assertNotProductionTarget("t", { DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/mon_stock_test", NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co" })).toEqual([]);
    expect(assertNotProductionTarget("t", {})).toEqual([]);
  });

  it("refuse la production sans dérogation, sans afficher les valeurs", () => {
    const env = { SUPABASE_URL: `https://${PROD}.supabase.co`, DATABASE_URL: `postgresql://postgres:TRES-SECRET@db.${PROD}.supabase.co/postgres` };
    let err: unknown;
    try {
      assertNotProductionTarget("seed:demo", env);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ProductionTargetError);
    const msg = (err as Error).message;
    expect(msg).toContain("seed:demo");
    expect(msg).toContain(PROD);
    expect(msg).toContain("MONSTOCK_ALLOW_PRODUCTION=");
    expect(msg).not.toContain("TRES-SECRET");
  });

  it("n'accepte qu'une dérogation qui nomme exactement la référence", () => {
    const env = { NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co` };
    for (const bad of ["1", "true", "yes", "ccywsegdowikeirbsfa", "autre-ref"]) {
      expect(() => assertNotProductionTarget("t", { ...env, MONSTOCK_ALLOW_PRODUCTION: bad })).toThrow(ProductionTargetError);
    }
    expect(assertNotProductionTarget("t", { ...env, MONSTOCK_ALLOW_PRODUCTION: ` ${PROD} ` })).toEqual([{ variable: "NEXT_PUBLIC_SUPABASE_URL", ref: PROD }]);
  });

  it("prend en compte les références supplémentaires de MONSTOCK_PRODUCTION_REFS", () => {
    const env = { MONSTOCK_PRODUCTION_REFS: "newprodref123, other", SUPABASE_URL: "https://newprodref123.supabase.co" };
    expect(productionRefs(env)).toEqual([PROD, "newprodref123", "other"]);
    expect(() => assertNotProductionTarget("t", env)).toThrow(/newprodref123/);
  });

  it("les scripts dangereux appellent le garde-fou avant toute connexion", () => {
    for (const [file, name] of [
      ["scripts/seed-demo.ts", "seed:demo"],
      ["scripts/run-sync.ts", "sync:run"],
      ["scripts/sourcing-test-searches.ts", "sourcing:test-searches"],
    ] as const) {
      const src = readFileSync(path.join(root, file), "utf8");
      const main = src.slice(src.indexOf("async function main"));
      expect(main.indexOf(`exitIfProductionTarget("${name}")`), file).toBeGreaterThan(0);
      for (const later of ["createAdminSupabaseClient(", "spawnSync(", "client.connect("]) {
        const i = main.indexOf(later);
        if (i >= 0) expect(main.indexOf("exitIfProductionTarget")).toBeLessThan(i);
      }
    }
  });

  it.each([
    ["scripts/seed-demo.ts", ["--user", "00000000-0000-0000-0000-000000000000"], { NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co` }],
    ["scripts/run-sync.ts", ["--all"], { NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co` }],
    ["scripts/sourcing-test-searches.ts", [], { DATABASE_URL: `postgresql://postgres:x@db.${PROD}.supabase.co:5432/postgres` }],
  ] as const)("%s s'arrête (code 3) sur la production, avant tout appel", (file, args, env) => {
    // --conditions react-server : comme en exécution réelle, `server-only` ne bloque pas l'import.
    const r = spawnSync(process.execPath, ["--conditions", "react-server", "--import", "tsx", file, ...args], {
      cwd: root,
      env: { PATH: process.env.PATH ?? "", ...env },
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(r.status, r.stderr).toBe(3);
    expect(r.stderr).toContain("refusé");
    expect(r.stderr).toContain(PROD);
  });
});

describe("db-local-reset.sh (garde-fou bash)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "dbreset-guard-"));
  const log = path.join(dir, "psql.log");
  writeFileSync(path.join(dir, "psql"), `#!/usr/bin/env bash\necho "$PGHOST|$*" >> "${log}"\n`);
  chmodSync(path.join(dir, "psql"), 0o755);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  function run(env: Record<string, string>) {
    rmSync(log, { force: true });
    const r = spawnSync("bash", [path.join(root, "scripts/db-local-reset.sh")], {
      env: { PATH: `${dir}:${process.env.PATH ?? ""}`, HOME: dir, ...env },
      encoding: "utf8",
    });
    return { status: r.status, stderr: r.stderr, calls: existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [] };
  }

  it("refuse l'hôte de la production, même avec la dérogation", () => {
    const host = `db.${PROD}.supabase.co`;
    const r = run({ PGHOST: host, MONSTOCK_ALLOW_REMOTE_DB_RESET: host });
    expect(r.status).toBe(3);
    expect(r.stderr).toContain("Supabase");
    expect(r.calls).toEqual([]);
  });

  it("refuse tout hôte non local sans dérogation exacte", () => {
    expect(run({ PGHOST: "db.example.org" })).toMatchObject({ status: 3, calls: [] });
    expect(run({ PGHOST: "db.example.org", MONSTOCK_ALLOW_REMOTE_DB_RESET: "1" })).toMatchObject({ status: 3, calls: [] });
    expect(run({ PGHOST: "localhost", PGHOSTADDR: "10.1.2.3" })).toMatchObject({ status: 3, calls: [] });
    expect(run({ PGSERVICE: "prod" })).toMatchObject({ status: 3, calls: [] });
  });

  it("refuse les bases système et les noms non sûrs", () => {
    expect(run({ PGDATABASE: "postgres" })).toMatchObject({ status: 3, calls: [] });
    expect(run({ PGDATABASE: "x; drop database y" })).toMatchObject({ status: 3, calls: [] });
  });

  it("accepte localhost, 127.0.0.1 et un socket Unix (psql factice appelé)", () => {
    for (const host of ["localhost", "127.0.0.1", "/var/run/postgresql"]) {
      const r = run({ PGHOST: host, PGDATABASE: "mon_stock_guard_test" });
      expect(r.status, r.stderr).toBe(0);
      expect(r.calls[0]).toBe(`${host}|-v ON_ERROR_STOP=1 -d postgres -c drop database if exists mon_stock_guard_test;`);
    }
  });

  it("accepte un hôte jetable distant avec la dérogation exacte", () => {
    const r = run({ PGHOST: "ci-db.internal", MONSTOCK_ALLOW_REMOTE_DB_RESET: "ci-db.internal", PGDATABASE: "mon_stock_ci" });
    expect(r.status, r.stderr).toBe(0);
    expect(r.calls.length).toBeGreaterThan(2);
  });
});
