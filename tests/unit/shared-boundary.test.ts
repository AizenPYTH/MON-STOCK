import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Frontière web / mobile. L'application Expo (apps/mobile) importe directement des modules de
 * src/ (`@/…`). Chacun de ces modules — et tout ce qu'ils importent, transitivement — doit rester
 * PUR : pas de code serveur (server-only, client service_role, secrets, réseau), pas de Next.js,
 * pas de DOM/React web, pas de Node. Sinon le bundle mobile embarquerait du code serveur, ou
 * casserait à l'exécution sur le téléphone.
 */
const ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(ROOT, "src");
const MOBILE_SRC = path.join(ROOT, "apps/mobile/src");

/** Dépendances externes autorisées dans un module partagé. */
const ALLOWED_PACKAGES = new Set(["zod"]);
/** Modules internes interdits même s'ils n'importent rien d'interdit (accès privilégiés). */
const FORBIDDEN_INTERNAL = [/^@\/lib\/supabase\/(server|admin|bearer|proxy)$/, /^@\/lib\/(env|crypto|logger|cron-auth)$/, /^@\/features\/[^/]+\/(actions|queries|dal)$/, /^@\/app\//];

const IMPORT_RE = /(?:^|\n)\s*(import|export)\s+(type\s+)?(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/g;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

function resolveAlias(spec: string): string | null {
  const base = path.join(SRC, spec.slice(2));
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function runtimeImports(file: string): Array<{ spec: string; typeOnly: boolean }> {
  const text = readFileSync(file, "utf8");
  const out: Array<{ spec: string; typeOnly: boolean }> = [];
  for (const m of text.matchAll(IMPORT_RE)) out.push({ spec: m[3]!, typeOnly: Boolean(m[2]) });
  return out;
}

function sharedEntryPoints(): string[] {
  const specs = new Set<string>();
  for (const f of walk(MOBILE_SRC)) for (const { spec } of runtimeImports(f)) if (spec.startsWith("@/")) specs.add(spec);
  return [...specs].sort();
}

describe("frontière des modules partagés avec l'application mobile", () => {
  const entries = sharedEntryPoints();

  it("le mobile importe bien des modules partagés (sinon ce test ne protège rien)", () => {
    expect(entries.length).toBeGreaterThan(5);
  });

  it("chaque module partagé (et ses dépendances) est pur", () => {
    const problems: string[] = [];
    const seen = new Set<string>();
    const queue: Array<{ spec: string; from: string }> = entries.map((spec) => ({ spec, from: "apps/mobile" }));
    while (queue.length > 0) {
      const { spec, from } = queue.shift()!;
      if (FORBIDDEN_INTERNAL.some((re) => re.test(spec))) {
        problems.push(`${from} → ${spec} (module serveur ou web interdit)`);
        continue;
      }
      const file = resolveAlias(spec);
      if (!file) {
        problems.push(`${from} → ${spec} (introuvable)`);
        continue;
      }
      if (seen.has(file)) continue;
      seen.add(file);
      const rel = path.relative(ROOT, file);
      const text = readFileSync(file, "utf8");
      if (/^\s*["']use (server|client)["']/m.test(text)) problems.push(`${rel} : directive "use server/client"`);
      if (file.endsWith(".tsx")) problems.push(`${rel} : composant web (.tsx) partagé`);
      for (const { spec: dep, typeOnly } of runtimeImports(file)) {
        if (dep.startsWith("@/")) {
          // Les imports de TYPES sont effacés à la compilation : ils n'embarquent rien.
          if (!typeOnly) queue.push({ spec: dep, from: rel });
          continue;
        }
        if (dep.startsWith(".")) {
          problems.push(`${rel} → ${dep} (import relatif : utiliser l'alias @/)`);
          continue;
        }
        if (typeOnly) continue;
        if (!ALLOWED_PACKAGES.has(dep)) problems.push(`${rel} → ${dep} (dépendance non autorisée côté mobile)`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("le mobile ne lit que des variables EXPO_PUBLIC_* et jamais un secret ou le client service_role", () => {
    const offenders: string[] = [];
    for (const f of walk(MOBILE_SRC)) {
      const text = readFileSync(f, "utf8");
      const rel = path.relative(ROOT, f);
      for (const m of text.matchAll(/process\.env\.([A-Z0-9_]+)/g)) if (!m[1]!.startsWith("EXPO_PUBLIC_")) offenders.push(`${rel} : process.env.${m[1]}`);
      for (const m of text.matchAll(/SUPABASE_SERVICE_ROLE_KEY|TOKEN_ENCRYPTION_KEY|EBAY_CLIENT_SECRET|CRON_SECRET|createAdminSupabaseClient/g)) offenders.push(`${rel} : ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });
});
