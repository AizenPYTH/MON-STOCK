import "server-only";
import type { ApiResponse } from "@/features/mobile-api/contract";
import { ORGANIZATION_HEADER } from "@/features/mobile-api/contract";
import type { OrgContext } from "@/features/auth/dal";
import { publicEnv } from "@/lib/env";

/**
 * Appel du serveur MON STOCK (Edge Function Supabase `api`, celui de l'application iPhone) depuis
 * le serveur web, AU NOM de l'utilisateur (son jeton de session, l'organisation active en en-tête).
 * Sert aux fonctions qui dépendent de secrets tiers gardés côté Edge (IA, transporteurs, suivi,
 * annonces eBay) : le web n'a ainsi aucun secret supplémentaire et se comporte comme l'application.
 * Réponses `{ ok, data | error }` : le message d'erreur est déjà rédigé pour l'utilisateur.
 */
export class EdgeApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "EdgeApiError";
  }
}

export interface EdgeCallOptions {
  method?: "GET" | "POST";
  query?: Record<string, string | number | undefined | null>;
  body?: unknown;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export function edgeApiBaseUrl(): string {
  return `${publicEnv().NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/api`;
}

/** Requête prête à envoyer (exposée pour les réponses en flux, ex. conseiller IA). */
export async function edgeRequest(ctx: OrgContext, path: string, options: EdgeCallOptions = {}): Promise<{ url: string; init: RequestInit }> {
  const { data } = await ctx.supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new EdgeApiError("Votre session a expiré : reconnectez-vous.", "AUTH_REQUIRED");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    apikey: publicEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY,
    Accept: "application/json",
    [ORGANIZATION_HEADER]: ctx.organization.id,
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const url = new URL(`${edgeApiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [k, v] of Object.entries(options.query ?? {})) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  return { url: url.toString(), init: { method: options.method ?? "GET", headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), cache: "no-store" } };
}

export async function callEdgeApi<T>(ctx: OrgContext, path: string, options: EdgeCallOptions = {}): Promise<T> {
  const { url, init } = await edgeRequest(ctx, path, options);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000);
  let res: Response;
  try {
    res = await (options.fetchImpl ?? fetch)(url, { ...init, signal: controller.signal });
  } catch {
    if (controller.signal.aborted) throw new EdgeApiError("Le serveur n'a pas répondu à temps. Réessayez.", "TIMEOUT");
    throw new EdgeApiError("Le serveur MON STOCK est injoignable. Réessayez dans un instant.", "UNREACHABLE");
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
  if (json && !json.ok) throw new EdgeApiError(json.error.message, json.error.code);
  throw new EdgeApiError(res.status >= 500 ? "Le serveur MON STOCK est momentanément indisponible. Réessayez." : `Réponse inattendue du serveur (HTTP ${res.status}).`, "SERVER");
}
