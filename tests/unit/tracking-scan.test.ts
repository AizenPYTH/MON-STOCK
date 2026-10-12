import { describe, expect, it } from "vitest";
import { canonicalTrackingNumber, colissimoCheckDigit, detectCarriers, extractTrackingFromScan } from "@/domain/tools/tracking";

describe("lecture des codes-barres scannés", () => {
  it("Lettre suivie La Poste : 14 chiffres extraits du code enrichi « % »", () => {
    expect(extractTrackingFromScan("%000000088000157045824600250A18^")).toEqual({ number: "88000157045824", carrier: "laposte", source: "laposte_letter" });
    // exemple publié par La Poste (fiche Smart Data Lettre suivie)
    expect(extractTrackingFromScan("%000000087000635587726600250A18")?.number).toBe("87000635587726");
  });
  it("Colissimo : ID13 reconstitué (code produit + série + clé recalculée)", () => {
    expect(colissimoCheckDigit("0000148195")).toBe(2); // exemple de la note GeoLabel : 9V 00001 48195 2
    expect(extractTrackingFromScan("%0075001119V0000148195802250")).toEqual({ number: "9V00001481952", carrier: "colissimo", source: "colissimo_label" });
    expect(colissimoCheckDigit("123")).toBeNull();
  });
  it("numéro lu tel quel (Code 128 classique), espaces et caractères de contrôle retirés", () => {
    expect(extractTrackingFromScan("6A 1898 7970 674")).toMatchObject({ number: "6A18987970674", source: "direct" });
    expect(extractTrackingFromScan("\u001dXW123456785FR\r")).toMatchObject({ number: "XW123456785FR", source: "direct" });
    expect(extractTrackingFromScan("1Z5R89390357567127")).toMatchObject({ carrier: "ups" });
  });
  it("numéro retrouvé dans un code 2D composite (Chronopost / international S10)", () => {
    expect(extractTrackingFromScan("DEST:75011;REF=CMD42;LT=XW123456785FR;POIDS=1.2")).toMatchObject({ number: "XW123456785FR", source: "s10" });
    expect(extractTrackingFromScan("ref 6A18987970674 / 1kg")).toMatchObject({ number: "6A18987970674", carrier: "colissimo" });
    expect(extractTrackingFromScan("https://exemple.fr/?a=1")).toBeNull();
    expect(extractTrackingFromScan("   ")).toBeNull();
  });
  it("Lettre suivie saisie avec sa clé : clé retirée (doublons, API) ; reconnue La Poste", () => {
    expect(canonicalTrackingNumber("88000157045824E")).toBe("88000157045824");
    expect(canonicalTrackingNumber("6A18987970674")).toBe("6A18987970674");
    expect(detectCarriers("88000157045824E")[0]).toMatchObject({ carrier: "laposte" });
    expect(extractTrackingFromScan("88000157045824E")).toMatchObject({ number: "88000157045824", carrier: "laposte" });
  });
});
