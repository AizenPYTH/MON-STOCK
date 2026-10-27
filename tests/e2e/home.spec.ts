import { expect, test } from "@playwright/test";

/**
 * Accueil v2 (docs/design/HANDOFF-v2-site-parcours.md §J) : critères vérifiables dans un navigateur.
 * Exécuté sur chaque largeur du fichier de configuration ; certains blocs fixent leur propre viewport.
 */

test.describe("accueil : contenus et statuts", () => {
  test("statuts des canaux exacts, liens de compte, chiffres étiquetés", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1, name: /Un seul stock\.\s*Tous vos canaux\./ })).toBeVisible();

    const panel = page.locator("#integrations");
    await expect(panel.locator('[data-port="lit"]')).toHaveCount(1);
    await expect(panel.locator('[data-port="open"]')).toHaveCount(7);
    await expect(panel.locator('[data-channel-status="available"]')).toHaveCount(1);
    await expect(panel.locator('[data-channel-status="soon"]')).toHaveCount(3);
    await expect(panel.getByText("PAS DE DATE")).toHaveCount(0);
    await expect(panel.locator("button, form")).toHaveCount(0);

    // Tous les liens vers /signup et /login (aucune autre cible de compte).
    const hrefs = await page.$$eval("a", (as) => as.map((a) => a.getAttribute("href") ?? ""));
    expect(hrefs.filter((h) => /signup/.test(h)).every((h) => h === "/signup")).toBe(true);
    expect(hrefs.filter((h) => /login/.test(h)).every((h) => h === "/login")).toBe(true);
    expect(hrefs.filter((h) => h === "/signup").length).toBeGreaterThanOrEqual(3);

    // Chiffres d'exemple : étiquette EXEMPLE ou bloc « aperçu illustratif ».
    expect(await page.locator("[data-example-tag]").count()).toBeGreaterThanOrEqual(8);
    await expect(page.getByText("Aperçu illustratif", { exact: false }).first()).toBeAttached();

    // 0 image, police serif servie par le site.
    await expect(page.locator("main img")).toHaveCount(0);
    const foreignFonts = await page.evaluate(() => performance.getEntriesByType("resource").filter((e) => /\.woff2?($|\?)/.test(e.name) && new URL(e.name).host !== location.host).length);
    expect(foreignFonts).toBe(0);
  });
});

test.describe("accueil à 1440 × 900", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("titre, lead, CTA, dock et haut de la fenêtre (CA) visibles sans défilement", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.waitForTimeout(2600); // entrées (fenêtre @1000 ms, 1 400 ms)
    const inView = async (loc: ReturnType<typeof page.locator>) => {
      const b = await loc.boundingBox();
      expect(b, "élément rendu").not.toBeNull();
      expect(b!.y + b!.height).toBeLessThanOrEqual(900);
      expect(b!.y).toBeGreaterThanOrEqual(0);
    };
    await inView(page.getByRole("heading", { level: 1 }));
    await inView(page.getByText("Vos références, vos quantités", { exact: false }));
    await inView(page.locator("#hero-titre ~ div a", { hasText: "Créer un compte" }).first());
    await inView(page.getByRole("list", { name: "Canaux", exact: true }));
    await inView(page.locator("figure").first().locator("span.tabular-nums").first());
  });

  test("la vente se rejoue au clic ; mêmes montants partout", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const button = page.locator("figure button").first();
    await button.click();
    await expect(button).toHaveText("● Vente en cours");
    await expect(button).toHaveText("↻ Rejouer", { timeout: 6000 });
    await expect(page.locator("figure").first()).toContainText("1 965 €");
    await expect(page.locator("figure").first()).toContainText("+479 €");
    await expect(page.locator("figure").first()).toContainText("Nouvelle commande eBay · 479,00 €");
  });
});

test.describe("accueil, réduire les animations", () => {
  test.use({ viewport: { width: 1440, height: 900 }, contextOptions: { reducedMotion: "reduce" } });

  test("contenu immédiat, aucune boucle, avant/après statique", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.waitForTimeout(4500); // > démarrage auto (1 800 ms) + étape 1
    await expect(page.locator("figure button").first()).toHaveText("▶ Simuler une vente");
    // Scène collante désactivée : la piste n'a pas 300 vh.
    const track = await page.locator('[data-scene="chaos"]').evaluate((el) => el.getBoundingClientRect().height);
    expect(track).toBeLessThan(900 * 2);
    // Révélations : tout est visible.
    const hidden = await page.$$eval("[data-r]", (els) => els.filter((el) => getComputedStyle(el).opacity !== "1").length);
    expect(hidden).toBe(0);
    // Bandeau des outils figé.
    const anim = await page.locator(".mk-loop").first().evaluate((el) => getComputedStyle(el).animationName);
    expect(anim).toBe("none");
  });
});

test.describe("accueil à 390 px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("pas de défilement horizontal ; dock réduit à eBay ; feuille de menu ; cibles ≥ 44 px", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const dock = page.getByRole("list", { name: "Canaux", exact: true });
    await expect(dock.locator("li:visible")).toHaveCount(1);
    await expect(dock).toContainText("eBay");

    const menu = page.getByRole("button", { name: "Ouvrir le menu" });
    const box = await menu.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
    await menu.click();
    const sheet = page.getByRole("navigation", { name: "Menu" });
    await expect(sheet).toBeVisible();
    for (const link of await sheet.getByRole("link").all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Ouvrir le menu" })).toBeFocused();

    // Démo : 3 colonnes en mobile, filtres utilisables au doigt.
    const header = page.locator("#produit").getByText("Référence", { exact: true });
    await header.scrollIntoViewIfNeeded();
    const cols = await header.locator("xpath=..").evaluate((el) => Array.from(el.children).filter((c) => getComputedStyle(c).display !== "none").length);
    expect(cols).toBe(3);
    for (const name of ["Tous", "Ruptures", "Faibles"]) expect((await page.getByRole("button", { name }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
});
