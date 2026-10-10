#!/usr/bin/env node
/**
 * Garde-fou des outils Supabase (PreToolUse) — complète les règles « allow » de settings.json :
 *  1. tout appel Supabase portant un project_id DOIT viser le projet MON-STOCK TEST, sinon refus ;
 *  2. le SQL destructeur (DROP, TRUNCATE, DELETE sans WHERE, ALTER … DROP, reset, suppression de
 *     rôles/schémas, désactivation de RLS…) déclenche une confirmation explicite, même si l'outil
 *     est autorisé ;
 *  3. tout le reste (lectures, migrations additives) passe sans demande.
 * Entrée : JSON du hook sur stdin. Sortie : décision JSON (ou rien = comportement par défaut).
 */
const TEST_PROJECT = "ccywsegdowikeirbsfae";

const DESTRUCTIVE = [
  [/\bdrop\s+(table|schema|database|function|view|materialized\s+view|type|index|trigger|policy|extension|role|column|constraint|sequence)\b/i, "DROP"],
  [/\btruncate\b/i, "TRUNCATE"],
  [/\balter\s+table\s+[^;]*\bdrop\b/i, "ALTER TABLE … DROP"],
  [/\bdisable\s+row\s+level\s+security\b/i, "désactivation de la RLS"],
  [/\bno\s+force\s+row\s+level\s+security\b/i, "RLS non forcée"],
  [/\bvault\.(update_secret|delete)|\bdelete\s+from\s+vault\./i, "modification des secrets Vault"],
  [/\bcron\.unschedule\b/i, "suppression de tâche planifiée"],
  [/\bupdate\s+(public\.)?(organizations|organization_members|inventory|skus|products)\b(?![^;]*\bwhere\b)/i, "UPDATE sans WHERE"],
];

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
  });
}

function decide(decision, reason) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: decision, permissionDecisionReason: reason } }));
}

const input = JSON.parse((await readStdin()) || "{}");
const tool = String(input.tool_name ?? "");
const args = input.tool_input ?? {};

if (args.project_id !== undefined && args.project_id !== TEST_PROJECT) {
  decide("deny", `Projet Supabase refusé (${args.project_id}) : seul MON-STOCK TEST (${TEST_PROJECT}) est autorisé.`);
  process.exit(0);
}

if (/execute_sql|apply_migration/.test(tool)) {
  // Commentaires SQL retirés avant l'analyse (un « -- drop » en commentaire ne compte pas).
  const sql = String(args.query ?? "").replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  // DELETE sans WHERE (instruction par instruction) = suppression massive.
  if (sql.split(";").some((st) => /^\s*delete\s+from\b/i.test(st) && !/\bwhere\b/i.test(st))) {
    decide("ask", "SQL potentiellement destructeur (DELETE sans WHERE) sur Supabase TEST : confirmation requise.");
    process.exit(0);
  }
  for (const [re, label] of DESTRUCTIVE) {
    if (re.test(sql)) {
      decide("ask", `SQL potentiellement destructeur (${label}) sur Supabase TEST : confirmation requise.`);
      process.exit(0);
    }
  }
}
// Rien à signaler : les règles allow de settings.json s'appliquent.
process.exit(0);
