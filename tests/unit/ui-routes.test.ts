import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Intégrité de la navigation : chaque cible interne écrite dans le code (href, ButtonLink,
 * redirect, revalidatePath, liens d'action) correspond à une route existante de src/app.
 */
const ROOT = path.resolve(__dirname, "../..");
const APP = path.join(ROOT, "src/app");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

function routePatterns(): RegExp[] {
  return walk(APP)
    .filter((f) => /\/(page\.tsx|route\.ts)$/.test(f))
    .map((f) => {
      const segs = path
        .relative(APP, path.dirname(f))
        .split(path.sep)
        .filter((s) => s && !/^\(.*\)$/.test(s));
      const re = segs.map((s) => (/^\[.*\]$/.test(s) ? "[^/]+" : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("/");
      return new RegExp(`^/${re}/?$`);
    });
}

/** Cibles internes trouvées dans le code ; `${…}` devient un segment générique. */
function internalTargets(): Array<{ file: string; target: string }> {
  const files = walk(path.join(ROOT, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
  const out: Array<{ file: string; target: string }> = [];
  const re = /(?:href\s*[=:]\s*\{?\s*|redirect\(\s*|revalidatePath\(\s*|redirect_to:\s*)(["'`])(\/[^"'`]*)\1/g;
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(re)) {
      const raw = m[2]!;
      if (raw.startsWith("//")) continue;
      const target = raw
        .replace(/\$\{[^}]*\}/g, "x")
        .split(/[?#]/)[0]!;
      out.push({ file: path.relative(ROOT, file), target: target || "/" });
    }
  }
  return out;
}

describe("intégrité des liens internes", () => {
  const patterns = routePatterns();
  const targets = internalTargets();

  it("trouve des routes et des liens à vérifier", () => {
    expect(patterns.length).toBeGreaterThan(30);
    expect(targets.length).toBeGreaterThan(100);
  });

  it("détecte une cible inexistante", () => {
    expect(patterns.some((re) => re.test("/stock/x/inexistant"))).toBe(false);
    expect(patterns.some((re) => re.test("/stock/x/edit"))).toBe(true);
  });

  it("chaque lien interne pointe vers une route existante", () => {
    const broken = targets.filter(({ target }) => !patterns.some((re) => re.test(target)));
    expect(broken).toEqual([]);
  });
});
