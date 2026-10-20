#!/usr/bin/env node
/**
 * Logos fournisseurs pour le site web : copie les icônes officielles déjà récupérées pour
 * l'application iPhone (apps/mobile/assets/suppliers/<domaine>.png) dans public/supplier-logos/ et
 * génère src/data/supplier-logos.web.ts (liste des domaines disponibles). Aucun appel réseau.
 * À relancer après scripts/fetch-supplier-logos.mjs.  Usage : node scripts/copy-supplier-logos.mjs
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const from = path.join(root, "apps/mobile/assets/suppliers");
const to = path.join(root, "public/supplier-logos");
const domains = readdirSync(from)
  .filter((f) => f.endsWith(".png"))
  .map((f) => f.slice(0, -4))
  .sort();
rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
for (const d of domains) copyFileSync(path.join(from, `${d}.png`), path.join(to, `${d}.png`));
const out = [
  "// FICHIER GÉNÉRÉ par scripts/copy-supplier-logos.mjs — ne pas modifier à la main.",
  "// Logos officiels récupérés sur le site de chaque fournisseur (voir apps/mobile/src/data/supplier-logos.generated.ts),",
  "// servis depuis public/supplier-logos/<domaine>.png ; usage d'identification uniquement.",
  `export const SUPPLIER_LOGO_DOMAINS: readonly string[] = ${JSON.stringify(domains, null, 2)};`,
  "",
].join("\n");
mkdirSync(path.join(root, "src/data"), { recursive: true });
writeFileSync(path.join(root, "src/data/supplier-logos.web.ts"), out);
console.log(`✓ ${domains.length} logos copiés dans public/supplier-logos, src/data/supplier-logos.web.ts régénéré`);
