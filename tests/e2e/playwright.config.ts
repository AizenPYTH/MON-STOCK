import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * Vérifications de rendu (pages publiques) contre un serveur déjà lancé :
 *   NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x \
 *   NEXT_PUBLIC_APP_URL=http://localhost:3100 npx next dev -p 3100
 *   E2E_BASE_URL=http://localhost:3100 npx playwright test -c tests/e2e
 * Les pages authentifiées redirigent vers /login sans vrai projet Supabase.
 * Navigateur : PLAYWRIGHT_CHROMIUM_PATH (ex. /opt/pw-browsers/chromium) ou celui de Playwright.
 * Sorties (captures, traces) hors du dépôt : E2E_OUTPUT_DIR ou le dossier temporaire.
 */
const outputDir = process.env.E2E_OUTPUT_DIR ?? path.join(os.tmpdir(), "mon-stock-e2e");
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

const WIDTHS = [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1280", width: 1280, height: 800 },
] as const;

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts$/,
  outputDir: path.join(outputDir, "results"),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    locale: "fr-FR",
    trace: "off",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: WIDTHS.map((w) => ({
    name: w.name,
    use: { ...devices["Desktop Chrome"], viewport: { width: w.width, height: w.height }, isMobile: false },
  })),
});
