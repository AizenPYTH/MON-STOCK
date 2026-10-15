/**
 * Exporte l'annuaire des fournisseurs avec sa classification (registre) vers
 * docs/sourcing/connected-suppliers-directory.{csv,md}. Lancement : npx tsx scripts/export-supplier-directory.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ACCESS_METHOD_LABEL, accessMethodsOf, INTEGRATION_STATUS_LABEL, integrationStatusOf, NO_FACTS, priorityOf, RELIABILITY_LABEL, reliabilityOf, SEGMENT_LABEL } from "../src/domain/sourcing/supplier-registry";

const ROOT = path.resolve(__dirname, "..");
const dir = JSON.parse(readFileSync(path.join(ROOT, "src/services/sourcing/data/supplier-directory.json"), "utf8")) as Array<Record<string, unknown> & { key: string; name: string; website: string | null; segment: string; country: string | null; deliveryZones: string[]; categories: string[]; accessModes: string[]; proAccountRequired: boolean | null; apiDocsUrl: string | null; verificationLevel: string; checkedAt: string }>;
const manifest = JSON.parse(readFileSync(path.join(ROOT, "docs/sourcing/supplier-logos-manifest.json"), "utf8")) as { entries: { domain: string; status: string; source: string | null }[] };
const logos = new Map(manifest.entries.filter((e) => e.status === "ok").map((e) => [e.domain, e.source]));
const lib = readFileSync(path.join(ROOT, "src/services/sourcing/source-library.ts"), "utf8");
const libDomains = new Set([...lib.matchAll(/website:\s*"([^"]+)"/g)].map((m) => domainOf(m[1]!)));

function domainOf(u: string | null): string | null {
  if (!u) return null;
  try {
    return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}
const esc = (v: unknown) => {
  const s = Array.isArray(v) ? v.join(" | ") : v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const rows = dir.map((e) => {
  const d = domainOf(e.website);
  const methods = accessMethodsOf(e, { publicAvailable: d !== null && libDomains.has(d) });
  const status = integrationStatusOf(e, methods, NO_FACTS);
  const p = priorityOf(e);
  return { e, d, methods, status, p, logo: d ? (logos.get(d) ?? null) : null };
});
rows.sort((a, b) => b.p.score - a.p.score || a.e.name.localeCompare(b.e.name));

const head = ["key", "name", "website", "country", "segment", "categories", "pro_account_required", "access_conditions", "access_modes_announced", "access_methods", "integration_status_default", "priority_score", "priority_tier", "api_docs_url", "prices_tax", "currency", "moq", "delivery_zones", "reliability", "verification_level", "logo_official_source", "checked_at", "how_to_get_catalog"];
const csv = [head.join(","), ...rows.map(({ e, methods, status, p, logo }) => [e.key, e.name, e.website, e.country, e.segment, e.categories, e.proAccountRequired, e.accessConditions, e.accessModes, methods, status, p.score, p.tier, e.apiDocsUrl, e.pricesTax, e.currency, e.moq, e.deliveryZones, reliabilityOf(e.verificationLevel), e.verificationLevel, logo, e.checkedAt, e.howToGetCatalog].map(esc).join(","))].join("\n");
writeFileSync(path.join(ROOT, "docs/sourcing/connected-suppliers-directory.csv"), `${csv}\n`);

const bySeg = new Map<string, typeof rows>();
for (const r of rows) bySeg.set(r.e.segment, [...(bySeg.get(r.e.segment) ?? []), r]);
const count = (pred: (r: (typeof rows)[number]) => boolean) => rows.filter(pred).length;
let md = `# Annuaire des fournisseurs — ${rows.length} fiches\n\nGénéré par \`scripts/export-supplier-directory.ts\` depuis \`src/services/sourcing/data/supplier-directory.json\` et le registre \`src/domain/sourcing/supplier-registry.ts\`. Export complet : [connected-suppliers-directory.csv](connected-suppliers-directory.csv).\n\n`;
md += `Statut indiqué : statut **par défaut**, sans compte connecté. Dans l'application, il est recalculé avec les preuves de chaque organisation (connexion testée, import réussi, source active).\n\n`;
md += `## Synthèse\n\n| Indicateur | Nombre |\n|---|---|\n| Fiches | ${rows.length} |\n| Logo officiel embarqué | ${count((r) => Boolean(r.logo))} |\n| API officielle intégrée (connecteur MON STOCK) | ${count((r) => r.methods.includes("official_api"))} |\n| Catalogue public intégré par MON STOCK | ${count((r) => r.methods.includes("public_integrated"))} |\n| Flux de catalogue annoncé | ${count((r) => r.methods.includes("catalog_feed"))} |\n| API annoncée sans connecteur (développement / accès commercial) | ${count((r) => r.methods.includes("custom_development"))} |\n| Import de fichier possible | ${count((r) => r.methods.includes("manual_import"))} |\n| Compte professionnel requis | ${count((r) => r.e.proAccountRequired === true)} |\n| Non automatisable | ${count((r) => r.methods.includes("not_automatable"))} |\n| Écartés (CGU) | ${count((r) => r.status === "abandoned")} |\n\n`;
md += `Fiabilité : ${Object.entries(RELIABILITY_LABEL).map(([k, v]) => `**${v}** ${count((r) => reliabilityOf(r.e.verificationLevel) === k)}`).join(" · ")}.\n\n`;
for (const [seg, list] of bySeg) {
  md += `## ${SEGMENT_LABEL[seg] ?? seg} (${list.length})\n\n| Fournisseur | Pays | Méthodes d'accès | Statut par défaut | Priorité | Logo |\n|---|---|---|---|---|---|\n`;
  for (const { e, methods, status, p, logo } of list) md += `| [${e.name.replace(/\|/g, "/")}](${e.website ?? "#"}) | ${e.country ?? "—"} | ${methods.map((m) => ACCESS_METHOD_LABEL[m]).join(", ")} | ${INTEGRATION_STATUS_LABEL[status]} | ${p.score} (${p.tier}) | ${logo ? "officiel" : "initiales"} |\n`;
  md += "\n";
}
writeFileSync(path.join(ROOT, "docs/sourcing/connected-suppliers-directory.md"), md);
console.log(`${rows.length} fiches exportées.`);
