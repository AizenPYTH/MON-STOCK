import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";

const shotsDir = path.join(process.env.E2E_OUTPUT_DIR ?? path.join(os.tmpdir(), "mon-stock-e2e"), "screenshots");

const PAGES = [
  { slug: "login", url: "/login", heading: "Connexion" },
  { slug: "signup", url: "/signup", heading: "Créer un compte" },
  { slug: "reset-password", url: "/reset-password", heading: /mot de passe/i },
  { slug: "invite", url: "/invite/jeton-de-test", heading: "Rejoindre une organisation" },
  // /auth/* est public (proxy) et n'a pas de page : la 404 globale s'affiche.
  { slug: "404", url: "/auth/page-inexistante", heading: "Page introuvable", status: 404 },
] as const;

for (const p of PAGES) {
  test(`${p.slug} : rendu, en-têtes de sécurité, pas de débordement horizontal`, async ({ page }, info) => {
    const cspViolations: string[] = [];
    page.on("console", (msg) => {
      if (/Content Security Policy|Refused to (load|execute|connect|apply)/i.test(msg.text())) cspViolations.push(msg.text());
    });
    const response = await page.goto(p.url, { waitUntil: "networkidle" });
    expect(response, "réponse HTTP").not.toBeNull();
    if ("status" in p) expect(response!.status()).toBe(p.status);
    else expect(response!.status()).toBeLessThan(400);

    const headers = response!.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");

    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("heading", { level: 1, name: p.heading })).toBeVisible();

    // Aucun champ de formulaire sans nom accessible.
    const unlabeled = await page.$$eval("input:not([type=hidden]), select, textarea", (els) =>
      els.filter((el) => {
        const id = el.getAttribute("id");
        const hasLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
        return !hasLabel && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby") && !el.closest("label");
      }).length,
    );
    expect(unlabeled).toBe(0);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "débordement horizontal (px)").toBeLessThanOrEqual(0);

    expect(cspViolations, "violations CSP").toEqual([]);

    await page.screenshot({ path: path.join(shotsDir, `${p.slug}-${info.project.name}.png`), fullPage: true });
  });
}

test("une page protégée redirige vers /login avec ?next=", async ({ page }) => {
  await page.goto("/stock/alerts");
  await expect(page).toHaveURL(/\/login\?next=%2Fstock%2Falerts$/);
});

test("le focus clavier est visible sur le premier champ", async ({ page }) => {
  await page.goto("/login");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return "none";
    const cs = getComputedStyle(el);
    return `${cs.outlineStyle}|${cs.boxShadow}`;
  });
  expect(outline).not.toBe("none|none");
});
