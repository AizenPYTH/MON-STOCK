/**
 * Corps des requêtes d'import de catalogue reçus par les route handlers web (pur, testé).
 *
 * Le navigateur envoie un `multipart/form-data` : `file` (le fichier tel quel) et `options`
 * (JSON : mapping, valeurs par défaut, fournisseur, mode…). Le serveur reconstruit EXACTEMENT le
 * corps JSON que reçoit l'Edge Function (`file.contentBase64`), puis le valide avec les mêmes
 * schémas (catalogPreviewSchema / catalogImportSchema) et la même taille maximale.
 */
import { MAX_FILE_BYTES } from "@/features/catalog-imports/labels";

/** Marge pour les en-têtes multipart et le JSON des options (le fichier reste borné à 15 Mo). */
export const MULTIPART_OVERHEAD_BYTES = 512 * 1024;

export class CatalogRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CatalogRequestError";
  }
}

/** Refus anticipé d'un corps trop volumineux (en-tête Content-Length), avant toute lecture. */
export function assertContentLength(header: string | null): void {
  if (!header) return;
  const n = Number(header);
  if (Number.isFinite(n) && n > MAX_FILE_BYTES + MULTIPART_OVERHEAD_BYTES) throw new CatalogRequestError("Fichier trop volumineux (15 Mo maximum).", 413);
}

/** Options JSON du formulaire → objet (jamais d'exception brute). */
export function parseOptions(raw: unknown): Record<string, unknown> {
  if (raw === null || raw === undefined || raw === "") return {};
  if (typeof raw !== "string") throw new CatalogRequestError("Options d'import illisibles.", 400);
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("not an object");
    return v as Record<string, unknown>;
  } catch {
    throw new CatalogRequestError("Options d'import illisibles.", 400);
  }
}

export interface UploadedFile {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export function isUploadedFile(v: unknown): v is UploadedFile {
  return Boolean(v) && typeof v === "object" && typeof (v as UploadedFile).arrayBuffer === "function" && typeof (v as UploadedFile).size === "number" && typeof (v as UploadedFile).name === "string";
}

/** Fichier reçu → objet `file` du contrat Edge (nom borné, contenu en base64, taille vérifiée contre celle annoncée par le navigateur). */
export async function fileToCatalogInput(file: unknown, sheet?: unknown, expectedSize?: unknown): Promise<{ fileName: string; contentBase64: string; sheet?: string }> {
  if (!isUploadedFile(file)) throw new CatalogRequestError("Choisissez un fichier (CSV, Excel .xlsx, XML ou JSON).", 400);
  if (file.size === 0) throw new CatalogRequestError("Le fichier est vide.", 400);
  if (file.size > MAX_FILE_BYTES) throw new CatalogRequestError("Fichier trop volumineux (15 Mo maximum).", 413);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength > MAX_FILE_BYTES) throw new CatalogRequestError("Fichier trop volumineux (15 Mo maximum).", 413);
  // Un fichier tronqué en route (proxy, réseau) ne doit jamais être importé : en mode « catalogue
  // complet », les offres absentes seraient marquées expirées à tort.
  if (typeof expectedSize !== "number" || expectedSize !== bytes.byteLength) throw new CatalogRequestError("Fichier reçu incomplet par le serveur : rien n'a été lu ni enregistré. Réessayez, ou découpez le fichier.", 400);
  const fileName = (file.name || "catalogue").slice(0, 200);
  return { fileName, contentBase64: bytes.toString("base64"), ...(typeof sheet === "string" && sheet ? { sheet: sheet.slice(0, 100) } : {}) };
}

const PREVIEW_KEYS = ["mapping", "defaults", "supplierId"] as const;
const IMPORT_KEYS = ["mapping", "defaults", "supplierId", "supplierName", "force", "mode", "allowSameFile"] as const;

/** Corps JSON identique à celui de l'Edge pour l'aperçu ou l'import (clés inattendues écartées). */
export function buildCatalogBody(kind: "preview" | "import", file: { fileName: string; contentBase64: string; sheet?: string }, options: Record<string, unknown>): Record<string, unknown> {
  const keys: readonly string[] = kind === "preview" ? PREVIEW_KEYS : IMPORT_KEYS;
  const body: Record<string, unknown> = { file };
  for (const k of keys) {
    const v = options[k];
    if (v === undefined || v === null || v === "") continue;
    body[k] = v;
  }
  return body;
}

const ZOD_DEFAULT = /^(Invalid|Too (small|big)|Expected|Unrecognized|Required)/i;
const PATH_LABEL: Record<string, string> = {
  supplierName: "Nom du fournisseur (2 à 160 caractères)",
  supplierId: "Fournisseur",
  currency: "Devise sur 3 lettres (EUR, USD…)",
  mapping: "Correspondance des colonnes",
  mode: "Mode d'import",
  taxType: "Type de prix",
  fileName: "Nom du fichier",
  url: "Adresse du flux (HTTPS)",
  format: "Format du flux",
  frequency: "Fréquence",
  auth: "Authentification",
  username: "Identifiant",
  password: "Mot de passe",
  value: "Valeur de l'en-tête",
};

/** Premier problème de validation en français (messages des schémas, sinon libellé du champ). */
export function validationMessage(issues: readonly { message: string; path: readonly PropertyKey[] }[]): string {
  const issue = issues[0];
  if (!issue) return "Demande invalide.";
  if (!ZOD_DEFAULT.test(issue.message)) return issue.message;
  const key = [...issue.path].reverse().find((p): p is string => typeof p === "string" && p in PATH_LABEL);
  return key ? `${PATH_LABEL[key]} : valeur invalide.` : "Vérifiez les informations de l'import.";
}
