import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Logos de marques (application mobile) : tout fichier de apps/mobile/assets/brands doit être
 * référencé par le registre ET la marque correspondante doit avoir le statut « authorized »
 * (autorisation écrite). Aujourd'hui : aucun fichier, aucune autorisation.
 */
const root = path.resolve(__dirname, "../..");
const dir = path.join(root, "apps/mobile/assets/brands");
const registry = readFileSync(path.join(root, "apps/mobile/src/brands/registry.ts"), "utf8");

describe("logos de marques embarqués", () => {
  it("aucun fichier de logo sans référence au registre", () => {
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => !f.startsWith(".") && f !== "README.md") : [];
    for (const f of files) expect(registry).toContain(`assets/brands/${f.replace(/@[23]x(?=\.)/, "")}`);
    expect(files).toEqual([]);
  });

  it("aucune marque n'est marquée « authorized » tant qu'aucune autorisation n'est archivée", () => {
    expect(registry).not.toMatch(/status:\s*"authorized"/);
    expect(registry).toMatch(/const LOGOS: Partial<Record<BrandId, BrandLogo>> = \{\};/);
  });
});
