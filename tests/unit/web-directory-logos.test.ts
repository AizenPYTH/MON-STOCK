import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { logoForDomain, logoForName, supplierLogoUrl } from "@/features/directory/logos";
import { SUPPLIER_LOGO_DOMAINS } from "@/data/supplier-logos.web";

/** Logos du site : mêmes règles que l'application iPhone, fichiers réellement présents dans public/. */
describe("logos fournisseurs (web)", () => {
  it("chaque domaine du registre a son fichier dans public/suppliers", () => {
    expect(SUPPLIER_LOGO_DOMAINS.length).toBeGreaterThan(50);
    for (const d of SUPPLIER_LOGO_DOMAINS) expect(existsSync(path.join(process.cwd(), "public/supplier-logos", `${d}.png`)), d).toBe(true);
  });

  it("domaine, sous-domaine www, domaine racine ; rien d'approximatif", () => {
    const d = SUPPLIER_LOGO_DOMAINS[0]!;
    expect(logoForDomain(d)).toBe(`/supplier-logos/${d}.png`);
    expect(logoForDomain(`www.${d}`)).toBe(`/supplier-logos/${d}.png`);
    expect(logoForDomain("inconnu.example")).toBeNull();
    expect(logoForDomain(null)).toBeNull();
  });

  it("par nom : premier libellé exact uniquement, initiales sinon", () => {
    const d = SUPPLIER_LOGO_DOMAINS.find((x) => (x.split(".")[0] ?? "").length >= 3)!;
    const label = d.split(".")[0]!;
    expect(logoForName(label.toUpperCase())).toBe(`/supplier-logos/${d}.png`);
    expect(logoForName("ab")).toBeNull();
    expect(supplierLogoUrl(null, "Fournisseur qui n'existe pas")).toBeNull();
  });
});
