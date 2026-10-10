import * as DocumentPicker from "expo-document-picker";
import type { CatalogImportDTO, CatalogMapping, CatalogPreviewDTO, DirectoryEntryDTO, DirectoryStage } from "@/features/mobile-api/contract";
import { callApi } from "~/lib/api";
import { UserFacingError } from "~/lib/errors";

/**
 * Sourcing professionnel côté mobile : annuaire de fournisseurs qualifiés (statuts prouvés par le
 * serveur) et import du catalogue / de la grille tarifaire transmis par un fournisseur.
 * Le fichier est lu sur le téléphone et envoyé au serveur MON STOCK, qui l'analyse et l'importe :
 * aucune donnée n'est enregistrée avant la confirmation de l'utilisateur.
 */

export type { DirectoryEntryDTO, DirectoryStage };

export const STAGE_LABEL: Record<DirectoryStage, string> = {
  identified: "Identifié",
  verified: "Site vérifié",
  public_access: "Accès public fonctionnel",
  account_required: "Compte pro requis",
  connector_ready: "Connecteur prêt (identifiants requis)",
  import_tested: "Import réel testé",
  unavailable: "Site indisponible",
};

export const STAGE_TONE: Record<DirectoryStage, "accent" | "neutral" | "success" | "danger" | "dark"> = {
  identified: "neutral",
  verified: "neutral",
  public_access: "success",
  account_required: "accent",
  connector_ready: "accent",
  import_tested: "success",
  unavailable: "danger",
};

export const SEGMENT_LABEL: Record<DirectoryEntryDTO["segment"], string> = {
  A_refurb: "Reconditionné",
  B_parts: "Pièces détachées",
  C_liquidation: "Lots & déstockage",
  D_distributor: "Distributeurs",
  E_specialist: "Flux & API",
};

export const ACCESS_MODE_LABEL: Record<string, string> = {
  api: "API",
  feed_csv: "Flux CSV",
  feed_xml: "Flux XML",
  feed_json: "Flux JSON",
  edi: "EDI",
  public_catalog: "Catalogue public",
  pro_portal: "Portail pro",
  manual_download: "Fichier à télécharger",
  pdf_price_list: "Tarif PDF",
  email_quote: "Devis par e-mail",
};

export function fetchDirectory(organizationId: string): Promise<{ entries: DirectoryEntryDTO[]; researchDate: string; lastCheckAt: string | null }> {
  return callApi("/sourcing/directory", { organizationId });
}

/** Lien mailto prêt à l'emploi (le destinataire est choisi par l'utilisateur : aucun envoi automatique). */
export function mailtoLink(email: { subject: string; body: string }): string {
  return `mailto:?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
}

// ---------------------------------------------------------------------------
// Import de catalogue
// ---------------------------------------------------------------------------

export const MAX_FILE_BYTES = 15 * 1024 * 1024;

export interface PickedFile {
  name: string;
  size: number | null;
  base64: string;
}

const PICKER_TYPES = [
  "text/csv",
  "text/comma-separated-values",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/xml",
  "text/xml",
  "application/json",
  "public.comma-separated-values-text",
  "public.spreadsheet",
  "application/octet-stream",
];

/** Sélection du fichier (Fichiers / iCloud / pièce jointe enregistrée). null si annulé. */
export async function pickCatalogFile(picker: typeof DocumentPicker.getDocumentAsync = DocumentPicker.getDocumentAsync): Promise<PickedFile | null> {
  const res = await picker({ type: PICKER_TYPES, copyToCacheDirectory: true, multiple: false, base64: true });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  if (a.size && a.size > MAX_FILE_BYTES) throw new UserFacingError("Fichier trop volumineux (15 Mo maximum). Demandez au fournisseur un export filtré ou découpez le fichier.");
  if (!a.base64) throw new UserFacingError("Le fichier n'a pas pu être lu. Réessayez depuis l'application Fichiers.");
  if (/\.xls$/i.test(a.name)) throw new UserFacingError("Les anciens fichiers Excel .xls ne sont pas pris en charge : enregistrez-le en .xlsx ou .csv.");
  return { name: a.name, size: a.size ?? null, base64: a.base64 };
}

export function previewImport(organizationId: string, file: PickedFile, options: { mapping?: CatalogMapping; currency?: string; taxType?: "ht" | "ttc" | "unknown" } = {}): Promise<CatalogPreviewDTO> {
  return callApi<CatalogPreviewDTO>("/sourcing/import/preview", {
    method: "POST",
    organizationId,
    timeoutMs: 90_000,
    body: { file: { fileName: file.name, contentBase64: file.base64 }, mapping: options.mapping, defaults: { currency: options.currency, taxType: options.taxType } },
  });
}

export function runImport(
  organizationId: string,
  input: { file: PickedFile; mapping: CatalogMapping; currency: string; taxType: "ht" | "ttc" | "unknown"; supplierId?: string; supplierName?: string },
): Promise<CatalogImportDTO> {
  if (!input.supplierId && !input.supplierName?.trim()) throw new UserFacingError("Choisissez le fournisseur de ce catalogue.");
  return callApi<CatalogImportDTO>("/sourcing/import", {
    method: "POST",
    organizationId,
    timeoutMs: 180_000,
    body: {
      file: { fileName: input.file.name, contentBase64: input.file.base64 },
      mapping: input.mapping,
      defaults: { currency: input.currency, taxType: input.taxType },
      ...(input.supplierId ? { supplierId: input.supplierId } : { supplierName: input.supplierName!.trim() }),
    },
  });
}

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
];

/** Le mapping est utilisable si identifiant (référence ou EAN), désignation et prix sont associés. */
export function mappingIssues(mapping: CatalogMapping): string[] {
  const issues: string[] = [];
  if (!mapping.supplier_sku && !mapping.ean && !mapping.external_offer_id) issues.push("Associez la référence fournisseur ou l'EAN.");
  if (!mapping.title) issues.push("Associez la désignation.");
  if (!mapping.price) issues.push("Associez le prix.");
  return issues;
}

/** Type de prix porté par le mapping (constante « ht »/« ttc ») ou choisi par l'utilisateur. */
export function taxTypeOf(mapping: CatalogMapping): "ht" | "ttc" | "unknown" {
  const v = mapping.tax_type;
  if (v && typeof v === "object" && (v.const === "ht" || v.const === "ttc")) return v.const;
  return "unknown";
}

export function withTaxType(mapping: CatalogMapping, taxType: "ht" | "ttc" | "unknown"): CatalogMapping {
  const next = { ...mapping };
  if (taxType === "unknown") delete next.tax_type;
  else next.tax_type = { const: taxType };
  return next;
}
