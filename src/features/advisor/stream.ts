import type { AdvisorReplyDTO, AdvisorStreamEvent } from "@/features/mobile-api/contract";

/**
 * Lecture du flux NDJSON du conseiller (une ligne JSON par événement), côté NAVIGATEUR.
 * Le navigateur parle uniquement à la route web /api/advisor/chat (même origine), qui relaie le
 * flux de l'Edge Function sans le mettre en mémoire tampon. Même logique que l'application iPhone
 * (apps/mobile/src/data/advisor.ts) : texte au fil de l'eau, cartes, réponse finale « done ».
 */

export const ADVISOR_CHAT_PATH = "/api/advisor/chat";
/** Délai côté navigateur (le tour du conseiller est borné à 100 s sur le serveur). */
export const ADVISOR_CLIENT_TIMEOUT_MS = 150_000;

export class AdvisorStreamError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "AdvisorStreamError";
  }
}

const KNOWN_TYPES = new Set(["conversation", "status", "text", "card", "done", "error"]);

/** Découpe un tampon NDJSON : renvoie les événements complets et le reste non terminé. */
export function parseNdjson(buffer: string): { events: AdvisorStreamEvent[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events: AdvisorStreamEvent[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    try {
      const parsed: unknown = JSON.parse(t);
      if (parsed && typeof parsed === "object" && KNOWN_TYPES.has(String((parsed as { type?: unknown }).type))) events.push(parsed as AdvisorStreamEvent);
    } catch {
      // ligne illisible : ignorée (jamais interprétée)
    }
  }
  return { events, rest };
}

function redirectedToLogin(url: string): boolean {
  try {
    return new URL(url, "http://localhost").pathname === "/login";
  } catch {
    return false;
  }
}

/** Message d'une réponse qui n'est pas un flux NDJSON (erreur JSON `{ ok:false, error }`, page de connexion…). */
export async function nonStreamErrorOf(res: Response): Promise<AdvisorStreamError> {
  // Session absente : le proxy redirige vers /login (fetch suit la redirection et reçoit la page HTML).
  if (res.redirected && redirectedToLogin(res.url)) return new AdvisorStreamError("Votre session a expiré : reconnectez-vous pour continuer.", "AUTH_REQUIRED");
  let message = res.status >= 500 ? "Le serveur MON STOCK est momentanément indisponible. Réessayez." : `Réponse inattendue du serveur (HTTP ${res.status}).`;
  let code = "SERVER";
  try {
    const json = (await res.json()) as { ok?: boolean; error?: { code?: string; message?: string } } | null;
    if (json && json.ok === false && json.error?.message) {
      message = json.error.message;
      code = json.error.code ?? code;
    }
  } catch {
    // corps illisible (HTML…)
  }
  if (res.status === 401 && code === "SERVER") return new AdvisorStreamError("Votre session a expiré : reconnectez-vous pour continuer.", "AUTH_REQUIRED");
  return new AdvisorStreamError(message, code);
}

/**
 * Lit la réponse de /api/advisor/chat et appelle `onEvent` pour chaque événement, dès réception.
 * Renvoie la réponse finale ; lève une AdvisorStreamError au message déjà rédigé pour l'utilisateur.
 */
export async function readAdvisorStream(res: Response, onEvent: (e: AdvisorStreamEvent) => void): Promise<AdvisorReplyDTO> {
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.includes("ndjson")) throw await nonStreamErrorOf(res);
  let reply: AdvisorReplyDTO | null = null;
  let failure: AdvisorStreamError | null = null;
  const handle = (events: AdvisorStreamEvent[]) => {
    for (const e of events) {
      if (e.type === "done") reply = e.reply;
      if (e.type === "error") failure = new AdvisorStreamError(e.message, e.code);
      onEvent(e);
    }
  };
  try {
    if (res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseNdjson(buffer);
        buffer = parsed.rest;
        handle(parsed.events);
      }
      handle(parseNdjson(`${buffer}${decoder.decode()}\n`).events);
    } else {
      handle(parseNdjson(`${await res.text()}\n`).events);
    }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e;
    throw new AdvisorStreamError("La connexion a été interrompue pendant la réponse. Réessayez.", "INTERRUPTED");
  }
  if (failure) throw failure;
  if (!reply) throw new AdvisorStreamError("La réponse du conseiller a été coupée (connexion interrompue). Réessayez.", "INTERRUPTED");
  return reply;
}
