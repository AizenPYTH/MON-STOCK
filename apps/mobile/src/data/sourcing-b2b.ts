import type { CatalogMapping, CatalogPreviewDTO, ImportJobDetailDTO, ImportJobDTO, SourceOverviewDTO } from "@/features/mobile-api/contract";
import { callApi } from "~/lib/api";
import { UserFacingError } from "~/lib/errors";

/**
 * Sourcing B2B : sources de l'organisation (statut, synchronisation), flux distants autorisés et
 * historique des imports. Tout passe par l'API serveur : aucun identifiant fournisseur ne transite
 * en clair vers l'application après l'enregistrement.
 */

export function fetchSources(organizationId: string): Promise<SourceOverviewDTO[]> {
  return callApi<SourceOverviewDTO[]>("/sourcing/sources", { organizationId });
}

export function syncSource(organizationId: string, sourceId: string): Promise<{ status: string; message: string; nextRunAt: string | null; consecutiveFailures: number }> {
  return callApi("/sourcing/sources/sync", { method: "POST", organizationId, timeoutMs: 180_000, body: { sourceId } });
}

export function scheduleSource(organizationId: string, input: { sourceId: string; frequency?: SourceOverviewDTO["frequency"]; enabled?: boolean }): Promise<SourceOverviewDTO> {
  return callApi<SourceOverviewDTO>("/sourcing/sources/schedule", { method: "POST", organizationId, body: input });
}

export function fetchImportJobs(organizationId: string, supplierId?: string): Promise<ImportJobDTO[]> {
  return callApi<ImportJobDTO[]>("/sourcing/imports", { organizationId, query: supplierId ? { supplierId } : {} });
}

export function fetchImportJob(organizationId: string, id: string): Promise<ImportJobDetailDTO> {
  return callApi<ImportJobDetailDTO>("/sourcing/imports/detail", { organizationId, query: { id } });
}

export type FeedAuthInput = { kind: "none" } | { kind: "header"; name: string; value: string } | { kind: "basic"; username: string; password: string };

export interface RemoteFeedDraft {
  url: string;
  format: "csv" | "xml" | "json";
  auth: FeedAuthInput;
}

/** Contrôles locaux avant l'envoi (le serveur revalide tout, SSRF compris). */
export function remoteFeedIssues(d: RemoteFeedDraft): string[] {
  const issues: string[] = [];
  let u: URL | null = null;
  try {
    u = new URL(d.url.trim());
  } catch {
    issues.push("Collez le lien complet du flux (https://…).");
  }
  if (u && u.protocol !== "https:") issues.push("Le lien doit commencer par https:// (connexion chiffrée).");
  if (u && (u.username || u.password)) issues.push("Ne mettez pas d'identifiant dans le lien : utilisez la section « Authentification ».");
  if (d.auth.kind === "header" && (!/^[A-Za-z0-9-]{1,64}$/.test(d.auth.name) || !d.auth.value)) issues.push("En-tête d'authentification incomplet (nom en lettres, chiffres et tirets, et valeur).");
  if (d.auth.kind === "basic" && (!d.auth.username || !d.auth.password)) issues.push("Identifiant et mot de passe requis.");
  return issues;
}

export function previewRemoteFeed(organizationId: string, d: RemoteFeedDraft & { mapping?: CatalogMapping; currency?: string; taxType?: "ht" | "ttc" | "unknown" }): Promise<CatalogPreviewDTO> {
  const issues = remoteFeedIssues(d);
  if (issues.length) throw new UserFacingError(issues[0]!);
  return callApi<CatalogPreviewDTO>("/sourcing/feeds/preview", { method: "POST", organizationId, timeoutMs: 60_000, body: { url: d.url.trim(), format: d.format, auth: d.auth, mapping: d.mapping, defaults: { currency: d.currency, taxType: d.taxType } } });
}

export function createRemoteFeed(
  organizationId: string,
  d: RemoteFeedDraft & { mapping: CatalogMapping; currency: string; taxType: "ht" | "ttc" | "unknown"; supplierId?: string; supplierName?: string; mode: "partial" | "snapshot"; frequency: SourceOverviewDTO["frequency"] },
): Promise<{ supplierId: string; sourceId: string; feedId: string }> {
  if (!d.supplierId && !d.supplierName?.trim()) throw new UserFacingError("Choisissez le fournisseur de ce flux.");
  return callApi("/sourcing/feeds", {
    method: "POST",
    organizationId,
    body: {
      url: d.url.trim(),
      format: d.format,
      auth: d.auth,
      mapping: d.mapping,
      defaults: { currency: d.currency, taxType: d.taxType },
      ...(d.supplierId ? { supplierId: d.supplierId } : { supplierName: d.supplierName!.trim() }),
      mode: d.mode,
      frequency: d.frequency,
      attest: true,
    },
  });
}

export const SOURCE_STATUS_TONE: Record<SourceOverviewDTO["status"], "success" | "neutral" | "accent" | "danger" | "dark"> = {
  connected: "success",
  to_configure: "accent",
  manual_import: "neutral",
  running: "dark",
  error: "danger",
  disabled: "neutral",
};

export const IMPORT_STATUS_LABEL: Record<ImportJobDTO["status"], string> = {
  running: "En cours",
  completed: "Terminé",
  partial: "Terminé avec des lignes ignorées",
  failed: "Échec",
  quarantined: "Suspendu (contrôle de qualité)",
  skipped_duplicate: "Fichier déjà importé (rien modifié)",
};

export const ISSUE_KIND_LABEL: Record<ImportJobDetailDTO["issues"][number]["kind"], string> = {
  invalid: "Ligne illisible",
  duplicate: "Doublon",
  rejected: "Rejetée",
  unrecognized: "Produit non reconnu",
  warning: "Remarque",
};

/** Rapport d'erreurs d'un import, en CSV (séparateur « ; », guillemets échappés, BOM pour Excel). Pur. */
export function issuesCsv(job: Pick<ImportJobDetailDTO, "issues" | "fileName" | "supplierName" | "startedAt">): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["ligne", "type", "reference", "message"].join(";");
  const lines = job.issues.map((i) => [i.line ?? "", ISSUE_KIND_LABEL[i.kind] ?? i.kind, i.reference ?? "", i.message].map(esc).join(";"));
  return `﻿${head}\n${lines.join("\n")}\n`;
}
