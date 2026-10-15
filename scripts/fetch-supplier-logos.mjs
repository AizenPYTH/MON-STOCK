#!/usr/bin/env node
/**
 * Récupère le logo officiel de chaque fournisseur DEPUIS SON PROPRE SITE (apple-touch-icon,
 * icône déclarée dans <head>, puis /apple-touch-icon.png et /favicon.ico), le convertit en PNG
 * 128×128 (fond transparent conservé) et génère le registre embarqué dans l'application :
 *
 *   apps/mobile/assets/suppliers/<domaine>.png
 *   apps/mobile/src/data/supplier-logos.generated.ts
 *   docs/sourcing/supplier-logos-manifest.json   (source exacte de chaque logo, date)
 *
 * Exécuté par .github/workflows/supplier-logos.yml (le bac à sable de développement n'a pas
 * d'accès Internet). Aucun logo n'est dessiné, généré ni pris sur un site tiers : un fournisseur
 * sans icône officielle exploitable garde ses initiales dans l'application.
 * Dépendances (installées par le workflow uniquement) : sharp, sharp-ico.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import ico from "sharp-ico";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT_DIR = path.join(ROOT, "apps/mobile/assets/suppliers");
const REGISTRY = path.join(ROOT, "apps/mobile/src/data/supplier-logos.generated.ts");
const MANIFEST = path.join(ROOT, "docs/sourcing/supplier-logos-manifest.json");
const UA = "MonStockLogoFetcher/1.0 (+https://github.com/AizenPYTH/MON-STOCK; logo d'identification)";
const MAX_BYTES = 1_500_000;
const SIZE = 128;
/** Icônes écartées après contrôle visuel (trop pixellisées ou génériques) : le fournisseur garde ses initiales. */
const REJECTED = new Map(Object.entries({
  "mobilepart.pl": "icône 32 px trop pixellisée",
  "itp-technologie.com": "icône 32 px trop pixellisée",
  "portal.wortmann.de": "icône générique du portail, pas la marque",
  "retoure-paletten.de": "icône illisible",
}));

const domainOf = (url) => {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};

function sites() {
  const out = new Map();
  const dir = JSON.parse(readFileSync(path.join(ROOT, "src/services/sourcing/data/supplier-directory.json"), "utf8"));
  for (const e of dir) if (e.website) out.set(domainOf(e.website), { domain: domainOf(e.website), website: e.website, names: [e.name] });
  // sources publiques de la bibliothèque (site déclaré dans source-library.ts)
  const lib = readFileSync(path.join(ROOT, "src/services/sourcing/source-library.ts"), "utf8");
  for (const m of lib.matchAll(/name:\s*"([^"]+)"[\s\S]{0,200}?website:\s*"([^"]+)"/g)) {
    const d = domainOf(m[2]);
    if (d && !out.has(d)) out.set(d, { domain: d, website: m[2], names: [m[1]] });
  }
  return [...out.values()].filter((s) => s.domain);
}

async function get(url, accept) {
  const res = await fetch(url, { redirect: "follow", headers: { "user-agent": UA, accept }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) throw new Error("trop volumineux");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error("trop volumineux");
  return { buf, finalUrl: res.url, type: res.headers.get("content-type") ?? "" };
}

/** Icônes déclarées dans <head>, de la plus grande à la plus petite (apple-touch-icon en tête). */
function declaredIcons(html, base) {
  const icons = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = /rel\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href || !/(apple-touch-icon|(^|\s)icon(\s|$)|shortcut icon)/.test(rel) || rel.includes("mask-icon")) continue;
    const sizes = /sizes\s*=\s*["'](\d+)x\d+["']/i.exec(tag)?.[1];
    const svg = /\.svg(\?|$)/i.test(href) || /image\/svg/i.test(tag);
    let url;
    try {
      url = new URL(href, base).toString();
    } catch {
      continue;
    }
    const weight = (rel.includes("apple-touch-icon") ? 1000 : 0) + (svg ? 900 : 0) + Number(sizes ?? 16);
    icons.push({ url, weight });
  }
  return icons.sort((a, b) => b.weight - a.weight).map((i) => i.url);
}

const isIco = (b) => b.length > 4 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0;

async function toPng(buf) {
  let input = buf;
  if (isIco(buf)) {
    const frames = ico.sharpsFromIco(buf);
    const metas = await Promise.all(frames.map(async (f) => ({ f, m: await f.metadata() })));
    metas.sort((a, b) => (b.m.width ?? 0) - (a.m.width ?? 0));
    input = await metas[0].f.png().toBuffer();
  }
  const img = sharp(input, { density: 300 });
  const meta = await img.metadata();
  if (!meta.width || !meta.height) throw new Error("image illisible");
  if (Math.max(meta.width, meta.height) < 32) throw new Error(`trop petit (${meta.width}px)`);
  const png = await img.resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 }).toBuffer();
  return { png, width: meta.width };
}

async function logoFor(site) {
  const tried = [];
  let home;
  try {
    home = await get(site.website, "text/html");
  } catch (e) {
    tried.push(`${site.website}: ${e.message}`);
  }
  const base = home?.finalUrl ?? site.website;
  const candidates = [...(home ? declaredIcons(home.buf.toString("utf8"), base) : []), new URL("/apple-touch-icon.png", base).toString(), new URL("/favicon.ico", base).toString()];
  for (const url of [...new Set(candidates)]) {
    try {
      const r = await get(url, "image/*");
      const { png, width } = await toPng(r.buf);
      return { png, source: r.finalUrl, originalWidth: width };
    } catch (e) {
      tried.push(`${url}: ${e.message}`);
    }
  }
  return { png: null, tried };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const list = sites();
  const manifest = [];
  const queue = [...list];
  const worker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      if (REJECTED.has(s.domain)) {
        manifest.push({ domain: s.domain, names: s.names, source: null, fetchedAt: new Date().toISOString(), status: "rejected_quality", rejectedReason: REJECTED.get(s.domain) });
        continue;
      }
      const r = await logoFor(s);
      if (r.png) {
        writeFileSync(path.join(OUT_DIR, `${s.domain}.png`), r.png);
        manifest.push({ domain: s.domain, names: s.names, source: r.source, originalWidth: r.originalWidth, fetchedAt: new Date().toISOString(), status: "ok" });
        console.log(`✓ ${s.domain} ← ${r.source}`);
      } else {
        manifest.push({ domain: s.domain, names: s.names, source: null, fetchedAt: new Date().toISOString(), status: "not_found", tried: r.tried.slice(0, 4) });
        console.log(`✗ ${s.domain} (${r.tried.length} essais)`);
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  manifest.sort((a, b) => a.domain.localeCompare(b.domain));
  const ok = manifest.filter((m) => m.status === "ok" && existsSync(path.join(OUT_DIR, `${m.domain}.png`)));
  writeFileSync(MANIFEST, `${JSON.stringify({ generatedAt: new Date().toISOString(), total: manifest.length, found: ok.length, entries: manifest }, null, 2)}\n`);
  const lines = ok.map((m) => `  ${JSON.stringify(m.domain)}: { image: require("../../assets/suppliers/${m.domain}.png"), source: ${JSON.stringify(m.source)} },`);
  writeFileSync(
    REGISTRY,
    `// FICHIER GÉNÉRÉ par scripts/fetch-supplier-logos.mjs — ne pas modifier à la main.\n// Logos récupérés sur le site officiel de chaque fournisseur (${new Date().toISOString().slice(0, 10)}), usage d'identification uniquement.\nimport type { ImageSourcePropType } from "react-native";\n\nexport const SUPPLIER_LOGOS: Readonly<Record<string, { image: ImageSourcePropType; source: string }>> = {\n${lines.join("\n")}\n};\n`,
  );
  console.log(`${ok.length}/${manifest.length} logos officiels récupérés.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
