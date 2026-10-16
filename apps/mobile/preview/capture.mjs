// APERÇU VISUEL : sert l'export web (expo export --platform web) et capture les écrans dans
// Chromium au format iPhone (390 × 844, @2x). Usage : node preview/capture.mjs <dist> <sortie> [route…]
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const [dist, outDir, ...routes] = process.argv.slice(2);
const TYPES = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".png": "image/png", ".ttf": "font/ttf", ".json": "application/json", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let file = path.join(dist, url);
  if (!existsSync(file) || statSync(file).isDirectory()) file = existsSync(`${file}.html`) ? `${file}.html` : path.join(dist, "index.html");
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
}).listen(0);
const port = server.address().port;
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "fr-FR", timezoneId: "Europe/Paris" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
for (const spec of routes.length ? routes : ["/today"]) {
  const [route, mode] = spec.split("#");
  // « #full » : fenêtre haute pour voir tout le contenu défilant (les listes défilent dans la page)
  const width = Number(process.env.CAPTURE_WIDTH ?? 390);
  await page.setViewportSize({ width, height: mode === "full" ? 2400 : width < 360 ? 568 : 844 });
  await page.goto(`http://localhost:${port}${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  const name = (route.replace(/^\//, "").replace(/[/?=&]/g, "_") || "root") + (mode === "full" ? "-full" : "");
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });
  console.log(`capture ${route} → ${name}.png`);
}
if (errors.length) console.log(`erreurs navigateur :\n${[...new Set(errors)].slice(0, 15).join("\n")}`);
await browser.close();
server.close();
