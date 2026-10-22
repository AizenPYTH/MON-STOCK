import { expect, test, type Page, type Response } from "@playwright/test";

/**
 * W-01 — parcours authentifié « inscription → onboarding → tableau de bord » sur BUILD DE PRODUCTION.
 *
 * Le bug ne se reproduit qu'avec le préchargement des liens, actif uniquement en production
 * (`next build && next start`), jamais avec `next dev`. Ce test exige un vrai projet Supabase de test
 * (Auth + base) : il est IGNORÉ tant que `E2E_ONBOARDING=1` n'est pas fourni.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… NEXT_PUBLIC_APP_URL=http://localhost:3100 \
 *     npx next build && npx next start -p 3100
 *   E2E_ONBOARDING=1 E2E_SIGNUP_EMAIL_DOMAIN=exemple.test E2E_BASE_URL=http://localhost:3100 \
 *     npx playwright test -c tests/e2e onboarding --project desktop-1280
 *
 * Conditions côté Supabase (projet de TEST uniquement, jamais la production) : confirmation d'e-mail
 * désactivée (Auth → Providers → Email → « Confirm email » décoché) pour que l'inscription ouvre une
 * session immédiatement. Chaque exécution crée un compte `e2e-<horodatage>@<domaine>` et une
 * organisation : à nettoyer ensuite dans le projet de test.
 */
const enabled = process.env.E2E_ONBOARDING === "1";
const domain = process.env.E2E_SIGNUP_EMAIL_DOMAIN ?? "exemple.test";

function isActionPost(r: Response): boolean {
  return r.request().method() === "POST" && Boolean(r.request().headers()["next-action"]);
}

async function signUp(page: Page): Promise<void> {
  const email = `e2e-${Date.now()}@${domain}`;
  await page.goto("/signup");
  await page.getByLabel("Nom complet").fill("Test E2E");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(`E2e-${Date.now()}-mdp`);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await page.waitForURL(/\/(onboarding|login)/, { timeout: 30_000 });
  test.skip(!page.url().includes("/onboarding"), "Confirmation d'e-mail active sur le projet de test : inscription sans session.");
}

test.describe("onboarding authentifié (W-01)", () => {
  test.skip(!enabled, "E2E_ONBOARDING=1 requis (projet Supabase de test, build de production).");

  test("créer l'organisation mène au tableau de bord, une seule fois", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-1280", "Un seul gabarit suffit pour ce parcours.");
    await signUp(page);

    // Le routeur apprend d'abord que /dashboard renvoie vers /onboarding (pas encore d'organisation).
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/onboarding$/);
    // Laisse au routeur le temps de précharger ce qui est visible (comportement de production).
    await page.waitForTimeout(1500);

    const name = `Boutique E2E ${Date.now()}`;
    await page.getByLabel("Nom de l'organisation").fill(name);
    const actionResponse = page.waitForResponse(isActionPost);
    await page.getByRole("button", { name: "Créer l'organisation" }).click();
    const res = await actionResponse;
    // Next 16.4 : redirection ET revalidation annoncées au client (sinon cache client réutilisé).
    expect(res.headers()["x-action-redirect"]).toContain("/dashboard");
    expect(res.headers()["x-action-revalidated"]).toBeTruthy();

    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Aujourd'hui" })).toBeAttached();
    // L'onboarding ne doit pas réapparaître après stabilisation.
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/dashboard$/);

    // Nouvel essai immédiat avec le même nom : pas de seconde organisation (garde serveur).
    await page.goto("/onboarding");
    await page.getByLabel("Nom de l'organisation").fill(name);
    await page.getByRole("button", { name: "Créer l'organisation" }).click();
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
    await page.getByRole("button", { name: /Organisation active/ }).first().click();
    await expect(page.getByRole("menuitem", { name: new RegExp(name) })).toHaveCount(1);
  });
});
