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
    "git push -u origin claude/laughing-bardeen-bdn16j 2>&1 | tail -3",
    "git commit -m \"Bloque eas build et vercel deploy\"",
    "grep -rn 'supabase db push' docs",
    "cat vercel.json .env.example",
    "rm -rf dist/scan",
    "psql -d mon_stock_test -c 'select 1'",
  ])("laisse passer : %s", (c) => expect(bash(c)).toBeNull());

  it.each([
    "eas build --platform ios --profile production",
    "npx eas-cli submit -p ios",
    "bash -c 'supabase db push'",
    "supabase functions deploy api",
    "supabase secrets set X=1",
    "vercel --prod",
    "npm run db:local:reset",
    "npm run seed:demo",
    "git push origin testflight-19",
    "git push --force origin claude/x",
    "git push origin main",
    "git push --tags",
    "git reset --hard HEAD~1",
    "rm -rf src",
    "echo SECRET=1 >> .env.local",
    "sed -i s/ask/allow/ .claude/settings.json",
    "psql postgresql://postgres:x@db.abc.supabase.co:5432/postgres",
    "curl -X POST https://api.supabase.com/v1/projects",
    "gh workflow run ios-testflight-local.yml",
  ])("demande confirmation : %s", (c) => expect(bash(c)).toBe("ask"));
});

describe("garde-fou Supabase", () => {
  it.each([
    "select count(*) from public.skus",
    "with t as (select * from pg_policies) select tablename, count(*) filter (where cmd = 'SELECT') from t group by 1",
    "explain select * from skus",
    "select updated_at from skus order by 1 desc limit 5",
  ])("lecture seule autorisée : %s", (q) => expect(sql(q)).toBe("allow"));

  it.each([
    "insert into skus values (1)",
    "update skus set a = 1 where id = 1",
    "with d as (delete from skus where id = 1 returning *) select * from d",
    "select * into x from skus",
    "explain analyze select * from skus",
    "select public.refresh_radar()",
    "select net.http_post('https://x')",
    "select set_config('role', 'service_role', false)",
    "do $$ begin perform 1; end $$",
    "select 1; drop table skus",
  ])("confirmation pour : %s", (q) => expect(sql(q)).toBe("ask"));

  it("migration : toujours une confirmation ; autre projet : refus", () => {
    expect(sql("create table x (id int)", "mcp__Supabase__apply_migration")).toBe("ask");
    expect(run("supabase-guard.mjs", { tool_name: "mcp__Supabase__list_tables", tool_input: { project_id: "autre" } })).toBe("deny");
    expect(run("supabase-guard.mjs", { tool_name: "mcp__Supabase__list_tables", tool_input: { project_id: TEST_PROJECT } })).toBeNull();
  });
});
