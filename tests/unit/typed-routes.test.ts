/**
 * W-22 : `typedRoutes` n'est plus contourné par `as never` dans le code web. Les liens littéraux et
 * gabarits sont vérifiés par le compilateur (tsconfig inclut `.next/types`) ; les chemins calculés
 * passent par `internalRoute` / `safeInternalRoute` (src/lib/routes.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { internalRoute, safeInternalRoute } from "@/lib/routes";

const ROOT = path.resolve(import.meta.dirname, "../..");

function files(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe("W-22 : routes typées", () => {
  it("aucun `as never` sur un lien, une navigation ou une redirection (src/app, src/components, src/features)", () => {
    const offenders: string[] = [];
    for (const dir of ["src/app", "src/components", "src/features"]) {
      for (const f of files(path.join(ROOT, dir))) {
        fs.readFileSync(f, "utf8")
          .split("\n")
          .forEach((line, i) => {
            if (/as never(?![\w[])/.test(line) && /href=|\.push\(|\.replace\(|redirect\(/.test(line)) offenders.push(`${path.relative(ROOT, f)}:${i + 1}`);
          });
      }
    }
    expect(offenders).toEqual([]);
  });

  it("tsconfig inclut les types de routes générés par la build (et exclut ceux, périmés, de next dev)", () => {
    const tsconfig = JSON.parse(fs.readFileSync(path.join(ROOT, "tsconfig.json"), "utf8")) as { include: string[]; exclude: string[] };
    expect(tsconfig.include).toContain(".next/types/**/*.ts");
    expect(tsconfig.exclude).not.toContain(".next");
    expect(tsconfig.exclude).toContain(".next/dev");
  });

  it("safeInternalRoute assainit (`next` venu de l'extérieur), internalRoute conserve le chemin", () => {
    expect(safeInternalRoute("/stock?q=1")).toBe("/stock?q=1");
    expect(safeInternalRoute("//evil.example")).toBe("/dashboard");
    expect(safeInternalRoute("/\\evil.example", "/onboarding")).toBe("/onboarding");
    expect(safeInternalRoute(undefined)).toBe("/dashboard");
    expect(internalRoute("/stock?page=2")).toBe("/stock?page=2");
  });
});
