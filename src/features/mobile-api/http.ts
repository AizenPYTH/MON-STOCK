import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, fromPostgrestError, isAppError, newErrorReference } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { scrubSecrets } from "@/integrations/core/sanitize";
import { connectorErrorToAppError, isConnectorError } from "@/integrations/core/errors";
import type { ApiErrorBody, ApiResponse } from "@/features/mobile-api/contract";

const log = createLogger("MOBILE_API");

/** Réponses de l'API mobile : jamais mises en cache (données privées, par utilisateur). */
const NO_STORE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } as const;

export function jsonOk<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ ok: true, data }, { status, headers: NO_STORE });
}

export function jsonError(status: number, error: ApiErrorBody): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
}

function isPostgrestLike(e: unknown): e is { code?: string; message: string; details?: string | null; hint?: string | null } {
  if (!e || typeof e !== "object" || e instanceof Error) return false;
  const o = e as { code?: unknown; message?: unknown };
  return typeof o.message === "string" && typeof o.code === "string";
}

/**
 * Traduit toute erreur en réponse JSON `{ ok: false, error: { code, message } }`.
 * Le message brut d'une erreur inattendue n'est JAMAIS renvoyé (il peut contenir des noms
 * de tables, des URL internes…) : il est journalisé (secrets masqués) avec une référence.
 */
export function errorResponse(e: unknown): NextResponse<ApiResponse<never>> {
  let app: AppError | null = null;
  if (isAppError(e)) app = e;
  else if (isConnectorError(e)) app = connectorErrorToAppError(e);
  else if (isPostgrestLike(e)) app = fromPostgrestError(e);
  else if (e instanceof z.ZodError) app = new AppError("VALIDATION", e.issues[0]?.message ?? "Paramètres invalides.");
  if (app) return jsonError(app.status, { code: app.code, message: app.message });
  const ref = newErrorReference();
  log.error("unexpected mobile api error", { ref, error: scrubSecrets(e instanceof Error ? `${e.name}: ${e.message}` : String(e)) });
  return jsonError(500, { code: "INTERNAL", message: `Une erreur inattendue est survenue. Réessayez ou contactez le support (réf. ${ref}).` });
}

/** Exécute un handler et uniformise la réponse. */
export async function handle<T>(fn: () => Promise<T>, status = 200): Promise<NextResponse<ApiResponse<T>>> {
  try {
    return jsonOk(await fn(), status);
  } catch (e) {
    return errorResponse(e);
  }
}

/** Paramètres de requête (URLSearchParams) validés par un schéma Zod ; vides ignorés. */
export function parseQuery<S extends z.ZodTypeAny>(request: Request, schema: S): z.infer<S> {
  const url = new URL(request.url);
  const flat: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) if (v !== "") flat[k] = v;
  const parsed = schema.safeParse(flat);
  if (!parsed.success) throw new AppError("VALIDATION", parsed.error.issues[0]?.message ?? "Paramètres invalides.");
  return parsed.data;
}

/** Corps JSON (64 Ko max) validé par un schéma Zod. */
export async function parseBody<S extends z.ZodTypeAny>(request: Request, schema: S): Promise<z.infer<S>> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 64_000) throw new AppError("VALIDATION", "Requête trop volumineuse.");
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 64_000) throw new AppError("VALIDATION", "Requête trop volumineuse.");
    body = text ? JSON.parse(text) : {};
  } catch (e) {
    if (isAppError(e)) throw e;
    throw new AppError("VALIDATION", "Corps de requête JSON invalide.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError("VALIDATION", parsed.error.issues[0]?.message ?? "Paramètres invalides.");
  return parsed.data;
}

export const uuidParam = z.string().uuid("Identifiant invalide.");
