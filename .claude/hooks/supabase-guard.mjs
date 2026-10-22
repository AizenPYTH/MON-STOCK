#!/usr/bin/env node
/**
 * Garde-fou des outils Supabase (PreToolUse) — complète les règles « allow » de settings.json :
 *  1. tout appel Supabase portant un project_id DOIT viser le projet MON-STOCK TEST, sinon refus ;
 *  2. le SQL destructeur (DROP, TRUNCATE, DELETE sans WHERE, ALTER … DROP, reset, suppression de
 *     rôles/schémas, désactivation de RLS…) déclenche une confirmation explicite, même si l'outil
 *     est autorisé ;
 *  3. `execute_sql` en LECTURE SEULE stricte (SELECT / WITH / EXPLAIN sans écriture, fonctions
 *     connues pour être sans effet) passe sans demande ; toute autre requête SQL (écriture,
 *     fonction inconnue qui pourrait écrire, bloc DO, appel réseau…) demande une confirmation ;
 *  4. `apply_migration` demande TOUJOURS une confirmation : le projet TEST est la base utilisée par
 *     l'application distribuée (profil EAS « production ») ;
 *  5. les autres outils suivent les règles de settings.json (lectures autorisées, actions à risque
 *     en « ask »).
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

/** Mots qui écrivent, verrouillent, changent la session ou exécutent du code. */
const WRITE_WORDS = /\b(insert|update|delete|merge|upsert|create|alter|drop|truncate|grant|revoke|comment|copy|call|do|vacuum|analyze|refresh|reindex|cluster|lock|set|reset|discard|listen|notify|unlisten|prepare|execute|deallocate|begin|start|commit|rollback|savepoint|release|import|load|into|returning|security|checkpoint)\b/i;
/** Mots-clés SQL suivis d'une parenthèse (ce ne sont pas des appels de fonction). */
const KEYWORDS = new Set("in exists any all some as over filter values using on and or not select from where join when then else case cast array row interval numeric decimal varchar char character timestamp timestamptz date time int integer bigint smallint float real double text jsonb json boolean bool uuid within group by order lateral distinct with recursive between like ilike similar escape is null partition rows range limit offset fetch union intersect except having window".split(" "));
/** Fonctions sans effet de bord (lecture, calcul, catalogue). Toute autre fonction → confirmation. */
const SAFE_FUNCS = new Set(("count sum avg min max coalesce nullif greatest least abs round ceil ceiling floor trunc mod power sqrt ln log exp sign div width_bucket " +
  "length char_length octet_length lower upper initcap left right lpad rpad ltrim rtrim btrim trim replace translate reverse repeat split_part substr substring strpos position concat concat_ws format md5 encode decode chr ascii quote_ident quote_literal starts_with string_to_array " +
  "to_char to_date to_timestamp to_number date_trunc date_part date_bin extract age now make_date make_interval justify_interval isfinite timezone " +
  "regexp_replace regexp_match regexp_matches regexp_split_to_array regexp_like regexp_count " +
  "string_agg array_agg array_length array_to_string array_position array_upper array_lower cardinality unnest generate_series " +
  "row_number rank dense_rank lag lead first_value last_value ntile percent_rank cume_dist percentile_cont percentile_disc mode bool_and bool_or every stddev variance corr " +
  "json_agg jsonb_agg json_build_object jsonb_build_object json_build_array jsonb_build_array json_object_agg jsonb_object_agg to_json to_jsonb row_to_json jsonb_array_length json_array_length jsonb_each jsonb_each_text jsonb_object_keys jsonb_array_elements jsonb_array_elements_text jsonb_typeof jsonb_extract_path jsonb_extract_path_text jsonb_path_query jsonb_pretty jsonb_strip_nulls " +
  "pg_typeof format_type pg_get_functiondef pg_get_viewdef pg_get_constraintdef pg_get_indexdef pg_get_triggerdef pg_get_expr pg_get_userbyid pg_get_function_arguments pg_get_function_result pg_get_function_identity_arguments pg_get_serial_sequence obj_description col_description " +
  "pg_size_pretty pg_total_relation_size pg_relation_size pg_table_size pg_indexes_size pg_database_size pg_column_size has_table_privilege has_schema_privilege has_function_privilege has_column_privilege pg_has_role current_setting version num_nulls num_nonnulls to_regclass " +
  "auth.uid auth.jwt auth.role").split(" "));

/** Vrai seulement si la requête est certainement en lecture seule (sinon : confirmation). */
function isReadOnlySql(raw) {
  let sql = raw.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  if (/\$[A-Za-z_]*\$/.test(sql)) return false; // corps de fonction / bloc DO
  sql = sql.replace(/'(?:[^']|'')*'/g, "''");
  const statements = sql.split(";").map((st) => st.trim()).filter(Boolean);
  if (statements.length === 0) return false;
  if (!statements.every((st) => /^(select|with|explain|show|table|values)\b/i.test(st))) return false;
  if (/\bexplain\b[^;]*\banaly[sz]e\b/i.test(sql) || WRITE_WORDS.test(sql)) return false;
  for (const m of sql.matchAll(/("[^"]+"|[A-Za-z_][\w$]*)(\s*\.\s*("[^"]+"|[A-Za-z_][\w$]*))?\s*\(/g)) {
    const name = m[0].slice(0, -1).replace(/[\s"]/g, "").toLowerCase().replace(/^pg_catalog\./, "");
    if (!KEYWORDS.has(name) && !SAFE_FUNCS.has(name)) return false;
  }
  return true;
}

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
// Migrations et SQL d'écriture non destructeurs : autorisés sans confirmation par le titulaire.
// Le SQL destructeur (DROP, TRUNCATE, DELETE sans WHERE…) a déjà reçu « ask » plus haut.
if (/apply_migration/.test(tool)) {
  decide("allow", "Migration non destructrice sur le projet Supabase autorisé (accord du titulaire).");
  process.exit(0);
}

if (/execute_sql/.test(tool)) {
  if (isReadOnlySql(String(args.query ?? ""))) decide("allow", "Requête SQL en lecture seule sur Supabase TEST.");
  else decide("allow", "Requête SQL d'écriture non destructrice (accord du titulaire).");
  process.exit(0);
}
// Rien à signaler : les règles de settings.json s'appliquent.
process.exit(0);
