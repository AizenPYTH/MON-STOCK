import { describe, expect, it } from "vitest";
import { LEGAL, LEGAL_REQUIRED_FIELDS, missingLegalFields, PROCESSORS } from "@/content/legal";

const complete = {
  publisher: "Société",
  legalForm: "SAS",
  address: "1 rue",
  registration: "000",
  publicationDirector: "Nom",
  contactEmail: "contact@exemple.fr",
};

describe("missingLegalFields", () => {
  it("ne signale rien quand tout est rempli", () => {
    expect(missingLegalFields(complete)).toEqual([]);
  });

  it("signale les champs absents ou vides", () => {
    expect(missingLegalFields({ ...complete, address: null, contactEmail: "  " })).toEqual(["address", "contactEmail"]);
  });

  it("reflète l'état réel : aucune donnée d'éditeur n'est inventée", () => {
    const filled = Object.keys(LEGAL_REQUIRED_FIELDS).filter((k) => LEGAL[k as keyof typeof LEGAL]);
    expect(missingLegalFields().length).toBe(Object.keys(LEGAL_REQUIRED_FIELDS).length - filled.length);
  });
});

describe("PROCESSORS", () => {
  it("cite les prestataires appelés par le code", () => {
    const names = PROCESSORS.map((p) => p.name).join(" | ");
    for (const n of ["Supabase", "Vercel", "OpenAI", "eBay", "Sendcloud", "Packlink", "La Poste", "Ship24", "DHL", "Brave"]) {
      expect(names).toContain(n);
    }
  });
});
