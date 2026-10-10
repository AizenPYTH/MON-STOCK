import type { ApiResponse } from "@/features/mobile-api/contract";
import { ORGANIZATION_HEADER } from "@/features/mobile-api/contract";
import { appConfig } from "~/lib/config";
import { requireSupabase } from "~/lib/supabase";
import { OFFLINE_MESSAGE, UserFacingError } from "~/lib/errors";

/**
 * Appels au serveur MON STOCK (Supabase Edge Function `api`) pour ce qui ne peut PAS tourner dans
 * le téléphone : recherche fournisseurs en direct, connexion et synchronisation eBay (secrets
 * serveur). Jeton d'accès de l'utilisateur en Bearer (jamais dans l'URL), organisation active en
 * en-tête ; réponses `{ ok, data | error }` — le message d'erreur est déjà rédigé pour l'utilisateur.
 */
export function apiBaseUrl(): string {
  if (!appConfig.ok) throw new UserFacingError("Configuration de l'application incomplète.", "CONFIG");
  return `${appConfig.config.supabaseUrl.replace(/\/+$/, "")}/functions/v1/api`;
}

export interface ApiCallOptions {
  method?: "GET" | "POST";
  organizationId?: string;
  query?: Record<string, string | number | undefined | null>;
  body?: unknown;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export async function callApi<T>(path: string, options: ApiCallOptions = {}): Promise<T> {
  const { data } = await requireSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new UserFacingError("Votre session a expiré : reconnectez-vous.", "AUTH_REQUIRED");
  const url = new URL(`${apiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [k, v] of Object.entries(options.query ?? {})) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  if (appConfig.ok) headers.apikey = appConfig.config.supabaseAnonKey;
  if (options.organizationId) headers[ORGANIZATION_HEADER] = options.organizationId;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000);
  let res: Response;
  try {
    res = await (options.fetchImpl ?? fetch)(url.toString(), { method: options.method ?? "GET", headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new UserFacingError("Le serveur n'a pas répondu à temps. Réessayez.", "TIMEOUT");
    throw new UserFacingError(OFFLINE_MESSAGE, "OFFLINE");
  } finally {
    clearTimeout(timer);
  }
  let json: ApiResponse<T> | null = null;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    json = null;
  }
  if (json && json.ok) return json.data;
  if (json && !json.ok) throw new UserFacingError(json.error.message, json.error.code);
  throw new UserFacingError(res.status >= 500 ? "Le serveur MON STOCK est momentanément indisponible. Réessayez." : `Réponse inattendue du serveur (HTTP ${res.status}).`, "SERVER");
}
