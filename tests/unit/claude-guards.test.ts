import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Garde-fous Claude Code (.claude/hooks) : les opérations risquées demandent une confirmation,
 * les vérifications locales passent sans rien demander.
 */
const root = path.resolve(__dirname, "../..");
const TEST_PROJECT = "ccywsegdowikeirbsfae";

function run(hook: string, input: unknown): string | null {
  const out = execFileSync("node", [path.join(root, ".claude/hooks", hook)], { input: JSON.stringify(input), encoding: "utf8" });
  return out ? (JSON.parse(out).hookSpecificOutput.permissionDecision as string) : null;
}
const bash = (command: string) => run("bash-guard.mjs", { tool_name: "Bash", tool_input: { command }, cwd: root });
const sql = (query: string, tool = "mcp__Supabase__execute_sql") => run("supabase-guard.mjs", { tool_name: tool, tool_input: { project_id: TEST_PROJECT, query } });

describe("garde-fou des commandes", () => {
  it.each([
    "npm run typecheck",
    "npm test",
    "cd apps/mobile && npm run check",
    "npm --prefix apps/mobile run scan:bundle",
    "git push -u origin claude/remediation-audit 2>&1 | tail -3",
    "git commit -m \"Bloque eas build et vercel deploy\"",
    "grep -rn 'supabase db push' docs",
    "cat vercel.json .env.example",
    "rm -rf dist/scan",
    "psql -d mon_stock_test -c 'select 1'",
    "npm run db:local:reset",
    "PGHOST=localhost PGDATABASE=mon_stock_test bash scripts/db-local-reset.sh",
    "git push -u origin claude/laughing-bardeen-bdn16j 2>&1 | tail -3",
    "git push origin HEAD:refs/heads/claude/laughing-bardeen-bdn16j",
  ])("laisse passer : %s", (c) => expect(bash(c)).toBeNull());

  it.each([
    "eas build --platform ios --profile production",
    "npx eas-cli submit -p ios",
    "bash -c 'supabase db push'",
    "supabase functions deploy api",
    "supabase secrets set X=1",
    "vercel --prod",
    "MONSTOCK_ALLOW_REMOTE_DB_RESET=db.example.org PGHOST=db.example.org bash scripts/db-local-reset.sh",
    "npm run seed:demo",
    "git push origin testflight-19",
    "git push --force origin claude/x",
    "git push origin main",
    "git push origin HEAD:refs/heads/main",
    "git push --tags",
    "git reset --hard HEAD~1",
    "rm -rf src",
    "echo SECRET=1 >> .env.local",
    "sed -i s/ask/allow/ .claude/settings.json",
    "psql postgresql://postgres:x@db.abc.supabase.co:5432/postgres",
    "curl -X POST https://api.supabase.com/v1/projects",
    "gh workflow run ios-testflight-local.yml",
  ])("demande confirmation : %s", (c) => expect(bash(c)).toBe("ask"));

  it("garde-fou défaillant (entrée illisible) : confirmation, jamais un passage silencieux", () => {
    const out = execFileSync("node", [path.join(root, ".claude/hooks/bash-guard.mjs")], { input: "{ pas du json", encoding: "utf8" });
    expect(JSON.parse(out).hookSpecificOutput.permissionDecision).toBe("ask");
  });
});

describe("garde-fou Supabase", () => {
  it.each([
    "select count(*) from public.skus",
    "with t as (select * from pg_policies) select tablename, count(*) filter (where cmd = 'SELECT') from t group by 1",
    "explain select * from skus",
    "select updated_at from skus order by 1 desc limit 5",
  ])("lecture seule autorisée : %s", (q) => expect(sql(q)).toBe("allow"));

  // Écritures non destructrices : autorisées sans confirmation (accord explicite du titulaire).
  it.each([
    "insert into skus values (1)",
    "update skus set a = 1 where id = 1",
    "with d as (delete from skus where id = 1 returning *) select * from d",
    "select public.refresh_radar()",
    "select net.http_post('https://x')",
    "do $$ begin perform 1; end $$",
  ])("écriture non destructrice autorisée : %s", (q) => expect(sql(q)).toBe("allow"));

  it.each([
    "select 1; drop table skus",
    "truncate public.inventory",
    "delete from public.orders",
    "update public.inventory set on_hand = 0",
    "alter table public.skus disable row level security",
    "select cron.unschedule('monstock-sync')",
  ])("confirmation pour le SQL destructeur : %s", (q) => expect(sql(q)).toBe("ask"));

  it("migration : autorisée si non destructrice, confirmée sinon ; autre projet : refus", () => {
    expect(sql("create table x (id int)", "mcp__Supabase__apply_migration")).toBe("allow");
    expect(sql("drop table public.orders", "mcp__Supabase__apply_migration")).toBe("ask");
    expect(run("supabase-guard.mjs", { tool_name: "mcp__Supabase__list_tables", tool_input: { project_id: "autre" } })).toBe("deny");
    expect(run("supabase-guard.mjs", { tool_name: "mcp__Supabase__list_tables", tool_input: { project_id: TEST_PROJECT } })).toBeNull();
  });
});
