/**
 * APERÇU VISUEL UNIQUEMENT : remplace `~/lib/api` quand MONSTOCK_PREVIEW=1 (metro.config.js).
 * Les réponses viennent de scripts/preview-api-fixtures.ts, qui exécute les vraies fonctions serveur
 * sur la base de démonstration. Toute autre route renvoie une erreur explicite (rien n'est inventé).
 */
import { UserFacingError } from "~/lib/errors";
import fixtures from "./api-fixtures.generated.json";

export interface ApiCallOptions {
  method?: "GET" | "POST";
  organizationId?: string;
  query?: Record<string, string | number | undefined | null>;
  body?: unknown;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const responses = (fixtures as { responses: Record<string, unknown> }).responses;

export function apiBaseUrl(): string {
  return "https://preview.invalid/functions/v1/api";
}

export async function apiHeaders(): Promise<Record<string, string>> {
  return { Authorization: "Bearer preview" };
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function callApi<T>(path: string, options: ApiCallOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const p = path.startsWith("/") ? path : `/${path}`;
  const query = Object.entries(options.query ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${String(v).trim().toLowerCase()}`);
  await delay(250);
  for (const key of [query.length ? `${method} ${p}?${query.join("&")}` : null, `${method} ${p}`]) {
    if (key && key in responses) return responses[key] as T;
  }
  if (p === "/suppliers/search") {
    const q = String(options.query?.q ?? "").trim();
    return { query: q, currency: "EUR", total: 0, offers: [], suppliers: [], checked: [], partial: false, durationMs: 0 } as T;
  }
  throw new UserFacingError("Aperçu : cette action n'est pas simulée.", "PREVIEW");
}
