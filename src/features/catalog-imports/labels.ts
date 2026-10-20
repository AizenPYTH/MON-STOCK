/**
 * Imports de catalogues fournisseurs (web) — libellés et fonctions pures, partagés par les pages
 * serveur, l'assistant client et les route handlers. Repris de l'application iPhone
 * (apps/mobile/src/data/suppliers-pro.ts et sourcing-b2b.ts).
 */
import type { CatalogMapping, ImportJobDetailDTO, ImportJobDTO } from "@/features/mobile-api/contract";
import type { BadgeVariant } from "@/components/ui/badge";

/** Taille maximale d'un fichier : identique à l'Edge Function (MAX_CATALOG_BYTES = 15 Mo). */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = [".csv", ".tsv", ".txt", ".xlsx", ".xlsm", ".xml", ".json"] as const;
export const ACCEPT_ATTRIBUTE = [...ACCEPTED_EXTENSIONS, "text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/xml", "text/xml", "application/json"].join(",");

/** Contrôle local d'un fichier choisi (le serveur revalide tout). null si acceptable. */
export function fileIssue(file: { name: string; size: number }): string | null {
  if (file.size === 0) return "Le fichier est vide.";
  if (file.size > MAX_FILE_BYTES) return "Fichier trop volumineux (15 Mo maximum). Demandez au fournisseur un export filtré ou découpez le fichier.";
  if (/\.xls$/i.test(file.name)) return "Les anciens fichiers Excel .xls ne sont pas pris en charge : enregistrez-le en .xlsx ou .csv.";
  return null;
}

export type ImportMode = "partial" | "snapshot";
export type TaxChoice = "ht" | "ttc" | "unknown";

export const IMPORT_MODE_LABEL: Record<ImportMode, string> = { partial: "Mise à jour partielle", snapshot: "Catalogue complet" };
export const IMPORT_MODE_HELP: Record<ImportMode, string> = {
  partial: "Seules les lignes du fichier sont créées ou mises à jour. Les autres offres du fournisseur restent telles quelles.",
  snapshot: "Le fichier contient TOUT le catalogue : les offres absentes sont marquées « expirées » (jamais supprimées). À choisir seulement si le fichier est exhaustif.",
};

export const TAX_OPTIONS: { value: TaxChoice; label: string }[] = [
  { value: "ht", label: "Prix HT" },
  { value: "ttc", label: "Prix TTC" },
  { value: "unknown", label: "Non précisé" },
];

/** Champs proposés à l'association (les autres restent disponibles via la suggestion automatique). */
export const MAPPABLE_FIELDS: { field: string; label: string; required?: boolean }[] = [
  { field: "supplier_sku", label: "Référence fournisseur" },
  { field: "ean", label: "EAN / code-barres" },
  { field: "title", label: "Désignation", required: true },
  { field: "price", label: "Prix unitaire", required: true },
  { field: "available_quantity", label: "Quantité disponible" },
  { field: "moq", label: "Quantité minimale (MOQ)" },
  { field: "brand", label: "Marque" },
  { field: "condition", label: "État" },
  { field: "grade", label: "Grade" },
  { field: "url", label: "Lien produit" },
  { field: "currency", label: "Devise (colonne)" },
  { field: "model", label: "Modèle" },
  { field: "storage", label: "Capacité" },
  { field: "color", label: "Couleur" },
  { field: "mpn", label: "Référence constructeur (MPN)" },
  { field: "order_multiple", label: "Multiple de commande" },
  { field: "shipping_cost", label: "Frais de port" },
  { field: "delivery_days", label: "Délai de livraison" },
  { field: "ship_from_country", label: "Pays d'expédition" },
  { field: "vat_regime", label: "Régime de TVA" },
  { field: "warranty_months", label: "Garantie" },
  { field: "available_from", label: "Disponible à partir du" },
  { field: "supplier_updated_at", label: "Mise à jour fournisseur" },
];

/** Champs affichés d'emblée ; les autres sous « Plus de champs ». */
export const ESSENTIAL_FIELDS = new Set(["supplier_sku", "ean", "title", "price", "available_quantity", "moq", "condition", "grade"]);

/** Le mapping est utilisable si identifiant (référence ou EAN), désignation et prix sont associés. Pur. */
export function mappingIssues(mapping: CatalogMapping): string[] {
  const issues: string[] = [];
  if (!mapping.supplier_sku && !mapping.ean && !mapping.external_offer_id) issues.push("Associez la référence fournisseur ou l'EAN.");
  if (!mapping.title) issues.push("Associez la désignation.");
  if (!mapping.price) issues.push("Associez le prix.");
  return issues;
}

/** Type de prix porté par le mapping (constante « ht »/« ttc »). Pur. */
export function taxTypeOf(mapping: CatalogMapping): TaxChoice {
  const v = mapping.tax_type;
  if (v && typeof v === "object" && (v.const === "ht" || v.const === "ttc")) return v.const;
  return "unknown";
}

export function withTaxType(mapping: CatalogMapping, taxType: TaxChoice): CatalogMapping {
  const next = { ...mapping };
  if (taxType === "unknown") delete next.tax_type;
  else next.tax_type = { const: taxType };
  return next;
}

/** Association d'une colonne à un champ (null : retirer). Pur. */
export function withColumn(mapping: CatalogMapping, field: string, column: string | null): CatalogMapping {
  const next = { ...mapping };
  if (column) next[field] = column;
  else delete next[field];
  return next;
}

export const IMPORT_STATUS_LABEL: Record<ImportJobDTO["status"], string> = {
  running: "En cours",
  completed: "Terminé",
  partial: "Terminé avec des lignes ignorées",
  failed: "Échec",
  quarantined: "Suspendu (contrôle de qualité)",
  skipped_duplicate: "Fichier déjà importé (rien modifié)",
};

export const IMPORT_STATUS_VARIANT: Record<ImportJobDTO["status"], BadgeVariant> = { completed: "success", partial: "warning", failed: "danger", quarantined: "warning", running: "info", skipped_duplicate: "neutral" };

export type IssueKind = ImportJobDetailDTO["issues"][number]["kind"];

export const ISSUE_KIND_LABEL: Record<IssueKind, string> = {
  invalid: "Ligne illisible",
  duplicate: "Doublon",
  rejected: "Rejetée",
  unrecognized: "Produit non reconnu",
  warning: "Remarque",
};

/** Que faire pour chaque type de ligne ignorée (affiché dans le rapport). */
export const ISSUE_KIND_HINT: Record<IssueKind, string> = {
  invalid: "Prix ou colonne obligatoire illisible : corrigez la colonne dans le fichier ou l'association des colonnes.",
  duplicate: "Même référence plusieurs fois : seule la première ligne est conservée.",
  rejected: "Valeur refusée par les contrôles de qualité (prix aberrant, devise inconnue…).",
  unrecognized: "Modèle introuvable dans le titre : ajoutez une colonne modèle ou marque.",
  warning: "Remarque sans blocage : une valeur par défaut a été appliquée.",
};

export const ISSUE_KINDS: IssueKind[] = ["invalid", "duplicate", "rejected", "unrecognized", "warning"];

export function isIssueKind(v: unknown): v is IssueKind {
  return typeof v === "string" && (ISSUE_KINDS as string[]).includes(v);
}

/** Lignes ignorées d'un import (doublons, illisibles, rejetées, non reconnues). Pur. */
export function ignoredCount(c: ImportJobDTO["counts"]): number {
  return c.duplicates + c.invalid + c.rejected + c.unrecognized;
}

/** Résumé d'un import : nouvelles, mises à jour, inchangées, ignorées, expirées. Pur. */
export function countsText(c: ImportJobDTO["counts"]): string {
  const ignored = c.duplicates + c.invalid + c.rejected;
  return [
    `${c.created} nouvelle${c.created > 1 ? "s" : ""}`,
    `${c.updated} mise${c.updated > 1 ? "s" : ""} à jour`,
    `${c.unchanged} inchangée${c.unchanged > 1 ? "s" : ""}`,
    ignored ? `${ignored} ignorée${ignored > 1 ? "s" : ""}` : null,
    c.expired ? `${c.expired} expirée${c.expired > 1 ? "s" : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export interface BreakdownPart {
  key: "created" | "updated" | "unchanged" | "ignored";
  label: string;
  value: number;
  /** part en % de la somme des parts (0 si aucune ligne) */
  percent: number;
  className: string;
}

/** Répartition des lignes (vrais comptes, pourcentages arrondis à 0,1). Pur. */
export function importBreakdown(c: ImportJobDTO["counts"]): BreakdownPart[] {
  const parts: Omit<BreakdownPart, "percent">[] = [
    { key: "created", label: "Nouvelles", value: c.created, className: "bg-success" },
    { key: "updated", label: "Mises à jour", value: c.updated, className: "bg-accent" },
    { key: "unchanged", label: "Inchangées", value: c.unchanged, className: "bg-zinc-300" },
    { key: "ignored", label: "Ignorées", value: ignoredCount(c), className: "bg-warning" },
  ];
  const total = parts.reduce((a, p) => a + p.value, 0);
  return parts.map((p) => ({ ...p, percent: total > 0 ? Math.round((p.value / total) * 1000) / 10 : 0 }));
}

/** Rapport d'erreurs d'un import, en CSV (séparateur « ; », guillemets échappés, BOM pour Excel). Pur. */
export function issuesCsv(job: Pick<ImportJobDetailDTO, "issues">): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["ligne", "type", "reference", "message"].join(";");
  const lines = job.issues.map((i) => [i.line ?? "", ISSUE_KIND_LABEL[i.kind] ?? i.kind, i.reference ?? "", i.message].map(esc).join(";"));
  return `﻿${head}\n${lines.join("\n")}\n`;
}

/** Taille lisible d'un fichier (« 1,2 Mo ») ; inconnue → « — ». Pur. */
export function fileSizeLabel(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}
