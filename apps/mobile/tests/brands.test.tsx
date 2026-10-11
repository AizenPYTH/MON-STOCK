import { render, screen } from "@testing-library/react-native";
import { BRAND_DISCLAIMER, BRANDS, brandById, brandFromText, canShowLogo, type BrandEntry } from "~/brands/registry";
import { BrandDisclaimer, BrandMark } from "~/components/ui";

/**
 * Identité des marques tierces : aucun logo sans autorisation écrite enregistrée au registre,
 * présentation typographique neutre sinon, aucune mention d'affiliation, correspondance des
 * noms libres (devis, grilles, transporteurs) vers le registre.
 */

describe("registre des marques", () => {
  it("chaque marque documente son statut d'usage, la date de vérification et une note", () => {
    for (const b of Object.values(BRANDS)) {
      expect(b.usage.checkedAt).toBe("2026-10-11");
      expect(b.usage.note.length).toBeGreaterThan(10);
      expect(["authorized", "permission_required", "official_kit_unverified", "no_public_terms"]).toContain(b.usage.status);
    }
  });

  it("aucun logo n'est affiché sans autorisation : état actuel, aucune autorisation détenue", () => {
    for (const b of Object.values(BRANDS)) {
      expect(canShowLogo(b)).toBe(false);
      if (b.logo) expect(b.usage.status).toBe("authorized");
    }
    // le contenu du dossier assets/brands est contrôlé par tests/unit/brand-assets.test.ts (racine)
  });

  it("marques vérifiées en priorité : statuts exacts", () => {
    expect(BRANDS.ebay).toMatchObject({ name: "eBay", usage: { status: "permission_required" } });
    expect(BRANDS.colissimo.usage.status).toBe("official_kit_unverified");
    expect(BRANDS.laposte.usage.status).toBe("official_kit_unverified");
    for (const id of ["chronopost", "mondial_relay", "sendcloud", "packlink", "boxtal"] as const) expect(BRANDS[id].usage.status).toBe("no_public_terms");
  });

  it("noms libres → marque (mots entiers, alias le plus long), inconnu → null", () => {
    expect(brandFromText("Colissimo Expert")?.id).toBe("colissimo");
    expect(brandFromText("Chrono Relais 13")?.id).toBe("chronopost");
    expect(brandFromText("MONDIAL RELAY – Point Relais")?.id).toBe("mondial_relay");
    expect(brandFromText("Lettre suivie")?.id).toBe("laposte");
    expect(brandFromText("UPS Standard")?.id).toBe("ups");
    expect(brandFromText("Groupsped Express")).toBeNull();
    expect(brandFromText("Transporteur local")).toBeNull();
    expect(brandById("sendcloud")?.name).toBe("Sendcloud");
    expect(brandById("inconnu")).toBeNull();
  });

  it("la mention n'affirme aucun partenariat", () => {
    expect(BRAND_DISCLAIMER).toMatch(/ni partenaire ni approuvé/);
    expect(BRAND_DISCLAIMER).not.toMatch(/partenaire officiel|certifié|approuvé par eBay/i);
  });
});

describe("composant BrandMark", () => {
  it("sans autorisation : icône générique + nom en typographie neutre, annoncé au lecteur d'écran", () => {
    render(<BrandMark brand={BRANDS.colissimo} detail="Expert" testID="m" />);
    expect(screen.getByTestId("m-generic")).toBeTruthy();
    expect(screen.queryByTestId("m-logo")).toBeNull();
    expect(screen.getByText("Colissimo")).toBeTruthy();
    expect(screen.getByLabelText("Colissimo, Expert")).toBeTruthy();
  });

  it("marque inconnue : nom libre conservé, icône du type de service", () => {
    render(<BrandMark brand={null} fallbackName="Transporteur local" kind="carrier" testID="u" />);
    expect(screen.getByText("Transporteur local")).toBeTruthy();
    expect(screen.getByTestId("u-generic")).toBeTruthy();
  });

  it("autorisation enregistrée + fichier officiel : logo affiché avec son ratio d'origine", () => {
    const authorized: BrandEntry = { ...BRANDS.boxtal, logo: { source: { uri: "file:///boxtal.png" }, width: 300, height: 100, background: "light" }, usage: { ...BRANDS.boxtal.usage, status: "authorized" } };
    render(<BrandMark brand={authorized} withName={false} testID="l" />);
    expect(screen.getByTestId("l-logo")).toBeTruthy();
    expect(screen.getByLabelText("Boxtal")).toBeTruthy();
  });

  it("mention d'identification affichable", () => {
    render(<BrandDisclaimer />);
    expect(screen.getByText(BRAND_DISCLAIMER)).toBeTruthy();
  });
});
