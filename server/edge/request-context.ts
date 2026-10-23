/**
 * Corrélation des journaux de l'Edge Function (S-17) : chaque requête reçoit un identifiant
 * (`X-Request-Id` fourni par l'appelant s'il est sûr, sinon un UUID), ajouté à toutes les lignes
 * du logger pendant son traitement (AsyncLocalStorage, node:async_hooks, pris en charge par Deno)
 * et renvoyé dans l'en-tête de réponse `X-Request-Id`.
 *
 * Chargement défensif : si node:async_hooks n'était pas disponible dans l'environnement d'exécution,
 * l'Edge démarre quand même (journaux sans requestId, en-tête de réponse toujours présent).
 */
import { setLogContextProvider } from "@/lib/logger";

export const REQUEST_ID_HEADER = "x-request-id";

type RequestContext = { requestId: string };

interface ContextStorage {
  run<T>(store: RequestContext, fn: () => T): T;
  getStore(): RequestContext | undefined;
}

async function createStorage(): Promise<ContextStorage | null> {
  try {
    const mod = await import("node:async_hooks");
    return new mod.AsyncLocalStorage<RequestContext>();
  } catch {
    return null;
  }
}

const storage = await createStorage();
if (storage) setLogContextProvider(() => storage.getStore());

/** Identifiant transmis par l'appelant : accepté seulement s'il est court et sans caractère spécial. */
export function requestIdFrom(request: Pick<Request, "headers">): string {
  const given = request.headers.get(REQUEST_ID_HEADER)?.trim() ?? "";
  if (/^[A-Za-z0-9._-]{8,64}$/.test(given)) return given;
  return globalThis.crypto.randomUUID();
}

export function withRequestContext<T>(requestId: string, fn: () => Promise<T>): Promise<T> {
  return storage ? storage.run({ requestId }, fn) : fn();
}

export function currentRequestId(): string | null {
  return storage?.getStore()?.requestId ?? null;
}
