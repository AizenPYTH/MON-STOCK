#!/usr/bin/env node
/**
 * Garde-fou des commandes shell (PreToolUse, outil Bash) — complète les règles de settings.json.
 *
 * Les règles « allow » ne voient que le début de la commande : `npm run x` est autorisé sans que
 * Claude Code regarde ce que fait le script `x`. Ce garde-fou lit la commande ENTIÈRE (y compris
 * `bash -c "…"`, les pipes et les `&&`) ET le contenu des scripts npm / shell qu'elle lance, et
 * force une confirmation explicite (« ask ») pour toute opération risquée :
 *  - build distant / soumission / mise à jour EAS, secrets ou variables EAS ;
 *  - CLI Supabase : migration poussée, reset, déploiement de fonction, secrets, liaison de projet ;
 *  - déploiement Vercel, publication npm, workflow GitHub, secrets GitHub, fusion de PR ;
 *  - git push forcé, suppression de branche distante, envoi de tags (un tag `testflight-*`
 *    déclenche la build TestFlight), push vers une autre branche que `claude/…` ;
 *  - perte de travail locale (reset --hard, clean -f, rm -rf hors des dossiers de sortie) ;
 *  - base de données : DROP DATABASE, connexion psql à une base distante, script lancé avec les
 *    variables réelles (.env.local) ;
 *  - écriture dans un fichier .env ou dans la configuration Claude Code (.claude/).
 * Rien à signaler → aucune sortie : les règles de settings.json s'appliquent normalement.
 * En cas d'erreur interne, le garde-fou ne bloque rien (comportement par défaut de Claude Code).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const RISKY = [
  [/\b(eas|eas-cli)\s+(build|submit|update|secret|env:(create|update|delete|push)|credentials|workflow:run|channel:(create|edit|delete)|branch:delete|device:delete|project:delete|deploy)\b/i, "opération EAS distante (build, soumission, mise à jour, secrets)"],
  [/\bsupabase\s+(db\s+(push|reset)|functions\s+(deploy|delete)|secrets\s+(set|unset)|link|migration\s+(repair|up|squash)|projects\s+(create|delete)|branches\s+(create|delete|update)|storage\s+rm|config\s+push|sso)\b/i, "CLI Supabase : modification du projet distant"],
  [/(^|[\s;&|(])vercel(?=\s|$)(?!\s+(ls|list|inspect|logs|whoami|help|--version|-v)\b)/i, "commande Vercel (déploiement possible)"],
  [/\bnpm\s+(publish|unpublish|deprecate|dist-tag|owner|token)\b/i, "publication npm"],
  [/\bgh\s+(workflow\s+run|run\s+rerun|secret|variable\s+(set|delete)|release\s+(create|delete|upload|edit)|pr\s+merge|repo\s+(delete|edit|rename|archive)|api\b[^|;&]*-X\s*(POST|PUT|PATCH|DELETE))/i, "action GitHub distante (workflow, secrets, publication, fusion)"],
  [/\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f|checkout\s+--\s+\.|restore\s+(--staged\s+)?\.(\s|$)|stash\s+(drop|clear)|branch\s+-D|filter-branch|update-ref\s+-d|reflog\s+expire)/i, "perte de travail local (git)"],
  [/\bdrop\s+database\b/i, "suppression de base de données"],
  [/--env-file=\S*\.env(?!\.example)\b/i, "script lancé avec les variables réelles (.env.local) : peut écrire dans une base ou un service distant"],
  [/(^|[\s;&|])(>|>>|tee(\s+-a)?)\s*\S*\.env(\.[\w-]+)?(\s|$)/i, "écriture dans un fichier .env (secrets)"],
  [/(^|[\s;&|])((>|>>|tee(\s+-a)?)\s*|(sed|perl)\s+-i\S*\s+[^;&|]*|(cp|mv|rm|ln|chmod)\s+[^;&|]*)\S*\.claude\/(settings|hooks)/i, "modification de la configuration Claude Code (permissions, garde-fous)"],
  [/\b(pg_dump|pg_restore|psql)\b[^;&|]*(supabase\.(co|com)|pooler\.|postgres(ql)?:\/\/(?!(postgres(:[^@]*)?@)?(localhost|127\.0\.0\.1)[:/]))/i, "connexion à une base PostgreSQL distante"],
  [/\bcurl\b(?![^;&|]*\b(localhost|127\.0\.0\.1)\b)[^;&|]*(\s-X\s*(POST|PUT|PATCH|DELETE)\b|\s--request\s+(POST|PUT|PATCH|DELETE)\b|\s(-d|--data\S*|-F|--form|-T|--upload-file)\s)/i, "requête HTTP d'écriture vers un service distant"],
];

/** Branches distantes autorisées sans confirmation : les branches de travail `claude/…`. */
const WORK_BRANCH = /^(HEAD:)?(refs\/heads\/)?claude\/[\w.\/-]+$/;
/**
 * Branches qui déclenchent un déploiement de production (Vercel publie la production à chaque
 * push) : jamais sans confirmation, même si elles ont la forme d'une branche de travail.
 */
const PRODUCTION_BRANCHES = new Set(["main", "master", "claude/laughing-bardeen-bdn16j"]);
const branchName = (ref) => ref.replace(/^HEAD:/, "").replace(/^refs\/heads\//, "");

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
  });
}

function ask(reason, command) {
  const short = command.length > 160 ? `${command.slice(0, 157)}…` : command;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: `Confirmation requise — ${reason} : ${short}` } }));
  process.exit(0);
}

/** Découpe grossière en commandes simples (&&, ||, ;, |, retours à la ligne). */
const segmentsOf = (cmd) => cmd.split(/&&|\|\||[;|\n]/).map((s) => s.trim()).filter(Boolean);
const tokensOf = (seg) => (seg.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((t) => t.replace(/^["']|["']$/g, ""));

function checkGitPush(seg) {
  const t = tokensOf(seg);
  const i = t.findIndex((x, k) => x === "push" && t.slice(0, k).includes("git"));
  if (i < 0) return null;
  const args = t.slice(i + 1);
  const OK_FLAGS = new Set(["-u", "--set-upstream", "-q", "--quiet", "-v", "--verbose", "--porcelain", "--progress"]);
  const flags = args.filter((a) => a.startsWith("-"));
  const bad = flags.find((f) => !OK_FLAGS.has(f));
  if (bad) return `git push avec l'option ${bad}`;
  const positional = args.filter((a) => !a.startsWith("-") && !/^\d?>/.test(a) && a !== "2>&1");
  const [remote, ...refs] = positional;
  if (remote && remote !== "origin") return `git push vers le dépôt « ${remote} »`;
  if (refs.length === 0) return "git push sans branche explicite";
  const prod = refs.find((r) => PRODUCTION_BRANCHES.has(branchName(r)));
  if (prod) return `git push de « ${prod} », branche de production (chaque push publie le site)`;
  const other = refs.find((r) => !WORK_BRANCH.test(r));
  if (other) return `git push de « ${other} » (seules les branches de travail claude/… passent sans confirmation ; un tag testflight-* lance une build TestFlight)`;
  return null;
}

/** rm -r -f : autorisé seulement sur des dossiers de sortie régénérables. */
function checkRm(seg) {
  const t = tokensOf(seg);
  const i = t.indexOf("rm");
  if (i < 0) return null;
  const args = t.slice(i + 1);
  const opts = args.filter((a) => a.startsWith("-")).join("");
  if (!/r|R|--recursive/.test(opts)) return null;
  const targets = args.filter((a) => !a.startsWith("-"));
  const SAFE = /^(\.\/)?((apps\/mobile\/)?dist(\/|$)|(apps\/mobile\/)?\.expo(\/|$)|node_modules\/\.cache(\/|$)|\.next(\/|$)|coverage(\/|$)|\/tmp\/)/;
  const unsafe = targets.find((x) => !SAFE.test(x) || x.includes(".."));
  return unsafe ? `suppression récursive de « ${unsafe} »` : null;
}

/** Contenu des scripts npm lancés (récursif, avec pre/post), lu dans le package.json du bon dossier. */
function npmScriptBodies(seg, cwd, depth = 0, seen = new Set()) {
  if (depth > 4) return [];
  const t = tokensOf(seg);
  const n = t.indexOf("npm");
  if (n < 0) return [];
  let dir = cwd;
  const rest = t.slice(n + 1);
  for (let k = 0; k < rest.length; k++) {
    if ((rest[k] === "--prefix" || rest[k] === "-C") && rest[k + 1]) dir = path.resolve(cwd, rest[k + 1]);
  }
  const cmdIdx = rest.findIndex((x) => ["run", "run-script", "test", "t", "start", "restart", "stop"].includes(x));
  if (cmdIdx < 0) return [];
  const verb = rest[cmdIdx];
  const name = verb === "run" || verb === "run-script" ? rest[cmdIdx + 1] : verb === "t" ? "test" : verb;
  if (!name) return [];
  const pkgFile = path.join(dir, "package.json");
  if (!existsSync(pkgFile)) return [];
  const scripts = JSON.parse(readFileSync(pkgFile, "utf8")).scripts ?? {};
  const out = [];
  for (const s of [`pre${name}`, name, `post${name}`]) {
    const key = `${pkgFile}#${s}`;
    if (!scripts[s] || seen.has(key)) continue;
    seen.add(key);
    out.push({ body: scripts[s], cwd: dir });
    for (const sub of segmentsOf(scripts[s])) out.push(...npmScriptBodies(sub, dir, depth + 1, seen));
  }
  return out;
}

/** Contenu des scripts shell lancés directement (`bash x.sh`, `sh x.sh`, `./x.sh`). */
function shellScriptBodies(seg, cwd) {
  const t = tokensOf(seg);
  const file = t[0] === "bash" || t[0] === "sh" ? t.find((x, k) => k > 0 && !x.startsWith("-")) : /\.sh$/.test(t[0] ?? "") ? t[0] : null;
  if (!file) return [];
  const p = path.resolve(cwd, file);
  return existsSync(p) ? [{ body: readFileSync(p, "utf8"), cwd: path.dirname(p) }] : [];
}

/** Texte non exécuté retiré avant l'analyse : corps des heredocs (sauf s'ils alimentent un
 *  interpréteur) et arguments entre guillemets des commandes qui ne font qu'afficher ou chercher
 *  (message de commit, motif de grep…). Évite de demander une confirmation pour un simple texte. */
function scrub(command) {
  const noHeredoc = command.replace(/^([^\n]*)<<-?\s*(['"]?)(\w+)\2[^\n]*\n[\s\S]*?\n\s*\3\s*(?=\n|$)/gm, (m, head) => (/\b(bash|sh|zsh|psql|node|python3?)\b/.test(head) ? m : `${head}<<_`));
  return segmentsOf(noHeredoc)
    .map((seg) => (/^(grep|rg|echo|printf|git\s+(commit|log|grep|show|tag\s+-l))\b/.test(seg) ? seg.replace(/"[^"]*"|'[^']*'/g, '""') : seg))
    .join(" ; ");
}

function inspect(raw, cwd, depth = 0) {
  const command = scrub(raw);
  for (const [re, label] of RISKY) if (re.test(command)) ask(label, raw);
  let dir = cwd;
  for (const seg of segmentsOf(command)) {
    const cd = seg.match(/^cd\s+("[^"]+"|'[^']+'|\S+)$/);
    if (cd) {
      dir = path.resolve(dir, cd[1].replace(/^["']|["']$/g, ""));
      continue;
    }
    const push = checkGitPush(seg);
    if (push) ask(push, raw);
    const rm = checkRm(seg);
    if (rm) ask(rm, raw);
    if (depth < 4) {
      for (const { body, cwd: d } of [...npmScriptBodies(seg, dir), ...shellScriptBodies(seg, dir)]) {
        for (const [re, label] of RISKY) if (re.test(body)) ask(`${label} (dans le script lancé)`, raw);
        for (const sub of segmentsOf(body)) {
          const p = checkGitPush(sub);
          if (p) ask(`${p} (dans le script lancé)`, raw);
          const r = checkRm(sub);
          if (r) ask(`${r} (dans le script lancé)`, raw);
        }
        inspect(body.replace(/^#!.*\n/, ""), d, depth + 1);
      }
    }
  }
}

try {
  const input = JSON.parse((await readStdin()) || "{}");
  const command = String(input.tool_input?.command ?? "");
  const cwd = String(input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
  // `bash -c "…"` / `sh -c '…'` : la commande interne est analysée comme une commande normale.
  const inner = [...command.matchAll(/\b(?:bash|sh|zsh)\s+-c\s+("([^"]*)"|'([^']*)')/g)].map((m) => m[2] ?? m[3]);
  for (const c of [command, ...inner]) inspect(c, cwd);
} catch (e) {
  // Garde-fou défaillant : on ne laisse rien passer sans confirmation (échec « fermé »).
  ask(`garde-fou indisponible (${e instanceof Error ? e.message.slice(0, 80) : "erreur"})`, "commande non analysée");
}
process.exit(0);
