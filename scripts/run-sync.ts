/**
 * CLI de synchronisation des canaux (hors Vercel Cron) :
 *   npm run sync:run -- --connection <uuid> [--scope full|listings|orders]
 *   npm run sync:run -- --all          (toutes les connexions actives)
 *   npm run sync:run -- --due          (uniquement celles dont l'intervalle est écoulé, comme le cron)
 *
 * Le script est déclaré dans package.json : `tsx --env-file=.env.local scripts/run-sync.ts`.
 * Les modules serveur importent « server-only », qui lève une erreur hors environnement
 * React Server : on relance donc Node avec la condition d'export `react-server` (le paquet
 * server-only y expose un module vide), en conservant les flags tsx et l'environnement.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function hasReactServerCondition(): boolean {
  const argv = process.execArgv;
  return argv.some((a, i) => a === "--conditions=react-server" || a === "-C=react-server" || ((a === "--conditions" || a === "-C") && argv[i + 1] === "react-server"));
}

function usage(): never {
  console.error("Usage : npm run sync:run -- --connection <uuid> [--scope full|listings|orders] | --all | --due");
  process.exit(2);
}

async function main(): Promise<void> {
  if (!hasReactServerCondition()) {
    const script = fileURLToPath(import.meta.url);
    const result = spawnSync(process.execPath, ["--conditions", "react-server", ...process.execArgv, script, ...process.argv.slice(2)], { stdio: "inherit", env: process.env });
    process.exit(result.status ?? 1);
  }

  const args = process.argv.slice(2);
  const get = (flag: string): string | null => {
    const i = args.indexOf(flag);
    return i >= 0 ? (args[i + 1] ?? null) : null;
  };
  const connectionId = get("--connection");
  const all = args.includes("--all");
  const due = args.includes("--due");
  const scopeArg = get("--scope") ?? "full";
  if (!connectionId && !all && !due) usage();
  if (!["full", "listings", "orders"].includes(scopeArg)) usage();
  const scope = scopeArg as "full" | "listings" | "orders";

  // Imports dynamiques : après la vérification de la condition react-server.
  const { runChannelSync } = await import("@/services/sync/engine");
  const { listDueConnections } = await import("@/services/channels/connection-store");
  const { createAdminSupabaseClient } = await import("@/lib/supabase/admin");

  let targets: Array<{ id: string; provider: string; external_username: string | null }> = [];
  if (connectionId) {
    targets = [{ id: connectionId, provider: "?", external_username: null }];
  } else if (due) {
    targets = await listDueConnections();
  } else {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.from("channel_connections").select("id, provider, external_username").in("status", ["connected", "error"]).order("created_at");
    if (error) throw new Error(error.message);
    targets = data ?? [];
  }

  if (targets.length === 0) {
    console.log("Aucune connexion à synchroniser.");
    return;
  }

  let failures = 0;
  for (const t of targets) {
    const started = Date.now();
    try {
      const r = await runChannelSync(t.id, { trigger: connectionId ? "manual" : "scheduled", scope });
      console.log(JSON.stringify({ connection: t.id, provider: t.provider, username: t.external_username, runId: r.runId, status: r.status, durationMs: r.durationMs, stats: r.stats, errorSummary: r.errorSummary }));
      if (r.status === "failed") failures++;
    } catch (e) {
      failures++;
      console.log(JSON.stringify({ connection: t.id, provider: t.provider, status: "skipped", durationMs: Date.now() - started, error: e instanceof Error ? e.message : String(e) }));
    }
  }
  process.exitCode = failures > 0 ? 1 : 0;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
