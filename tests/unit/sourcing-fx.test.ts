import { describe, expect, it } from "vitest";
import { parseEcbXml, crossRate } from "@/services/sourcing/ecb-parser";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
<gesmes:subject>Reference rates</gesmes:subject>
<Cube><Cube time="2026-10-06"><Cube currency="USD" rate="1.0850"/><Cube currency="GBP" rate="0.8420"/><Cube currency="JPY" rate="162.50"/></Cube></Cube>
</gesmes:Envelope>`;

describe("ECB rates", () => {
  it("parse le flux quotidien", () => {
    const r = parseEcbXml(XML);
    expect(r.date).toBe("2026-10-06");
    expect(r.rates.USD).toBe(1.085);
    expect(r.rates.EUR).toBe(1);
  });
  it("calcule un taux croisé et retourne null si une devise manque", () => {
    const { rates } = parseEcbXml(XML);
    expect(crossRate(rates, "USD", "EUR")).toBeCloseTo(1 / 1.085, 5);
    expect(crossRate(rates, "USD", "GBP")).toBeCloseTo(0.842 / 1.085, 5);
    expect(crossRate(rates, "CHF", "EUR")).toBeNull();
  });
  it("rejette un flux illisible", () => {
    expect(() => parseEcbXml("<x/>")).toThrow();
  });
});
