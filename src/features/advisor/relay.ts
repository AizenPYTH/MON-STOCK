import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import { advisorChatSchema } from "@/features/mobile-api/contract";
import { isCrossSiteRequest } from "@/features/integrations/oauth-flow";
import { edgeRequest, EdgeApiError } from "@/lib/edge-api";
import { isAppError } from "@/lib/errors";

/**
 * Relais web du conseiller : POST /api/advisor/chat (même origine) → Edge Function
 * POST /advisor/chat (flux NDJSON), au nom de l'utilisateur connecté (jeton de session,
 * organisation active). Le corps de la réponse Edge est renvoyé TEL QUEL au navigateur : aucune
 * mise en mémoire tampon, le texte s'affiche au fil de l'eau. La clé OpenAI reste côté Edge.
 * Si le navigateur se déconnecte (bouton « Arrêter », onglet fermé), la requête Edge est annulée.
 */

export const ADVISOR_RELAY_TIMEOUT_MS = 145_000;
/** Taille maximale (octets) du corps JSON d'une question au conseiller. */
export const BODY_LIMIT_BYTES = 16_000;

export interface AdvisorRelayDeps {
  getContext: () => Promise<OrgContext>;
  allowedOrigins: string[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Lecture BORNÉE du corps (W-27) : refus dès l'annonce (Content-Length) ou dès que le flux dépasse
 * `maxBytes` octets (et non caractères UTF-16), sans jamais charger plus en mémoire.
 * null si trop gros.
 */
export async function readBodyBounded(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8").decode(bytes);
}

export function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: { code, message } }), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" } });
}

export async function relayAdvisorChat(request: Request, deps: AdvisorRelayDeps): Promise<Response> {
  if (isCrossSiteRequest(request.headers, deps.allowedOrigins)) return jsonError(403, "FORBIDDEN", "Requête refusée : elle ne provient pas de MON STOCK.");

  let ctx: OrgContext;
  try {
    ctx = await deps.getContext();
  } catch (e) {
    if (isAppError(e)) return jsonError(e.status, e.code, e.message);
    return jsonError(500, "INTERNAL", "Impossible de vérifier votre session. Réessayez.");
  }

  let raw: unknown;
  try {
    const text = await readBodyBounded(request, BODY_LIMIT_BYTES);
    if (text === null) return jsonError(413, "VALIDATION", "Message trop long.");
    raw = JSON.parse(text);
  } catch {
    return jsonError(400, "VALIDATION", "Requête invalide.");
  }
  const parsed = advisorChatSchema.safeParse(raw);
  if (!parsed.success) return jsonError(400, "VALIDATION", parsed.error.issues[0]?.message ?? "Requête invalide.");

  let url: string;
  let init: RequestInit;
  try {
    ({ url, init } = await edgeRequest(ctx, "/advisor/chat", { method: "POST", body: parsed.data }));
  } catch (e) {
    if (e instanceof EdgeApiError) return jsonError(401, e.code, e.message);
    return jsonError(500, "INTERNAL", "Impossible de préparer la demande au conseiller.");
  }
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/x-ndjson");
  const timeout = AbortSignal.timeout(deps.timeoutMs ?? ADVISOR_RELAY_TIMEOUT_MS);
  const signal = AbortSignal.any([request.signal, timeout]);

  let upstream: Response;
  try {
    upstream = await (deps.fetchImpl ?? fetch)(url, { ...init, headers, signal });
  } catch {
    if (timeout.aborted) return jsonError(504, "TIMEOUT", "Le conseiller n'a pas répondu à temps. Réessayez.");
    if (request.signal.aborted) return jsonError(499, "ABORTED", "Demande annulée.");
    return jsonError(502, "UNREACHABLE", "Le serveur MON STOCK est injoignable. Réessayez dans un instant.");
  }

  const type = upstream.headers.get("content-type") ?? "";
  if (upstream.ok && type.includes("ndjson") && upstream.body) {
    return new Response(upstream.body, {
      status: 200,
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "private, no-store, no-transform", "X-Content-Type-Options": "nosniff", "X-Accel-Buffering": "no" },
    });
  }

  // Réponse d'erreur de l'Edge (`{ ok:false, error }`, message déjà rédigé) : relayée telle quelle.
  try {
    const json = (await upstream.json()) as { ok?: boolean; error?: { code?: string; message?: string } } | null;
    if (json && json.ok === false && json.error?.message) return jsonError(upstream.status >= 400 ? upstream.status : 502, json.error.code ?? "SERVER", json.error.message);
  } catch {
    // corps illisible
  }
  return jsonError(502, "SERVER", upstream.status >= 500 ? "Le serveur MON STOCK est momentanément indisponible. Réessayez." : `Réponse inattendue du serveur (HTTP ${upstream.status}).`);
}

const MESSAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VOICES = new Set(["marin", "cedar"]);
export const ADVISOR_SPEECH_TIMEOUT_MS = 45_000;

/**
 * Voix du conseiller (web) : GET /api/advisor/speech?messageId=…&voice=… → Edge Function
 * GET /advisor/speech (audio/mpeg), au nom de l'utilisateur. Même voix que l'application iPhone ;
 * la clé OpenAI reste côté Edge. Seule une réponse déjà enregistrée peut être lue (identifiant).
 */
export async function relayAdvisorSpeech(request: Request, deps: Omit<AdvisorRelayDeps, "allowedOrigins">): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const messageId = params.get("messageId") ?? "";
  if (!MESSAGE_ID.test(messageId)) return jsonError(400, "VALIDATION", "Réponse à lire invalide.");
  const voice = params.get("voice");

  let ctx: OrgContext;
  try {
    ctx = await deps.getContext();
  } catch (e) {
    if (isAppError(e)) return jsonError(e.status, e.code, e.message);
    return jsonError(500, "INTERNAL", "Impossible de vérifier votre session. Réessayez.");
  }

  let url: string;
  let init: RequestInit;
  try {
    ({ url, init } = await edgeRequest(ctx, "/advisor/speech", { query: { messageId, voice: voice && VOICES.has(voice) ? voice : undefined } }));
  } catch (e) {
    if (e instanceof EdgeApiError) return jsonError(401, e.code, e.message);
    return jsonError(500, "INTERNAL", "Impossible de préparer la lecture.");
  }
  const headers = new Headers(init.headers);
  headers.set("Accept", "audio/mpeg");
  const timeout = AbortSignal.timeout(deps.timeoutMs ?? ADVISOR_SPEECH_TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await (deps.fetchImpl ?? fetch)(url, { ...init, headers, signal: AbortSignal.any([request.signal, timeout]) });
  } catch {
    if (timeout.aborted) return jsonError(504, "TIMEOUT", "La voix n'a pas répondu à temps.");
    return jsonError(502, "UNREACHABLE", "Le serveur MON STOCK est injoignable.");
  }
  const type = upstream.headers.get("content-type") ?? "";
  if (upstream.ok && type.startsWith("audio/") && upstream.body) {
    // W-27 : jamais conservé dans le cache du navigateur (poste partagé, après déconnexion).
    return new Response(upstream.body, { status: 200, headers: { "Content-Type": type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  }
  try {
    const json = (await upstream.json()) as { ok?: boolean; error?: { code?: string; message?: string } } | null;
    if (json && json.ok === false && json.error?.message) return jsonError(upstream.status >= 400 ? upstream.status : 502, json.error.code ?? "SERVER", json.error.message);
  } catch {
    // corps illisible
  }
  return jsonError(502, "SERVER", "La voix est momentanément indisponible.");
}
